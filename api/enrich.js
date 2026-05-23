// api/enrich.js — Creators API product enrichment (v3.1, North America)
// ---------------------------------------------------------------------------
// Takes the AI's items (each with a searchQuery) and returns them enriched with
// a real ASIN, image, price, and the vended affiliate link. Runs AFTER the bag
// renders (progressive enhancement) — never blocks generation.
//
// Caching:
//   - access token: in-memory (module scope). Tokens last ~1h; refetching one
//     occasionally on a cold start is harmless.
//   - product results: Upstash Redis (persists across deploys + shared across
//     instances). This is also what makes the prebuilt-bag warm cache durable.
//
// Field paths below are confirmed against the official Creators API docs.
// ---------------------------------------------------------------------------

import { Redis } from "@upstash/redis";

// Upstash auto-injects these env vars when you add the Marketplace integration.
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// ── Config ──────────────────────────────────────────────────────────────────
const TOKEN_URL   = "https://api.amazon.com/auth/o2/token";        // v3.1, NA (LwA)
const API_URL     = "https://creatorsapi.amazon/catalog/v1/searchItems";
const MARKETPLACE = "www.amazon.com";
const PARTNER_TAG = "smawormom06-20";
const CACHE_TTL   = 60 * 60 * 24 * 7;   // re-verify each product weekly (prices move)

// ── In-memory token cache (module scope) ──────────────────────────────────────
let tokenCache = { value: null, expiresAt: 0 };

async function getToken() {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt - 60000) return tokenCache.value;
  // v3.x uses a JSON body (NOT form-encoded — that's the v2.x pattern).
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.CREATORS_CLIENT_ID,
      client_secret: process.env.CREATORS_CLIENT_SECRET,
      scope: "creatorsapi::default",
    }),
  });
  if (!r.ok) throw new Error(`Token request failed: ${r.status} ${await r.text()}`);
  const j = await r.json();                     // { access_token: "Atc|...", expires_in, token_type }
  tokenCache = { value: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
  return tokenCache.value;
}

// ── One product lookup, cache-first ───────────────────────────────────────────
async function searchOne(query, token) {
  const key = `gbg:product:${query.toLowerCase().trim()}`;

  // Cache hit (Upstash auto-deserializes JSON)
  try {
    const cached = await redis.get(key);
    if (cached) return cached;                  // may be a product object OR the {miss:true} marker
  } catch { /* cache read failure → fall through to a live call */ }

  const r = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,       // v3.x: no ", Version x.x" suffix
      "x-marketplace": MARKETPLACE,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      keywords: query,
      itemCount: 3,
      partnerTag: PARTNER_TAG,
      marketplace: MARKETPLACE,
      resources: ["images.primary.medium", "itemInfo.title", "offersV2.listings.price"],
    }),
  });
  if (!r.ok) return null;                        // 429/5xx → caller keeps the search-link fallback

  const j = await r.json();
  const hit = j?.searchResult?.items?.[0];
  if (!hit) {
    // Remember the miss briefly so we don't re-call the API for the same dud query.
    try { await redis.set(key, { miss: true }, { ex: 60 * 60 * 24 }); } catch {}
    return { miss: true };
  }

  const listing = hit.offersV2?.listings?.[0];
  const product = {
    asin: hit.asin,
    detailPageURL: hit.detailPageURL,            // use VERBATIM — carries tag+linkCode
    imageUrl: hit.images?.primary?.medium?.url || null,
    title: hit.itemInfo?.title?.displayValue || null,
    price: listing?.price?.money?.amount ?? null,                 // offersV2 path
    inStock: listing?.availability?.type === "IN_STOCK",
  };

  try { await redis.set(key, product, { ex: CACHE_TTL }); } catch {}
  // Throttle AFTER a live (uncached) call to respect 1 TPS during the first 30 days.
  // Cache hits return early above and never reach here, so warm items stay fast.
  await new Promise(r => setTimeout(r, 1100));
  return product;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: "items array required" });

    const token = await getToken();
    const out = [];
    for (const it of items) {
      const p = await searchOne(it.searchQuery, token);
      const matched = p && !p.miss && p.imageUrl;
      if (matched) {
        out.push({
          ...it,
          asin: p.asin,
          detailPageURL: p.detailPageURL,
          imageUrl: p.imageUrl,
          inStock: p.inStock,
          // Replace the AI's estimate with the real price when we have one.
          unitCostLow:  p.price ?? it.unitCostLow,
          unitCostHigh: p.price ?? it.unitCostHigh,
        });
      } else {
        out.push(it);                            // graceful fallback: unchanged search-link item
      }
    }
    res.status(200).json({ items: out });
  } catch (e) {
    // Total failure → tell the client nothing changed; the bag keeps its search links.
    res.status(500).json({ error: e.message });
  }
}
