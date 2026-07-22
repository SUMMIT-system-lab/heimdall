import type { Category, LayerDef } from "../types";
import { CATEGORY_LABELS } from "../types";

/** Severity-color mapping for each category's chip dot */
const CATEGORY_COLORS: Record<Category, string> = {
  conflicts: "#e34b3f",
  military: "#e3a83b",
  economic: "#4a7a9c",
  hotspots: "#ff6b4a",
  natural: "#4ae3a8",
  outages: "#7fc4e8",
  sanctions: "#e3a83b",
};

export interface FiltersConfig {
  layers: LayerDef[];
  onChange: (layers: LayerDef[]) => void;
  container: HTMLElement;
}

export function renderFilters(config: FiltersConfig): void {
  const { layers, onChange, container } = config;

  container.innerHTML = "";

  const row = document.createElement("div");
  row.className = "filters-row";

  for (const layer of layers) {
    const chip = document.createElement("button");
    chip.className = `chip${layer.active ? " active" : ""}`;
    chip.dataset.layer = layer.id;

    const color = CATEGORY_COLORS[layer.id];

    chip.innerHTML = `
      <span class="chip-dot${layer.active ? "" : " inactive"}" style="background:${color}"></span>
      ${CATEGORY_LABELS[layer.id]}
    `;

    chip.addEventListener("click", () => {
      const updated = layers.map((l) =>
        l.id === layer.id ? { ...l, active: !l.active } : l,
      );
      onChange(updated);
    });

    row.appendChild(chip);
  }

  container.appendChild(row);
}
