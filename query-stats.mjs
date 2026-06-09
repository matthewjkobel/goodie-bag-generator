// query-stats.mjs — read the measured search demand + cache hit-rate.
//
// Part B of the measurement work: api/enrich.js logs every real (user-driven)
// searchQuery into a self-expiring weekly bucket, plus a cache hit/miss tally.
// After ~a week of live traffic, this prints the numbers so you can rebuild the
// warm list (GENERIC_QUERIES) from real demand and confirm the cache is hit.
//
// Run with:
//   vercel env pull .env.local        # if you don't already have it
//   node --env-file=.env.local query-stats.mjs        # this week
//   node --env-file=.env.local query-stats.mjs -1     # last week

import { Redis } from "@upstash/redis";
const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

const offset = Number(process.argv[2] || 0); // 0 = this week, -1 = last week
const week = Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 7)) + offset;

const hit  = Number((await redis.get(`gbg:cachehit:${week}`))  || 0);
const miss = Number((await redis.get(`gbg:cachemiss:${week}`)) || 0);
const rate = hit + miss ? ((hit / (hit + miss)) * 100).toFixed(1) : "n/a";

const top    = await redis.zrange(`gbg:querystats:${week}`, 0, 49, { rev: true, withScores: true });
const miss50 = await redis.zrange(`gbg:querymiss:${week}`, 0, 29, { rev: true, withScores: true });

// @upstash/redis returns a flat [member, score, member, score, ...] array for
// withScores. Pretty-print it as ranked "score  member" lines either way.
const fmt = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return "  (none)";
  // Flat [member, score, ...] shape.
  if (typeof arr[1] !== "object") {
    const lines = [];
    for (let i = 0; i < arr.length; i += 2) {
      lines.push(`  ${String(arr[i + 1]).padStart(5)}  ${arr[i]}`);
    }
    return lines.join("\n");
  }
  // Fallback: array of { member, score } objects (other client versions).
  return arr.map(o => `  ${String(o.score).padStart(5)}  ${o.member}`).join("\n");
};

console.log(`Week ${week} (offset ${offset})`);
console.log(`Cache hit-rate: ${rate}%   (${hit} hits / ${miss} misses)`);
console.log(`\n— Top 50 queries by frequency (your measured warm list) —`);
console.log(fmt(top));
console.log(`\n— Top 30 MISSING queries (warm these first; highest payoff) —`);
console.log(fmt(miss50));
