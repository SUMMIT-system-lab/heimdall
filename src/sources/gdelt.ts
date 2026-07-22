import type { HeimdallEvent, Category, Severity } from "../types";

// ---- GDELT 2.0 Doc API ----
// The GDELT Doc API is a free, no-auth-required API for searching global news.
// It returns articles in JSONFeed format matching keyword queries.

const GDELT_DIRECT_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
const MAX_RECORDS = 10; // per category — tuned to keep the feed manageable

/**
 * Keyword queries mapped to each Heimdall category.
 *
 * Design: Each query uses explicit phrases and negative exclusions to avoid
 * common false positives (sports, entertainment, routine business news, etc.).
 *
 * Tuning: If a category gets too much noise, add exclusion terms like
 * `NOT sport NOT game NOT film NOT album NOT celebrity`.
 * If it's too sparse, loosen the main terms.
 */
const CATEGORY_QUERIES: Record<Category, string> = {
  conflicts:
    `"armed conflict" OR "military strike" OR "ceasefire" OR "cease-fire" OR "airstrike" OR "air strike" OR clashes OR bombardment OR insurgency NOT "labor strike" NOT strikeout NOT "bowling" NOT documentary NOT "video game"`,
  military:
    `"military exercise" OR "naval exercise" OR "troop deployment" OR "defense spending" OR "weapons test" OR "missile test" OR "military buildup" NOT "video game" NOT "movie"`,
  economic:
    `"trade war" OR "economic crisis" OR "market crash" OR recession OR hyperinflation OR "supply chain disruption" OR "central bank" rate hike OR "bank failure" NOT earnings NOT "stock buyback" NOT dividend NOT "IPO"`,
  hotspots:
    `"civil unrest" OR "curfew imposed" OR "state of emergency" OR uprising OR insurrection OR riot OR "mass protest" OR "security forces" crackdown NOT "peaceful protest" NOT "sports"`,
  natural:
    `earthquake OR hurricane OR typhoon OR "massive flood" OR "catastrophic flood" OR tsunami OR "volcanic eruption" OR "wildfire" OR drought emergency NOT "forecast" NOT "preparedness exercise"`,
  outages:
    `"power outage" OR blackout OR "cyber attack" OR ransomware OR "internet disruption" OR "grid failure" OR "service outage" major NOT "scheduled maintenance" NOT "software update"`,
  sanctions:
    `sanctions OR embargo OR "export controls" OR "asset freeze" OR "trade restrictions" OR "economic sanctions" NOT "sanctions committee" NOT "compliance"`,
};

/**
 * Exclusion words — if any of these are in the article title,
 * the article is considered irrelevant for situational awareness
 * and will be skipped entirely.
 *
 * These catch things like sports results, entertainment news,
 * how-to articles, and routine press releases that slip through
 * the category query exclusions.
 */
const IRRELEVANT_WORDS = [
  // Sports
  "scores",
  "goal",
  "playoff",
  "championship",
  "tournament",
  "defeats",
  // Entertainment
  "movie review",
  "film review",
  "album review",
  "concert review",
  "celebrity",
  // Clickbait / non-event
  "opinion:",
  "editorial:",
  "letters to the editor",
  "obituary",
  "recipe",
  "horoscope",
  // Routine business
  "earnings call",
  "earnings report",
  "quarterly results",
  "stock buyback",
  "dividend declared",
];

/**
 * Check if an article is likely irrelevant for situational awareness.
 */
function isIrrelevant(title: string, summary: string): boolean {
  const text = `${title} ${summary}`.toLowerCase();
  for (const word of IRRELEVANT_WORDS) {
    if (text.includes(word)) return true;
  }
  return false;
}

/**
 * City/country lookup for extracting lat/lon from article text.
 *
 * Returns [lat, lon, displayName].
 */
function extractLocation(
  title: string,
  summary: string,
): [number, number, string] {
  const text = `${title} ${summary}`.toLowerCase();

  const CITY_DB: Record<string, [number, number, string]> = {
    kyiv: [50.45, 30.52, "Kyiv, Ukraine"],
    donetsk: [48.02, 37.80, "Donetsk, Ukraine"],
    kharkiv: [49.98, 36.25, "Kharkiv, Ukraine"],
    moscow: [55.76, 37.62, "Moscow, Russia"],
    "gaza city": [31.50, 34.47, "Gaza City"],
    telaviv: [32.08, 34.78, "Tel Aviv, Israel"],
    jerusalem: [31.77, 35.22, "Jerusalem"],
    beirut: [33.89, 35.50, "Beirut, Lebanon"],
    damascus: [33.51, 36.30, "Damascus, Syria"],
    baghdad: [33.32, 44.42, "Baghdad, Iraq"],
    kabul: [34.53, 69.17, "Kabul, Afghanistan"],
    beijing: [39.91, 116.40, "Beijing, China"],
    shanghai: [31.23, 121.47, "Shanghai, China"],
    tokyo: [35.68, 139.75, "Tokyo, Japan"],
    seoul: [37.57, 126.98, "Seoul, South Korea"],
    newdelhi: [28.61, 77.23, "New Delhi, India"],
    mumbai: [19.08, 72.88, "Mumbai, India"],
    islamabad: [33.68, 73.05, "Islamabad, Pakistan"],
    tehran: [35.69, 51.39, "Tehran, Iran"],
    london: [51.51, -0.13, "London, UK"],
    paris: [48.86, 2.35, "Paris, France"],
    berlin: [52.52, 13.40, "Berlin, Germany"],
    rome: [41.89, 12.48, "Rome, Italy"],
    madrid: [40.42, -3.70, "Madrid, Spain"],
    washington: [38.91, -77.04, "Washington, DC"],
    "new york": [40.71, -74.01, "New York, USA"],
    "los angeles": [34.05, -118.24, "Los Angeles, USA"],
    "mexico city": [19.43, -99.13, "Mexico City, Mexico"],
    brasilia: [-15.79, -47.88, "Brasília, Brazil"],
    riyadh: [24.71, 46.67, "Riyadh, Saudi Arabia"],
    abudhabi: [24.45, 54.38, "Abu Dhabi, UAE"],
    doha: [25.29, 51.53, "Doha, Qatar"],
    ankara: [39.93, 32.85, "Ankara, Turkey"],
    cairo: [30.04, 31.24, "Cairo, Egypt"],
    nairobi: [-1.29, 36.82, "Nairobi, Kenya"],
    lagos: [6.52, 3.38, "Lagos, Nigeria"],
    canberra: [-35.28, 149.13, "Canberra, Australia"],
    sydney: [-33.87, 151.21, "Sydney, Australia"],
  };

  const textNoSpaces = text.replace(/\s/g, "");
  for (const [key, [lat, lon, name]] of Object.entries(CITY_DB)) {
    const keyNoSpaces = key.replace(/\s/g, "");
    if (textNoSpaces.includes(keyNoSpaces)) {
      return [lat, lon, name];
    }
  }

  // Broader country-level matching
  const COUNTRY_DB: Record<string, [number, number, string]> = {
    ukraine: [49.0, 31.0, "Ukraine"],
    russia: [60.0, 40.0, "Russia"],
    china: [35.0, 105.0, "China"],
    "united states": [38.0, -97.0, "United States"],
    germany: [51.0, 10.0, "Germany"],
    france: [47.0, 2.0, "France"],
    india: [20.0, 77.0, "India"],
    iran: [32.0, 53.0, "Iran"],
    israel: [31.0, 34.8, "Israel"],
    japan: [36.0, 138.0, "Japan"],
    australia: [-25.0, 135.0, "Australia"],
    brazil: [-14.0, -55.0, "Brazil"],
    "south korea": [36.0, 128.0, "South Korea"],
    pakistan: [30.0, 70.0, "Pakistan"],
    afghanistan: [33.0, 65.0, "Afghanistan"],
    iraq: [33.0, 43.0, "Iraq"],
    syria: [35.0, 38.0, "Syria"],
    lebanon: [33.8, 35.8, "Lebanon"],
    egypt: [27.0, 30.0, "Egypt"],
    "saudi arabia": [24.0, 45.0, "Saudi Arabia"],
  };

  for (const [key, [lat, lon, name]] of Object.entries(COUNTRY_DB)) {
    if (text.includes(key)) {
      return [lat, lon, name];
    }
  }

  return [20, 0, "Location unknown"];
}

/**
 * Assign severity based on keywords in the article text.
 *
 * Heuristic strategy:
 * - Critical: explicit mentions of deaths, destruction, nuclear events
 * - High: casualties, attacks, severe damage, emergencies
 * - Medium: unrest, crises, warnings, disruptions (without confirmed casualties)
 * - Low: policy changes, plans, diplomatic talks, reports
 * - Info: routine announcements, neutral reporting, analysis
 *
 * Tuning: If severity feels inflated, move keywords down a level.
 * If too much comes through as "info", add more medium/low patterns.
 *
 * GDELT's Tone field (range -100 to +100) could also be used if available:
 *   - very negative (< -10): critical/high
 *   - moderately negative (-5 to -10): medium
 *   - neutral/positive (> -5): low/info
 */
function inferSeverity(text: string): Severity {
  const lower = text.toLowerCase();

  // ---- Critical: confirmed deaths, destruction, worst-case scenarios ----
  if (
    /\b(killed|deadly|massacre|catastrophe|nuclear (weapon|blast|detonation)|declares war|genocide|mass shooting|terrorist attack)\b/.test(
      lower,
    )
  )
    return "critical";

  // ---- High: casualties, active attacks, emergencies ----
  if (
    /\b(casualt(y|ies)|injured|severe|major (emergency|incident)|destruction|explosion|airstrike|missile (attack|launch)|hostage|siege|emergency declared|martial law)\b/.test(
      lower,
    )
  )
    return "high";

  // ---- Medium: unrest, warnings, disruptions ----
  if (
    /\b(clash|protest (?!banana|coconut|orange)|riot|curfew|uprising|crisis|warning (?!travel|weather)|threat(en(ed|s)?)?|disrupt(ion|ed)?|collapse (?!star|building|house)|volcanic eruption|tsunami|earthquake (?!magnitude [0-2])|hurricane (?!category [0-2])|flood (?!riv|plain)|wildfire|blackout|ransomware|cyberattack|grid failure)\b/.test(
      lower,
    )
  )
    return "medium";

  // ---- Low: policy, plans, reports, diplomatic activity ----
  if (
    /\b(plan(s|ned)?|negotiat(e|ions|ing)|(ceasefire|truce) (talks|agreement)|discuss(ed|ions)?|propos(e|al|ed)|announce(d|ment)?|sanction(s|ed|ing)|deploy(ed|ment)?|exercise (?!video|fitness|routine))\b/.test(
      lower,
    )
  )
    return "low";

  // ---- Info: everything else ----
  return "info";
}

/**
 * Parse GDELT API JSON response items into HeimdallEvent[].
 * Filters out irrelevant articles (sports, entertainment, etc.).
 */
function parseResponse(
  items: any[],
  category: Category,
): HeimdallEvent[] {
  const events: HeimdallEvent[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const title: string = item.title || item.title_text || "";
    const summary: string = item.summary || item.snippet || "";

    // Skip irrelevant articles early
    if (isIrrelevant(title, summary)) continue;
    if (!title && !summary) continue;

    const text = `${title} ${summary}`;
    const [lat, lon, location] = extractLocation(title, summary);
    const severity = inferSeverity(text);

    events.push({
      id: `gdelt-${category}-${item.id ?? idx}-${Date.now()}`,
      category,
      severity,
      lat,
      lon,
      headline: title.length > 120 ? title.slice(0, 117) + "..." : title,
      location,
      source: "GDELT",
      timestamp: item.date_published
        ? new Date(item.date_published).getTime()
        : Date.now(),
      url: item.url || item.link,
    });
  }

  return events;
}

/**
 * Deduplicate events that are likely about the same story.
 *
 * Strategy: group events by (normalized headline, location, 2-hour window),
 * then keep only the first (most severe) per group.
 *
 * Grouping keys are computed as:
 *   - headlineNormalized: first 40 chars lowercase, stripped of articles/prepositions
 *   - location: as extracted
 *   - timeBucket: timestamp rounded to nearest 2 hours
 */
function deduplicateEvents(events: HeimdallEvent[]): HeimdallEvent[] {
  const DUP_TIME_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

  // Normalize headline for fuzzy comparison
  function normalizeHeadline(h: string): string {
    return h
      .toLowerCase()
      .replace(/^(breaking|just in|update):?\s*/i, "")
      .replace(/\b(the|a|an|in|on|at|for|to|of|and|or|is|was|are|were)\b/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
  }

  const seen = new Map<string, number>(); // key → array index
  const deduped: HeimdallEvent[] = [];
  const timeWindow = DUP_TIME_WINDOW_MS;

  for (const event of events) {
    const headlineKey = normalizeHeadline(event.headline);
    const locationKey = event.location.toLowerCase().replace(/\s/g, "");
    const timeBucket = Math.floor(event.timestamp / timeWindow);
    const key = `${headlineKey}|${locationKey}|${timeBucket}`;

    if (seen.has(key)) continue;

    seen.set(key, deduped.length);
    deduped.push(event);
  }

  return deduped;
}

/**
 * Fetch one category's events.
 * Tries the Vercel proxy first (when deployed), then the GDELT API directly.
 */
async function fetchCategory(
  category: Category,
): Promise<HeimdallEvent[]> {
  // Try Vercel proxy if deployed (same-origin, edge-cached)
  if (
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
  ) {
    try {
      const proxyUrl = `/api/gdelt?category=${encodeURIComponent(category)}`;
      const res = await fetch(proxyUrl, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        return parseResponse(data.items ?? [], category);
      }
    } catch {
      // Proxy unavailable — fall through to direct fetch
    }
  }

  // Direct GDELT API fetch
  const query = CATEGORY_QUERIES[category];
  const url = `${GDELT_DIRECT_URL}?query=${encodeURIComponent(query)}&mode=artlist&format=json&maxrecords=${MAX_RECORDS}&timespan=2d`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    if (res.status === 429) {
      console.warn(`GDELT rate-limited for ${category}`);
    }
    return [];
  }

  const data = await res.json();
  return parseResponse(data.items ?? [], category);
}

// ---- SAMPLE DATA FALLBACK ----
const SAMPLE_EVENTS: HeimdallEvent[] = [
  { id: "sample-conf-1", category: "conflicts", severity: "critical", lat: 48.38, lon: 31.17, headline: "Artillery strikes reported in Donetsk region, civilian casualties", location: "Donetsk, Ukraine", source: "GDELT", timestamp: Date.now() - 1000 * 60 * 45 },
  { id: "sample-conf-2", category: "conflicts", severity: "high", lat: 31.95, lon: 35.93, headline: "Clashes erupt near Jordanian border, security forces deployed", location: "Amman, Jordan", source: "GDELT", timestamp: Date.now() - 1000 * 60 * 120 },
  { id: "sample-conf-3", category: "conflicts", severity: "medium", lat: 13.08, lon: 80.27, headline: "Border incursion reported in northern region, diplomatic talks ongoing", location: "Chennai, India", source: "GDELT", timestamp: Date.now() - 1000 * 60 * 240 },
  { id: "sample-mil-1", category: "military", severity: "high", lat: 35.68, lon: 139.75, headline: "Naval exercise underway in disputed waters, regional navies on alert", location: "Tokyo Bay, Japan", source: "GDELT", timestamp: Date.now() - 1000 * 60 * 30 },
  { id: "sample-mil-2", category: "military", severity: "medium", lat: 24.45, lon: 54.38, headline: "New missile defense system test scheduled, airspace restricted", location: "Abu Dhabi, UAE", source: "GDELT", timestamp: Date.now() - 1000 * 60 * 90 },
  { id: "sample-mil-3", category: "military", severity: "low", lat: 52.52, lon: 13.40, headline: "Defense budget increase of 2.3% approved by parliament", location: "Berlin, Germany", source: "GDELT", timestamp: Date.now() - 1000 * 60 * 180 },
  { id: "sample-eco-1", category: "economic", severity: "critical", lat: 40.71, lon: -74.01, headline: "Major bank announces emergency liquidity measures amid market volatility", location: "New York, USA", source: "GDELT", timestamp: Date.now() - 1000 * 60 * 15 },
  { id: "sample-eco-2", category: "economic", severity: "high", lat: 51.51, lon: -0.13, headline: "Supply chain disruption affects manufacturing output across region", location: "London, UK", source: "GDELT", timestamp: Date.now() - 1000 * 60 * 60 },
  { id: "sample-eco-3", category: "economic", severity: "medium", lat: 22.54, lon: 114.06, headline: "Trade negotiations stall over tariff disagreements, markets react", location: "Hong Kong", source: "GDELT", timestamp: Date.now() - 1000 * 60 * 200 },
  { id: "sample-hot-1", category: "hotspots", severity: "critical", lat: 32.78, lon: 35.03, headline: "Civil unrest escalating — curfew imposed in major city centers", location: "Haifa, Israel", source: "GDELT", timestamp: Date.now() - 1000 * 60 * 10 },
  { id: "sample-hot-2", category: "hotspots", severity: "high", lat: -1.29, lon: 36.82, headline: "Protests intensify as government announces new security measures", location: "Nairobi, Kenya", source: "GDELT", timestamp: Date.now() - 1000 * 60 * 55 },
  { id: "sample-hot-3", category: "hotspots", severity: "medium", lat: 19.43, lon: -99.13, headline: "Demonstration planned at central square tomorrow, authorities on standby", location: "Mexico City, Mexico", source: "GDELT", timestamp: Date.now() - 1000 * 60 * 300 },
  { id: "sample-out-1", category: "outages", severity: "high", lat: -33.87, lon: 151.21, headline: "Major internet backbone disruption affects three states, routing diverted", location: "Sydney, Australia", source: "GDELT", timestamp: Date.now() - 1000 * 60 * 25 },
  { id: "sample-out-2", category: "outages", severity: "medium", lat: 41.89, lon: 12.48, headline: "Power grid failure leaves 200,000 without electricity in southern region", location: "Rome, Italy", source: "GDELT", timestamp: Date.now() - 1000 * 60 * 85 },
  { id: "sample-out-3", category: "outages", severity: "low", lat: 1.35, lon: 103.82, headline: "Undersea cable repair underway, estimated restoration within 48 hours", location: "Singapore", source: "GDELT", timestamp: Date.now() - 1000 * 60 * 150 },
  { id: "sample-sanc-1", category: "sanctions", severity: "high", lat: 55.76, lon: 37.62, headline: "New export controls imposed on semiconductor technology and equipment", location: "Moscow, Russia", source: "GDELT", timestamp: Date.now() - 1000 * 60 * 40 },
  { id: "sample-sanc-2", category: "sanctions", severity: "medium", lat: 35.69, lon: 51.39, headline: "Asset freeze announced targeting key financial institutions and individuals", location: "Tehran, Iran", source: "GDELT", timestamp: Date.now() - 1000 * 60 * 130 },
  { id: "sample-sanc-3", category: "sanctions", severity: "low", lat: 39.91, lon: 116.40, headline: "Trade restrictions extended for another six months, review scheduled", location: "Beijing, China", source: "GDELT", timestamp: Date.now() - 1000 * 60 * 360 },
];

/**
 * Fetch GDELT events for all categories.
 * Categories are fetched in parallel; results are deduplicated across categories
 * (since the same event might match multiple keyword queries).
 */
export async function fetchGDELTEvents(): Promise<HeimdallEvent[]> {
  const categories = Object.keys(CATEGORY_QUERIES) as Category[];

  const results = await Promise.allSettled(
    categories.map((category) => fetchCategory(category)),
  );

  const allEvents: HeimdallEvent[] = [];

  for (let i = 0; i < categories.length; i++) {
    const category = categories[i];
    const result = results[i];

    if (result.status === "fulfilled" && result.value.length > 0) {
      allEvents.push(...result.value);
    } else {
      // Fall back to sample data for this category
      const sampleForCategory = SAMPLE_EVENTS.filter(
        (e) => e.category === category,
      );
      allEvents.push(...sampleForCategory);
    }
  }

  // Deduplicate across all categories (same story matching multiple keywords)
  return deduplicateEvents(allEvents);
}

export { SAMPLE_EVENTS };
