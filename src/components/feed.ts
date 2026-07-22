import type { HeimdallEvent } from "../types";
import { severityColor, relativeTime, formatCoord } from "../utils";
import { CATEGORY_LABELS, SEVERITY_ORDER } from "../types";

export interface FeedConfig {
  events: HeimdallEvent[];
  activeCategories: Set<string>;
  container: HTMLElement;
  onEventClick?: (eventId: string | null) => void;
  highlightedEventId?: string | null;
}

export function renderFeed(config: FeedConfig): void {
  const { events, activeCategories, container, onEventClick, highlightedEventId } = config;

  // Filter and sort
  const filtered = events
    .filter((e) => activeCategories.has(e.category))
    .sort((a, b) => {
      const sevA = SEVERITY_ORDER[a.severity] ?? 99;
      const sevB = SEVERITY_ORDER[b.severity] ?? 99;
      if (sevA !== sevB) return sevA - sevB;
      return b.timestamp - a.timestamp;
    });

  // Clear
  container.innerHTML = "";

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span>⏺</span>
        <span>No events for active layers</span>
      </div>
    `;
    return;
  }

  for (const event of filtered) {
    const card = document.createElement("div");
    const isHighlighted = highlightedEventId === event.id;
    card.className = `event-card${isHighlighted ? " highlighted" : ""}`;
    card.dataset.eventId = event.id;

    const color = severityColor(event.severity);

    card.innerHTML = `
      <span class="sev-dot" style="color:${color};background:${color}"></span>
      <div class="card-headline">${escapeHtml(event.headline)}</div>
      <div class="card-meta">
        <span class="tag">${CATEGORY_LABELS[event.category]}</span>
        <span>${formatCoord(event.lat, event.lon)}</span>
        <span>${escapeHtml(event.location)}</span>
      </div>
      <div class="card-time">${relativeTime(event.timestamp)}</div>
    `;

    // Click to highlight on radar
    if (onEventClick) {
      card.addEventListener("click", (e) => {
        e.stopPropagation();
        // Toggle: clicking the same card again deselects
        if (highlightedEventId === event.id) {
          onEventClick(null);
        } else {
          onEventClick(event.id);
        }
      });
    }

    container.appendChild(card);
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
