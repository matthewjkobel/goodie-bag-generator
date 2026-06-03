// api/preset.js — fetch a pre-warmed preset bag for instant render
// ---------------------------------------------------------------------------
// GET /api/preset?key=<presetKey>  →  { bag }   (or 404 if not warmed yet)
//
// Mirrors api/bag.js but reads gbg:preset:<key> instead of gbg:bag:<id>.
// The bag stored there is already fully enriched by the cron, so the client
// gets a complete bag in one round trip — no per-item /api/enrich calls,
// no 1.1s × N stagger, no spinner.
//
// Allowed key chars: lowercase letters, digits, and hyphens. Keep it strict
// so a typo can never become a Redis key probe.
// ---------------------------------------------------------------------------

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const VALID_KEY = /^[a-z0-9-]{1,40}$/;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const key = req.query?.key;
  if (!key || !VALID_KEY.test(key)) {
    return res.status(400).json({ error: "valid key required" });
  }
  try {
    const bag = await redis.get(`gbg:preset:${key}`);
    if (!bag) return res.status(404).json({ error: "Preset not found yet — cron may not have run" });
    return res.status(200).json({ bag });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
