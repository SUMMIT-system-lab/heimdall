import type { HeimdallEvent } from "../types";
import { computeRadarPosition, severityColor, formatCoord } from "../utils";

/** Center point for the radar (arbitrary — 0,0 gives a global overview) */
const CENTER_LAT = 20;
const CENTER_LON = 0;
const MAX_RANGE_KM = 20000; // roughly half the Earth's circumference

const RING_COUNT = 5;
const SWEEP_PERIOD_MS = 4000;
const BLIP_PULSE_MS = 1500;

export interface RadarConfig {
  events: HeimdallEvent[];
  activeCategories: Set<string>;
  highlightedEventId?: string | null;
  /** Called when a blip is clicked (or click on empty area to deselect) */
  onRadarClick?: (eventId: string | null) => void;
}

interface BlipHitArea {
  id: string;
  x: number;
  y: number;
  /** Visual radius of the blip (drawn extent, not the hit-test radius) */
  visualRadius: number;
}

let sweepAngle = 0;
let lastFrame = 0;
let animFrameId = 0;

// Per-frame blip positions populated during draw, used by click handler
let blipHitAreas: BlipHitArea[] = [];

export function renderRadar(
  canvas: HTMLCanvasElement,
  config: RadarConfig,
): () => void {
  const ctx = canvas.getContext("2d")!;
  const dpr = window.devicePixelRatio || 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }

  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  function draw(now: number) {
    if (!lastFrame) lastFrame = now;
    const dt = now - lastFrame;
    lastFrame = now;

    sweepAngle = (sweepAngle + (dt / SWEEP_PERIOD_MS) * 360) % 360;

    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy) - 20;

    ctx.clearRect(0, 0, w, h);

    // ---- Draw range rings ----
    for (let i = 1; i <= RING_COUNT; i++) {
      const r = (radius / RING_COUNT) * i;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle =
        i === RING_COUNT ? "rgba(127,196,232,0.15)" : "rgba(127,196,232,0.06)";
      ctx.lineWidth = i === RING_COUNT ? 1 : 0.5;
      ctx.stroke();

      if (i < RING_COUNT) {
        const label = `${((MAX_RANGE_KM / RING_COUNT) * i).toFixed(0)}km`;
        ctx.fillStyle = "rgba(127,196,232,0.2)";
        ctx.font = "9px 'JetBrains Mono', monospace";
        ctx.textAlign = "left";
        ctx.fillText(label, cx + 3, cy - r + 10);
      }
    }

    // ---- Crosshairs ----
    ctx.strokeStyle = "rgba(127,196,232,0.04)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    // Bearing ticks
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = ((deg - 90) * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(rad) * (radius - 8), cy + Math.sin(rad) * (radius - 8));
      ctx.lineTo(cx + Math.cos(rad) * (radius - 2), cy + Math.sin(rad) * (radius - 2));
      ctx.strokeStyle = "rgba(127,196,232,0.12)";
      ctx.lineWidth = deg % 90 === 0 ? 1 : 0.5;
      ctx.stroke();
    }

    // ---- Sweep line ----
    const sweepRad = ((sweepAngle - 90) * Math.PI) / 180;
    const sweepGrad = ctx.createConicGradient(sweepRad, cx, cy);
    sweepGrad.addColorStop(0, "rgba(127,196,232,0.15)");
    sweepGrad.addColorStop(0.05, "rgba(127,196,232,0.02)");
    sweepGrad.addColorStop(1, "rgba(127,196,232,0)");

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, sweepRad - 0.3, sweepRad + 0.3);
    ctx.closePath();
    ctx.fillStyle = sweepGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweepRad) * radius, cy + Math.sin(sweepRad) * radius);
    ctx.strokeStyle = "rgba(127,196,232,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // ---- Center dot ----
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(127,196,232,0.4)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(127,196,232,0.15)";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // ---- Draw event blips ----
    const activeEvents = config.events.filter((e) =>
      config.activeCategories.has(e.category),
    );

    // Reset hit areas for this frame
    blipHitAreas = [];

    for (const event of activeEvents) {
      const pos = computeRadarPosition(
        event,
        CENTER_LAT,
        CENTER_LON,
        MAX_RANGE_KM,
      );
      const bx = cx + pos.x * radius;
      const by = cy + pos.y * radius;

      if (bx < 10 || bx > w - 10 || by < 10 || by > h - 10) continue;

      const isHighlighted = config.highlightedEventId === event.id;
      const color = severityColor(event.severity);
      const pulse = Math.sin((now / BLIP_PULSE_MS) * Math.PI + event.id.length) * 0.3 + 0.7;

      // Store hit area (use a generous visual radius for easier clicking)
      const blipVisualRadius = isHighlighted ? 16 : 6;
      blipHitAreas.push({ id: event.id, x: bx, y: by, visualRadius: blipVisualRadius });

      if (isHighlighted) {
        // Highlighted: larger glow ring + crosshair
        const ringPulse = Math.sin((now / 800) * Math.PI) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(bx, by, 12 + ringPulse * 4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${0.2 * ringPulse})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Bright glow
        const glowRadius = 6 + pulse * 3;
        ctx.beginPath();
        ctx.arc(bx, by, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = color.replace(")", `,${0.3 * pulse})`).replace("rgb", "rgba");
        ctx.fill();

        ctx.beginPath();
        ctx.arc(bx, by, glowRadius, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Outer glow
      ctx.beginPath();
      ctx.arc(bx, by, 4 + pulse * 2, 0, Math.PI * 2);
      ctx.fillStyle = color.replace(")", `,${0.15 * pulse})`).replace("rgb", "rgba");
      ctx.fill();

      // Inner dot
      ctx.beginPath();
      ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = isHighlighted ? "#ffffff" : color;
      ctx.fill();

      // Border
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.strokeStyle = color.replace(")", `,${0.4 * pulse})`).replace("rgb", "rgba");
      ctx.lineWidth = isHighlighted ? 1.5 : 0.5;
      ctx.stroke();

      // Coordinate label
      const label = formatCoord(event.lat, event.lon);
      ctx.fillStyle = isHighlighted
        ? "rgba(255,255,255,0.7)"
        : "rgba(127,196,232,0.4)";
      ctx.font = isHighlighted
        ? "9px 'JetBrains Mono', monospace"
        : "8px 'JetBrains Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText(label, bx + 6, by + 3);
    }

    animFrameId = requestAnimationFrame(draw);
  }

  animFrameId = requestAnimationFrame(draw);

  // ---- Click hit detection ----
  function handleCanvasClick(e: MouseEvent) {
    if (!config.onRadarClick) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Check blips in reverse draw order (topmost first)
    for (let i = blipHitAreas.length - 1; i >= 0; i--) {
      const blip = blipHitAreas[i];
      const dx = clickX - blip.x;
      const dy = clickY - blip.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Generous hit radius: visual extent + 4px padding for easy clicking
      const hitRadius = blip.visualRadius + 4;
      if (dist <= hitRadius) {
        config.onRadarClick(blip.id);
        return;
      }
    }

    // Click on empty area — deselect
    config.onRadarClick(null);
  }

  canvas.addEventListener("click", handleCanvasClick);

  return () => {
    cancelAnimationFrame(animFrameId);
    ro.disconnect();
    canvas.removeEventListener("click", handleCanvasClick);
  };
}

export { CENTER_LAT, CENTER_LON, MAX_RANGE_KM };
