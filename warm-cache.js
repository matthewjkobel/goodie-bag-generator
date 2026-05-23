// warm-cache.js — one-time / occasional offline cache warmer
// ---------------------------------------------------------------------------
// Pre-enriches the search queries that show up in almost every goodie bag
// (heroes, bulk fillers, packaging) plus your prebuilt-bag items, so live
// users hit a warm cache instead of waiting on the 1-TPS API.
//
// Run it locally or as a scheduled job:   node warm-cache.js
// It writes into the SAME Upstash store /api/enrich.js reads from, using the
// same key format, so warmed entries are transparently reused.
//
// Requires the same env vars as enrich.js. Locally, pull them with:
//   vercel env pull .env.local       (then: node --env-file=.env.local warm-cache.js)
// ---------------------------------------------------------------------------

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const TOKEN_URL   = "https://api.amazon.com/auth/o2/token";
const API_URL     = "https://creatorsapi.amazon/catalog/v1/searchItems";
const MARKETPLACE = "www.amazon.com";
const PARTNER_TAG = "smawormom06-20";
const CACHE_TTL   = 60 * 60 * 24 * 7;

// ── The queries worth warming ─────────────────────────────────────────────────
// Start with high-frequency recurring items. Add your prebuilt-bag item
// searchQueries here (or load them from a JSON file) as those get built.
const QUERIES = [
  // universal heroes
  "ring pops variety pack", "smarties candy bulk", "glow sticks bulk party",
  "kids sunglasses bulk pack", "temporary tattoos kids bulk", "bouncy balls bulk assorted",
  "mini play doh party pack", "slap bracelets bulk",
  // bulk fillers
  "kids stickers bulk", "mini erasers bulk", "pencils bulk kids fun",
  // packaging (mirrors the in-app PACKAGING_ADDONS / tip keywords)
  "tissue paper bulk", "curly ribbon party", "cellophane treat bags",
  "party favor bags bulk", "gift tags kids party",
  // seasonal staples
  "halloween party favors bulk", "valentines cards kids classroom",
  "easter egg fillers bulk", "christmas party favors kids",
];

let tokenCache = { value: null, expiresAt: 0 };
async function getToken() {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt - 60000) return tokenCache.value;
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
  const j = await r.json();
  tokenCache = { value: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
  return tokenCache.value;
}

async function warmOne(query, token) {
  const key = `gbg:product:${query.toLowerCase().trim()}`;
  const r = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "x-marketplace": MARKETPLACE,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      keywords: query, itemCount: 3, partnerTag: PARTNER_TAG, marketplace: MARKETPLACE,
      resources: ["images.primary.medium", "itemInfo.title", "offersV2.listings.price"],
    }),
  });
  if (!r.ok) { console.log(`  ✗ ${query} — HTTP ${r.status}`); return false; }
  const hit = (await r.json())?.searchResult?.items?.[0];
  if (!hit) { console.log(`  – ${query} — no result`); return false; }
  const listing = hit.offersV2?.listings?.[0];
  const product = {
    asin: hit.asin,
    detailPageURL: hit.detailPageURL,
    imageUrl: hit.images?.primary?.medium?.url || null,
    title: hit.itemInfo?.title?.displayValue || null,
    price: listing?.price?.money?.amount ?? null,
    inStock: listing?.availability?.type === "IN_STOCK",
  };
  await redis.set(key, product, { ex: CACHE_TTL });
  console.log(`  ✓ ${query} — ${product.asin} $${product.price ?? "?"}`);
  return true;
}

async function main() {
  console.log(`Warming ${QUERIES.length} queries (≈${QUERIES.length}s at 1 TPS)...`);
  const token = await getToken();
  let ok = 0;
  for (const q of QUERIES) {
    try { if (await warmOne(q, token)) ok++; } catch (e) { console.log(`  ✗ ${q} — ${e.message}`); }
    await new Promise(r => setTimeout(r, 1100));   // stay under 1 TPS
  }
  console.log(`Done. ${ok}/${QUERIES.length} cached.`);
}

main().catch(e => console.log("Fatal:", e.message));
