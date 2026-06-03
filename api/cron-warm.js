// api/cron-warm.js — Daily cron: keep product cache warm + rebuild preset bags
// ---------------------------------------------------------------------------
// Scheduled by vercel.json. Runs once per day (Hobby plan minimum cadence).
//
// What it does each run:
//   1. Verify Vercel's cron call via Bearer ${CRON_SECRET}.
//   2. Compute today's slice (~10 queries) of the combined warm pool. The
//      pool is GENERIC_QUERIES (high-frequency fillers/packaging/heroes from
//      the original warm-cache.js) + every preset item's searchQuery.
//   3. Re-warm those ~10 entries in gbg:product:<lc-query> with 7-day TTL
//      — same cache /api/enrich.js reads from, so live bags pick them up
//      transparently.
//   4. Rebuild EVERY preset bag from whatever's currently cached and store
//      under gbg:preset:<key> with 30-day TTL. Presets always serve fresh
//      against current cache; items still warming up just fall back to their
//      AI-style item shape (no image/asin until their slice runs).
//
// Why daily-slice instead of one big every-6-days run:
//   - Creators API rate limit is 1 TPS. 56 queries × 1.1s ≈ 62s — that's
//     OVER the Hobby maxDuration cap (60s). A single mega-run would silently
//     time out partway through.
//   - 10 queries/run × ~1.1s = ~11s. Token fetch + Upstash reads/writes add
//     ~2s. Total ~12-15s, comfortably under maxDuration: 60.
//   - Slice rotation cycles every 6 days (Math.ceil(56/10) = 6), 1 day inside
//     the 7-day product TTL. Margin is thin but works as long as the cron runs.
//
// What ISN'T here:
//   - Anthropic API calls (zero). The cron only uses Creators + Upstash.
//   - Licensing verification. Counterfeit Pokemon/Mario/Spidey listings get
//     cached the same as legit ones — periodic human spot-check is a separate
//     maintenance task.
//
// To test locally:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//        https://generator.goodiebaggenerator.com/api/cron-warm
// ---------------------------------------------------------------------------

import { Redis } from "@upstash/redis";
import { PRESETS, PRESET_QUERIES } from "../presets.js";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// ── Config ──────────────────────────────────────────────────────────────────
const TOKEN_URL    = "https://api.amazon.com/auth/o2/token";
const API_URL      = "https://creatorsapi.amazon/catalog/v1/searchItems";
const MARKETPLACE  = "www.amazon.com";
const PARTNER_TAG  = "smawormom06-20";
const PRODUCT_TTL  = 60 * 60 * 24 * 7;   // 7 days — matches enrich.js exactly
const PRESET_TTL   = 60 * 60 * 24 * 30;  // 30 days — daily rewrites extend it
const SLICE_SIZE   = 10;                  // ~11s of API calls at 1 TPS
const RATE_DELAY   = 1100;                // ms; stay under 1 TPS

// ── Generic warm queries (copy of warm-cache.js QUERIES) ────────────────────
// High-frequency items that show up in almost every AI-generated bag.
// Keep in sync with warm-cache.js. If you tweak one, tweak both.
const GENERIC_QUERIES = [
  // universal heroes
  "ring pops variety pack", "smarties candy bulk", "glow sticks bulk party",
  "kids sunglasses bulk pack", "temporary tattoos kids bulk", "bouncy balls bulk assorted",
  "mini play doh party pack", "slap bracelets bulk",
  // bulk fillers
  "kids stickers bulk", "mini erasers bulk", "pencils bulk kids fun",
  // packaging
  "tissue paper bulk", "curly ribbon party", "cellophane treat bags",
  "party favor bags bulk", "gift tags kids party",
  // seasonal staples
  "halloween party favors bulk", "valentines cards kids classroom",
  "easter egg fillers bulk", "christmas party favors kids",
];

// ── Full pool, deduped ──────────────────────────────────────────────────────
const ALL_QUERIES = [...new Set([...GENERIC_QUERIES, ...PRESET_QUERIES])];

// ── Token cache (module scope) ──────────────────────────────────────────────
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

// ── Today's rotating slice ──────────────────────────────────────────────────
// Uses the Unix day number so the slice is stable across multiple invocations
// on the same UTC day (Vercel can retry; we don't want a re-run to skip ahead).
function todaysSlice() {
  const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const sliceCount = Math.ceil(ALL_QUERIES.length / SLICE_SIZE);
  const sliceIndex = day % sliceCount;
  const start = sliceIndex * SLICE_SIZE;
  return {
    sliceIndex,
    sliceCount,
    queries: ALL_QUERIES.slice(start, start + SLICE_SIZE),
  };
}

// ── One product lookup → store in gbg:product:* ─────────────────────────────
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
  if (!r.ok) return { ok: false, reason: `HTTP ${r.status}` };

  const hit = (await r.json())?.searchResult?.items?.[0];
  if (!hit) return { ok: false, reason: "no result" };

  const listing = hit.offersV2?.listings?.[0];
  const product = {
    asin: hit.asin,
    detailPageURL: hit.detailPageURL,
    imageUrl: hit.images?.primary?.medium?.url || null,
    title: hit.itemInfo?.title?.displayValue || null,
    price: listing?.price?.money?.amount ?? null,
    inStock: listing?.availability?.type === "IN_STOCK",
  };
  await redis.set(key, product, { ex: PRODUCT_TTL });
  return { ok: true, asin: product.asin, price: product.price };
}

// ── Rebuild one preset bag from current cache ───────────────────────────────
// Reads each item's product cache (no live API calls) and merges enrichment
// data into the AI-style item shape. Items whose product isn't cached yet
// stay in their AI shape — App.jsx still renders them, just without an image
// or vended link until that item's slice runs.
async function rebuildPresetBag(presetKey, def) {
  const enrichedItems = await Promise.all(def.items.map(async (item) => {
    const cacheKey = `gbg:product:${item.searchQuery.toLowerCase().trim()}`;
    let cached = null;
    try { cached = await redis.get(cacheKey); } catch { /* tolerate */ }
    if (!cached || cached.miss || !cached.imageUrl) return item; // fallback to AI shape
    return {
      ...item,
      asin: cached.asin,
      detailPageURL: cached.detailPageURL,
      imageUrl: cached.imageUrl,
      inStock: cached.inStock,
      packPrice: cached.price ?? null,
    };
  }));

  // totalPerBag = sum of midpoint per-unit × quantity (matches AI convention).
  // Display in the UI is dominated by real packPrices per Phase 1 pricing fix;
  // this field is kept for shape parity with AI-generated bags.
  const totalPerBag = enrichedItems.reduce(
    (sum, it) => sum + ((it.unitCostLow + it.unitCostHigh) / 2) * it.quantity,
    0,
  );

  const bag = {
    theme: def.theme,
    tagline: def.tagline,
    totalPerBag: Math.round(totalPerBag * 100) / 100,
    items: enrichedItems,
    packagingTip: def.packagingTip,
    teacherTip: def.teacherTip,
    funActivity: def.funActivity,
    _preset: presetKey, // marker so the UI can show "Pre-built" badge if useful
  };

  await redis.set(`gbg:preset:${presetKey}`, bag, { ex: PRESET_TTL });
  return {
    presetKey,
    items: enrichedItems.length,
    enriched: enrichedItems.filter(i => i.imageUrl).length,
  };
}

// ── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Auth: Vercel auto-sends Bearer ${CRON_SECRET}. Reject anything else.
  // (Don't disclose the failure reason — anyone hitting the URL gets 401.)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false });
  }

  const t0 = Date.now();
  const { sliceIndex, sliceCount, queries } = todaysSlice();

  try {
    const token = await getToken();

    // Step 1: warm today's product slice (~11s at 1 TPS).
    const warmed = [];
    for (const q of queries) {
      try {
        const r = await warmOne(q, token);
        warmed.push({ query: q, ...r });
      } catch (e) {
        warmed.push({ query: q, ok: false, reason: e.message });
      }
      await new Promise(r => setTimeout(r, RATE_DELAY));
    }

    // Step 2: rebuild every preset bag from current cache (no API calls).
    const presetResults = [];
    for (const [key, def] of Object.entries(PRESETS)) {
      try { presetResults.push(await rebuildPresetBag(key, def)); }
      catch (e) { presetResults.push({ presetKey: key, error: e.message }); }
    }

    const okCount = warmed.filter(w => w.ok).length;
    const duration = Math.round((Date.now() - t0) / 1000);

    return res.status(200).json({
      ok: true,
      duration: `${duration}s`,
      slice: { index: sliceIndex, of: sliceCount, size: queries.length },
      products: { warmed: okCount, attempted: queries.length, detail: warmed },
      presets: presetResults,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
