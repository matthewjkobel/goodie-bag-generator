// api/feedback.js — store a rating + optional comment in Upstash (runbook §1.7)
// Same-origin POST from the React rating widget; no CORS proxy needed.
// Reviewed on demand via export-feedback.js (CSV). Daily automation = deferred.

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { bagId, rating, comment, occasion, ageMin, ageMax, budget } = req.body || {};
    const r = Number(rating);
    if (!r || r < 1 || r > 5) return res.status(400).json({ error: "rating 1–5 required" });

    const ts = new Date().toISOString();
    // Unique key per submission; ts prefix keeps them roughly ordered + avoids collisions.
    const key = `gbg:feedback:${ts}:${Math.random().toString(36).slice(2, 8)}`;
    const record = {
      ts,
      bagId: bagId || null,
      rating: r,
      comment: (comment || "").slice(0, 2000),   // cap free text
      occasion: occasion || null,
      ageMin: ageMin ?? null,
      ageMax: ageMax ?? null,
      budget: budget ?? null,
    };

    await redis.set(key, record);                 // no TTL — feedback is kept

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
