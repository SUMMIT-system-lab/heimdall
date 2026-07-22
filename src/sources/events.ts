import type { HeimdallEvent } from "../types";
import { fetchEarthquakes } from "./usgs";
import { fetchGDELTEvents, SAMPLE_EVENTS } from "./gdelt";

// ---- localStorage cache keys ----
const CACHE_KEY = "heimdall-cache";
const CACHE_FRESH_MS = 15 * 60 * 1000; // 15 minutes

interface CacheEntry {
  events: HeimdallEvent[];
  timestamp: number;
  source: "live" | "sample";
}

/**
 * Save events to localStorage with a timestamp.
 */
function saveToCache(
  events: HeimdallEvent[],
  source: "live" | "sample",
): void {
  try {
    const entry: CacheEntry = { events, timestamp: Date.now(), source };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable — skip silently
  }
}

/**
 * Load cached events from localStorage.
 */
function loadFromCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

/**
 * Merge events from multiple sources, deduplicate by id.
 */
function mergeEvents(sources: HeimdallEvent[][]): HeimdallEvent[] {
  const seen = new Set<string>();
  const merged: HeimdallEvent[] = [];

  for (const batch of sources) {
    for (const ev of batch) {
      if (!seen.has(ev.id)) {
        seen.add(ev.id);
        merged.push(ev);
      }
    }
  }

  return merged;
}

type UpdateCallback = (events: HeimdallEvent[], lastUpdated: number) => void;

/**
 * The EventManager handles fetching from GDELT + USGS,
 * localStorage-based caching with stale-data fallback,
 * and coordinates refresh cycles.
 */
export class EventManager {
  private events: HeimdallEvent[] = [];
  private lastUpdated: number | null = null;
  private usingCachedData = false;
  private cachedDataTimestamp: number | null = null;
  private refreshInterval: number;
  private timerId: number | null = null;
  private listeners: UpdateCallback[] = [];
  private errorListeners: Array<(error: string) => void> = [];
  private loadingListeners: Array<(loading: boolean) => void> = [];

  constructor(refreshIntervalMs = 180_000) {
    this.refreshInterval = refreshIntervalMs;
  }

  /** Subscribe to event updates */
  onUpdate(fn: UpdateCallback): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  onError(fn: (error: string) => void): () => void {
    this.errorListeners.push(fn);
    return () => {
      this.errorListeners = this.errorListeners.filter((l) => l !== fn);
    };
  }

  onLoading(fn: (loading: boolean) => void): () => void {
    this.loadingListeners.push(fn);
    return () => {
      this.loadingListeners = this.loadingListeners.filter((l) => l !== fn);
    };
  }

  get usingCache(): boolean {
    return this.usingCachedData;
  }

  get cacheTimestamp(): number | null {
    return this.cachedDataTimestamp;
  }

  private notify() {
    if (this.lastUpdated) {
      for (const fn of this.listeners) {
        fn(this.events, this.lastUpdated);
      }
    }
  }

  private notifyError(error: string) {
    for (const fn of this.errorListeners) {
      fn(error);
    }
  }

  private notifyLoading(loading: boolean) {
    for (const fn of this.loadingListeners) {
      fn(loading);
    }
  }

  /**
   * Attempt to load cached data immediately (if available and fresh)
   * to avoid a blank screen on startup.
   */
  tryLoadCached(): boolean {
    const cached = loadFromCache();
    if (!cached) return false;

    const isFresh = Date.now() - cached.timestamp < CACHE_FRESH_MS;

    if (isFresh) {
      this.events = cached.events;
      this.lastUpdated = cached.timestamp;
      this.usingCachedData = false;
      this.cachedDataTimestamp = null;
      this.notify();
      return true;
    }

    // Stale cache: still load it but mark as cached
    this.events = cached.events;
    this.lastUpdated = cached.timestamp;
    this.usingCachedData = true;
    this.cachedDataTimestamp = cached.timestamp;
    this.notify();
    return true;
  }

  /** Fetch from all sources, merge, cache, and notify */
  async refresh(): Promise<void> {
    this.notifyLoading(true);

    const fetched: HeimdallEvent[][] = [];
    let anyLiveSucceeded = false;

    // 1. Fetch earthquakes
    try {
      const quakes = await fetchEarthquakes();
      fetched.push(quakes);
      if (quakes.length > 0) anyLiveSucceeded = true;
    } catch (err) {
      console.warn("USGS fetch failed:", err);
    }

    // 2. Fetch GDELT events (per-category sample fallback built in)
    try {
      const gdeltEvents = await fetchGDELTEvents();
      fetched.push(gdeltEvents);
      const hasLiveData = gdeltEvents.some((e) => !e.id.startsWith("sample-"));
      if (hasLiveData) anyLiveSucceeded = true;
    } catch (err) {
      console.warn("GDELT fetch failed, using sample data:", err);
      fetched.push(SAMPLE_EVENTS);
    }

    // 3. Merge + deduplicate
    this.events = mergeEvents(fetched);
    this.lastUpdated = Date.now();

    // 4. Save to cache
    saveToCache(this.events, anyLiveSucceeded ? "live" : "sample");

    // 5. Clear cache status
    this.usingCachedData = false;
    this.cachedDataTimestamp = null;

    // 6. Notify
    this.notify();
    this.notifyError("");
    this.notifyLoading(false);
  }

  /**
   * Fall back to whatever is in cache, however old.
   */
  fallbackToCache(): boolean {
    const cached = loadFromCache();
    if (!cached) return false;

    this.events = cached.events;
    this.lastUpdated = cached.timestamp;
    this.usingCachedData = true;
    this.cachedDataTimestamp = cached.timestamp;
    this.notify();
    return true;
  }

  /** Start auto-refresh cycle */
  start(): void {
    // Show cached data immediately
    this.tryLoadCached();

    // Then fetch fresh data
    this.refresh().catch((err) => {
      console.error("Initial fetch failed:", err);
      if (!this.fallbackToCache()) {
        this.notifyError("Failed to fetch data and no cache available");
      }
    });

    // Periodic refresh
    if (this.timerId === null) {
      this.timerId = window.setInterval(() => {
        this.refresh().catch((err) => {
          console.error("Refresh failed:", err);
          this.fallbackToCache();
        });
      }, this.refreshInterval);
    }
  }

  /** Stop auto-refresh */
  stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  getEvents(): HeimdallEvent[] {
    return this.events;
  }

  getLastUpdated(): number | null {
    return this.lastUpdated;
  }
}
