# Heimdall — Global Situational Awareness Dashboard

A lightweight, single-user, real-time dashboard for monitoring global events. Built for the browser — no backend database required.

![Screenshot placeholder](screenshot.png)

## Stack

- **Vite** + **TypeScript** (vanilla, no framework)
- Deploy target: **Vercel** (static + serverless data functions)
- Data sources: USGS Earthquake API (live), **GDELT** news API (live with sample fallback)
- Client-side **localStorage caching** for instant load and offline resilience

## Getting Started

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The dev server opens at `http://localhost:3000`.

## Project Structure

```
├── api/
│   └── gdelt.ts            # Vercel serverless function proxy for GDELT
├── public/
│   └── favicon.svg
├── src/
│   ├── main.ts             # Entry point — wires everything together
│   ├── types.ts            # Event schema and type definitions
│   ├── utils.ts            # Coordinate math, formatting helpers
│   ├── styles.css          # Global HUD-aesthetic styles
│   ├── vite-env.d.ts       # Vite type declarations
│   ├── components/
│   │   ├── radar.ts        # Canvas-based radar visualization
│   │   ├── feed.ts         # Live event feed panel
│   │   ├── ticker.ts       # Scrolling headline ticker
│   │   └── filters.ts      # Layer toggle chips
│   └── sources/
│       ├── usgs.ts         # USGS earthquake feed fetcher
│       ├── gdelt.ts        # GDELT news feed fetcher with sample fallback
│       └── events.ts       # EventManager — coordinates all sources + caching
├── vercel.json             # Vercel deployment configuration
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## How to Add a New Data Source

Each data source is a module that exports a function returning `HeimdallEvent[]`. Here's the flow:

### 1. Create a fetcher module

Create `src/sources/my-source.ts`:

```typescript
import type { HeimdallEvent } from "../types";

export async function fetchMySource(): Promise<HeimdallEvent[]> {
  const res = await fetch("https://api.example.com/events");
  const data = await res.json();

  // Map external API response to HeimdallEvent[]
  return data.map((item: any) => ({
    id: `my-${item.id}`,
    category: "conflicts",     // Pick from: conflicts | military | economic | hotspots | natural | outages | sanctions
    severity: item.magnitude > 5 ? "high" : "medium",  // critical | high | medium | low | info
    lat: item.latitude,
    lon: item.longitude,
    headline: item.title,
    location: item.place_name,
    source: "MySource",
    timestamp: new Date(item.date).getTime(),
    url: item.link,            // optional
  }));
}
```

### 2. Register it in the EventManager

Open `src/sources/events.ts` and add the fetch call inside the `refresh()` method:

```typescript
// 1. Import your fetcher
import { fetchMySource } from "./my-source";

// 2. Inside the refresh() method, after the existing fetches:
try {
  const myEvents = await fetchMySource();
  if (myEvents.length > 0) {
    fetched.push(myEvents);
  }
} catch (err) {
  console.warn("MySource fetch failed:", err);
}
```

### 3. Optionally add a new category

If your source needs a category not in the default set:

1. Add the new category ID to the `Category` type in `src/types.ts`
2. Add an entry to `CATEGORY_LABELS` in the same file
3. Add a color in `CATEGORY_COLORS` in `src/components/filters.ts`
4. Add a new `LayerDef` entry in the `ALL_LAYERS` array in `src/main.ts`

That's it. The dashboard will automatically pick up new events on the next refresh cycle (every 3 minutes by default).

## Event Schema

```typescript
interface HeimdallEvent {
  id: string;              // Unique identifier (prefix with source name)
  category: Category;      // conflicts | military | economic | hotspots | natural | outages | sanctions
  severity: Severity;      // critical | high | medium | low | info
  lat: number;             // Latitude (-90 to 90)
  lon: number;             // Longitude (-180 to 180)
  headline: string;        // Short descriptive title
  location: string;        // Human-readable place name
  source: string;          // e.g. "USGS", "GDELT"
  timestamp: number;       // Unix timestamp in milliseconds
  url?: string;            // Optional link for more details
}
```

## Data Sources

| Source | Type | Requires API Key? | Status |
|--------|------|-------------------|--------|
| USGS Earthquakes | Natural disasters | No | ✅ Live |
| GDELT News API | Geopolitical & general events | No | ✅ Live (with sample fallback) |

### GDELT Integration Notes

The GDELT 2.0 Doc API is a free, no-auth news search API. The Heimdall fetcher:

- Queries the API with **category-specific keyword searches** (e.g., `conflict OR war` for the Conflicts layer)
- Extracts location from article text using a **city/country lookup heuristic**
- Assigns **severity via keyword matching** (e.g., "killed" → critical, "protest" → medium)
- **Falls back to curated sample data** if the API is rate-limited or unreachable

**Tuning the GDELT mapper:**
- Edit `src/sources/gdelt.ts` → `inferSeverity()` to adjust the keyword → severity mapping
- Edit `src/sources/gdelt.ts` → `CATEGORY_QUERIES` to refine search terms for each category
- Edit `src/sources/gdelt.ts` → `extractLocation()` to add more cities to the lookup

## Caching

Heimdall caches the merged event list in **localStorage**:

- **Fresh cache** (< 15 minutes old): shown immediately on load, background refresh happens silently
- **Stale cache** (> 15 minutes old): shown with a yellow "Cached [time]" indicator while fresh data loads
- **No network**: if both live fetch and cache fail, an error message is shown

## Deployment

### Vercel (recommended)

```bash
npm run build
npx vercel --prod
```

The project comes with:
- `vercel.json` — preconfigured for static site + serverless API routes
- `api/gdelt.ts` — serverless proxy for the GDELT API (avoids CORS, enables edge caching)

#### Environment Variables

None required for the default setup. If you add sources that need keys:

1. Add them in the Vercel dashboard: Project Settings → Environment Variables
2. Access via `process.env.VARIABLE_NAME` in `api/*.ts` functions

#### Manual Steps (Vercel Dashboard)

1. Connect your GitHub repo to Vercel
2. Framework preset: **Other** (Vite auto-detection may work)
3. Build command: `npm run build`
4. Output directory: `dist`
5. No environment variables needed for v1

### Other Hosting

```bash
npm run build
# Deploy the dist/ folder to Netlify, Cloudflare Pages, or any static host
```

The GDELT proxy function is only needed if you want server-side fetching. Without it, the client-side fallback in `src/sources/gdelt.ts` will try the GDELT API directly from the browser.

## License

MIT — use it however you like.
