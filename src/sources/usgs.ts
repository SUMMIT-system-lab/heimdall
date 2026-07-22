import type { HeimdallEvent } from "../types";

const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";

interface UsgsProperties {
  mag: number;
  place: string;
  time: number;
  url: string;
  detail: string;
  status: string;
  type: string;
  title: string;
}

interface UsgsFeature {
  type: "Feature";
  properties: UsgsProperties;
  geometry: {
    type: "Point";
    coordinates: [number, number, number]; // [lon, lat, depth]
  };
  id: string;
}

interface UsgsResponse {
  type: "FeatureCollection";
  metadata: { count: number };
  features: UsgsFeature[];
}

/**
 * Fetch recent earthquakes (magnitude 2.5+) from USGS.
 * Rate limit: generous — USGS requests caching, not auth.
 */
export async function fetchEarthquakes(): Promise<HeimdallEvent[]> {
  const res = await fetch(USGS_URL, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`USGS returned ${res.status}`);
  }

  const data: UsgsResponse = await res.json();

  const events: HeimdallEvent[] = data.features.map((f) => {
    const [lon, lat, depth] = f.geometry.coordinates;
    const mag = f.properties.mag;
    const place = f.properties.place || "Unknown location";
    const time = f.properties.time;
    const title = f.properties.title || `M${mag} earthquake near ${place}`;

    // Determine severity based on magnitude
    let severity: HeimdallEvent["severity"];
    if (mag >= 6.5) severity = "critical";
    else if (mag >= 5.5) severity = "high";
    else if (mag >= 4.5) severity = "medium";
    else severity = "low";

    return {
      id: `usgs-${f.id}`,
      category: "natural" as const,
      severity,
      lat,
      lon,
      headline: title,
      location: place,
      source: "USGS",
      timestamp: time,
      url: f.properties.url,
    };
  });

  return events;
}
