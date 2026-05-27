// api/bag.js — fetch a stored bag by id for return-link rehydration (runbook §1.6)
// GET /api/bag?id=<bagId>  →  { bag }  (the enriched bag stored by /api/subscribe)

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const id = req.query?.id;
  if (!id) return res.status(400).json({ error: "id required" });
  try {
    const bag = await redis.get(`gbg:bag:${id}`);
    if (!bag) return res.status(404).json({ error: "Bag not found or expired" });
    return res.status(200).json({ bag });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
