// Trip map helpers: reading Google My Maps exports (KMZ/KML), distances,
// stop ordering, and links that open places in Google or Apple Maps.
import { unzipSync, strFromU8 } from "fflate";

const uid = () => Math.random().toString(36).slice(2, 10);

// One colour per day when the file doesn't carry its own.
export const DAY_COLORS = ["#0288D1", "#A52714", "#097138", "#14323A", "#E0A526", "#FF5252", "#9C27B0", "#F57C00", "#558B2F", "#5D4037"];

export const blankMap = () => ({ days: [], places: [] });
export const mapOf = (trip) => ({
  days: Array.isArray(trip?.map?.days) ? trip.map.days : [],
  places: Array.isArray(trip?.map?.places) ? trip.map.places : [],
});

/* ---------------- Import ---------------- */

const kids = (el, tag) => Array.from(el.children).filter((c) => c.localName === tag);
const kid = (el, tag) => kids(el, tag)[0];
const text = (el, tag) => (kid(el, tag)?.textContent || "").trim();

// Google My Maps style ids look like "icon-1899-0288D1-nodesc"; KML colours are aabbggrr.
function styleColor(doc, styleUrl) {
  const id = (styleUrl || "").replace(/^#/, "");
  const m = id.match(/-([0-9A-Fa-f]{6})(?:-|$)/);
  if (m) return "#" + m[1].toUpperCase();
  const style = doc.getElementById?.(id) || Array.from(doc.getElementsByTagName("Style")).find((s) => s.getAttribute("id") === id);
  const c = style?.getElementsByTagName("color")?.[0]?.textContent?.trim();
  if (c && /^[0-9a-f]{8}$/i.test(c)) return `#${c.slice(6, 8)}${c.slice(4, 6)}${c.slice(2, 4)}`.toUpperCase();
  return null;
}

// Strip My Maps' HTML from descriptions.
const plain = (html) => {
  if (!html) return "";
  const d = new DOMParser().parseFromString(`<div>${html.replace(/<br\s*\/?>/gi, "\n")}</div>`, "text/html");
  return (d.body.textContent || "").trim();
};

function readPlacemark(doc, p) {
  // Points only; lines and shapes (routes drawn in My Maps) are skipped.
  const pt = p.getElementsByTagName("Point")[0];
  const raw = pt?.getElementsByTagName("coordinates")[0]?.textContent?.trim();
  if (!raw) return null;
  const [lng, lat] = raw.split(/[\s,]+/).map(Number);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  const extra = Array.from(p.getElementsByTagName("Data"))
    .map((d) => [d.getAttribute("name"), (d.getElementsByTagName("value")[0]?.textContent || "").trim()])
    .filter(([k, v]) => v && !/^(gx_media_links|name|description)$/i.test(k));
  const notes = [plain(text(p, "description")), ...extra.map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join("\n");
  return {
    name: text(p, "name") || "Unnamed place",
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    notes,
    color: styleColor(doc, text(p, "styleUrl")),
  };
}

/** Parse KML text into layers: [{ label, color, places: [...] }] */
export function parseKML(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("This file isn't valid KML.");
  const root = doc.getElementsByTagName("Document")[0] || doc.documentElement;
  const title = text(root, "name");
  const layers = [];
  const walk = (el, label) => {
    const own = kids(el, "Placemark").map((p) => readPlacemark(doc, p)).filter(Boolean);
    if (own.length) layers.push({ label: label || title || "Places", color: own.find((x) => x.color)?.color || null, places: own });
    kids(el, "Folder").forEach((f) => walk(f, text(f, "name") || label));
    kids(el, "Document").forEach((d) => walk(d, text(d, "name") || label));
  };
  walk(root, "");
  return { title, layers };
}

/** Read a .kmz (zipped) or .kml File. */
export async function readMapFile(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
  let xml;
  if (isZip) {
    const files = unzipSync(buf, { filter: (f) => /\.kml$/i.test(f.name) });
    const name = Object.keys(files).sort((a, b) => (a === "doc.kml" ? -1 : b === "doc.kml" ? 1 : a.length - b.length))[0];
    if (!name) throw new Error("No map data (.kml) inside this .kmz file.");
    xml = strFromU8(files[name]);
  } else {
    xml = new TextDecoder().decode(buf);
  }
  return parseKML(xml);
}

// "Day 3 – Roppongi" → 3
export const dayNumber = (label) => {
  const m = (label || "").match(/\b(?:day|dia|d)\s*(\d{1,2})\b|^(\d{1,2})\b|第\s*(\d{1,2})\s*天/i);
  return m ? Number(m[1] || m[2] || m[3]) : null;
};

/**
 * Turn parsed layers into new map days and places for a trip, skipping places
 * already on the map (same name within ~60 m). Layers called "Day N" are put
 * on the Nth day of the trip when the trip has dates.
 */
export function importLayers(map, layers, { tripDates = [] } = {}) {
  const days = [...map.days];
  const places = [...map.places];
  let added = 0, skipped = 0, newDays = 0;
  layers.forEach((layer, li) => {
    let day = days.find((d) => d.label.trim().toLowerCase() === layer.label.trim().toLowerCase());
    if (!day) {
      const n = dayNumber(layer.label);
      const date = n && tripDates[n - 1] ? tripDates[n - 1] : "";
      day = { id: "md_" + uid(), label: layer.label, date, color: layer.color || DAY_COLORS[(days.length + li) % DAY_COLORS.length] };
      days.push(day);
      newDays++;
    }
    let order = places.filter((p) => p.dayId === day.id).length;
    layer.places.forEach((p) => {
      const dup = places.some((q) => q.name.trim().toLowerCase() === p.name.trim().toLowerCase() && distanceKm(q, p) < 0.06);
      if (dup) { skipped++; return; }
      places.push({ id: "pl_" + uid(), dayId: day.id, name: p.name, lat: p.lat, lng: p.lng, notes: p.notes || "", order: order++, visited: false });
      added++;
    });
  });
  return { map: { days, places }, added, skipped, newDays };
}

/* ---------------- Geometry ---------------- */

export function distanceKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const pathKm = (stops) => stops.slice(1).reduce((s, p, i) => s + distanceKm(stops[i], p), 0);

/**
 * Shortest-ish walking order that keeps the first stop where it is:
 * nearest neighbour, then 2-opt clean-up. Good enough for a day's 3–15 stops.
 */
export function bestOrder(stops) {
  if (stops.length < 3) return stops;
  const rest = stops.slice(1);
  const route = [stops[0]];
  while (rest.length) {
    const last = route[route.length - 1];
    let bi = 0;
    rest.forEach((p, i) => { if (distanceKm(last, p) < distanceKm(last, rest[bi])) bi = i; });
    route.push(rest.splice(bi, 1)[0]);
  }
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const cand = [...route.slice(0, i), ...route.slice(i, k + 1).reverse(), ...route.slice(k + 1)];
        if (pathKm(cand) + 1e-9 < pathKm(route)) { route.splice(0, route.length, ...cand); improved = true; }
      }
    }
  }
  return route;
}

/* ---------------- Adding places ---------------- */

/** Coordinates from "35.68, 139.76" or a Google/Apple Maps link that carries them. */
export function coordsFromText(s) {
  const t = decodeURIComponent((s || "").trim());
  const pats = [
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // Google place data (most precise)
    /@(-?\d+\.\d+),(-?\d+\.\d+)/, // Google viewport
    /[?&](?:q|ll|query|daddr|destination|sll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
    /^(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)$/,
  ];
  for (const p of pats) {
    const m = t.match(p);
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

/** Place name from a Google Maps link like …/place/Senso-ji/@… */
export function nameFromLink(s) {
  const m = decodeURIComponent(s || "").match(/\/place\/([^/@]+)/);
  return m ? m[1].replace(/\+/g, " ").trim() : "";
}

// OpenStreetMap's free geocoder (no key). Biased towards what's on screen.
export async function searchPlaces(q, near) {
  const params = new URLSearchParams({ q, format: "jsonv2", limit: "6", "accept-language": "en" });
  if (near) {
    const d = 0.6;
    params.set("viewbox", `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal: ctl.signal });
    if (!r.ok) throw new Error(`search failed (${r.status})`);
    const arr = await r.json();
    return arr.map((x) => ({ name: x.name || x.display_name.split(",")[0], address: x.display_name, lat: Number(x.lat), lng: Number(x.lon) }));
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "search timed out (OpenStreetMap may be blocked on this network)" : e.message);
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- Open in Maps ---------------- */

const ll = (p) => `${p.lat},${p.lng}`;

// Searches the name around the pin, so Google opens the actual venue (hours,
// reviews) rather than a bare dropped pin.
export const googleUrl = (p) =>
  p.name ? `https://www.google.com/maps/search/${encodeURIComponent(p.name)}/@${ll(p)},17z` : `https://www.google.com/maps/search/?api=1&query=${ll(p)}`;
export const appleUrl = (p) => `https://maps.apple.com/?ll=${ll(p)}&q=${encodeURIComponent(p.name || "Place")}`;

// Google Maps directions take up to 9 stops between start and end.
export const MAX_GOOGLE_WAYPOINTS = 9;
export function googleRouteUrls(stops, mode = "transit") {
  if (stops.length < 2) return [];
  const chunks = [];
  const size = MAX_GOOGLE_WAYPOINTS + 2;
  for (let i = 0; i < stops.length - 1; i += size - 1) chunks.push(stops.slice(i, i + size));
  return chunks.map((c) => {
    const params = new URLSearchParams({ api: "1", origin: ll(c[0]), destination: ll(c[c.length - 1]), travelmode: mode });
    if (c.length > 2) params.set("waypoints", c.slice(1, -1).map(ll).join("|"));
    return { from: c[0], to: c[c.length - 1], count: c.length, url: `https://www.google.com/maps/dir/?${params}` };
  });
}
export function appleRouteUrl(from, to, mode = "r") {
  return `https://maps.apple.com/?saddr=${ll(from)}&daddr=${ll(to)}&dirflg=${mode}`;
}

/* ---------------- Base maps ---------------- */
// Tiles are cached on the device once seen (see vite.config.js), so a day you
// looked at at the hotel still shows offline.
export const TILE_SOURCES = {
  carto: {
    label: "Light (CARTO)",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
  },
  osm: {
    label: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    subdomains: "",
  },
};
