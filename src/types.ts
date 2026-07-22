/** Severity levels for events */
export type Severity = "critical" | "high" | "medium" | "low" | "info";

/** Event categories / layers */
export type Category =
  | "conflicts"
  | "military"
  | "economic"
  | "hotspots"
  | "natural"
  | "outages"
  | "sanctions";

/** Normalized event schema — all sources map to this */
export interface HeimdallEvent {
  id: string;
  category: Category;
  severity: Severity;
  lat: number;
  lon: number;
  headline: string;
  location: string;
  source: string;
  timestamp: number; // unix ms
  url?: string;
}

/** Radar position computed from a fixed center */
export interface RadarPosition {
  bearing: number; // degrees from north, clockwise
  range: number; // normalized 0–1
  x: number; // pixel offset from center
  y: number; // pixel offset from center
}

/** Layer chip definition */
export interface LayerDef {
  id: Category;
  label: string;
  active: boolean;
}

/** Application state */
export interface AppState {
  events: HeimdallEvent[];
  layers: LayerDef[];
  lastUpdated: number | null;
  loading: boolean;
  error: string | null;
}

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export const CATEGORY_LABELS: Record<Category, string> = {
  conflicts: "Conflicts",
  military: "Military",
  economic: "Economic",
  hotspots: "Hotspots",
  natural: "Natural",
  outages: "Outages",
  sanctions: "Sanctions",
};
