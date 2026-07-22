import "./styles.css";
import type { HeimdallEvent, LayerDef } from "./types";
import { EventManager } from "./sources/events";
import { renderRadar } from "./components/radar";
import { renderFeed } from "./components/feed";
import { renderTicker } from "./components/ticker";
import { renderFilters } from "./components/filters";
import { relativeTime } from "./utils";

// ---- Initialize Layers ----
const ALL_LAYERS: LayerDef[] = [
  { id: "conflicts", label: "Conflicts", active: true },
  { id: "military", label: "Military", active: true },
  { id: "economic", label: "Economic", active: true },
  { id: "hotspots", label: "Hotspots", active: true },
  { id: "natural", label: "Natural", active: true },
  { id: "outages", label: "Outages", active: true },
  { id: "sanctions", label: "Sanctions", active: true },
];

// ---- Build DOM ----
const app = document.getElementById("app")!;
app.innerHTML = `
  <!-- Header -->
  <header class="header">
    <div class="header-brand">
      <div class="eye-icon">
        <svg viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="12" stroke="#7fc4e8" stroke-width="1.2"/>
          <circle cx="14" cy="14" r="7" stroke="#7fc4e8" stroke-width="0.5" opacity="0.4"/>
          <line x1="14" y1="14" x2="24" y2="6" stroke="#7fc4e8" stroke-width="0.8" opacity="0.6"/>
          <circle cx="14" cy="14" r="1.5" fill="#7fc4e8"/>
        </svg>
      </div>
      <h1>HEIMDALL</h1>
    </div>
    <div class="header-status">
      <span class="status-bar" id="status-bar">
        <span class="status-dot"></span>
        <span id="status-text">Initializing...</span>
      </span>
      <span id="cache-indicator" class="cache-indicator"></span>
      <button id="refresh-btn" class="refresh-btn" title="Refresh now">↻</button>
      <span class="last-updated" id="last-updated">—</span>
    </div>
  </header>

  <!-- Radar Panel -->
  <section class="radar-panel panel">
    <div class="panel-br"></div>
    <div class="panel-bl"></div>
    <canvas id="radar-canvas"></canvas>
  </section>

  <!-- Filters -->
  <section class="filters-panel panel">
    <div class="panel-br"></div>
    <div class="panel-bl"></div>
    <div id="filters-container"></div>
  </section>

  <!-- Feed Panel -->
  <section class="feed-panel panel">
    <div class="panel-br"></div>
    <div class="panel-bl"></div>
    <div class="feed-header">
      <h2>Live Feed</h2>
      <span class="feed-count" id="feed-count">0</span>
    </div>
    <div class="feed-list" id="feed-list"></div>
  </section>

  <!-- Ticker -->
  <section class="ticker-panel panel">
    <div class="panel-br"></div>
    <div class="panel-bl"></div>
    <span class="ticker-label">⏺ HEADLINES</span>
    <div id="ticker-container" style="flex:1;overflow:hidden;"></div>
  </section>
`;

// ---- Component Refs ----
const radarCanvas = document.getElementById("radar-canvas") as HTMLCanvasElement;
const feedList = document.getElementById("feed-list") as HTMLElement;
const filtersContainer = document.getElementById("filters-container") as HTMLElement;
const tickerContainer = document.getElementById("ticker-container") as HTMLElement;
const statusText = document.getElementById("status-text") as HTMLElement;
const statusBar = document.getElementById("status-bar") as HTMLElement;
const lastUpdatedEl = document.getElementById("last-updated") as HTMLElement;
const feedCount = document.getElementById("feed-count") as HTMLElement;
const cacheIndicator = document.getElementById("cache-indicator") as HTMLElement;
const refreshBtn = document.getElementById("refresh-btn") as HTMLButtonElement;

// ---- State ----
let layers: LayerDef[] = [...ALL_LAYERS];
let highlightedEventId: string | null = null;

function getActiveCategories(): Set<string> {
  return new Set(layers.filter((l) => l.active).map((l) => l.id));
}

function updateFeedCount(count: number) {
  feedCount.textContent = String(count);
}

function updateCacheIndicator(
  usingCache: boolean,
  cacheTimestamp: number | null,
) {
  if (usingCache && cacheTimestamp) {
    cacheIndicator.textContent = `Cached ${relativeTime(cacheTimestamp)}`;
    cacheIndicator.className = "cache-indicator stale";
  } else {
    cacheIndicator.textContent = "";
    cacheIndicator.className = "cache-indicator";
  }
}

// ---- Event Manager ----
const eventManager = new EventManager(180_000); // refresh every 3 min

let currentEvents: HeimdallEvent[] = [];
let radarCleanup: (() => void) | null = null;

function reinitRadar() {
  if (radarCleanup) {
    radarCleanup();
  }
  const activeCategories = getActiveCategories();
  radarCleanup = renderRadar(radarCanvas, {
    events: currentEvents,
    activeCategories,
    highlightedEventId,
    onRadarClick: handleEventClick,
  });
}

function refreshUI(events: HeimdallEvent[], lastUpdated: number) {
  currentEvents = events;

  const activeCategories = getActiveCategories();
  updateFeedCount(events.length);

  statusText.textContent = `Online · ${events.length} events`;
  statusBar.className = "status-bar";

  lastUpdatedEl.textContent = `Updated ${relativeTime(lastUpdated)}`;

  updateCacheIndicator(eventManager.usingCache, eventManager.cacheTimestamp);

  // Redraw feed (pass highlight state + click handler)
  renderFeed({
    events,
    activeCategories,
    container: feedList,
    highlightedEventId,
    onEventClick: handleEventClick,
  });

  // Redraw ticker
  renderTicker({ events, activeCategories, container: tickerContainer });

  // Re-init radar
  reinitRadar();
}

eventManager.onUpdate(refreshUI);

eventManager.onError((error) => {
  if (error) {
    statusText.textContent = `Error: ${error}`;
    statusBar.className = "status-bar error";
  }
});

eventManager.onLoading((loading) => {
  if (loading) {
    statusText.textContent = "Fetching data...";
    statusBar.className = "status-bar loading";
  }
});

// ---- Feed-Radar Click Interaction ----
function handleEventClick(eventId: string | null) {
  highlightedEventId = eventId;

  // Re-render feed with updated highlight
  const activeCategories = getActiveCategories();
  renderFeed({
    events: currentEvents,
    activeCategories,
    container: feedList,
    highlightedEventId,
    onEventClick: handleEventClick,
  });

  // Update radar highlight
  reinitRadar();

  // Scroll matching feed card into view
  if (eventId) {
    const card = feedList.querySelector(`[data-event-id="${eventId}"]`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
}

// ---- Manual Refresh Button ----
refreshBtn.addEventListener("click", () => {
  refreshBtn.classList.add("spinning");
  eventManager.refresh().finally(() => {
    refreshBtn.classList.remove("spinning");
  });
});

// ---- Filters ----
function handleFilterChange(updatedLayers: LayerDef[]) {
  layers = updatedLayers;
  renderFilters({
    layers,
    onChange: handleFilterChange,
    container: filtersContainer,
  });
  if (currentEvents.length > 0 && eventManager.getLastUpdated()) {
    refreshUI(currentEvents, eventManager.getLastUpdated()!);
  }
}

renderFilters({ layers, onChange: handleFilterChange, container: filtersContainer });

// ---- Start ----
eventManager.start();
