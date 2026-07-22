/**
 * GDELT API proxy — Vercel serverless function.
 *
 * Handles the server-side fetch so:
 *   1. Any future API key stays server-side
 *   2. Responses can be cached at Vercel's edge
 *   3. CORS is not an issue
 *
 * Usage: GET /api/gdelt?category=conflicts
 *
 * Environment variables (none required for GDELT since it has no auth):
 *   - GDELT_API_BASE_URL (optional, defaults to the official endpoint)
 */

const GDELT_BASE =
  process.env.GDELT_API_BASE_URL ||
  "https://api.gdeltproject.org/api/v2/doc/doc";

/** Keyword queries mapped to each Heimdall category */
const CATEGORY_QUERIES: Record<string, string> = {
  conflicts: 'conflict OR war OR "military strike" OR ceasefire OR clashes',
  military:
    '"military exercise" OR "naval exercise" OR "troop deployment" OR "defense spending" OR "weapons test"',
  economic:
    '"trade war" OR sanctions OR tariff OR "market crash" OR "economic crisis" OR inflation',
  hotspots:
    'protest OR riot OR "civil unrest" OR demonstration OR curfew OR uprising',
  natural:
    "earthquake OR hurricane OR flood OR wildfire OR tsunami OR volcano OR drought",
  outages:
    '"power outage" OR blackout OR "internet disruption" OR "cyber attack" OR "service outage"',
  sanctions:
    'sanctions OR "export controls" OR embargo OR "asset freeze" OR "trade restrictions"',
};

/**
 * Vercel serverless function handler.
 *
 * Vercel passes the standard Node (req, res) signature.
 */
export default async function handler(
  req: any,
  res: any,
) {
  // CORS headers for client-side fetch from any origin
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const category = (req.query?.category as string)?.toLowerCase();
  if (!category || !CATEGORY_QUERIES[category]) {
    res.status(400).json({
      error: `Invalid or missing category. Supported: ${Object.keys(CATEGORY_QUERIES).join(", ")}`,
    });
    return;
  }

  const query = CATEGORY_QUERIES[category];
  const url = `${GDELT_BASE}?query=${encodeURIComponent(query)}&mode=artlist&format=json&maxrecords=15&timespan=2d`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      res.status(response.status).json({
        error: `GDELT API returned ${response.status}`,
        category,
      });
      return;
    }

    const data = await response.json();

    // Cache at Vercel edge for 5 minutes (300 seconds)
    res.setHeader(
      "Cache-Control",
      "s-maxage=300, stale-while-revalidate=600",
    );

    res.status(200).json({
      category,
      source: "gdelt",
      fetchedAt: new Date().toISOString(),
      count: data.items?.length ?? 0,
      items: data.items ?? [],
    });
  } catch (error) {
    console.error("GDELT proxy error:", error);
    res.status(502).json({
      error: "Failed to fetch from GDELT",
      category,
    });
  }
}
