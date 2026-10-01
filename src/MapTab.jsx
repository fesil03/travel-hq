import { useState, useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Upload, Plus, Trash2, ChevronUp, ChevronDown, Route, ExternalLink, MapPin, Search, Crosshair,
  X, Check, Pencil, Loader2, Navigation, Shuffle,
} from "lucide-react";
import {
  mapOf, blankMap, readMapFile, importLayers, distanceKm, pathKm, bestOrder, coordsFromText, nameFromLink,
  searchPlaces, googleUrl, appleUrl, googleRouteUrls, appleRouteUrl, TILE_SOURCES, DAY_COLORS,
} from "./maps.js";

const uid = () => Math.random().toString(36).slice(2, 10);
const UNSCHEDULED = "";

const MAP_CSS = `
.thq .pin{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);color:#fff;font:700 11px/1 'Instrument Sans',system-ui,sans-serif}
.thq .pin span{transform:rotate(45deg)}
.thq .pin.done{opacity:.45}
.thq .pin.sel{outline:3px solid var(--gold);outline-offset:1px}
.thq .pin.draft{background:var(--gold)!important;color:var(--ink)}
.thq .leaflet-container{font-family:inherit;background:#E8EEEC}
.thq .mapbox{height:62vh;min-height:340px;border-radius:10px;overflow:hidden;border:1px solid var(--line)}
.thq .mapbox.picking{cursor:crosshair}
.thq .mapbox.picking .leaflet-container{cursor:crosshair}
.thq .badge{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;border-radius:999px;color:#fff;font-size:11px;font-weight:700;flex:none}
.thq .stop.sel{box-shadow:inset 4px 0 0 var(--gold);background:#FCFAF3}
.thq .daychip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;border:1px solid var(--line);background:#fff;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;color:var(--ink)}
.thq .daychip[aria-pressed=true]{background:var(--ink);color:#fff;border-color:var(--ink)}
.thq .dot{width:10px;height:10px;border-radius:50%;flex:none}
.thq .iconbtn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;background:none;border:none;color:var(--ink);cursor:pointer}
.thq .iconbtn:hover{background:rgba(20,50,58,.07)}
.thq .iconbtn:disabled{opacity:.3;cursor:default}
`;

const getPref = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const km = (n) => (n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`);

function pinIcon(color, label, { done, sel, draft } = {}) {
  return L.divIcon({
    className: "",
    html: `<div class="pin${done ? " done" : ""}${sel ? " sel" : ""}${draft ? " draft" : ""}" style="background:${color}"><span>${label}</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });
}

/* ------------------------------------------------------------------ */

export default function MapTab({ trip, updTrip, tripDates, fmtDate, focusDay, onFocusUsed }) {
  const map = useMemo(() => mapOf(trip), [trip]);
  const [view, setView] = useState("all"); // "all" | dayId | UNSCHEDULED
  const [sel, setSel] = useState(null); // place id
  const [adding, setAdding] = useState(null); // draft place or null
  const [picking, setPicking] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [tiles, setTiles] = useState(() => getPref("thq.tiles", "carto"));
  const fileRef = useRef(null);

  const dayById = useMemo(() => Object.fromEntries(map.days.map((d) => [d.id, d])), [map.days]);
  const sortedDays = useMemo(() => {
    const idx = new Map(map.days.map((d, i) => [d.id, i]));
    return [...map.days].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || idx.get(a.id) - idx.get(b.id));
  }, [map.days]);
  const stopsOf = (dayId) => map.places.filter((p) => (p.dayId || UNSCHEDULED) === dayId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const unscheduled = stopsOf(UNSCHEDULED);
  const colorOf = (p) => dayById[p.dayId]?.color || "#5E7A78";

  // Jump to a day when asked from the Itinerary tab.
  useEffect(() => {
    if (focusDay && dayById[focusDay]) { setView(focusDay); setSel(null); }
    if (focusDay) onFocusUsed?.();
  }, [focusDay]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(""), 7000); return () => clearTimeout(t); }, [msg]);
  useEffect(() => { if (view !== "all" && view !== UNSCHEDULED && !dayById[view]) setView("all"); }, [view, dayById]);

  const updMap = (fn) => updTrip((t) => {
    if (!t.map || typeof t.map !== "object") t.map = blankMap();
    if (!Array.isArray(t.map.days)) t.map.days = [];
    if (!Array.isArray(t.map.places)) t.map.places = [];
    fn(t.map, t);
  });
  const updPlace = (id, patch) => updMap((m) => { const p = m.places.find((x) => x.id === id); if (p) Object.assign(p, patch); });
  const updDay = (id, patch) => updMap((m) => { const d = m.days.find((x) => x.id === id); if (d) Object.assign(d, patch); });

  const setOrder = (dayId, ids) => updMap((m) => {
    ids.forEach((id, i) => { const p = m.places.find((x) => x.id === id); if (p) p.order = i; });
  });
  const move = (dayId, id, dir) => {
    const ids = stopsOf(dayId).map((p) => p.id);
    const i = ids.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder(dayId, ids);
  };
  const moveToDay = (id, dayId) => updMap((m) => {
    const p = m.places.find((x) => x.id === id);
    if (!p) return;
    p.dayId = dayId;
    p.order = m.places.filter((x) => x.id !== id && (x.dayId || UNSCHEDULED) === dayId).length;
  });
  const optimise = (dayId) => {
    const stops = stopsOf(dayId);
    const before = pathKm(stops);
    const after = bestOrder(stops);
    setOrder(dayId, after.map((p) => p.id));
    const saved = before - pathKm(after);
    setMsg(saved > 0.05 ? `Reordered: about ${km(saved)} shorter in straight lines, starting from ${stops[0].name}.` : "That day is already in the shortest order.");
  };
  const removePlace = (id) => { updMap((m) => { m.places = m.places.filter((x) => x.id !== id); }); if (sel === id) setSel(null); };
  const addDay = () => {
    const id = "md_" + uid();
    updMap((m) => { m.days.push({ id, label: `Day ${m.days.length + 1}`, date: "", color: DAY_COLORS[m.days.length % DAY_COLORS.length] }); });
    setView(id);
  };
  const removeDay = (id) => {
    updMap((m) => {
      let n = m.places.filter((x) => !x.dayId).length;
      m.places.forEach((p) => { if (p.dayId === id) { p.dayId = UNSCHEDULED; p.order = n++; } });
      m.days = m.days.filter((d) => d.id !== id);
    });
    setView("all");
  };

  const onImport = async (file) => {
    setErr(""); setMsg("");
    try {
      const { layers } = await readMapFile(file);
      if (!layers.length) throw new Error("No pinned places found in this file.");
      // Counts from what's on screen; the update itself re-runs on the latest copy.
      const preview = importLayers(map, layers, { tripDates });
      updMap((m) => {
        const res = importLayers(mapOf({ map: m }), layers, { tripDates });
        m.days = res.map.days;
        m.places = res.map.places;
      });
      const dated = preview.map.days.filter((d) => d.date && !map.days.some((x) => x.id === d.id)).length;
      setMsg(
        `Imported ${file.name}: ${preview.added} place${preview.added === 1 ? "" : "s"}` +
        (preview.newDays ? ` in ${preview.newDays} new day${preview.newDays === 1 ? "" : "s"}` : "") +
        (preview.skipped ? `, ${preview.skipped} already on the map skipped` : "") +
        (preview.newDays ? (dated ? `. ${dated} matched to trip dates by their "Day N" names; change any day's date with its pencil.` : ". Set each day's date with its pencil.") : ".")
      );
      setView("all");
    } catch (e) {
      setErr(`Couldn't read ${file.name}: ${e.message}`);
    }
  };

  const startAdd = () => {
    setSel(null);
    setAdding({ name: "", lat: null, lng: null, notes: "", dayId: view === "all" ? (sortedDays[0]?.id || UNSCHEDULED) : view });
    setPicking(false);
  };
  const saveAdd = () => {
    if (!adding || adding.lat === null) return;
    const id = "pl_" + uid();
    updMap((m) => {
      const order = m.places.filter((x) => (x.dayId || UNSCHEDULED) === adding.dayId).length;
      m.places.push({ id, dayId: adding.dayId, name: adding.name.trim() || "New place", lat: adding.lat, lng: adding.lng, notes: adding.notes, order, visited: false });
    });
    if (view !== "all") setView(adding.dayId);
    setAdding(null); setPicking(false); setSel(id);
  };

  const visible = view === "all" ? map.places : stopsOf(view);
  const listDays = view === "all" ? sortedDays.map((d) => d.id).concat(unscheduled.length ? [UNSCHEDULED] : []) : [view];

  return (
    <div className="space-y-4">
      <style>{MAP_CSS}</style>

      <section className="panel p-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-solid" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import My Maps (.kmz/.kml)</button>
        <input ref={fileRef} type="file" accept=".kmz,.kml,application/vnd.google-earth.kmz,application/vnd.google-earth.kml+xml" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onImport(f); }} />
        <button className="btn" onClick={startAdd}><MapPin size={14} /> Add place</button>
        <button className="btn" onClick={addDay}><Plus size={14} /> Add day</button>
        <label className="flex items-center gap-2 ml-auto text-sm">
          <span className="muted">Base map</span>
          <select style={{ width: "auto" }} value={tiles} onChange={(e) => { setTiles(e.target.value); setPref("thq.tiles", e.target.value); }}>
            {Object.entries(TILE_SOURCES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        {msg && <p className="w-full text-sm verdict" role="status">{msg}</p>}
        {err && <p className="w-full text-sm" style={{ color: "var(--bad)" }} role="alert">{err}</p>}
      </section>

      {!map.places.length && !adding ? (
        <div className="panel p-6 text-center muted">
          <p className="font-semibold" style={{ color: "var(--ink)" }}>No places on this trip's map yet.</p>
          <p className="mt-1 text-sm">In Google My Maps: ⋮ next to the map title → Export to KML/KMZ → import the file here. Each layer becomes a day.</p>
          <p className="mt-1 text-sm">Or add places one by one: search, paste a Google Maps link, or tap the map.</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Show day">
            <button className="daychip" aria-pressed={view === "all"} onClick={() => { setView("all"); setSel(null); }}>All days <span className="muted num" style={{ color: "inherit", opacity: 0.7 }}>{map.places.length}</span></button>
            {sortedDays.map((d) => (
              <button key={d.id} className="daychip" aria-pressed={view === d.id} onClick={() => { setView(d.id); setSel(null); }}>
                <span className="dot" style={{ background: d.color }} />
                {d.date ? `${fmtDate(d.date)} · ` : ""}{shortLabel(d.label)}
                <span className="num" style={{ opacity: 0.7 }}>{stopsOf(d.id).length}</span>
              </button>
            ))}
            {unscheduled.length > 0 && (
              <button className="daychip" aria-pressed={view === UNSCHEDULED} onClick={() => { setView(UNSCHEDULED); setSel(null); }}>
                <span className="dot" style={{ background: "#5E7A78" }} /> Unscheduled <span className="num" style={{ opacity: 0.7 }}>{unscheduled.length}</span>
              </button>
            )}
          </div>

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start">
            <div className="lg:sticky lg:top-3 space-y-2 min-w-0">
              <LeafletMap
                places={visible}
                days={view === "all" ? sortedDays.map((d) => d.id) : view === UNSCHEDULED ? [] : [view]}
                stopsOf={stopsOf}
                colorOf={colorOf}
                dayById={dayById}
                sel={sel}
                setSel={(id) => { const p = map.places.find((x) => x.id === id); if (view === "all" && p) setView(p.dayId || UNSCHEDULED); setSel(id); }}
                tiles={tiles}
                fitKey={`${view}|${trip.id}`}
                picking={picking}
                draft={adding && adding.lat !== null ? adding : null}
                onPick={(lat, lng) => { setAdding((a) => (a ? { ...a, lat: round6(lat), lng: round6(lng) } : a)); setPicking(false); }}
                onDragPlace={(id, lat, lng) => updPlace(id, { lat: round6(lat), lng: round6(lng) })}
                onDragDraft={(lat, lng) => setAdding((a) => (a ? { ...a, lat: round6(lat), lng: round6(lng) } : a))}
              />
              <p className="text-xs muted">
                Lines join each day's stops in order (straight lines, not streets). Select a stop to drag its pin.
                Map tiles need internet; areas you've viewed stay cached on this device.
              </p>
            </div>

            <div className="space-y-3 min-w-0">
              {adding && (
                <AddPlace
                  draft={adding}
                  setDraft={setAdding}
                  days={sortedDays}
                  fmtDate={fmtDate}
                  picking={picking}
                  setPicking={setPicking}
                  near={visible[0] || map.places[0] || null}
                  onSave={saveAdd}
                  onCancel={() => { setAdding(null); setPicking(false); }}
                />
              )}
              {listDays.map((dayId) => (
                <DayList
                  key={dayId || "none"}
                  day={dayById[dayId] || null}
                  stops={stopsOf(dayId)}
                  days={sortedDays}
                  tripDates={tripDates}
                  fmtDate={fmtDate}
                  compact={view === "all"}
                  sel={sel}
                  setSel={setSel}
                  onOpen={(placeId = null) => { setView(dayId); setSel(placeId); }}
                  updDay={updDay}
                  updPlace={updPlace}
                  move={move}
                  moveToDay={moveToDay}
                  optimise={optimise}
                  removePlace={removePlace}
                  removeDay={removeDay}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;
// "Day 3 – Roppongi / Azabu" → "Day 3 Roppongi / Azabu" kept short for chips
const shortLabel = (s) => (s || "").replace(/\s*[–—-]\s*/, " ").slice(0, 34);

/* ---------------- Leaflet map ---------------- */

function LeafletMap({ places, days, stopsOf, colorOf, dayById, sel, setSel, tiles, fitKey, picking, draft, onPick, onDragPlace, onDragDraft }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const tileRef = useRef(null);
  const markers = useRef({});
  const cb = useRef({});
  cb.current = { onPick, onDragPlace, onDragDraft, setSel, picking };
  const lastFit = useRef("");
  const fitRef = useRef(null);
  const [tileTrouble, setTileTrouble] = useState(false);

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, worldCopyJump: true });
    m.setView([35.68, 139.76], 12);
    layerRef.current = L.layerGroup().addTo(m);
    m.on("click", (e) => { if (cb.current.picking) cb.current.onPick(e.latlng.lat, e.latlng.lng); });
    mapRef.current = m;
    lastFit.current = "";
    // The tab can mount while hidden or resizing; recalc size once laid out.
    const ro = new ResizeObserver(() => {
      m.invalidateSize();
      // Re-fit if the box changed size right after fitting (tab just opened, phone rotated).
      if (fitRef.current && Date.now() - fitRef.current.at < 2000) fitTo(m, fitRef.current.b, fitRef.current.single);
    });
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (tileRef.current) tileRef.current.remove();
    const t = TILE_SOURCES[tiles] || TILE_SOURCES.carto;
    setTileTrouble(false);
    let ok = 0, bad = 0;
    tileRef.current = L.tileLayer(t.url, { attribution: t.attribution, subdomains: t.subdomains || "abc", maxZoom: 19, crossOrigin: true })
      .on("tileload", () => { ok++; setTileTrouble(false); })
      .on("tileerror", () => { bad++; if (bad >= 6 && ok === 0) setTileTrouble(true); })
      .addTo(m);
  }, [tiles]);

  // Redraw pins and day lines.
  useEffect(() => {
    const m = mapRef.current, g = layerRef.current;
    if (!m || !g) return;
    g.clearLayers();
    markers.current = {};
    days.forEach((dayId) => {
      const stops = stopsOf(dayId);
      if (stops.length > 1) {
        L.polyline(stops.map((p) => [p.lat, p.lng]), { color: dayById[dayId]?.color || "#14323A", weight: 3, opacity: 0.75, dashArray: "6 6" }).addTo(g);
      }
    });
    places.forEach((p) => {
      const idx = p.dayId ? stopsOf(p.dayId).findIndex((x) => x.id === p.id) + 1 : "•";
      const mk = L.marker([p.lat, p.lng], {
        icon: pinIcon(colorOf(p), idx, { done: p.visited, sel: p.id === sel }),
        draggable: p.id === sel,
        zIndexOffset: p.id === sel ? 1000 : 0,
        title: p.name,
        keyboard: true,
      }).addTo(g);
      mk.bindTooltip(`${idx !== "•" ? idx + ". " : ""}${escapeHTML(p.name)}`, { direction: "top", offset: [0, -24] });
      mk.on("click", () => cb.current.setSel(p.id));
      mk.on("dragend", (e) => { const ll = e.target.getLatLng(); cb.current.onDragPlace(p.id, ll.lat, ll.lng); });
      markers.current[p.id] = mk;
    });
    if (draft) {
      const mk = L.marker([draft.lat, draft.lng], { icon: pinIcon("#E0A526", "+", { draft: true }), draggable: true, zIndexOffset: 2000 }).addTo(g);
      mk.on("dragend", (e) => { const ll = e.target.getLatLng(); cb.current.onDragDraft(ll.lat, ll.lng); });
    }
    if (lastFit.current !== fitKey && places.length) {
      lastFit.current = fitKey;
      const b = L.latLngBounds(places.map((p) => [p.lat, p.lng]));
      fitRef.current = { b, single: places.length === 1, at: Date.now() };
      fitTo(m, b, places.length === 1);
    }
  }, [places, days, sel, draft, fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bring the selected stop into view.
  useEffect(() => {
    const m = mapRef.current, mk = markers.current[sel];
    if (m && mk && !m.getBounds().pad(-0.1).contains(mk.getLatLng())) m.panTo(mk.getLatLng());
  }, [sel]);
  useEffect(() => { if (draft && mapRef.current) mapRef.current.panTo([draft.lat, draft.lng]); }, [draft?.lat, draft?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative">
      <div ref={el} className={`mapbox ${picking ? "picking" : ""}`} role="application" aria-label="Trip map" />
      {tileTrouble && (
        <p className="absolute left-2 right-2 bottom-7 text-xs verdict" style={{ zIndex: 500 }} role="status">
          The base map isn't loading on this network. Try the other base map, or a VPN. Pins, order and links still work.
        </p>
      )}
    </div>
  );
}

const fitTo = (m, b, single) => (single ? m.setView(b.getCenter(), 15) : m.fitBounds(b, { padding: [36, 36], maxZoom: 16 }));

const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------------- Day list ---------------- */

function DayList({ day, stops, days, tripDates, fmtDate, compact, sel, setSel, onOpen, updDay, updPlace, move, moveToDay, optimise, removePlace, removeDay }) {
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const dayId = day?.id || UNSCHEDULED;
  const dist = pathKm(stops);
  // Google ignores extra stops for public transport, so the whole-day route is walking; single legs use transit.
  const routes = googleRouteUrls(stops, "walking");
  const selRef = useRef(null);
  useEffect(() => { if (sel && selRef.current) selRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [sel]);

  return (
    <section className="panel">
      <header className="p-3 flex flex-wrap items-start gap-2" style={{ borderBottom: "1px solid var(--line)" }}>
        <span className="dot mt-1.5" style={{ background: day?.color || "#5E7A78", width: 12, height: 12 }} />
        <div className="flex-1 min-w-0">
          {editing && day ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
              <input aria-label="Day name" value={day.label} onChange={(e) => updDay(day.id, { label: e.target.value })} />
              <select aria-label="Date" value={day.date || ""} onChange={(e) => updDay(day.id, { date: e.target.value })}>
                <option value="">No date</option>
                {tripDates.map((d, i) => <option key={d} value={d}>{fmtDate(d)} (day {i + 1})</option>)}
                {day.date && !tripDates.includes(day.date) && <option value={day.date}>{fmtDate(day.date)}</option>}
              </select>
              <input aria-label="Colour" type="color" value={day.color} onChange={(e) => updDay(day.id, { color: e.target.value })} style={{ width: 44, padding: 2, height: 34 }} />
            </div>
          ) : (
            <button className="text-left w-full" style={{ background: "none", border: "none", padding: 0, cursor: compact ? "pointer" : "default", color: "inherit" }} onClick={compact ? () => onOpen() : undefined}>
              <div className="font-semibold leading-tight">{day ? day.label : "Unscheduled"}</div>
              <div className="text-xs muted num">
                {day?.date ? `${fmtDate(day.date)} · ` : day ? "No date · " : ""}
                {stops.length} stop{stops.length === 1 ? "" : "s"}{stops.length > 1 ? ` · ~${km(dist)} between stops` : ""}
              </div>
            </button>
          )}
        </div>
        {day && !compact && (
          <div className="flex items-center gap-1">
            <button className="iconbtn" title={editing ? "Done" : "Rename, set date or colour"} aria-label={editing ? "Done editing day" : "Edit day"} onClick={() => setEditing(!editing)}>{editing ? <Check size={16} /> : <Pencil size={15} />}</button>
            {confirmDel ? (
              <>
                <button className="btn btn-danger" style={{ padding: "4px 10px" }} onClick={() => removeDay(day.id)}>Remove day</button>
                <button className="iconbtn" aria-label="Keep day" onClick={() => setConfirmDel(false)}><X size={15} /></button>
              </>
            ) : (
              <button className="iconbtn" title="Remove day (its places move to Unscheduled)" aria-label="Remove day" onClick={() => setConfirmDel(true)}><Trash2 size={15} /></button>
            )}
          </div>
        )}
      </header>

      {!compact && day && stops.length > 1 && (
        <div className="px-3 py-2 flex flex-wrap gap-2" style={{ borderBottom: "1px solid var(--line)" }}>
          {stops.length > 2 && <button className="btn" onClick={() => optimise(dayId)} title="Keeps the first stop, reorders the rest to minimise distance"><Shuffle size={14} /> Shortest order</button>}
          {routes.map((r, i) => (
            <a key={i} className="btn" href={r.url} target="_blank" rel="noreferrer">
              <Route size={14} /> {routes.length > 1 ? `Directions part ${i + 1} (${r.count} stops)` : "Day route in Google Maps (walking)"}
            </a>
          ))}
        </div>
      )}

      {stops.length === 0 ? (
        <p className="p-3 text-sm muted">No places yet. Use Add place, or move one here from another day.</p>
      ) : (
        <ol>
          {stops.map((p, i) => {
            const prev = stops[i - 1];
            const isSel = p.id === sel;
            if (compact) {
              return (
                <li key={p.id} className="px-3 py-1.5 flex items-center gap-2 text-sm" style={{ borderTop: i ? "1px solid #E3EBE8" : "none" }}>
                  <span className="badge" style={{ background: day?.color || "#5E7A78", opacity: p.visited ? 0.45 : 1 }}>{day ? i + 1 : "•"}</span>
                  <button className="text-left flex-1 min-w-0 truncate" style={{ background: "none", border: "none", padding: 0, color: "inherit", textDecoration: p.visited ? "line-through" : "none" }} onClick={() => onOpen(p.id)}>{p.name}</button>
                </li>
              );
            }
            return (
              <li key={p.id} ref={isSel ? selRef : null} className={`stop px-3 py-2 ${isSel ? "sel" : ""}`} style={{ borderTop: i ? "1px solid #E3EBE8" : "none" }}>
                {prev && day && (
                  <div className="text-xs muted mb-1 flex items-center gap-2 pl-8">
                    <span>↓ {km(distanceKm(prev, p))}</span>
                    <a className="underline" href={appleRouteUrl(prev, p, "r")} target="_blank" rel="noreferrer">Apple Maps</a>
                    <a className="underline" href={googleRouteUrls([prev, p], "transit")[0].url} target="_blank" rel="noreferrer">Google</a>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <span className="badge mt-0.5" style={{ background: day?.color || "#5E7A78", opacity: p.visited ? 0.45 : 1 }}>{day ? i + 1 : "•"}</span>
                  <div className="flex-1 min-w-0">
                    {isSel ? (
                      <input aria-label="Place name" value={p.name} onChange={(e) => updPlace(p.id, { name: e.target.value })} className="font-semibold" />
                    ) : (
                      <button className="text-left font-semibold leading-tight" style={{ background: "none", border: "none", padding: 0, color: "inherit", textDecoration: p.visited ? "line-through" : "none" }} onClick={() => setSel(p.id)}>{p.name}</button>
                    )}
                    {!isSel && p.notes && <p className="text-xs muted mt-0.5 line-clamp-2 whitespace-pre-line">{p.notes}</p>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs">
                      <a className="inline-flex items-center gap-1 underline" href={googleUrl(p)} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Google Maps</a>
                      <a className="inline-flex items-center gap-1 underline" href={appleUrl(p)} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Apple Maps</a>
                      <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!p.visited} onChange={(e) => updPlace(p.id, { visited: e.target.checked })} /> Visited</label>
                    </div>
                    {isSel && (
                      <div className="grid grid-cols-1 gap-2 mt-2">
                        <textarea aria-label="Notes" rows={2} placeholder="Notes: opening hours, tickets, what to eat" value={p.notes || ""} onChange={(e) => updPlace(p.id, { notes: e.target.value })} />
                        <div className="flex flex-wrap items-center gap-2">
                          <select aria-label="Move to day" style={{ width: "auto", maxWidth: "100%" }} value={p.dayId || UNSCHEDULED} onChange={(e) => moveToDay(p.id, e.target.value)}>
                            {days.map((d) => <option key={d.id} value={d.id}>{d.date ? `${fmtDate(d.date)} · ` : ""}{d.label}</option>)}
                            <option value={UNSCHEDULED}>Unscheduled</option>
                          </select>
                          <span className="text-xs muted num">{p.lat.toFixed(5)}, {p.lng.toFixed(5)} · drag the pin to move it</span>
                        </div>
                        <div className="flex gap-2">
                          <button className="btn btn-danger" onClick={() => removePlace(p.id)}><Trash2 size={14} /> Delete place</button>
                          <button className="btn" onClick={() => setSel(null)}><Check size={14} /> Done</button>
                        </div>
                      </div>
                    )}
                  </div>
                  {day && (
                    <div className="flex flex-col">
                      <button className="iconbtn" aria-label={`Move ${p.name} earlier`} disabled={i === 0} onClick={() => move(dayId, p.id, -1)}><ChevronUp size={16} /></button>
                      <button className="iconbtn" aria-label={`Move ${p.name} later`} disabled={i === stops.length - 1} onClick={() => move(dayId, p.id, 1)}><ChevronDown size={16} /></button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/* ---------------- Add place ---------------- */

function AddPlace({ draft, setDraft, days, fmtDate, picking, setPicking, near, onSave, onCancel }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const go = async () => {
    const s = q.trim();
    if (!s) return;
    setErr(""); setResults(null);
    const c = coordsFromText(s);
    if (c) {
      set({ ...c, name: draft.name || nameFromLink(s) });
      setQ("");
      return;
    }
    if (/^https?:\/\//i.test(s)) {
      setErr("That link has no coordinates in it (short goo.gl / maps.app links don't). Open it, then copy the full address-bar link, or search by name.");
      return;
    }
    setBusy(true);
    try {
      const r = await searchPlaces(s, near);
      setResults(r);
      if (!r.length) setErr("Nothing found. Try the name in English or Japanese, or tap the map.");
    } catch (e) {
      setErr(`Search unavailable: ${e.message}. Paste a Google Maps link or tap the map instead.`);
    }
    setBusy(false);
  };

  return (
    <section className="panel p-3 space-y-2" style={{ borderColor: "var(--gold)" }}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Add a place</h3>
        <button className="iconbtn" aria-label="Cancel" onClick={onCancel}><X size={16} /></button>
      </div>
      <div className="flex gap-2">
        <input aria-label="Search, or paste a link or coordinates" placeholder="Search, paste a Google Maps link, or 35.68, 139.76" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} />
        <button className="btn" onClick={go} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <Search size={14} />} Find</button>
      </div>
      <button className={`btn ${picking ? "btn-solid" : ""}`} onClick={() => setPicking(!picking)}><Crosshair size={14} /> {picking ? "Tap the map now…" : "Pick on map"}</button>
      {err && <p className="text-sm" style={{ color: "var(--bad)" }}>{err}</p>}
      {results && results.length > 0 && (
        <ul className="text-sm" style={{ border: "1px solid var(--line)", borderRadius: 8 }}>
          {results.map((r, i) => (
            <li key={i} style={{ borderTop: i ? "1px solid #E3EBE8" : "none" }}>
              <button className="w-full text-left px-2 py-1.5" style={{ background: "none", border: "none", color: "inherit" }}
                onClick={() => { set({ name: draft.name || r.name, lat: round6(r.lat), lng: round6(r.lng) }); setResults(null); setQ(""); }}>
                <span className="font-semibold">{r.name}</span>
                <span className="block text-xs muted truncate">{r.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input aria-label="Name" placeholder="Name" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
        <select aria-label="Day" value={draft.dayId} onChange={(e) => set({ dayId: e.target.value })}>
          {days.map((d) => <option key={d.id} value={d.id}>{d.date ? `${fmtDate(d.date)} · ` : ""}{d.label}</option>)}
          <option value={UNSCHEDULED}>Unscheduled</option>
        </select>
      </div>
      <textarea aria-label="Notes" rows={2} placeholder="Notes (optional)" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
      <div className="flex items-center gap-2">
        <button className="btn btn-solid" disabled={draft.lat === null} onClick={onSave}><Navigation size={14} /> Save place</button>
        <span className="text-xs muted num">{draft.lat === null ? "No location yet" : `${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)} · drag the gold pin to adjust`}</span>
      </div>
    </section>
  );
}
