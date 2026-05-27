// export-feedback.js — dump all stored ratings from Upstash to a CSV (runbook §1.7)
//
// Run on demand:
//   vercel env pull .env.local           (if not already present)
//   node --env-file=.env.local export-feedback.js
//
// Writes feedback-export-<date>.csv in the current folder. Open in Sheets/Excel.
// (Daily automation via Vercel Cron → email/Drive is a deferred enhancement.)

import { Redis } from "@upstash/redis";
import { writeFileSync } from "node:fs";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const COLUMNS = ["ts", "rating", "comment", "occasion", "ageMin", "ageMax", "budget", "bagId"];

function csvCell(v) {
  if (v == null) return "";
  const s = String(v);
  // Quote if it contains comma, quote, or newline; escape inner quotes.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  // Scan all feedback keys (cursor-based; handles any volume).
  let cursor = 0, keys = [];
  do {
    const [next, batch] = await redis.scan(cursor, { match: "gbg:feedback:*", count: 200 });
    cursor = Number(next);
    keys.push(...batch);
  } while (cursor !== 0);

  if (keys.length === 0) { console.log("No feedback found yet."); return; }

  // Fetch all records (mget is efficient; falls back to per-key if needed).
  const records = [];
  for (const k of keys) {
    try { const v = await redis.get(k); if (v) records.push(v); } catch {}
  }
  records.sort((a, b) => (a.ts || "").localeCompare(b.ts || ""));

  const header = COLUMNS.join(",");
  const rows = records.map(rec => COLUMNS.map(c => csvCell(rec[c])).join(","));
  const csv = [header, ...rows].join("\n");

  const fname = `feedback-export-${new Date().toISOString().slice(0, 10)}.csv`;
  writeFileSync(fname, csv);
  console.log(`Wrote ${records.length} feedback rows to ${fname}`);
}

main().catch(e => console.log("Export failed:", e.message));
