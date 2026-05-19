// api/generate.js — Vercel serverless function that proxies Claude API calls
// Keeps your Anthropic API key secret (it never reaches the browser)

export default async function handler(req, res) {
  // CORS — allow your WordPress site to call this endpoint
  const allowedOrigins = [
    "https://goodiebaggenerator.com",
    "https://www.goodiebaggenerator.com",
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Simple in-memory rate limit: 15 requests per IP per hour
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  globalThis.rateLimits = globalThis.rateLimits || new Map();
  const now = Date.now();
  const hourAgo = now - 3600000;
  const requests = (globalThis.rateLimits.get(ip) || []).filter(t => t > hourAgo);
  if (requests.length >= 15) {
    return res.status(429).json({
      error: { type: "rate_limit", message: "Too many requests. Try again in an hour." }
    });
  }
  requests.push(now);
  globalThis.rateLimits.set(ip, requests);

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: { type: "config_error", message: "API key not configured on server" }
      });
    }

    // Forward the request body straight to Anthropic
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({
      error: { type: "server_error", message: err.message }
    });
  }
}