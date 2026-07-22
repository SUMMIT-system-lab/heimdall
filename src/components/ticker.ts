import type { HeimdallEvent } from "../types";
import { severityColor } from "../utils";

export interface TickerConfig {
  events: HeimdallEvent[];
  activeCategories: Set<string>;
  container: HTMLElement;
}

export function renderTicker(config: TickerConfig): void {
  const { events, activeCategories, container } = config;

  const filtered = events
    .filter((e) => activeCategories.has(e.category))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 30);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="ticker-track"><span class="ticker-item">⏺ Waiting for events...</span></div>`;
    return;
  }

  // Build items: duplicate for seamless loop
  const items = [...filtered, ...filtered];
  let html = '<div class="ticker-track">';

  for (const event of items) {
    const color = severityColor(event.severity);
    html += `
      <span class="ticker-item">
        <span class="ticker-dot" style="background:${color}"></span>
        ${escapeHtml(event.headline)}
        <span class="ticker-sep">//</span>
      </span>
    `;
  }

  html += "</div>";
  container.innerHTML = html;
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
