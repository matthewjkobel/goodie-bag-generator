// verify-cron.mjs — Step 11: confirm the daily SCHEDULED cron actually fired.
//
// How it works: api/cron-warm.js rebuilds all 6 gbg:preset:* bags on EVERY run
// with a fresh 30-day TTL. From the remaining TTL we can derive when each bag
// was last rebuilt. The scheduled cron runs at 06:00 UTC, so we PASS only if a
// rebuild happened AT/AFTER the most recent 06:00 UTC boundary — that's what
// distinguishes the scheduled run from an earlier manual warm.
//
// Run AFTER 06:00 UTC:
//   vercel env pull .env.local        # if you don't already have it
//   node --env-file=.env.local verify-cron.mjs
//
// Caveat: a manual cron trigger after 06:00 would also satisfy this. On an
// untouched prod, a post-06:00 rebuild = the scheduled run. Authoritative
// history is still Vercel → project → Cron Jobs.

import { Redis } from "@upstash/redis";
import { PRESETS } from "./presets.js";
const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

const PRESET_KEYS = Object.keys(PRESETS);   // stays in sync as presets are added
const FULL_TTL = 60 * 60 * 24 * 30;     // 30 days — what each run sets
const SCHEDULE_HOUR_UTC = 6;            // cron: "0 6 * * *"
const GRACE_MS = 30 * 60 * 1000;        // allow the run to land up to 30m late

const now = new Date();

// Most recent 06:00 UTC at or before now.
const boundary = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), SCHEDULE_HOUR_UTC));
if (now < boundary) boundary.setUTCDate(boundary.getUTCDate() - 1);

if (now.getTime() - boundary.getTime() < 0) {
  console.log("⚠ Run this after 06:00 UTC — the scheduled run hasn't had a chance to fire yet today.");
}
console.log(`now              ${now.toISOString()}`);
console.log(`scheduled at     ${boundary.toISOString()} (06:00 UTC)\n`);

let pass = true, missing = false;
for (const k of PRESET_KEYS) {
  const ttl = await redis.ttl(`gbg:preset:${k}`);   // secs remaining; -2 missing, -1 no expiry
  if (ttl === -2) {
    console.log(`  ✗ ${k.padEnd(12)} MISSING (never warmed)`);
    missing = true; pass = false; continue;
  }
  const rebuiltAt = new Date(now.getTime() - (FULL_TTL - ttl) * 1000);
  const fresh = rebuiltAt.getTime() >= boundary.getTime() - GRACE_MS;
  if (!fresh) pass = false;
  console.log(`  ${fresh ? "✓" : "•"} ${k.padEnd(12)} rebuilt ${rebuiltAt.toISOString()}  ${fresh ? "(after 06:00 ✓)" : "(BEFORE 06:00 — stale)"}`);
}

console.log("");
if (missing) {
  console.log("RESULT: ✗ FAIL — preset bag(s) missing. Cron never ran or the deploy is broken.");
  process.exit(1);
} else if (pass) {
  console.log("RESULT: ✓ PASS — all 6 bags rebuilt at/after today's 06:00 UTC. Scheduled cron fired.");
} else {
  console.log("RESULT: ⚠ STALE — bags exist but predate today's 06:00 UTC run. The scheduled run did NOT fire;");
  console.log("        open Vercel → project → Cron Jobs and check today's run for an error.");
  process.exit(2);
}
