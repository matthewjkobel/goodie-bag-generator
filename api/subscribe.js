// api/subscribe.js — email capture + bag storage (server-side; secrets never reach browser)
// ---------------------------------------------------------------------------
// Flow (PRD §18, runbook §1.4):
//   1. Store the (enriched) bag in Upstash under a short id, 60-day TTL.
//   2. Upsert the Kit subscriber with custom field `bag_link` = return URL.
//   3. Apply the tag `goodie-bag-generated` (by id) → triggers the Kit automation.
// The return URL (goodiebaggenerator.com/?bag=<id>) is emailed by Kit's automation
// via the bag_link merge field. Rehydration reads the bag back from Upstash.
// ---------------------------------------------------------------------------

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const KIT_API = "https://api.kit.com/v4";
const KIT_KEY = process.env.KIT_API_KEY;
const KIT_TAG_ID = process.env.KIT_TAG_ID;            // numeric id of `goodie-bag-generated`
const BAG_TTL = 60 * 60 * 24 * 60;                    // 60 days (SETTLED, runbook §1.4)
const RETURN_BASE = "https://generator.goodiebaggenerator.com"; // tool's own URL — the React app
// reads ?bag= directly here. (Root domain serves the tool in an iframe that can't see the parent's query string.)

function kitHeaders() {
  return { "Content-Type": "application/json", "X-Kit-Api-Key": KIT_KEY };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { email, bagId, bag } = req.body || {};
    if (!email || !bag || !bagId) {
      return res.status(400).json({ error: "email, bagId, and bag are required" });
    }

    // 1. Store the enriched bag (so the return link loads instantly, no re-enrich).
    try {
      await redis.set(`gbg:bag:${bagId}`, bag, { ex: BAG_TTL });
    } catch (e) {
      return res.status(500).json({ error: "Could not save bag" });
    }

    const returnUrl = `${RETURN_BASE}/?bag=${encodeURIComponent(bagId)}`;

    // 2. Upsert subscriber with the bag_link custom field. Request active state to
    //    try to skip the double-opt-in hop (verified empirically at runbook §1.8).
    const createRes = await fetch(`${KIT_API}/subscribers`, {
      method: "POST",
      headers: kitHeaders(),
      body: JSON.stringify({
        email_address: email,
        state: "active",
        fields: { bag_link: returnUrl },
      }),
    });
    if (!createRes.ok) {
      const detail = await createRes.text();
      return res.status(502).json({ error: "Kit subscriber upsert failed", detail });
    }

    // 3. Apply the trigger tag by email (idempotent; fires the automation).
    if (KIT_TAG_ID) {
      const tagRes = await fetch(`${KIT_API}/tags/${KIT_TAG_ID}/subscribers`, {
        method: "POST",
        headers: kitHeaders(),
        body: JSON.stringify({ email_address: email }),
      });
      if (!tagRes.ok) {
        const detail = await tagRes.text();
        // Bag is saved and subscriber exists; surface tag failure so we can see it.
        return res.status(502).json({ error: "Kit tag failed", detail });
      }
    }

    return res.status(200).json({ ok: true, returnUrl });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
