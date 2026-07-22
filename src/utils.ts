import type { HeimdallEvent, RadarPosition, Severity } from "./types";

/**
 * Haversine distance between two lat/lon points in km.
 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Initial bearing from point A to point B in degrees (0–360).
 */
export function bearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Compute the radar-screen position (bearing, range, x, y) for an event
 * relative to a fixed center point.
 */
export function computeRadarPosition(
  event: HeimdallEvent,
  centerLat: number,
  centerLon: number,
  maxRangeKm: number,
): RadarPosition {
  const dist = haversineKm(centerLat, centerLon, event.lat, event.lon);
  const bear = bearing(centerLat, centerLon, event.lat, event.lon);
  const r = Math.min(dist / maxRangeKm, 1);
  const angleRad = toRad(bear - 90); // rotate so 0° (north) is up
  return {
    bearing: bear,
    range: r,
    x: Math.cos(angleRad) * r,
    y: Math.sin(angleRad) * r,
  };
}

/**
 * Format a coordinate pair for display.
 */
export function formatCoord(lat: number, lon: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lonDir = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(1)}°${latDir} ${Math.abs(lon).toFixed(1)}°${lonDir}`;
}

/**
 * Format a timestamp as a relative time string.
 */
export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/**
 * Color for a given severity level.
 */
export function severityColor(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "#e34b3f";
    case "high":
      return "#ff6b4a";
    case "medium":
      return "#e3a83b";
    case "low":
      return "#7fc4e8";
    case "info":
      return "#4a7a9c";
  }
}
