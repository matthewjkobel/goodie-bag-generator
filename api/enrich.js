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

// ── Query stats (best-effort; measures real demand + cache hit-rate) ──────────
const STAT_TTL = 60 * 60 * 24 * 14; // keep ~2 weeks, then auto-expire

// Monotonic week number (UTC). Same formula used by query-stats.mjs to read it back.
const weekBucket = () => Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 7));

// Best-effort: a stats failure must NEVER break enrichment.
async function logStat(query, cacheHit) {
  const w = weekBucket();
  const q = query.toLowerCase().trim();
  try {
    const p = redis.pipeline();
    p.zincrby(`gbg:querystats:${w}`, 1, q);
    p.incr(`gbg:cache${cacheHit ? "hit" : "miss"}:${w}`);
    if (!cacheHit) p.zincrby(`gbg:querymiss:${w}`, 1, q);
    p.expire(`gbg:querystats:${w}`, STAT_TTL);
    p.expire(`gbg:cache${cacheHit ? "hit" : "miss"}:${w}`, STAT_TTL);
    if (!cacheHit) p.expire(`gbg:querymiss:${w}`, STAT_TTL);
    await p.exec();
  } catch { /* swallow — stats are never worth a failed enrich */ }
}

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
async function searchOne(query, token, track = false) {
  const key = `gbg:product:${query.toLowerCase().trim()}`;

  // Cache hit (Upstash auto-deserializes JSON)
  try {
    const cached = await redis.get(key);
    if (cached) {                               // may be a product object OR the {miss:true} marker
      // "Cache hit" = served without a Creators API call (incl. negative-cache) — the cost win we measure.
      if (track) await logStat(query, true);
      return cached;
    }
  } catch { /* cache read failure → fall through to a live call */ }

  // Live (uncached) call — count it as a miss for hit-rate purposes.
  if (track) await logStat(query, false);

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
  // DIAGNOSTIC (uncomment to inspect raw Amazon shape in Vercel logs — e.g. to fix inStock):
  // console.log("RAW HIT:", JSON.stringify(hit, null, 2));
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

// Merge one AI item with its looked-up product data (or return it unchanged on miss).
async function enrichItem(it, token, track = false) {
  const p = await searchOne(it.searchQuery, token, track);
  const matched = p && !p.miss && p.imageUrl;
  if (!matched) return it;                       // graceful fallback: unchanged search-link item
  return {
    ...it,                                        // keep AI per-unit estimates intact (unitCostLow/High)
    asin: p.asin,
    detailPageURL: p.detailPageURL,
    imageUrl: p.imageUrl,
    inStock: p.inStock,                           // currently unused in UI; mapping may be off (known)
    // packPrice = real Amazon price for the whole pack/listing (NOT per goodie-bag unit).
    // Kept separate so the per-bag estimator keeps using AI per-unit estimates (Option C).
    packPrice: p.price ?? null,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
// Accepts EITHER { item } (single — used by the staggered per-item client flow and
// the swap feature) OR { items } (array — used by the cache warmer / batch callers).
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const token = await getToken();
    const { item, items } = req.body;

    if (item && item.searchQuery) {
      // Single item = real user demand → track it. (The array branch is the warmer; leave it untracked.)
      const enriched = await enrichItem(item, token, true);
      return res.status(200).json({ item: enriched });
    }
    if (Array.isArray(items)) {
      const out = [];
      for (const it of items) out.push(await enrichItem(it, token));
      return res.status(200).json({ items: out });
    }
    return res.status(400).json({ error: "provide { item } or { items }" });
  } catch (e) {
    // Total failure → tell the client nothing changed; the bag keeps its search links.
    res.status(500).json({ error: e.message });
  }
}
