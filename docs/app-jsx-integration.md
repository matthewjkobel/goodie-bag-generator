# App.jsx changes for prebuilt presets

Three targeted edits. Apply in order; each is independent enough to verify on its own.

---

## Edit 1: Extend the existing URL listener to also handle `?preset=<key>`

This reuses the same lazy-load pattern that already handles `?bag=<id>` (see runbook §1.6). New behavior: opening `…/?preset=bluey` deep-links straight into the Bluey preset, no taps required.

**Find** the existing `useEffect` block that starts with:

```jsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("bag");
  if (!id) return;
```

**Replace the whole effect** with:

```jsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const bagId    = params.get("bag");
  const presetKey = params.get("preset");
  if (!bagId && !presetKey) return;
  (async () => {
    setLoading(true);
    try {
      const url = bagId
        ? `/api/bag?id=${encodeURIComponent(bagId)}`
        : `/api/preset?key=${encodeURIComponent(presetKey)}`;
      const r = await fetch(url);
      if (r.ok) {
        const { bag } = await r.json();
        setResult(bag);
        setBagId(bagId || crypto.randomUUID());
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
      }
    } catch { /* ignore — user can just generate fresh */ }
    finally { setLoading(false); }
  })();
}, []);
```

---

## Edit 2: Add a `loadPreset` helper

Add this alongside `generate`, `submitEmail`, etc. (one of the async functions defined inside the component body):

```jsx
const loadPreset = async (presetKey) => {
  setLoading(true); setError(null); setResult(null); setDebugInfo(null);
  try {
    const r = await fetch(`/api/preset?key=${encodeURIComponent(presetKey)}`);
    if (!r.ok) {
      // Graceful fallback: if the preset hasn't been warmed yet (cron not run,
      // or first 6 days of bootstrap), tell the user and let them generate
      // normally instead of showing a hard error.
      if (r.status === 404) {
        setError("This themed bag isn't ready yet — try generating one with the form below.");
      } else {
        setError("Couldn't load that themed bag right now.");
      }
      return;
    }
    const { bag } = await r.json();
    setResult(bag);
    setBagId(crypto.randomUUID());
    setEmailStatus(null); setEmail("");
    setRating(0); setRatingComment(""); setRatingStatus(null);
    setConfetti(c => c + 1);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
  } catch (e) {
    setError(e.message);
  } finally {
    setLoading(false);
  }
};
```

Note what's missing on purpose vs. `generate`:
- **No `enrichBag(bag)` call.** The preset bag is already fully enriched — calling enrichBag would just re-hit the cache and (worse) trigger the per-item stagger UI.
- **No prompt build, no `/api/generate` call, no validation retry loop.** This is the whole point of the speed win.

---

## Edit 3: Add the preset selector UI

Place this right above the main `<form>` or as its first child — wherever makes visual sense alongside the existing form. Keep it small; this is a quick-pick, not the primary path.

```jsx
{!result && (
  <div style={{ margin: "0 0 24px 0" }}>
    <p style={{ fontSize: 14, color: "#666", margin: "0 0 8px 0", textAlign: "center" }}>
      Or jump straight into a themed bag:
    </p>
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center",
    }}>
      {[
        { key: "bluey",        label: "🐶 Bluey" },
        { key: "paw-patrol",   label: "🚒 Paw Patrol" },
        { key: "spidey",       label: "🕷️ Spidey" },
        { key: "minecraft",    label: "⛏️ Minecraft" },
        { key: "pokemon",      label: "⚡ Pokémon" },
        { key: "super-mario",  label: "🍄 Super Mario" },
      ].map(p => (
        <button
          key={p.key}
          type="button"
          onClick={() => loadPreset(p.key)}
          disabled={loading}
          style={{
            padding: "8px 14px",
            border: "1px solid #ddd",
            background: "#fff",
            borderRadius: 999,
            cursor: loading ? "wait" : "pointer",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  </div>
)}
```

Style this however fits the existing visual system. The `!result &&` guard hides the chips once a bag is showing (otherwise it competes with the "Regenerate" affordance).

---

## What you still get for free

- **Existing card UI works unchanged.** Preset items have the same shape as AI items (`name`, `emoji`, `description`, `category`, `unitCostLow/High`, `quantity`, `searchQuery`) plus the enrichment fields (`asin`, `detailPageURL`, `imageUrl`, `packPrice`, `inStock`). The card renderer doesn't need to know it's a preset.
- **Email-my-bag still works.** When a user emails a preset bag, `/api/subscribe` stores it under `gbg:bag:<uuid>` exactly like a generated bag, and the return link `/?bag=<uuid>` rehydrates it via `/api/bag.js`. (The `_preset` marker field rides along harmlessly.)
- **Regenerate works.** It calls `generate()` with current form state — if the user tapped a preset and then hits Regenerate, they'll get a fresh AI bag based on whatever's in the form (which may not match the preset's theme — that's expected; the preset was a quick-pick, not a saved configuration).

---

## How to verify each piece, in order

1. **Cron auth + execution.** After deploy, manually trigger:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://generator.goodiebaggenerator.com/api/cron-warm`
   Should return JSON with `ok: true`, today's slice, products warmed, and 6 preset results. Run it 6 times across 6 days (or hand-bump the day clock if you're impatient — see "Bootstrap" below) until every slice has run.

2. **Preset endpoint.** Once at least one cron run has completed:
   `curl https://generator.goodiebaggenerator.com/api/preset?key=bluey`
   Should return a full bag JSON with 6 items. Some items may not have `imageUrl` yet if their slice hasn't run.

3. **Instant load on live site.** Open `https://generator.goodiebaggenerator.com/?preset=bluey` directly. Bag should render in well under a second, with all images visible at once (no per-item stagger).

4. **Generated-bag warm-cache hits.** Generate a bag whose items will include common warmed terms (e.g., a generic Birthday bag — the AI will likely produce "ring pops" or "play doh" items). Open the browser network panel: cached items return from `/api/enrich` in ~50–200ms; uncached items take ~1100ms each. To make this visible in Vercel logs, add this one line to `enrich.js`'s `searchOne` cache-hit path:

```js
if (cached) { console.log(`[enrich] HIT  ${key}`); return cached; }
```

(and optionally a `console.log("[enrich] MISS", key)` before the live fetch).

---

## Bootstrap on day one

The cron warms only ~10 queries per day. On day 1, only 10 of 56 product cache entries exist, so the first preset rebuild will produce bags with mostly-unenriched items.

Two options:

**Option A (recommended) — seed once manually, then let the cron maintain.**
Add the preset queries to the QUERIES list in your local `warm-cache.js` (or just import them):

```js
// warm-cache.js (add near the top, after the existing imports)
import { PRESET_QUERIES } from "./presets.js";

// then later, replace QUERIES with:
const QUERIES = [...EXISTING_QUERIES_ABOVE, ...PRESET_QUERIES];
```

Then run once locally: `node --env-file=.env.local warm-cache.js`. That populates all 56 entries in one ~62-second pass (no Vercel timeout — local Node has no limit). After that, the daily cron just maintains.

**Option B — let the cron bootstrap itself.** Don't pre-seed; for the first 6 days, preset bags will have partial enrichment. Bags fill in completely once their slice has run. Acceptable if you don't mind the first ~week looking incomplete.

---

## Bullet items the runbook §2.3 / §2.4 / §4A can mark done

- §2.3 — `api/cron-warm.js` exists, `vercel.json` cron entry added, `CRON_SECRET` set in Vercel env vars, deployed. **Verify first cron run actually fired** (Vercel → project → Cron Jobs → next-day logs).
- §2.4 — preset items already in the cron's warm pool by import; no separate edit needed when adding more presets later (just add to `presets.js`).
- §4A — preset selector renders, taps load fully-enriched bags instantly.
