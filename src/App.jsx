import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plane, BedDouble, CalendarDays, CloudSun, Luggage, LayoutGrid, Wallet, Plus, Trash2,
  Sparkles, Check, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Info, Loader2,
  RefreshCw, ArrowLeftRight, XCircle, ExternalLink, Cloud, CloudOff, Download, Upload, CarFront,
  Mail, X, Paperclip,
} from "lucide-react";
import { askAI, aiConfig, aiReady, testAI, AI_PROVIDERS } from "./ai.js";
import { readInputs } from "./emailinput.js";
import {
  getDevice, setDevice, syncConfigured, loadLocal, saveLocal, getMeta, setMeta,
  pull, push, ConflictError, NetworkError,
} from "./sync.js";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const DAY = 86400000;
const CURRENCIES = ["USD", "CNY", "BRL", "IDR", "JPY", "EUR", "SGD", "MYR", "THB"];
const SYM = { USD: "$", CNY: "¥", BRL: "R$", IDR: "Rp ", JPY: "JP¥", EUR: "€", SGD: "S$", MYR: "RM ", THB: "฿" };

const PROGRAMS = {
  avios: "Qatar Avios",
  aeroplan: "Aeroplan",
  latam: "LATAM Pass",
  turkish: "Miles&Smiles",
  milesmore: "Miles&More",
};

// code: [name, alliance, program in the wallet that earns on this metal]
const CARRIERS = {
  QR: ["Qatar Airways", "oneworld", "avios"], BA: ["British Airways", "oneworld", "avios"],
  CX: ["Cathay Pacific", "oneworld", "avios"], JL: ["Japan Airlines", "oneworld", "avios"],
  MH: ["Malaysia Airlines", "oneworld", "avios"], QF: ["Qantas", "oneworld", "avios"],
  AA: ["American", "oneworld", "avios"], IB: ["Iberia", "oneworld", "avios"],
  AY: ["Finnair", "oneworld", "avios"], UL: ["SriLankan", "oneworld", "avios"],
  RJ: ["Royal Jordanian", "oneworld", "avios"], AS: ["Alaska", "oneworld", "avios"],
  WY: ["Oman Air", "oneworld", "avios"], AT: ["Royal Air Maroc", "oneworld", "avios"],
  FJ: ["Fiji Airways", "oneworld", "avios"],
  CZ: ["China Southern", "none", "avios"],
  CA: ["Air China", "star", "aeroplan"], NH: ["ANA", "star", "aeroplan"],
  SQ: ["Singapore Airlines", "star", "aeroplan"], TG: ["Thai Airways", "star", "aeroplan"],
  TK: ["Turkish Airlines", "star", "aeroplan"], LH: ["Lufthansa", "star", "aeroplan"],
  UA: ["United", "star", "aeroplan"], AC: ["Air Canada", "star", "aeroplan"],
  OZ: ["Asiana", "star", "aeroplan"], BR: ["EVA Air", "star", "aeroplan"],
  ZH: ["Shenzhen Airlines", "star", "aeroplan"], NZ: ["Air New Zealand", "star", "aeroplan"],
  ET: ["Ethiopian", "star", "aeroplan"], TP: ["TAP", "star", "aeroplan"],
  LX: ["Swiss", "star", "aeroplan"], AI: ["Air India", "star", "aeroplan"],
  CM: ["Copa", "star", "aeroplan"], AV: ["Avianca", "star", "aeroplan"],
  MU: ["China Eastern", "skyteam", null], FM: ["Shanghai Airlines", "skyteam", null],
  KE: ["Korean Air", "skyteam", null], GA: ["Garuda Indonesia", "skyteam", null],
  VN: ["Vietnam Airlines", "skyteam", null], CI: ["China Airlines", "skyteam", null],
  MF: ["Xiamen Airlines", "skyteam", null], AF: ["Air France", "skyteam", null],
  KL: ["KLM", "skyteam", null], DL: ["Delta", "skyteam", null],
  LA: ["LATAM", "none", "latam"], "3U": ["Sichuan Airlines", "none", null],
  HU: ["Hainan Airlines", "none", null], HO: ["Juneyao Air", "none", null],
  AK: ["AirAsia", "none", null], D7: ["AirAsia X", "none", null],
  QZ: ["Indonesia AirAsia", "none", null], JT: ["Lion Air", "none", null],
  ID: ["Batik Air", "none", null], TR: ["Scoot", "none", null],
  VJ: ["VietJet", "none", null], "5J": ["Cebu Pacific", "none", null],
  "9C": ["Spring Airlines", "none", null], MM: ["Peach", "none", null],
};

const ALLIANCE_LABEL = { oneworld: "Oneworld", star: "Star Alliance", skyteam: "SkyTeam", none: "Unaligned", unknown: "Unknown carrier" };

const CHANNELS = {
  latam: "LATAM × Booking.com",
  qatar: "Qatar × Booking.com",
  direct: "Direct with hotel",
  other: "Other site",
};

// Ground transfers (airport ↔ hotel, between towns). Each mode seeds a
// pre-trip checklist you can edit; ticking boxes is the whole point.
const TRANSFER_MODES = {
  public: ["Public transport", ["Route and line checked", "Transit card or ticket app sorted", "First and last departure times checked", "Offline map saved"]],
  taxi: ["Taxi", ["Fare estimate noted", "Address saved in the local language", "Cash or local payment ready", "Official taxi rank located"]],
  app: ["Ride-hailing app", ["App installed and logged in", "Payment method works abroad", "Pickup point found", "Roaming or eSIM working on arrival"]],
  booked: ["Booked transfer", ["Booked", "Confirmation saved offline", "Pickup time and meeting point confirmed", "Driver or company contact saved", "Paid"]],
  shuttle: ["Hotel shuttle", ["Requested with the hotel", "Flight details sent", "Meeting point confirmed"]],
  rental: ["Rental car", ["Booked", "Licence and IDP ready", "Insurance checked", "Pickup location and hours confirmed"]],
  walk: ["Walk", ["Route saved"]],
  other: ["Other", []],
};
const transferTasks = (mode) => (TRANSFER_MODES[mode]?.[1] || []).map((text) => ({ id: uid(), text, done: false }));

const PACK_CATS = ["Documents", "Tech", "Clothing", "Shoes", "Toiletries", "Other"];
const BAGS = ["Backpack", "Suitcase", "Wear on travel day"];

// Presets built from past packing lists (Hong Kong, Jun 2026; Beijing, Jul 2026;
// Brazil carry-on, Aug 2026). Item: [bag, category, text, qty]
// qty: number, "d" = one per day (max 7), "d1" = days + 1 (max 8), or omitted.
const BUILTIN_PRESETS = [
  {
    id: "p_standard", kind: "base", name: "Standard carry only",
    desc: "Documents and tech you bring on every trip.",
    items: [],
  },
  {
    id: "p_hotcity", kind: "base", name: "Hot, humid city",
    desc: "From your Hong Kong (June) and Beijing (July) lists. About 6 days, no umbrella.",
    items: [
      ["Suitcase", "Clothing", "Tops, including collared options", "d"],
      ["Suitcase", "Clothing", "Khaki shorts", 2],
      ["Suitcase", "Clothing", "Light trousers or second jeans", 1],
      ["Suitcase", "Clothing", "Linen short-sleeve shirt"],
      ["Suitcase", "Clothing", "Windbreaker"],
      ["Suitcase", "Clothing", "Underwear", "d1"],
      ["Suitcase", "Clothing", "Socks", "d"],
      ["Suitcase", "Clothing", "Pajama set"],
      ["Suitcase", "Clothing", "Cap"],
      ["Suitcase", "Shoes", "Onitsuka Tigers"],
      ["Suitcase", "Toiletries", "Toiletry kit"],
      ["Suitcase", "Toiletries", "Sunscreen"],
      ["Backpack", "Other", "Packable rain poncho (instead of umbrella)"],
      ["Wear on travel day", "Clothing", "Dark jeans"],
      ["Wear on travel day", "Clothing", "Zip-up sweater for cold cabins"],
      ["Wear on travel day", "Shoes", "Hokas"],
    ],
  },
  {
    id: "p_tropical", kind: "base", name: "Beach and tropical",
    desc: "Your hot-city list with beach gear added. For Bali, Thailand, SEA islands.",
    items: [
      ["Suitcase", "Clothing", "Tops, including collared options", "d"],
      ["Suitcase", "Clothing", "Shorts", 3],
      ["Suitcase", "Clothing", "Light trousers for dinners and temples", 1],
      ["Suitcase", "Clothing", "Linen short-sleeve shirt"],
      ["Suitcase", "Clothing", "Swimwear", 2],
      ["Suitcase", "Clothing", "Underwear", "d1"],
      ["Suitcase", "Clothing", "Socks", 3],
      ["Suitcase", "Clothing", "Pajama set"],
      ["Suitcase", "Clothing", "Cap"],
      ["Suitcase", "Shoes", "Onitsuka Tigers"],
      ["Suitcase", "Shoes", "Sandals or flip-flops"],
      ["Suitcase", "Toiletries", "Toiletry kit"],
      ["Suitcase", "Toiletries", "Sunscreen"],
      ["Suitcase", "Toiletries", "After-sun"],
      ["Suitcase", "Toiletries", "Insect repellent"],
      ["Suitcase", "Other", "Quick-dry towel"],
      ["Backpack", "Other", "Dry bag for boats and beaches"],
      ["Backpack", "Other", "Packable rain poncho (instead of umbrella)"],
      ["Wear on travel day", "Clothing", "Dark jeans"],
      ["Wear on travel day", "Clothing", "Zip-up sweater for cold cabins"],
      ["Wear on travel day", "Shoes", "Hokas"],
    ],
  },
  {
    id: "a_meetings", kind: "addon", name: "Meetings or company visits",
    desc: "From Hong Kong and Beijing.",
    items: [
      ["Suitcase", "Clothing", "Button-down dress shirt"],
      ["Suitcase", "Clothing", "Dress pants"],
      ["Suitcase", "Clothing", "Dress socks"],
      ["Suitcase", "Clothing", "Belt"],
      ["Suitcase", "Shoes", "Loro Piana loafers"],
      ["Backpack", "Documents", "Business cards"],
      ["Suitcase", "Other", "Small gift for hosts"],
    ],
  },
  {
    id: "a_longhaul", kind: "addon", name: "Long-haul flight",
    desc: "From your Brazil carry-on list (Qatar via Doha).",
    items: [
      ["Backpack", "Other", "Eye mask, earplugs, neck pillow"],
      ["Backpack", "Clothing", "Compression socks"],
      ["Backpack", "Clothing", "One full change for the layover"],
      ["Backpack", "Other", "Empty water bottle"],
      ["Backpack", "Toiletries", "Liquids under 100ml (re-screened in transit)"],
      ["Backpack", "Toiletries", "Eye drops and lip balm"],
      ["Backpack", "Other", "Medications in original packaging"],
      ["Backpack", "Tech", "Offline maps, films and podcasts downloaded"],
    ],
  },
  {
    id: "a_brazil", kind: "addon", name: "Brazil",
    desc: "From your Brazil carry-on list.",
    items: [
      ["Backpack", "Documents", "Brazilian passport for entry and exit"],
      ["Backpack", "Documents", "CPF number on hand"],
      ["Backpack", "Documents", "Some BRL for arrival"],
      ["Backpack", "Tech", "Type N plug adapter"],
      ["Backpack", "Tech", "Brazil SIM or carrier plan sorted"],
    ],
  },
];

// Documents and tech: the same on every trip. From your Beijing backpack list
// plus the recurring items from Hong Kong and Brazil.
const STANDARD_CARRY = [
  ["Backpack", "Documents", "Passport"],
  ["Backpack", "Documents", "Residence permit and visa pages"],
  ["Backpack", "Documents", "Boarding passes and bookings saved offline"],
  ["Backpack", "Documents", "Two cards on different networks"],
  ["Backpack", "Documents", "Some local cash"],
  ["Backpack", "Tech", "Phone and cable"],
  ["Backpack", "Tech", "Laptop, charger and adapter"],
  ["Backpack", "Tech", "Chargers and plugs"],
  ["Backpack", "Tech", "Power bank with 3C label (carry-on only)"],
  ["Backpack", "Tech", "Noise-cancelling headphones"],
  ["Backpack", "Tech", "Wired headphones"],
  ["Backpack", "Tech", "Plug adapter for destination"],
  ["Backpack", "Other", "Sunglasses"],
  ["Backpack", "Other", "Glasses"],
  ["Backpack", "Other", "Sleeping mask"],
  ["Backpack", "Other", "Notebook and pens"],
];

const qtyFor = (q, days) => {
  if (q === undefined || q === null) return null;
  if (q === "d") return Math.min(7, Math.max(1, days));
  if (q === "d1") return Math.min(8, Math.max(1, days) + 1);
  return Number(q) || null;
};
const bagFor = (cat) => (cat === "Documents" || cat === "Tech" ? "Backpack" : "Suitcase");

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const uid = () => Math.random().toString(36).slice(2, 10);
const clone = (o) => JSON.parse(JSON.stringify(o));
const todayISO = () => new Date().toISOString().slice(0, 10);
const parseD = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const validD = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const nightsBetween = (a, b) => (validD(a) && validD(b) ? Math.max(0, Math.round((parseD(b) - parseD(a)) / DAY)) : 0);
const addDays = (s, n) => new Date(parseD(s) + n * DAY).toISOString().slice(0, 10);
const fmtDate = (s) => (validD(s) ? new Date(parseD(s)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "No date");
const fmtDow = (s) => new Date(parseD(s)).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
const numOrNull = (v) => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));

const toUSD = (amount, cur, st) => {
  const a = numOrNull(amount);
  if (a === null) return null;
  return a / (st.fx[cur] || 1);
};

const money = (usd, st, cur) => {
  cur = cur || st.displayCurrency;
  if (usd === null || usd === undefined || isNaN(usd)) return "—";
  const v = usd * (st.fx[cur] || 1);
  const dec = ["IDR", "JPY"].includes(cur) || Math.abs(v) >= 1000 ? 0 : 2;
  return (SYM[cur] || cur + " ") + v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

const carrier = (code) => CARRIERS[(code || "").toUpperCase().trim()];
const allianceOf = (code) => carrier(code)?.[1] || "unknown";
const tierOf = (code) => {
  const c = (code || "").toUpperCase().trim();
  if (c === "QR") return 1;
  const a = allianceOf(c);
  return a === "oneworld" ? 1 : a === "star" ? 2 : 3;
};
const compliant = (f) => (Number(f.stops) || 0) <= 1 && !f.basic;

// Existing AI features (itinerary drafts, packing suggestions) go through the
// provider chosen under This device.
const askClaude = (prompt, { search = false } = {}) =>
  askAI({ text: prompt, search: search && aiConfig().id === "anthropic" });

const JSON_ONLY = "Respond with ONLY valid JSON. No prose, no markdown, no code fences.";

const normFlight = (o = {}) => {
  const f = {
    id: uid(), leg: "Outbound", route: "", date: "", operating: "", marketing: "", flightNo: "",
    stops: 0, durationH: null, cabin: "Economy", basic: false, fareClass: "", pricePP: null,
    currency: "CNY", travelerIds: [], awardPoints: null, awardProgram: "avios", awardTaxes: null,
    estEarn: null, notes: "", link: "", selected: false, booked: false, confirmation: "", source: "manual", ...o,
  };
  f.id = o.id || uid();
  f.stops = Number(f.stops) || 0;
  f.durationH = numOrNull(f.durationH);
  f.pricePP = numOrNull(f.pricePP);
  f.operating = (f.operating || "").toUpperCase();
  f.marketing = (f.marketing || "").toUpperCase();
  f.basic = !!f.basic;
  if (!CURRENCIES.includes(f.currency)) f.currency = "USD";
  return f;
};

const normHotel = (o = {}) => {
  const h = {
    id: uid(), destId: "", name: "", area: "", nights: null, total: null, currency: "USD",
    channel: "latam", badgeAvios: false, badgeLatam: false, rating: "", notes: "", link: "",
    checkIn: "", checkOut: "", selected: false, booked: false, confirmation: "", source: "manual", ...o,
  };
  h.id = o.id || uid();
  h.total = numOrNull(h.total);
  h.nights = numOrNull(h.nights);
  if (!CURRENCIES.includes(h.currency)) h.currency = "USD";
  return h;
};

/* ------------------------------------------------------------------ */
/* Starter data                                                        */
/* ------------------------------------------------------------------ */

const DEFAULT_SETTINGS = {
  displayCurrency: "USD",
  secondaryCurrency: "CNY",
  fx: { USD: 1, CNY: 7.1, BRL: 5.4, IDR: 16300, JPY: 147, EUR: 0.86, SGD: 1.29, MYR: 4.2, THB: 32.5 },
  fxUpdated: null,
  valuation: { avios: 1.2, aeroplan: 1.3, latam: 0.8, turkish: 1.0, milesmore: 1.0 },
  bandUsd: 50, bandPct: 10, bandMode: "larger",
  floorLow: 1.0, floorHigh: 1.4,
};

// The public app ships with no personal data. Your trips, balances and rules
// come from your private GitHub data repo or a backup file.
function blankState() {
  return {
    version: 1, updatedAt: 0, activeTripId: null,
    settings: clone(DEFAULT_SETTINGS),
    balances: [], rules: [], travelers: [], trips: [], packPresets: [],
  };
}

function migrate(s) {
  const b = blankState();
  if (!s || typeof s !== "object") return b;
  return {
    ...b,
    ...s,
    settings: {
      ...b.settings,
      ...(s.settings || {}),
      fx: { ...b.settings.fx, ...(s.settings?.fx || {}) },
      valuation: { ...b.settings.valuation, ...(s.settings?.valuation || {}) },
    },
    balances: s.balances || [],
    rules: s.rules || [],
    travelers: s.travelers || [],
    trips: (s.trips || []).map(migrateTrip),
    packPresets: s.packPresets || [],
  };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function migrateTrip(t) {
  if (!t || !Array.isArray(t.hotels)) return t;
  const year = validD(t.start) ? Number(t.start.slice(0, 4)) : new Date().getFullYear();
  const toISO = (day, mon) => {
    const m = MONTHS.indexOf(mon.slice(0, 3).toLowerCase());
    if (m < 0) return "";
    let iso = `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (validD(t.start) && parseD(iso) < parseD(t.start) - 60 * DAY) iso = `${year + 1}${iso.slice(4)}`;
    return validD(iso) ? iso : "";
  };
  const hotels = t.hotels.map((h) => {
    if (!h || validD(h.checkIn) || typeof h.notes !== "string") return h;
    const m = h.notes.match(/^(\d{1,2}) ([A-Za-z]{3,9}) to (\d{1,2}) ([A-Za-z]{3,9})(?:\.\s*|$)/);
    if (!m) return h;
    const checkIn = toISO(m[1], m[2]), checkOut = toISO(m[3], m[4]);
    if (!checkIn || !checkOut || parseD(checkOut) <= parseD(checkIn)) return h;
    return { ...h, checkIn, checkOut, notes: h.notes.slice(m[0].length) };
  });
  return { ...t, hotels };
}

const isBlank = (s) => !s || (!s.trips?.length && !s.balances?.length && !s.travelers?.length && !s.rules?.length);

function timeAgo(ms) {
  if (!ms) return "";
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function newTrip(travelers) {
  const start = addDays(todayISO(), 30);
  const end = addDays(start, 7);
  return {
    id: "trip_" + uid(),
    name: "New trip",
    start, end,
    travelerIds: travelers.map((t) => t.id),
    destinations: [{ id: "d_" + uid(), name: "Destination", start, end }],
    flights: [], hotels: [], transfers: [], days: {}, weather: {}, packing: [], notes: "",
  };
}

const normTransfer = (o = {}) => ({
  id: o.id || uid(),
  destId: o.destId || "",
  from: o.from || "",
  to: o.to || "",
  date: validD(o.date) ? o.date : "",
  time: o.time || "",
  mode: TRANSFER_MODES[o.mode] ? o.mode : "taxi",
  cost: numOrNull(o.cost),
  currency: CURRENCIES.includes(o.currency) ? o.currency : "USD",
  link: o.link || "",
  notes: o.notes || "",
  booked: !!o.booked,
  confirmation: o.confirmation || "",
  source: o.source || "manual",
  tasks: Array.isArray(o.tasks) ? o.tasks.map((t) => ({ id: t.id || uid(), text: t.text || "", done: !!t.done })) : transferTasks(o.mode || "taxi"),
});

/* ------------------------------------------------------------------ */
/* Calculations                                                        */
/* ------------------------------------------------------------------ */

// A hotel's own dates when known, otherwise the destination's.
function hotelRange(h, d) {
  const s = validD(h.checkIn) ? h.checkIn : d?.start;
  let e = validD(h.checkOut) ? h.checkOut : null;
  if (!e) e = validD(h.checkIn) && numOrNull(h.nights) ? addDays(h.checkIn, h.nights) : d?.end;
  return [s, e];
}
function hotelNights(h, d) {
  if (numOrNull(h.nights) !== null) return h.nights;
  const [s, e] = hotelRange(h, d);
  return nightsBetween(s, e);
}
const rangesOverlap = ([a1, a2], [b1, b2]) =>
  !(validD(a1) && validD(a2) && validD(b1) && validD(b2)) || (parseD(a1) < parseD(b2) && parseD(b1) < parseD(a2));
const routeEnds = (r) => { const a = (r || "").split("-").map((x) => x.trim().toUpperCase()).filter(Boolean); return [a[0] || "", a[a.length - 1] || ""]; };

// Picking marks what you're going with. It only unpicks real alternatives
// (same stay dates, or same leg from/to the same airport) and never anything
// already booked, so split stays and separate tickets can all be picked.
function pickHotel(t, id, on) {
  const x = t.hotels.find((h) => h.id === id);
  if (!x) return;
  x.selected = on;
  if (!on) return;
  const d = t.destinations.find((dd) => dd.id === x.destId);
  const r = hotelRange(x, d);
  t.hotels.forEach((y) => {
    if (y.id !== x.id && y.destId === x.destId && y.selected && !y.booked && rangesOverlap(r, hotelRange(y, d))) y.selected = false;
  });
}
function pickFlight(t, id, on) {
  const x = t.flights.find((f) => f.id === id);
  if (!x) return;
  x.selected = on;
  if (!on) return;
  const [xa, xz] = routeEnds(x.route);
  t.flights.forEach((y) => {
    if (y.id === x.id || y.leg !== x.leg || !y.selected || y.booked) return;
    const [ya, yz] = routeEnds(y.route);
    if (!xa || !ya || xa === ya || xz === yz) y.selected = false;
  });
}

// Nights of a destination not covered by any picked hotel.
function uncoveredNights(d, picked) {
  if (!validD(d.start) || !validD(d.end)) return [];
  const out = [];
  for (let day = d.start; parseD(day) < parseD(d.end); day = addDays(day, 1)) {
    const covered = picked.some((h) => { const [s, e] = hotelRange(h, d); return validD(s) && validD(e) && parseD(s) <= parseD(day) && parseD(day) < parseD(e); });
    if (!covered) out.push(day);
  }
  return out;
}

function tripCosts(trip, st) {
  const flights = trip.flights.filter((f) => f.selected);
  const flightUSD = flights.reduce((a, f) => a + (toUSD(f.pricePP, f.currency, st) || 0) * Math.max(1, f.travelerIds?.length || 0), 0);
  const dests = trip.destinations.map((d) => {
    const nights = nightsBetween(d.start, d.end);
    const hotels = trip.hotels
      .filter((h) => h.destId === d.id && h.selected)
      .sort((a, b) => (hotelRange(a, d)[0] || "").localeCompare(hotelRange(b, d)[0] || ""));
    const priced = hotels.filter((h) => toUSD(h.total, h.currency, st) !== null);
    const total = priced.length ? priced.reduce((a, h) => a + toUSD(h.total, h.currency, st), 0) : null;
    const pricedNights = priced.reduce((a, h) => a + hotelNights(h, d), 0);
    const covered = hotels.reduce((a, h) => a + hotelNights(h, d), 0);
    const gaps = hotels.length ? uncoveredNights(d, hotels) : [];
    return {
      d, nights, hotels, total, covered, gaps, unpriced: hotels.length - priced.length,
      names: hotels.map((h) => h.name || "Unnamed hotel").join(" → "),
      perNight: total !== null && pricedNights ? total / pricedNights : null,
    };
  });
  const hotelUSD = dests.reduce((a, x) => a + (x.total || 0), 0);
  const nights = nightsBetween(trip.start, trip.end);
  const grand = flightUSD + hotelUSD;
  const pax = Math.max(1, trip.travelerIds.length);
  return { flights, flightUSD, dests, hotelUSD, grand, nights, pax, perPerson: grand / pax, perNight: nights ? grand / nights : null };
}

function legVerdict(list, st) {
  const usd = (f) => toUSD(f.pricePP, f.currency, st);
  const priced = list.filter((f) => compliant(f) && usd(f) !== null);
  if (!priced.length) return null;
  const cheapest = priced.reduce((a, b) => (usd(b) < usd(a) ? b : a));
  const c = usd(cheapest);
  const pct = (c * st.bandPct) / 100;
  const band = st.bandMode === "smaller" ? Math.min(st.bandUsd, pct) : Math.max(st.bandUsd, pct);
  const inBand = priced.filter((f) => usd(f) <= c + band);
  let pick = null;
  let reason = "";
  for (const tier of [1, 2]) {
    const t = inBand.filter((f) => tierOf(f.operating || f.marketing) === tier);
    if (t.length) {
      pick = t.reduce((a, b) => (usd(b) < usd(a) ? b : a));
      reason = tier === 1 ? "Qatar/Oneworld option inside your price band" : "Star Alliance option inside your price band";
      break;
    }
  }
  if (!pick) { pick = cheapest; reason = "Cheapest fare that passes your rules; no alliance option inside the band"; }
  return { pick, cheapest, band, reason, premium: usd(pick) - c };
}

function flightChecks(f, st) {
  const out = [];
  const op = (f.operating || f.marketing || "").toUpperCase();
  const c = carrier(op);
  out.push({ s: f.stops <= 1 ? "ok" : "bad", t: f.stops === 0 ? "Nonstop" : `${f.stops} stop${f.stops === 1 ? "" : "s"}` });
  if (f.basic) out.push({ s: "bad", t: "Basic economy" });
  if ((f.durationH || 0) > 6 && f.cabin === "Economy") out.push({ s: "warn", t: "Over 6h: compare premium economy" });
  if (c?.[2]) out.push({ s: "ok", t: `Earns ${PROGRAMS[c[2]]}` });
  else out.push({ s: "info", t: op ? "No program in your wallet earns here" : "Add operating carrier" });
  if (op === "CZ") out.push({ s: "info", t: "Qatar bilateral partner" });
  if (op === "CA") out.push({ s: "warn", t: "Check fare class earns on wheretocredit.com" });
  if (c?.[2] === "aeroplan") out.push({ s: "info", t: "Resets Aeroplan expiry" });
  if (numOrNull(f.awardPoints)) {
    const cash = toUSD(f.pricePP, f.currency, st);
    const tax = toUSD(f.awardTaxes || 0, f.currency, st) || 0;
    if (cash !== null) {
      const cpp = ((cash - tax) / f.awardPoints) * 100;
      out.push({
        s: cpp >= st.floorHigh ? "ok" : cpp >= st.floorLow ? "warn" : "bad",
        t: `Award ${cpp.toFixed(2)}¢/pt${cpp < st.floorLow ? ": pay cash" : ""}`,
      });
    }
    if (f.awardProgram === "avios" && (f.durationH || 0) > 10) out.push({ s: "bad", t: "Avoid Avios on ultra-long-haul" });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Small UI pieces                                                     */
/* ------------------------------------------------------------------ */

const CSS = `
.thq{--ink:#14323A;--ink2:#2B5560;--page:#EEF3F1;--line:#C9D6D2;--muted:#5E7A78;--gold:#E0A526;--goldsoft:#FBF1D6;--ok:#2F7D5B;--oksoft:#E3F1EA;--bad:#B4432F;--badsoft:#F6E3DF;
font-family:'Instrument Sans',ui-sans-serif,system-ui,sans-serif;color:var(--ink);background:var(--page);min-height:100vh;font-size:14px;line-height:1.45}
.thq .display{font-family:'Bricolage Grotesque','Instrument Sans',ui-sans-serif,system-ui;letter-spacing:-0.025em}
.thq .num{font-variant-numeric:tabular-nums}
.thq .muted{color:var(--muted)}
.thq input,.thq select,.thq textarea{border:1px solid var(--line);background:#fff;border-radius:6px;padding:6px 8px;font-size:14px;color:var(--ink);width:100%;font-family:inherit}
.thq input[type=checkbox]{width:auto;accent-color:var(--ink)}
.thq input:focus,.thq select:focus,.thq textarea:focus{outline:2px solid var(--gold);outline-offset:0;border-color:var(--gold)}
.thq button:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.thq .lbl{display:block;font-size:12px;color:var(--muted);margin-bottom:3px;font-weight:500}
.thq .btn{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:600;border:1px solid var(--ink);background:#fff;color:var(--ink);cursor:pointer;white-space:nowrap}
.thq .btn:hover{background:var(--page)}
.thq .btn-solid{background:var(--ink);color:#fff}
.thq .btn-solid:hover{background:var(--ink2)}
.thq .btn-quiet{border-color:transparent;background:transparent;padding:6px 8px}
.thq .btn-quiet:hover{background:rgba(20,50,58,.06)}
.thq .btn-danger{color:var(--bad);border-color:var(--bad)}
.thq .btn:disabled{opacity:.5;cursor:not-allowed}
.thq .panel{background:#fff;border:1px solid var(--line);border-radius:10px}
.thq .toptab{padding:10px 4px;margin-right:18px;border-bottom:3px solid transparent;font-weight:600;color:var(--muted);white-space:nowrap;cursor:pointer;background:none}
.thq .toptab[aria-selected=true]{color:var(--ink);border-bottom-color:var(--gold)}
.thq .subtab{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:8px;font-weight:600;color:var(--muted);white-space:nowrap;cursor:pointer;background:none;border:none}
.thq .subtab[aria-selected=true]{background:var(--ink);color:#fff}
.thq .chip{display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);background:#fff;white-space:nowrap}
.thq .chip-ok{background:var(--oksoft);border-color:transparent;color:var(--ok)}
.thq .chip-bad{background:var(--badsoft);border-color:transparent;color:var(--bad)}
.thq .chip-warn{background:var(--goldsoft);border-color:transparent;color:#7A5608}
.thq .chip-info{color:var(--muted)}
.thq .seg{border-radius:8px;padding:10px 12px;min-width:120px;color:#fff;background:var(--ink2)}
.thq .seg.empty{background:transparent;color:var(--ink);border:1.5px dashed var(--ink2)}
.thq .picked{box-shadow:inset 4px 0 0 var(--gold)}
.thq .verdict{background:var(--goldsoft);border-radius:8px;padding:10px 12px}
.thq table{border-collapse:collapse;width:100%}
.thq th{font-size:12px;font-weight:500;color:var(--muted);text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
.thq td{padding:8px;border-bottom:1px solid #E3EBE8;vertical-align:top}
.thq .spin{animation:thqspin 1s linear infinite}
@keyframes thqspin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.thq .spin{animation:none}}
`;

function F({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="lbl">{label}</span>
      {children}
    </label>
  );
}

function Num({ value, onChange, ...rest }) {
  return <input type="number" value={value ?? ""} onChange={(e) => onChange(numOrNull(e.target.value))} {...rest} />;
}

function CurSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
    </select>
  );
}

function Chip({ s, children }) {
  const Icon = s === "ok" ? CheckCircle2 : s === "bad" ? XCircle : s === "warn" ? AlertTriangle : Info;
  return <span className={`chip chip-${s}`}><Icon size={12} aria-hidden="true" />{children}</span>;
}

function AIButton({ busy, onClick, children, solid = true }) {
  return (
    <button className={`btn ${solid ? "btn-solid" : ""}`} onClick={onClick} disabled={busy}>
      {busy ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
      {busy ? "Working…" : children}
    </button>
  );
}

function ErrorLine({ msg }) {
  if (!msg) return null;
  return <p className="mt-2 text-sm" style={{ color: "var(--bad)" }} role="alert">{msg}</p>;
}

function ConfirmButton({ onConfirm, children, className = "btn btn-danger" }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return (
    <button className={className} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      <Trash2 size={14} aria-hidden="true" />
      {armed ? "Click again to confirm" : children}
    </button>
  );
}

function BookedChip({ x }) {
  if (!x.booked && !x.confirmation) return null;
  return (
    <span className="chip chip-ok">
      <CheckCircle2 size={12} aria-hidden="true" />
      {x.booked ? "Booked" : "Ref"}{x.confirmation ? ` · ${x.confirmation}` : ""}
    </span>
  );
}

function BookedFields({ x, set }) {
  return (
    <>
      <F label="Confirmation / PNR"><input value={x.confirmation || ""} onChange={(e) => set("confirmation", e.target.value)} autoCapitalize="characters" /></F>
      <label className="flex items-center gap-2 self-end pb-2"><input type="checkbox" checked={!!x.booked} onChange={(e) => set("booked", e.target.checked)} /> Booked</label>
    </>
  );
}

function Empty({ children }) {
  return <div className="panel p-6 text-center muted">{children}</div>;
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

export default function TravelHQ() {
  const [state, setState] = useState(null);
  const [view, setView] = useState("trip");
  const [device, setDeviceState] = useState(getDevice);
  const [sync, setSync] = useState({ kind: "local", text: "On this device only" });
  const stateRef = useRef(null);
  const busyRef = useRef(false);
  const retryRef = useRef(0);
  const pushTimer = useRef(null);
  stateRef.current = state;

  const runSync = useCallback(async () => {
    const d = getDevice();
    if (!syncConfigured(d)) { setSync({ kind: "local", text: "On this device only" }); return; }
    if (busyRef.current || !stateRef.current) return;
    busyRef.current = true;
    clearTimeout(pushTimer.current);
    setSync({ kind: "syncing", text: "Syncing…" });
    try {
      const meta = getMeta(d);
      const local = stateRef.current;
      const remote = await pull(d);
      let note = "";
      if (!remote) {
        const sha = await push(local, null, d);
        setMeta({ sha, dirty: false, lastSyncedAt: Date.now() }, d);
        note = `Created ${d.path} in ${d.repo}`;
      } else if (remote.sha === meta.sha) {
        if (meta.dirty) {
          const sha = await push(local, remote.sha, d);
          setMeta({ sha, dirty: false, lastSyncedAt: Date.now() }, d);
        } else {
          setMeta({ lastSyncedAt: Date.now() }, d);
        }
      } else {
        const remoteNewer = (remote.data?.updatedAt || 0) >= (local.updatedAt || 0);
        if (!meta.dirty || remoteNewer || isBlank(local)) {
          const data = migrate(remote.data);
          stateRef.current = data;
          setState(data);
          await saveLocal(data);
          setMeta({ sha: remote.sha, dirty: false, lastSyncedAt: Date.now() }, d);
          note = meta.sha ? "Loaded changes from another device" : "Loaded your data from GitHub";
        } else {
          const sha = await push(local, remote.sha, d);
          setMeta({ sha, dirty: false, lastSyncedAt: Date.now() }, d);
          note = "Changes here were newer, so they replaced GitHub's copy";
        }
      }
      retryRef.current = 0;
      setSync({ kind: "synced", text: note, at: Date.now() });
    } catch (e) {
      if (e instanceof NetworkError) {
        setSync({ kind: "offline", text: "Offline. Saved on this device and will sync later" });
      } else if (e instanceof ConflictError && retryRef.current < 3) {
        retryRef.current += 1;
        setTimeout(() => runSync(), 1500);
      } else {
        setSync({ kind: "error", text: e.message });
      }
    } finally {
      busyRef.current = false;
    }
  }, []);

  // first load: local copy immediately, then check GitHub
  useEffect(() => {
    (async () => {
      const local = migrate(await loadLocal());
      stateRef.current = local;
      setState(local);
      if (syncConfigured()) runSync();
    })();
  }, [runSync]);

  // keep the local copy current
  useEffect(() => { if (state) saveLocal(state); }, [state]);

  // pick up other devices' changes when returning to the app; push when leaving
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" || getMeta().dirty) runSync();
    };
    const onOnline = () => runSync();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
    };
  }, [runSync]);

  // refresh the "synced x min ago" label
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60000); return () => clearInterval(t); }, []);

  if (!state) {
    return (
      <div className="thq flex items-center justify-center">
        <style>{CSS}</style>
        <p className="muted flex items-center gap-2"><Loader2 size={16} className="spin" /> Loading your trips</p>
      </div>
    );
  }

  const update = (fn) => {
    setState((s) => { const n = clone(s); fn(n); n.updatedAt = Date.now(); return n; });
    if (syncConfigured()) {
      setMeta({ dirty: true });
      setSync({ kind: "pending", text: "Changes not synced yet" });
      clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => runSync(), 6000);
    }
  };
  const saveDevice = (d) => { setDevice(d); setDeviceState(d); };

  const trip = state.trips.find((t) => t.id === state.activeTripId) || state.trips[0];
  const updTrip = (fn) => update((s) => { const t = s.trips.find((x) => x.id === trip.id); if (t) fn(t, s); });

  const addTrip = () => {
    update((s) => { const t = newTrip(s.travelers); s.trips.push(t); s.activeTripId = t.id; });
    setView("trip");
  };

  const lastSynced = getMeta().lastSyncedAt;
  const statusText =
    sync.kind === "synced" ? `${sync.text && Date.now() - (sync.at || 0) < 8000 ? sync.text : `Synced ${timeAgo(lastSynced)}`}` : sync.text;
  const StatusIcon = sync.kind === "offline" || sync.kind === "error" ? CloudOff : sync.kind === "syncing" ? Loader2 : Cloud;

  return (
    <div className="thq">
      <style>{CSS}</style>
      <header className="px-4 sm:px-8" style={{ borderBottom: "1px solid var(--line)", paddingTop: "max(16px, env(safe-area-inset-top))" }}>
        <div className="flex items-center justify-between gap-4">
          <span className="display text-lg font-bold flex items-center gap-2"><Plane size={18} aria-hidden="true" /> Travel HQ</span>
          <button
            className="btn btn-quiet text-xs"
            style={{ color: sync.kind === "error" ? "var(--bad)" : "var(--muted)", fontWeight: 500 }}
            onClick={() => (syncConfigured() ? runSync() : setView("wallet"))}
            title={syncConfigured() ? "Sync now" : "Set up GitHub sync"}
            aria-live="polite"
          >
            <StatusIcon size={14} className={sync.kind === "syncing" ? "spin" : ""} aria-hidden="true" />
            <span className="truncate" style={{ maxWidth: 260 }}>{statusText}</span>
          </button>
        </div>
        <nav className="flex items-end overflow-x-auto mt-2" role="tablist" aria-label="Trips">
          {state.trips.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={view === "trip" && t.id === trip?.id}
              className="toptab"
              onClick={() => { update((s) => { s.activeTripId = t.id; }); setView("trip"); }}
            >
              {t.name}
            </button>
          ))}
          <button className="toptab flex items-center gap-1" onClick={addTrip}><Plus size={14} aria-hidden="true" /> New trip</button>
          <span className="flex-1" />
          <button role="tab" aria-selected={view === "wallet"} className="toptab flex items-center gap-1" onClick={() => setView("wallet")}>
            <Wallet size={14} aria-hidden="true" /> Wallet and rules
          </button>
        </nav>
      </header>

      <main className="px-4 sm:px-8 py-6 max-w-6xl" style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}>
        {view === "wallet" ? (
          <WalletView state={state} update={update} device={device} onSaveDevice={saveDevice} sync={sync} onSyncNow={runSync} />
        ) : trip ? (
          <TripView key={trip.id} trip={trip} state={state} update={update} updTrip={updTrip} />
        ) : (
          <div className="panel p-6 max-w-xl">
            <h1 className="display text-3xl font-extrabold mb-2">Welcome to Travel HQ</h1>
            <p className="mb-4">
              {syncConfigured()
                ? "No trips yet. Create one, or check that your data file is in the connected repo."
                : "Your data isn't on this device yet. Connect your private GitHub data repo to load it, or restore a backup file."}
            </p>
            <div className="flex flex-wrap gap-2">
              {!syncConfigured() && <button className="btn btn-solid" onClick={() => setView("wallet")}><Cloud size={14} /> Set up sync or restore</button>}
              <button className="btn" onClick={addTrip}><Plus size={14} /> Create a trip</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trip view                                                           */
/* ------------------------------------------------------------------ */

const SUBTABS = [
  ["overview", "Overview", LayoutGrid],
  ["flights", "Flights", Plane],
  ["hotels", "Hotels", BedDouble],
  ["transfers", "Transfers", CarFront],
  ["itinerary", "Itinerary", CalendarDays],
  ["weather", "Weather", CloudSun],
  ["packing", "Packing", Luggage],
];

function TripView({ trip, state, update, updTrip }) {
  const [tab, setTab] = useState("overview");
  const [importing, setImporting] = useState(false);
  const [flash, setFlash] = useState("");
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(""), 6000); return () => clearTimeout(t); }, [flash]);
  useEffect(() => { setImporting(false); }, [trip.id]);
  const st = state.settings;
  const costs = useMemo(() => tripCosts(trip, st), [trip, st]);
  const names = state.travelers.filter((t) => trip.travelerIds.includes(t.id)).map((t) => t.name);

  return (
    <div>
      {/* Trip header with proportional route strip */}
      <section className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="display text-4xl sm:text-5xl font-extrabold leading-none">{trip.name}</h1>
            <p className="muted mt-2">
              {fmtDate(trip.start)} to {fmtDate(trip.end)}, {costs.nights} night{costs.nights === 1 ? "" : "s"}
              {names.length ? `, ${names.join(" and ")}` : ""}
            </p>
          </div>
          <div className="text-right">
            <div className="display text-3xl font-bold num">{money(costs.grand, st)}</div>
            <div className="text-sm muted num">
              {money(costs.grand, st, st.secondaryCurrency)} picked so far, {money(costs.perPerson, st)} per person
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4 overflow-x-auto pb-1" aria-label="Destinations by nights">
          {costs.dests.map(({ d, nights, hotels, names, total, perNight, gaps }) => (
            <div
              key={d.id}
              className={`seg ${hotels.length ? "" : "empty"}`}
              style={{ flexGrow: Math.max(1, nights), flexBasis: 0 }}
            >
              <div className="font-semibold">{d.name}</div>
              <div className="text-xs num" style={{ opacity: 0.85 }}>
                {fmtDate(d.start)} to {fmtDate(d.end)}, {nights}n
              </div>
              <div className="text-sm mt-1 num">
                {hotels.length ? `${names}: ${money(total, st)}${perNight !== null ? `, ${money(perNight, st)}/night` : ""}` : "No hotel picked"}
              </div>
              {hotels.length > 0 && gaps.length > 0 && (
                <div className="text-xs mt-1" style={{ opacity: 0.9 }}>{gaps.length} night{gaps.length === 1 ? "" : "s"} without a hotel</div>
              )}
            </div>
          ))}
          <div className="seg" style={{ background: "var(--gold)", color: "var(--ink)", flexGrow: 0 }}>
            <div className="font-semibold flex items-center gap-1"><Plane size={14} aria-hidden="true" /> Flights</div>
            <div className="text-xs">{costs.flights.length} picked</div>
            <div className="text-sm mt-1 num">{money(costs.flightUSD, st)}</div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Trip sections">
          {SUBTABS.map(([id, label, Icon]) => (
            <button key={id} role="tab" aria-selected={tab === id} className="subtab" onClick={() => setTab(id)}>
              <Icon size={15} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        {!importing && <button className="btn" onClick={() => setImporting(true)}><Mail size={14} /> Import booking</button>}
      </div>

      {flash && <div className="verdict text-sm mb-4 flex items-center gap-2" role="status"><CheckCircle2 size={16} aria-hidden="true" /> {flash}</div>}
      {importing && (
        <ImportPanel
          trip={trip}
          state={state}
          updTrip={updTrip}
          onClose={() => setImporting(false)}
          onDone={(msg, kind) => {
            setImporting(false);
            setFlash(msg);
            if (kind) setTab({ flight: "flights", hotel: "hotels", transfer: "transfers" }[kind] || tab);
          }}
        />
      )}

      {tab === "overview" && <Overview trip={trip} state={state} update={update} updTrip={updTrip} costs={costs} />}
      {tab === "flights" && <FlightsTab trip={trip} state={state} updTrip={updTrip} />}
      {tab === "hotels" && <HotelsTab trip={trip} state={state} updTrip={updTrip} />}
      {tab === "transfers" && <TransfersTab trip={trip} state={state} updTrip={updTrip} />}
      {tab === "itinerary" && <ItineraryTab trip={trip} state={state} updTrip={updTrip} />}
      {tab === "weather" && <WeatherTab trip={trip} updTrip={updTrip} />}
      {tab === "packing" && <PackingTab trip={trip} state={state} update={update} updTrip={updTrip} />}
    </div>
  );
}

/* ---------------- Overview ---------------- */

function Overview({ trip, state, update, updTrip, costs }) {
  const st = state.settings;
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <section className="panel p-4 lg:col-span-3">
        <h2 className="display text-xl font-bold mb-3">Costs</h2>
        <table>
          <thead>
            <tr><th>Item</th><th>Nights</th><th className="text-right">Per night</th><th className="text-right">Total</th><th className="text-right">{st.secondaryCurrency}</th></tr>
          </thead>
          <tbody className="num">
            {costs.dests.map(({ d, nights, hotels, names, covered, gaps, unpriced, total, perNight }) => (
              <tr key={d.id}>
                <td>
                  <div className="font-semibold">{d.name}</div>
                  <div className="text-xs muted">{hotels.length ? names : "No hotel picked yet"}</div>
                  {hotels.length > 0 && gaps.length > 0 && (
                    <div className="text-xs" style={{ color: "#7A5608" }}>No hotel for {gaps.map(fmtDate).join(", ")}</div>
                  )}
                  {unpriced > 0 && <div className="text-xs muted">{unpriced} picked without a price</div>}
                </td>
                <td>{hotels.length ? covered : nights}</td>
                <td className="text-right">{money(perNight, st)}</td>
                <td className="text-right">{money(total, st)}</td>
                <td className="text-right muted">{money(total, st, st.secondaryCurrency)}</td>
              </tr>
            ))}
            {costs.flights.map((f) => {
              const pax = Math.max(1, f.travelerIds.length);
              const tot = (toUSD(f.pricePP, f.currency, st) || 0) * pax;
              return (
                <tr key={f.id}>
                  <td><div className="font-semibold">{f.leg}</div><div className="text-xs muted">{f.route || "Route"} {f.flightNo}, {pax} traveler{pax === 1 ? "" : "s"}</div></td>
                  <td />
                  <td className="text-right muted">{money(toUSD(f.pricePP, f.currency, st), st)} pp</td>
                  <td className="text-right">{money(tot, st)}</td>
                  <td className="text-right muted">{money(tot, st, st.secondaryCurrency)}</td>
                </tr>
              );
            })}
            {!costs.flights.length && (
              <tr><td colSpan={5} className="muted">No flights picked yet. Pick the ones you're taking in Flights.</td></tr>
            )}
            <tr>
              <td className="font-semibold">Hotels subtotal</td><td /><td />
              <td className="text-right font-semibold">{money(costs.hotelUSD, st)}</td>
              <td className="text-right muted">{money(costs.hotelUSD, st, st.secondaryCurrency)}</td>
            </tr>
            <tr>
              <td className="font-semibold">Flights subtotal</td><td /><td />
              <td className="text-right font-semibold">{money(costs.flightUSD, st)}</td>
              <td className="text-right muted">{money(costs.flightUSD, st, st.secondaryCurrency)}</td>
            </tr>
            <tr>
              <td className="display text-lg font-bold">Trip total</td>
              <td>{costs.nights}</td>
              <td className="text-right">{money(costs.perNight, st)}</td>
              <td className="text-right display text-lg font-bold">{money(costs.grand, st)}</td>
              <td className="text-right muted">{money(costs.grand, st, st.secondaryCurrency)}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs muted mt-3">
          Converted at your saved rates{st.fxUpdated ? ` (updated ${st.fxUpdated})` : ""}. Change them in Wallet and rules.
        </p>
      </section>

      <section className="panel p-4 lg:col-span-2 space-y-3">
        <h2 className="display text-xl font-bold">Trip details</h2>
        <F label="Trip name"><input value={trip.name} onChange={(e) => updTrip((t) => { t.name = e.target.value; })} /></F>
        <div className="grid grid-cols-2 gap-2">
          <F label="Start"><input type="date" value={trip.start} onChange={(e) => updTrip((t) => { t.start = e.target.value; })} /></F>
          <F label="End"><input type="date" value={trip.end} onChange={(e) => updTrip((t) => { t.end = e.target.value; })} /></F>
        </div>
        <div>
          <span className="lbl">Travelers</span>
          <div className="flex flex-wrap gap-3">
            {state.travelers.map((p) => (
              <label key={p.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={trip.travelerIds.includes(p.id)}
                  onChange={(e) => updTrip((t) => {
                    t.travelerIds = e.target.checked ? [...t.travelerIds, p.id] : t.travelerIds.filter((x) => x !== p.id);
                  })}
                />
                {p.name}
              </label>
            ))}
          </div>
        </div>
        <div>
          <span className="lbl">Destinations, in order</span>
          <div className="space-y-2">
            {trip.destinations.map((d, i) => (
              <div key={d.id} className="grid gap-2" style={{ gridTemplateColumns: "1.2fr 1fr 1fr auto" }}>
                <input aria-label="Destination name" value={d.name} onChange={(e) => updTrip((t) => { t.destinations[i].name = e.target.value; })} />
                <input aria-label="Arrive" type="date" value={d.start} onChange={(e) => updTrip((t) => { t.destinations[i].start = e.target.value; })} />
                <input aria-label="Leave" type="date" value={d.end} onChange={(e) => updTrip((t) => { t.destinations[i].end = e.target.value; })} />
                <button
                  className="btn btn-quiet"
                  aria-label={`Remove ${d.name}`}
                  disabled={trip.destinations.length === 1}
                  onClick={() => updTrip((t) => {
                    t.destinations.splice(i, 1);
                    t.hotels = t.hotels.filter((h) => h.destId !== d.id);
                    delete t.weather[d.id];
                  })}
                ><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <button
            className="btn btn-quiet mt-2"
            onClick={() => updTrip((t) => {
              const last = t.destinations[t.destinations.length - 1];
              const start = last?.end || t.start;
              const end = t.end > start ? t.end : addDays(start, 2);
              if (last && last.end === t.end) {
                // split the last stop in half so the new one has room
                const mid = addDays(last.start, Math.max(1, Math.floor(nightsBetween(last.start, last.end) / 2)));
                last.end = mid;
                t.destinations.push({ id: "d_" + uid(), name: "Next stop", start: mid, end: t.end });
              } else {
                t.destinations.push({ id: "d_" + uid(), name: "Next stop", start, end });
              }
            })}
          ><Plus size={14} /> Add destination</button>
        </div>
        <F label="Notes (the AI reads these)">
          <textarea rows={3} value={trip.notes} onChange={(e) => updTrip((t) => { t.notes = e.target.value; })} />
        </F>
        <div className="pt-2">
          <ConfirmButton onConfirm={() => update((s) => {
            s.trips = s.trips.filter((x) => x.id !== trip.id);
            s.activeTripId = s.trips[0]?.id || null;
          })}>Delete trip</ConfirmButton>
        </div>
      </section>
    </div>
  );
}

/* ---------------- Flights ---------------- */

function FlightsTab({ trip, state, updTrip }) {
  const st = state.settings;
  const people = state.travelers.filter((t) => trip.travelerIds.includes(t.id));
  const firstDest = trip.destinations[0]?.name || "";
  const [form, setForm] = useState(() => ({
    legType: "Outbound",
    who: trip.travelerIds,
    from: people[0]?.home || "",
    to: firstDest,
    date: trip.start,
    cabin: "Economy",
  }));
  const [open, setOpen] = useState(null);

  const legName = (type, who) => {
    if (!who.length || who.length === trip.travelerIds.length) return type;
    return `${type}, ${people.filter((p) => who.includes(p.id)).map((p) => p.name).join(" and ")}`;
  };

  const setWho = (id, on) => {
    setForm((f) => {
      const who = on ? [...f.who, id] : f.who.filter((x) => x !== id);
      const first = people.find((p) => who.includes(p.id));
      const next = { ...f, who };
      if (first) {
        if (f.legType === "Return") next.to = first.home; else next.from = first.home;
      }
      return next;
    });
  };

  const logFlight = () => {
    const f = normFlight({
      leg: legName(form.legType, form.who),
      date: form.date,
      route: [form.from, form.to].filter(Boolean).join("-"),
      travelerIds: form.who,
      cabin: form.cabin,
    });
    updTrip((t) => { t.flights.push(f); });
    setOpen(f.id);
  };

  const groups = [];
  trip.flights.forEach((f) => {
    let g = groups.find((x) => x.leg === f.leg);
    if (!g) { g = { leg: f.leg, items: [] }; groups.push(g); }
    g.items.push(f);
  });

  return (
    <div className="space-y-6">
      <section className="panel p-4">
        <h2 className="display text-xl font-bold mb-1">Log a flight option</h2>
        <p className="text-sm muted mb-3">Fill in the basics, then add the carrier, stops and price in the card that opens.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <F label="Leg">
            <select value={form.legType} onChange={(e) => setForm({ ...form, legType: e.target.value })}>
              <option>Outbound</option><option>Return</option><option>Internal</option>
            </select>
          </F>
          <div className="lg:col-span-2 grid gap-2" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
            <F label="From"><input value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} placeholder="PEK" /></F>
            <button className="btn btn-quiet self-end" aria-label="Swap origin and destination" onClick={() => setForm({ ...form, from: form.to, to: form.from })}>
              <ArrowLeftRight size={14} />
            </button>
            <F label="To"><input value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder="DPS" /></F>
          </div>
          <F label="Date"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></F>
          <F label="Cabin">
            <select value={form.cabin} onChange={(e) => setForm({ ...form, cabin: e.target.value })}>
              <option>Economy</option><option>Premium economy</option><option>Business</option>
            </select>
          </F>
          <div>
            <span className="lbl">For</span>
            <div className="flex flex-wrap gap-3 pt-1">
              {people.map((p) => (
                <label key={p.id} className="flex items-center gap-1">
                  <input type="checkbox" checked={form.who.includes(p.id)} onChange={(e) => setWho(p.id, e.target.checked)} />
                  {p.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-end lg:col-span-6">
            <button className="btn btn-solid" onClick={logFlight}><Plus size={14} /> Log flight</button>
          </div>
        </div>
      </section>

      {!groups.length && <Empty>No flight options logged yet. Add the ones you find above to compare them against your rules.</Empty>}

      {groups.map((g) => {
        const v = legVerdict(g.items, st);
        return (
          <section key={g.leg}>
            <h3 className="display text-lg font-bold mb-2">{g.leg}</h3>
            {v && (
              <div className="verdict mb-2">
                <div className="font-semibold">
                  Rules pick: {v.pick.route || "flight"} {v.pick.flightNo} on {carrier(v.pick.operating)?.[0] || v.pick.operating || "unknown carrier"},{" "}
                  {money(toUSD(v.pick.pricePP, v.pick.currency, st), st)} pp
                </div>
                <div className="text-sm">
                  {v.reason}.{" "}
                  {v.premium > 0.5
                    ? `Costs ${money(v.premium, st)} more than the cheapest (band ${money(v.band, st)}).`
                    : "It's also the cheapest compliant fare."}
                </div>
              </div>
            )}
            <div className="space-y-2">
              {g.items.map((f) => (
                <FlightCard
                  key={f.id} f={f} st={st} people={people} isPick={v?.pick.id === f.id}
                  open={open === f.id} setOpen={(o) => setOpen(o ? f.id : null)} updTrip={updTrip}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function FlightCard({ f, st, people, isPick, open, setOpen, updTrip }) {
  const set = (k, v) => updTrip((t) => { const x = t.flights.find((y) => y.id === f.id); if (x) x[k] = v; });
  const pax = Math.max(1, f.travelerIds.length);
  const pp = toUSD(f.pricePP, f.currency, st);
  const prog = carrier(f.operating || f.marketing)?.[2];
  const earnValue = prog && numOrNull(f.estEarn) ? (f.estEarn * (st.valuation[prog] || 0)) / 100 : null;
  const checks = flightChecks(f, st);

  const toggleSelect = () => updTrip((t) => pickFlight(t, f.id, !f.selected));

  return (
    <div className={`panel ${f.selected ? "picked" : ""}`}>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <button className="btn btn-quiet" aria-expanded={open} aria-label="Edit details" onClick={() => setOpen(!open)}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {f.route || "Route"} <span className="muted font-normal">{f.flightNo}</span>
            {isPick && <span className="chip chip-warn ml-2">Rules pick</span>}
            {f.source === "ai" && <span className="chip chip-info ml-2">AI estimate</span>}
            {f.source === "email" && <span className="chip chip-info ml-2">From email</span>}
          </div>
          <div className="text-sm muted">
            {fmtDate(f.date)}, {carrier(f.operating)?.[0] || f.operating || "carrier?"} ({ALLIANCE_LABEL[allianceOf(f.operating)]}),{" "}
            {f.durationH ? `${f.durationH}h, ` : ""}{f.cabin}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            <BookedChip x={f} />
            {checks.map((c, i) => <Chip key={i} s={c.s}>{c.t}</Chip>)}
          </div>
        </div>
        <div className="text-right num">
          <div className="font-bold">{money(pp !== null ? pp * pax : null, st)}</div>
          <div className="text-xs muted">{money(pp, st)} pp, {pax} pax</div>
          {earnValue !== null && <div className="text-xs" style={{ color: "var(--ok)" }}>≈ {money(earnValue, st)} back in miles</div>}
        </div>
        <button className={`btn ${f.selected ? "btn-solid" : ""}`} onClick={toggleSelect} aria-pressed={f.selected}>
          <Check size={14} /> {f.selected ? "Picked" : "Pick"}
        </button>
      </div>

      {open && (
        <div className="p-3 pt-0 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <F label="Leg"><input value={f.leg} onChange={(e) => set("leg", e.target.value)} /></F>
          <F label="Route"><input value={f.route} onChange={(e) => set("route", e.target.value)} placeholder="PEK-SIN-DPS" /></F>
          <F label="Date"><input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></F>
          <F label="Flight numbers"><input value={f.flightNo} onChange={(e) => set("flightNo", e.target.value)} /></F>
          <F label="Operating carrier"><input value={f.operating} maxLength={3} onChange={(e) => set("operating", e.target.value.toUpperCase())} placeholder="QR" /></F>
          <F label="Marketing carrier"><input value={f.marketing} maxLength={3} onChange={(e) => set("marketing", e.target.value.toUpperCase())} /></F>
          <F label="Stops"><Num value={f.stops} min={0} onChange={(v) => set("stops", v ?? 0)} /></F>
          <F label="Duration (h)"><Num value={f.durationH} step="0.5" onChange={(v) => set("durationH", v)} /></F>
          <F label="Cabin">
            <select value={f.cabin} onChange={(e) => set("cabin", e.target.value)}>
              <option>Economy</option><option>Premium economy</option><option>Business</option>
            </select>
          </F>
          <F label="Fare class"><input value={f.fareClass} onChange={(e) => set("fareClass", e.target.value)} placeholder="e.g. S" /></F>
          <F label="Price per person"><Num value={f.pricePP} onChange={(v) => set("pricePP", v)} /></F>
          <F label="Currency"><CurSelect value={f.currency} onChange={(v) => set("currency", v)} /></F>
          <label className="flex items-center gap-2 self-end pb-2">
            <input type="checkbox" checked={f.basic} onChange={(e) => set("basic", e.target.checked)} /> Basic economy
          </label>
          <F label="Miles earned (est.)"><Num value={f.estEarn} onChange={(v) => set("estEarn", v)} /></F>
          <F label="Award points pp"><Num value={f.awardPoints} onChange={(v) => set("awardPoints", v)} /></F>
          <F label="Award program">
            <select value={f.awardProgram} onChange={(e) => set("awardProgram", e.target.value)}>
              {Object.entries(PROGRAMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </F>
          <F label={`Award taxes pp (${f.currency})`}><Num value={f.awardTaxes} onChange={(v) => set("awardTaxes", v)} /></F>
          <div>
            <span className="lbl">For</span>
            <div className="flex flex-wrap gap-2 pt-1">
              {people.map((p) => (
                <label key={p.id} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={f.travelerIds.includes(p.id)}
                    onChange={(e) => set("travelerIds", e.target.checked ? [...f.travelerIds, p.id] : f.travelerIds.filter((x) => x !== p.id))}
                  />
                  {p.name}
                </label>
              ))}
            </div>
          </div>
          <BookedFields x={f} set={set} />
          <F label="Booking link" className="sm:col-span-2"><input value={f.link} onChange={(e) => set("link", e.target.value)} placeholder="https://" /></F>
          <F label="Notes" className="sm:col-span-3 lg:col-span-3"><input value={f.notes} onChange={(e) => set("notes", e.target.value)} /></F>
          <div className="flex items-end gap-2">
            {/^https?:\/\//.test(f.link) && (
              <a className="btn btn-quiet" href={f.link} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a>
            )}
            <button className="btn btn-quiet" style={{ color: "var(--bad)" }} onClick={() => updTrip((t) => { t.flights = t.flights.filter((x) => x.id !== f.id); })}>
              <Trash2 size={14} /> Remove
            </button>
          </div>
        </div>
      )}
      {!open && f.notes && <p className="px-3 pb-3 -mt-1 text-sm muted">{f.notes}</p>}
    </div>
  );
}

/* ---------------- Hotels ---------------- */

function HotelsTab({ trip, state, updTrip }) {
  return (
    <div className="space-y-8">
      {trip.destinations.map((d) => <HotelDest key={d.id} d={d} trip={trip} state={state} updTrip={updTrip} />)}
    </div>
  );
}

function HotelDest({ d, trip, state, updTrip }) {
  const st = state.settings;
  const [open, setOpen] = useState(null);
  const nights = nightsBetween(d.start, d.end);
  const list = trip.hotels
    .filter((h) => h.destId === d.id)
    .sort((a, b) => (hotelRange(a, d)[0] || "").localeCompare(hotelRange(b, d)[0] || "") || (a.name || "").localeCompare(b.name || ""));
  const picked = list.filter((h) => h.selected);
  const gaps = picked.length ? uncoveredNights(d, picked) : [];
  const add = () => {
    const h = normHotel({ destId: d.id });
    updTrip((t) => { t.hotels.push(h); });
    setOpen(h.id);
  };

  // cheapest effective price for comparison
  const eff = (h) => {
    const tot = toUSD(h.total, h.currency, st);
    if (tot === null) return null;
    return tot - milesFor(h, tot, st).value;
  };
  // Compare per night, and only among options you haven't booked yet.
  const perNightEff = (h) => eff(h) / (hotelNights(h, d) || 1);
  const priced = list.filter((h) => !h.booked && eff(h) !== null);
  const best = priced.length > 1 ? priced.reduce((a, b) => (perNightEff(b) < perNightEff(a) ? b : a)) : null;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="display text-2xl font-bold">{d.name}</h2>
          <p className="muted">{fmtDate(d.start)} to {fmtDate(d.end)}, {nights} night{nights === 1 ? "" : "s"}</p>
        </div>
        <button className="btn btn-solid" onClick={add}><Plus size={14} /> Log hotel</button>
      </div>
      {!list.length ? (
        <Empty>No hotels logged for {d.name} yet. Add the ones you're considering to compare price per night and miles.</Empty>
      ) : (
        <div className="space-y-2">
          {picked.length > 0 && (
            <p className="text-sm" style={{ color: gaps.length ? "#7A5608" : "var(--ok)" }}>
              {gaps.length
                ? `Picked stays leave ${gaps.length} night${gaps.length === 1 ? "" : "s"} uncovered: ${gaps.map(fmtDate).join(", ")}.`
                : `Picked stays cover all ${nights} night${nights === 1 ? "" : "s"}.`}
            </p>
          )}
          {best && (
            <div className="verdict text-sm">
              Best value after miles among options not booked yet: <strong>{best.name}</strong> at {money(perNightEff(best), st)}/night effective.
            </div>
          )}
          {list.map((h) => (
            <HotelCard key={h.id} h={h} d={d} st={st} nights={nights} isBest={best?.id === h.id} open={open === h.id} setOpen={(o) => setOpen(o ? h.id : null)} updTrip={updTrip} />
          ))}
        </div>
      )}
    </section>
  );
}

function milesFor(h, totalUSD, st) {
  if (totalUSD === null) return { latam: 0, avios: 0, value: 0, label: "" };
  const latam = Math.round(totalUSD * 6);
  const avios = h.badgeAvios ? Math.round(totalUSD * 3) : 0;
  let value = 0;
  let label = "";
  if (h.channel === "latam") {
    value = (latam * st.valuation.latam) / 100;
    label = `${latam.toLocaleString()} LATAM miles + ${latam.toLocaleString()} qualifying pts`;
  } else if (h.channel === "qatar") {
    if (h.badgeAvios) { value = (avios * st.valuation.avios) / 100; label = `${avios.toLocaleString()} Avios`; }
    else label = "No Avios: property lacks the Avios badge";
  } else {
    label = "No miles on this channel";
  }
  return { latam, avios, value, label };
}

function HotelCard({ h, d, st, nights, isBest, open, setOpen, updTrip }) {
  const set = (k, v) => updTrip((t) => { const x = t.hotels.find((y) => y.id === h.id); if (x) x[k] = v; });
  const n = hotelNights(h, d);
  const ownDates = validD(h.checkIn) && validD(h.checkOut);
  const tot = toUSD(h.total, h.currency, st);
  const m = milesFor(h, tot, st);
  const lv = (m.latam * st.valuation.latam) / 100;
  const av = (m.avios * st.valuation.avios) / 100;
  const betterChannel = h.booked ? null : tot !== null && h.badgeAvios && av > lv && h.channel === "latam" ? "Qatar site earns more here" :
    tot !== null && lv > av && h.channel === "qatar" ? "LATAM site earns more here" : null;

  const toggleSelect = () => updTrip((t) => pickHotel(t, h.id, !h.selected));

  return (
    <div className={`panel ${h.selected ? "picked" : ""}`}>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <button className="btn btn-quiet" aria-expanded={open} aria-label="Edit details" onClick={() => setOpen(!open)}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {h.name || "Unnamed hotel"} {h.area && <span className="muted font-normal">{h.area}</span>}
            {h.rating && <span className="muted font-normal"> ({h.rating})</span>}
            {isBest && <span className="chip chip-warn ml-2">Best value</span>}
            {h.source === "ai" && <span className="chip chip-info ml-2">AI estimate</span>}
            {h.source === "email" && <span className="chip chip-info ml-2">From email</span>}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {ownDates && <span className="chip num">{fmtDate(h.checkIn)} → {fmtDate(h.checkOut)}</span>}
            <BookedChip x={h} />
            <span className="chip">{CHANNELS[h.channel]}</span>
            {h.badgeLatam && <span className="chip">LATAM badge</span>}
            {h.badgeAvios && <span className="chip">Avios badge</span>}
            {m.label && <Chip s={m.value > 0 ? "ok" : "info"}>{m.label}</Chip>}
            {betterChannel && <Chip s="warn">{betterChannel}</Chip>}
          </div>
          {!open && h.notes && <p className="text-sm muted mt-1">{h.notes}</p>}
        </div>
        <div className="text-right num">
          <div className="font-bold">{tot === null ? "Add price" : money(tot, st)}</div>
          <div className="text-xs muted">{tot === null ? `${n} nights` : `${money(tot / (n || 1), st)}/night, ${n} nights`}</div>
          {m.value > 0 && <div className="text-xs" style={{ color: "var(--ok)" }}>≈ {money(tot - m.value, st)} after miles</div>}
        </div>
        <button className={`btn ${h.selected ? "btn-solid" : ""}`} onClick={toggleSelect} aria-pressed={h.selected}>
          <Check size={14} /> {h.selected ? "Picked" : "Pick"}
        </button>
      </div>
      {open && (
        <div className="p-3 pt-0 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <F label="Name" className="sm:col-span-2"><input value={h.name} onChange={(e) => set("name", e.target.value)} /></F>
          <F label="Area"><input value={h.area} onChange={(e) => set("area", e.target.value)} /></F>
          <F label="Total for stay"><Num value={h.total} onChange={(v) => set("total", v)} /></F>
          <F label="Currency"><CurSelect value={h.currency} onChange={(v) => set("currency", v)} /></F>
          <F label="Check-in"><input type="date" value={h.checkIn || ""} onChange={(e) => set("checkIn", e.target.value)} /></F>
          <F label="Check-out"><input type="date" value={h.checkOut || ""} onChange={(e) => set("checkOut", e.target.value)} /></F>
          <F label={`Nights (blank = ${ownDates ? "from dates" : nights})`}><Num value={h.nights} min={0} onChange={(v) => set("nights", v)} /></F>
          <F label="Book through" className="sm:col-span-2">
            <select value={h.channel} onChange={(e) => set("channel", e.target.value)}>
              {Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </F>
          <label className="flex items-center gap-2 self-end pb-2"><input type="checkbox" checked={h.badgeLatam} onChange={(e) => set("badgeLatam", e.target.checked)} /> LATAM badge</label>
          <label className="flex items-center gap-2 self-end pb-2"><input type="checkbox" checked={h.badgeAvios} onChange={(e) => set("badgeAvios", e.target.checked)} /> Avios badge</label>
          <BookedFields x={h} set={set} />
          <F label="Rating"><input value={h.rating} onChange={(e) => set("rating", e.target.value)} /></F>
          <F label="Link"><input value={h.link} onChange={(e) => set("link", e.target.value)} placeholder="https://" /></F>
          <F label="Notes" className="sm:col-span-3 lg:col-span-4"><input value={h.notes} onChange={(e) => set("notes", e.target.value)} /></F>
          <div className="flex items-end gap-2 lg:col-span-2">
            {/^https?:\/\//.test(h.link) && <a className="btn btn-quiet" href={h.link} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a>}
            <button className="btn btn-quiet" style={{ color: "var(--bad)" }} onClick={() => updTrip((t) => { t.hotels = t.hotels.filter((x) => x.id !== h.id); })}>
              <Trash2 size={14} /> Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Transfers ---------------- */

const transfersOf = (trip) => (Array.isArray(trip.transfers) ? trip.transfers : []);
const transferTitle = (x) => `${x.from || "?"} → ${x.to || "?"}`;

function TransfersTab({ trip, state, updTrip }) {
  const st = state.settings;
  const [open, setOpen] = useState(null);
  const list = useMemo(
    () => transfersOf(trip).slice().sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || (a.time || "99:99").localeCompare(b.time || "99:99")),
    [trip],
  );
  const tasks = list.flatMap((x) => x.tasks);
  const done = tasks.filter((t) => t.done).length;
  const totalUSD = list.reduce((s, x) => s + (toUSD(x.cost, x.currency, st) ?? 0), 0);
  const withCost = list.some((x) => toUSD(x.cost, x.currency, st) !== null);

  const add = (patch = {}) => {
    const x = normTransfer(patch);
    updTrip((t) => { t.transfers = transfersOf(t); t.transfers.push(x); });
    return x;
  };
  const addOne = () => setOpen(add({ date: trip.start }).id);
  // One arrival and one departure per destination, dated to the stay.
  const addPairs = () => {
    let first = null;
    trip.destinations.forEach((d) => {
      const a = add({ destId: d.id, from: `${d.name} airport`, to: "Hotel", date: d.start });
      add({ destId: d.id, from: "Hotel", to: `${d.name} airport`, date: d.end });
      first = first || a;
    });
    if (first) setOpen(first.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="display text-2xl font-bold">Transfers</h2>
          <p className="muted">
            {list.length
              ? `${list.length} transfer${list.length === 1 ? "" : "s"}, ${done} of ${tasks.length} steps done${withCost ? `, ${money(totalUSD, st)} budgeted` : ""}`
              : "Airport to hotel, hotel to airport, and anything in between. Each one carries a checklist so nothing is left for the night before."}
          </p>
        </div>
        <div className="flex gap-2">
          {!!list.length && (
            <button className="btn btn-quiet" onClick={() => updTrip((t) => { transfersOf(t).forEach((x) => x.tasks.forEach((k) => { k.done = false; })); })}>
              <RefreshCw size={14} /> Uncheck all
            </button>
          )}
          <button className="btn" onClick={addPairs}><Plus size={14} /> Airport ↔ hotel for each stop</button>
          <button className="btn btn-solid" onClick={addOne}><Plus size={14} /> Log transfer</button>
        </div>
      </div>

      {tasks.length > 0 && done === tasks.length && (
        <div className="verdict text-sm flex items-center gap-2"><CheckCircle2 size={16} aria-hidden="true" /> Every transfer step is ticked. Ground side of this trip is ready.</div>
      )}

      {!list.length ? (
        <Empty>No transfers yet. Start with the airport runs for each stop, then add anything between towns.</Empty>
      ) : (
        <div className="space-y-2">
          {list.map((x) => (
            <TransferCard key={x.id} x={x} trip={trip} st={st} open={open === x.id} setOpen={(o) => setOpen(o ? x.id : null)} updTrip={updTrip} />
          ))}
        </div>
      )}
    </div>
  );
}

function TransferCard({ x, trip, st, open, setOpen, updTrip }) {
  const [draft, setDraft] = useState("");
  const edit = (fn) => updTrip((t) => { const y = transfersOf(t).find((z) => z.id === x.id); if (y) fn(y); });
  const set = (k, v) => edit((y) => { y[k] = v; });
  const setMode = (mode) => edit((y) => {
    // Swap in the new mode's checklist unless you've already started ticking or editing this one.
    const untouched = !y.tasks.some((k) => k.done) && y.tasks.every((k) => (TRANSFER_MODES[y.mode]?.[1] || []).includes(k.text));
    y.mode = mode;
    if (untouched) y.tasks = transferTasks(mode);
  });
  const addTask = () => {
    const text = draft.trim();
    if (!text) return;
    edit((y) => { y.tasks.push({ id: uid(), text, done: false }); });
    setDraft("");
  };
  const dest = trip.destinations.find((d) => d.id === x.destId);
  const total = x.tasks.length;
  const done = x.tasks.filter((k) => k.done).length;
  const cost = toUSD(x.cost, x.currency, st);
  const status = total === 0 ? "info" : done === total ? "ok" : done === 0 ? "bad" : "warn";
  const statusText = total === 0 ? "No steps" : done === total ? "Ready" : `${done} of ${total} done`;

  return (
    <div className={`panel ${status === "ok" ? "picked" : ""}`}>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <button className="btn btn-quiet" aria-expanded={open} aria-label="Edit details" onClick={() => setOpen(!open)}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{transferTitle(x)}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            <span className="chip">{TRANSFER_MODES[x.mode][0]}</span>
            <span className="chip chip-info num">{x.date ? `${fmtDow(x.date)} ${fmtDate(x.date)}` : "No date"}{x.time ? ` ${x.time}` : ""}</span>
            {dest && <span className="chip chip-info">{dest.name}</span>}
            <BookedChip x={x} />
            <Chip s={status}>{statusText}</Chip>
          </div>
          {!open && x.notes && <p className="text-sm muted mt-1">{x.notes}</p>}
        </div>
        <div className="text-right num">
          <div className="font-bold">{cost === null ? <span className="muted font-normal">No cost yet</span> : money(cost, st)}</div>
          {cost !== null && <div className="text-xs muted">{money(cost, st, st.secondaryCurrency)}</div>}
        </div>
      </div>

      {open && (
        <div className="p-3 pt-0 grid gap-3 lg:grid-cols-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-3 content-start">
            <F label="From"><input value={x.from} onChange={(e) => set("from", e.target.value)} placeholder="PEK airport" /></F>
            <F label="To"><input value={x.to} onChange={(e) => set("to", e.target.value)} placeholder="Hotel" /></F>
            <F label="How">
              <select value={x.mode} onChange={(e) => setMode(e.target.value)}>
                {Object.entries(TRANSFER_MODES).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </F>
            <F label="Destination">
              <select value={x.destId} onChange={(e) => set("destId", e.target.value)}>
                <option value="">Any</option>
                {trip.destinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </F>
            <F label="Date"><input type="date" value={x.date} onChange={(e) => set("date", e.target.value)} /></F>
            <F label="Time"><input type="time" value={x.time} onChange={(e) => set("time", e.target.value)} /></F>
            <F label="Cost"><Num value={x.cost} min={0} onChange={(v) => set("cost", v)} /></F>
            <F label="Currency"><CurSelect value={x.currency} onChange={(v) => set("currency", v)} /></F>
            <BookedFields x={x} set={set} />
            <F label="Link" className="sm:col-span-2"><input value={x.link} onChange={(e) => set("link", e.target.value)} placeholder="https:// booking, map or timetable" /></F>
            <F label="Notes" className="sm:col-span-2"><textarea rows={2} value={x.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Meeting point, driver name, plate, what to do if it falls through" /></F>
            <div className="flex items-end gap-2 sm:col-span-2">
              {/^https?:\/\//.test(x.link) && <a className="btn btn-quiet" href={x.link} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a>}
              <button className="btn btn-quiet" style={{ color: "var(--bad)" }} onClick={() => updTrip((t) => { t.transfers = transfersOf(t).filter((y) => y.id !== x.id); })}>
                <Trash2 size={14} /> Remove
              </button>
            </div>
          </div>

          <section className="panel p-3 lg:col-span-2" style={{ background: "var(--page)" }}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="display text-lg font-bold">Before the trip</h3>
              <span className="text-xs muted num">{done} of {total}</span>
            </div>
            {!total && <p className="text-sm muted mt-1">No steps for this one. Add what you need to do below.</p>}
            <ul className="mt-2">
              {x.tasks.map((k) => (
                <li key={k.id} className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" id={`tr_${k.id}`} checked={k.done} onChange={(e) => edit((y) => { const z = y.tasks.find((q) => q.id === k.id); if (z) z.done = e.target.checked; })} />
                  <label htmlFor={`tr_${k.id}`} className="flex-1" style={{ textDecoration: k.done ? "line-through" : "none", color: k.done ? "var(--muted)" : undefined }}>
                    {k.text}
                  </label>
                  <button className="btn btn-quiet" aria-label={`Remove ${k.text}`} onClick={() => edit((y) => { y.tasks = y.tasks.filter((q) => q.id !== k.id); })}>
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 mt-2">
              <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTask(); } }} placeholder="Add a step" aria-label="New step" />
              <button className="btn" onClick={addTask} disabled={!draft.trim()}><Plus size={14} /> Add</button>
            </div>
            <button className="btn btn-quiet mt-2 text-xs" onClick={() => edit((y) => { y.tasks = transferTasks(y.mode); })}>
              <RefreshCw size={12} /> Reset to the {TRANSFER_MODES[x.mode][0].toLowerCase()} checklist
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

/* ---------------- Import bookings from email ---------------- */

const IMPORT_SYSTEM = "You read travel booking confirmations, e-tickets and vouchers (any language, including Chinese and Portuguese) and extract the bookings as structured data. You never invent details: anything not stated is null or an empty string.";

function importPrompt(trip, state) {
  const people = state.travelers.filter((p) => trip.travelerIds.includes(p.id));
  return `Today is ${todayISO()}. The trip being filled in:
- ${trip.name}, ${trip.start} to ${trip.end}
- Destinations: ${trip.destinations.map((d) => `${d.name} (${d.start} to ${d.end})`).join("; ") || "none yet"}
- Travellers: ${people.map((p) => `${p.name}${p.home ? ` (home airport ${p.home})` : ""}`).join("; ") || "not set"}

List every flight, hotel and ground transfer booked in the material below.
Rules:
- Dates YYYY-MM-DD, times 24h HH:MM local time. Infer a missing year from context (bookings are for upcoming travel).
- Airports as 3-letter IATA codes, airlines as 2-letter IATA codes (e.g. QR, CA, LA).
- A flight booking has one journey per direction (outbound, return, or each hop of a multi-city). Connecting segments stay in one journey, with the connection airports in "via".
- Amounts are plain numbers in the currency actually charged or due (ISO 4217 code), taxes and fees included. Give a journey's own price only if the email breaks it out.
- Transfers cover airport pickups, private drivers, shuttles, pre-booked trains, buses or ferries, and car rentals.
- status: "confirmed", "pending" (awaiting payment or confirmation) or "cancelled".
- Use "ignored" for anything else in the email that is a booking but not one of these types (tours, restaurants, insurance).
${JSON_ONLY}
Schema:
{"bookings":[
 {"type":"flight","status":"confirmed","provider":"who sold it, e.g. Trip.com or Qatar Airways","confirmation":"PNR or booking ref","passengers":["full names"],"totalPrice":0,"currency":"CNY","paid":true,"link":"manage-booking URL or empty",
  "journeys":[{"from":"PEK","to":"DPS","via":["DOH"],"date":"YYYY-MM-DD","departTime":"HH:MM","arriveTime":"HH:MM","arriveDate":"YYYY-MM-DD","flightNumbers":["QR819","QR960"],"operatingCarrier":"QR","marketingCarrier":"QR","cabin":"Economy","fareClass":"N","basicEconomy":false,"durationHours":null,"price":null}]},
 {"type":"hotel","status":"confirmed","provider":"Booking.com","confirmation":"","loyalty":"miles or points programme mentioned, e.g. LATAM Pass or Avios","name":"","city":"","area":"","address":"","checkIn":"YYYY-MM-DD","checkOut":"YYYY-MM-DD","checkInTime":"","nights":null,"guests":null,"roomType":"","totalPrice":null,"currency":"","paid":false,"cancellation":"free cancellation deadline or policy","link":""},
 {"type":"transfer","status":"confirmed","provider":"","confirmation":"","from":"","to":"","date":"YYYY-MM-DD","time":"HH:MM","mode":"booked|shuttle|rental|public|taxi|app|other","meetingPoint":"","contact":"driver or company phone/WeChat","vehicle":"","totalPrice":null,"currency":"","paid":false,"link":""}
],"ignored":""}`;
}

const upper = (s) => (s || "").toString().trim().toUpperCase();
const round2 = (n) => Math.round(n * 100) / 100;
const normName = (s) =>
  (s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/\b(the|hotel|hotels|resort|resorts|spa|and|by|&|villa|villas|suites?|boutique|retreat|bali|ubud|inn)\b/g, " ")
    .replace(/[^a-z0-9一-鿿]+/g, " ").trim();
const similarName = (a, b) => {
  const x = normName(a), y = normName(b);
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const tx = x.split(" ").filter((w) => w.length >= 3);
  return tx.some((w) => y.split(" ").includes(w));
};
const hasText = (v) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length);
const addNote = (notes, extra) => {
  const bits = (extra || "").split(". ").filter((b) => b && !(notes || "").includes(b));
  const base = (notes || "").replace(/[.\s]+$/, "");
  return [base, bits.join(". ")].filter(Boolean).join(". ");
};
const cleanDate = (s) => (validD(s) ? s : "");
const nearTrip = (trip, a, b = a) => {
  if (!validD(a)) return true;
  return parseD(b || a) >= parseD(trip.start) - 3 * DAY && parseD(a) <= parseD(trip.end) + 3 * DAY;
};
const shortDate = (s) => (validD(s) ? fmtDate(s) : "no date");

function priceIn(amount, cur) {
  const n = numOrNull(amount);
  const c = upper(cur);
  if (n === null) return { value: null, currency: CURRENCIES.includes(c) ? c : "USD", note: "" };
  if (CURRENCIES.includes(c)) return { value: n, currency: c, note: "" };
  return { value: null, currency: "USD", note: `Charged ${n.toLocaleString("en-US")} ${c || "(currency not stated)"}, which the app doesn't convert` };
}

function destFor(trip, start, end, ...names) {
  const ds = trip.destinations;
  if (validD(start)) {
    const s = parseD(start);
    const e = validD(end) ? parseD(end) : s + DAY;
    let best = null, bestOverlap = 0;
    ds.forEach((d) => {
      if (!validD(d.start) || !validD(d.end)) return;
      const o = Math.min(e, parseD(d.end)) - Math.max(s, parseD(d.start));
      if (o > bestOverlap) { bestOverlap = o; best = d; }
    });
    if (best) return best;
    const on = ds.find((d) => validD(d.start) && validD(d.end) && s >= parseD(d.start) && s <= parseD(d.end));
    if (on) return on;
  }
  const hay = names.filter(Boolean).join(" ").toLowerCase();
  return ds.find((d) => d.name && hay.includes(d.name.toLowerCase())) || ds[0] || null;
}

// Turns the model's answer into a reviewable list of changes to this trip.
function buildProposals(res, trip, state) {
  const out = [];
  const people = state.travelers.filter((p) => trip.travelerIds.includes(p.id));
  const homes = new Set(people.map((p) => upper(p.home)).filter(Boolean));
  const legLabel = (type, who) =>
    !who.length || who.length === trip.travelerIds.length ? type : `${type}, ${people.filter((p) => who.includes(p.id)).map((p) => p.name).join(" and ")}`;
  const matchPeople = (names = []) => {
    const hay = names.join(" | ").toLowerCase();
    return people.filter((p) => p.name && hay.includes(p.name.split(" ")[0].toLowerCase())).map((p) => p.id);
  };
  const bookings = Array.isArray(res?.bookings) ? res.bookings : Array.isArray(res) ? res : [];

  bookings.forEach((b, bi) => {
    const status = ["pending", "cancelled"].includes(b.status) ? b.status : "confirmed";
    const booked = status === "confirmed";
    const via = b.provider ? `Booked via ${b.provider}` : "";

    if (b.type === "flight") {
      const J = (Array.isArray(b.journeys) ? b.journeys : []).filter((j) => j && (j.from || j.to || j.date));
      const matched = matchPeople(b.passengers || []);
      const who = matched.length ? matched : trip.travelerIds;
      const pax = matched.length || (b.passengers || []).length || who.length || 1;
      J.forEach((j, i) => {
        const from = upper(j.from), to = upper(j.to);
        const date = cleanDate(j.date);
        let type;
        if (J.length > 1) type = i === 0 ? "Outbound" : i === J.length - 1 ? "Return" : "Internal";
        else if (homes.has(from)) type = "Outbound";
        else if (homes.has(to)) type = "Return";
        else if (date && parseD(date) <= parseD(trip.start) + DAY) type = "Outbound";
        else if (date && parseD(date) >= parseD(trip.end) - DAY) type = "Return";
        else type = "Internal";

        const split = !hasText(j.price) && hasText(b.totalPrice) && J.length > 1;
        const pr = priceIn(hasText(j.price) ? j.price : hasText(b.totalPrice) ? b.totalPrice / J.length : null, b.currency);
        const cab = (j.cabin || "").toLowerCase();
        const cabin = /first|头等/.test(cab) || /business|商务|公务/.test(cab) ? "Business" : /premium|超级经济/.test(cab) ? "Premium economy" : "Economy";
        const route = [from, ...(Array.isArray(j.via) ? j.via.map(upper) : []), to].filter(Boolean).join("-");
        const flightNo = (Array.isArray(j.flightNumbers) ? j.flightNumbers : [j.flightNumbers]).filter(Boolean).map((x) => upper(x).replace(/\s+/g, "")).join(" / ");
        const notes = [
          j.departTime && `Departs ${j.departTime}`,
          j.arriveTime && `arrives ${j.arriveTime}${validD(j.arriveDate) && j.arriveDate !== date ? ` on ${fmtDate(j.arriveDate)}` : ""}`,
          /first|头等/.test(cab) && "First class",
          split && "Price is the booking total split evenly across directions",
          pr.note, via, status === "pending" && "Not confirmed yet",
        ].filter(Boolean).join(". ");
        const obj = normFlight({
          leg: legLabel(type, who), route, date, operating: upper(j.operatingCarrier || j.marketingCarrier), marketing: upper(j.marketingCarrier),
          flightNo, stops: Array.isArray(j.via) ? j.via.length : 0, durationH: numOrNull(j.durationHours), cabin,
          basic: !!j.basicEconomy, fareClass: upper(j.fareClass), pricePP: pr.value === null ? null : round2(pr.value / pax),
          currency: pr.currency, travelerIds: who, notes, link: b.link || "", selected: status !== "cancelled", booked,
          confirmation: upper(b.confirmation), source: "email",
        });
        const ends = (r) => { const a = (r || "").split("-").map((x) => upper(x)); return [a[0], a[a.length - 1]]; };
        const nums = new Set(flightNo.split(" / ").filter(Boolean));
        // Strong: same flight numbers, or a placeholder card with no carrier yet.
        // Weak: same day and leg but a different option you're comparing (offered, not preselected).
        const scored = trip.flights.map((f) => {
          const [a, z] = ends(f.route);
          const sameEnds = a === from && z === to;
          const sameNo = (f.flightNo || "").toUpperCase().replace(/\s+/g, "").split("/").some((n) => nums.has(n));
          const placeholder = !f.flightNo && !f.operating;
          const sameDay = f.date === date || !f.date;
          const strong = sameDay && (sameNo || (placeholder && (sameEnds || f.leg.startsWith(type))));
          const weak = sameDay && (sameEnds || f.leg.startsWith(type));
          return { f, score: strong ? 2 : weak ? 1 : 0 };
        }).filter((m) => m.score).sort((x, y) => y.score - x.score);
        const matches = scored.map((m) => m.f);
        const strongId = scored[0]?.score === 2 ? scored[0].f.id : null;
        out.push({
          key: `f${bi}_${i}`, kind: "flight", status, obj, include: status !== "cancelled" || matches.length > 0,
          target: strongId || (status === "cancelled" && matches[0]?.id) || "new",
          matches: matches.map((f) => ({ id: f.id, label: `${f.route || "flight"} ${f.flightNo || ""} (${shortDate(f.date)})`.replace(/\s+/g, " ") })),
          title: `${type}: ${route || "flight"}${flightNo ? `, ${flightNo}` : ""}`,
          sub: [shortDate(date), j.departTime, obj.cabin, pr.value !== null ? `${money(toUSD(pr.value, pr.currency, state.settings), state.settings)} total` : null, obj.confirmation].filter(Boolean).join(" · "),
          warnings: [!nearTrip(trip, date) && "Outside this trip's dates", pr.note && "Currency not converted", status === "pending" && "Not confirmed yet", status === "cancelled" && "Cancelled"].filter(Boolean),
        });
      });
      if (!J.length) out.push({ key: `f${bi}`, kind: "note", title: "Flight booking without readable flights", sub: b.confirmation || b.provider || "", include: false, warnings: [] });
      return;
    }

    if (b.type === "hotel") {
      const checkIn = cleanDate(b.checkIn), checkOut = cleanDate(b.checkOut);
      const d = destFor(trip, checkIn, checkOut, b.city, b.area, b.address, b.name);
      const dn = d ? nightsBetween(d.start, d.end) : 0;
      const n = numOrNull(b.nights) ?? (nightsBetween(checkIn, checkOut) || null);
      const pr = priceIn(b.totalPrice, b.currency);
      const tag = `${b.provider || ""} ${b.loyalty || ""}`;
      const channel = /latam/i.test(tag) ? "latam" : /qatar|avios|privilege/i.test(tag) ? "qatar"
        : b.provider && similarName(b.provider, b.name) ? "direct" : /booking\.com/i.test(tag) ? "" : "other";
      const notes = [
        b.roomType, b.guests && `${b.guests} guests`, b.checkInTime && `Check-in from ${b.checkInTime}`,
        b.cancellation, b.paid === true ? "Paid" : b.paid === false ? "Pay at the property" : "",
        pr.note, via, status === "pending" && "Not confirmed yet",
      ].filter(Boolean).join(". ");
      const obj = normHotel({
        destId: d?.id || "", name: b.name || "", area: b.area || b.city || "", checkIn, checkOut,
        nights: n !== null && n !== (checkIn && checkOut ? nightsBetween(checkIn, checkOut) : dn) ? n : null,
        total: pr.value, currency: pr.currency, channel: channel || "latam", notes, link: b.link || "",
        selected: status !== "cancelled", booked, confirmation: (b.confirmation || "").toString().trim(), source: "email",
      });
      const matches = trip.hotels.filter((h) => similarName(h.name, b.name) && (!d || h.destId === d.id || !h.destId));
      out.push({
        key: `h${bi}`, kind: "hotel", status, obj, channelFromEmail: channel, include: status !== "cancelled" || matches.length > 0,
        target: matches[0]?.id || "new",
        matches: matches.map((h) => ({ id: h.id, label: h.name || "Unnamed hotel" })),
        title: `${b.name || "Hotel"}${d ? `, ${d.name}` : ""}`,
        sub: [checkIn && checkOut ? `${fmtDate(checkIn)} to ${fmtDate(checkOut)}` : null, n && `${n} nights`, pr.value !== null ? money(toUSD(pr.value, pr.currency, state.settings), state.settings) : null, obj.confirmation].filter(Boolean).join(" · "),
        warnings: [!nearTrip(trip, checkIn, checkOut) && "Outside this trip's dates", pr.note && "Currency not converted", status === "pending" && "Not confirmed yet", status === "cancelled" && "Cancelled"].filter(Boolean),
      });
      return;
    }

    if (b.type === "transfer") {
      const date = cleanDate(b.date);
      const d = destFor(trip, date, date ? addDays(date, 1) : "", b.from, b.to);
      const pr = priceIn(b.totalPrice, b.currency);
      const mode = TRANSFER_MODES[b.mode] ? b.mode : "booked";
      const notes = [
        b.meetingPoint && `Meet at ${b.meetingPoint}`, b.contact && `Contact ${b.contact}`, b.vehicle,
        b.paid === true ? "Paid" : b.paid === false ? "Pay on the day" : "", pr.note, via, status === "pending" && "Not confirmed yet",
      ].filter(Boolean).join(". ");
      const obj = normTransfer({
        destId: d?.id || "", from: b.from || "", to: b.to || "", date, time: b.time || "", mode,
        cost: pr.value, currency: pr.currency, link: b.link || "", notes, booked, confirmation: (b.confirmation || "").toString().trim(), source: "email",
      });
      const air = (s) => /airport|机场|aeroporto|aeropuerto|\b[A-Z]{3}\b/i.test(s || "");
      const matches = transfersOf(trip).filter((x) =>
        x.date === date && ((air(x.from) && air(b.from)) || (air(x.to) && air(b.to)) || similarName(x.to, b.to) || similarName(x.from, b.from)));
      out.push({
        key: `t${bi}`, kind: "transfer", status, obj, include: status !== "cancelled" || matches.length > 0,
        ticks: { paid: b.paid === true, pickup: !!(b.time && b.meetingPoint), contact: !!b.contact },
        target: matches[0]?.id || "new",
        matches: matches.map((x) => ({ id: x.id, label: `${transferTitle(x)} (${shortDate(x.date)})` })),
        title: `${b.from || "?"} → ${b.to || "?"}`,
        sub: [TRANSFER_MODES[mode][0], shortDate(date), b.time, pr.value !== null ? money(toUSD(pr.value, pr.currency, state.settings), state.settings) : null, obj.confirmation].filter(Boolean).join(" · "),
        warnings: [!nearTrip(trip, date) && "Outside this trip's dates", pr.note && "Currency not converted", status === "pending" && "Not confirmed yet", status === "cancelled" && "Cancelled"].filter(Boolean),
      });
    }
  });
  // Bookings clearly for another trip start unticked.
  out.forEach((p) => { if (p.warnings?.includes("Outside this trip's dates")) p.include = false; });
  return out;
}

function tickTransfer(x, p) {
  if (!p.obj.booked) return;
  x.tasks.forEach((k) => {
    if (/^booked$|^requested with the hotel$/i.test(k.text)) k.done = true;
    if (/^paid$/i.test(k.text) && p.ticks?.paid) k.done = true;
    if (/pickup time and meeting point/i.test(k.text) && p.ticks?.pickup) k.done = true;
    if (/driver or company contact/i.test(k.text) && p.ticks?.contact) k.done = true;
  });
}

// Applies one reviewed proposal to the trip (mutates t).
function applyProposal(t, p) {
  const o = p.obj;
  const merge = (x, keys) => keys.forEach((k) => { if (hasText(o[k])) x[k] = o[k]; });
  const cancel = (x) => { x.booked = false; x.selected = false; x.notes = addNote(x.notes, "Cancelled per booking email"); };

  if (p.kind === "flight") {
    let x = p.target !== "new" && t.flights.find((f) => f.id === p.target);
    if (p.status === "cancelled") { if (x) cancel(x); return; }
    if (x) {
      merge(x, ["route", "date", "operating", "marketing", "flightNo", "durationH", "fareClass", "pricePP", "currency", "travelerIds", "link", "confirmation"]);
      x.stops = o.stops; x.cabin = o.cabin; x.basic = o.basic;
      x.notes = addNote(x.notes, o.notes);
      x.booked = o.booked;
      if (x.source === "ai") x.source = "email";
    } else {
      x = clone(o);
      t.flights.push(x);
    }
    pickFlight(t, x.id, true);
    return;
  }

  if (p.kind === "hotel") {
    let x = p.target !== "new" && t.hotels.find((h) => h.id === p.target);
    if (p.status === "cancelled") { if (x) cancel(x); return; }
    if (x) {
      merge(x, ["name", "total", "currency", "checkIn", "checkOut", "link", "confirmation"]);
      x.nights = o.nights;
      if (!x.area && o.area) x.area = o.area;
      if (!x.destId && o.destId) x.destId = o.destId;
      if (p.channelFromEmail) x.channel = p.channelFromEmail;
      x.notes = addNote(x.notes === "Candidate. Add the Booking.com price." ? "" : x.notes, o.notes);
      x.booked = o.booked;
    } else {
      x = clone(o);
      t.hotels.push(x);
    }
    pickHotel(t, x.id, true);
    return;
  }

  if (p.kind === "transfer") {
    t.transfers = transfersOf(t);
    let x = p.target !== "new" && t.transfers.find((y) => y.id === p.target);
    if (p.status === "cancelled") { if (x) cancel(x); return; }
    if (x) {
      const untouched = !x.tasks.some((k) => k.done) && x.tasks.every((k) => (TRANSFER_MODES[x.mode]?.[1] || []).includes(k.text));
      merge(x, ["from", "to", "date", "time", "cost", "currency", "link", "confirmation", "destId"]);
      if (o.mode !== x.mode) { x.mode = o.mode; if (untouched) x.tasks = transferTasks(o.mode); }
      x.notes = addNote(x.notes, o.notes);
      x.booked = o.booked;
    } else {
      x = clone(o);
      t.transfers.push(x);
    }
    tickTransfer(x, p);
  }
}

const KIND_ICON = { flight: Plane, hotel: BedDouble, transfer: CarFront, note: Info };

function ImportPanel({ trip, state, updTrip, onClose, onDone }) {
  const [pasted, setPasted] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [review, setReview] = useState(null); // { props, warnings, ignored }
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);
  const ai = aiConfig();
  const ready = aiReady();

  const addFiles = (list) => {
    const picked = Array.from(list || []); // copy now: the input's FileList is cleared right after
    if (picked.length) setFiles((fs) => [...fs, ...picked]);
  };
  const onPaste = (e) => {
    const imgs = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith("image/"));
    if (imgs.length) { e.preventDefault(); addFiles(imgs.map((f, i) => new File([f], f.name && f.name !== "image.png" ? f.name : `screenshot-${Date.now()}-${i}.png`, { type: f.type }))); }
  };

  const read = async () => {
    setErr(""); setReview(null);
    try {
      setBusy("Reading files…");
      const inp = await readInputs(files, pasted);
      if (!inp.text && !inp.images.length) throw new Error(inp.warnings[0] || "Nothing to read yet. Paste the email or add a file");
      setBusy(`Asking ${ai.label}…`);
      const res = await askAI({
        system: IMPORT_SYSTEM,
        text: `${importPrompt(trip, state)}\n\n=== BOOKING MATERIAL (${inp.sources.join(", ") || "images"}) ===\n${inp.text || "(see the attached images)"}`,
        images: inp.images,
        maxTokens: 4000,
      });
      const props = buildProposals(res, trip, state);
      if (!props.length) throw new Error(res?.ignored ? `No flights, hotels or transfers found. The email mentions: ${res.ignored}` : "No flights, hotels or transfers found in this email");
      setReview({ props, warnings: inp.warnings, ignored: res?.ignored || "" });
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy("");
    }
  };

  const setProp = (key, patch) => setReview((r) => ({ ...r, props: r.props.map((p) => (p.key === key ? { ...p, ...patch } : p)) }));
  const chosen = review ? review.props.filter((p) => p.include && p.kind !== "note") : [];
  const apply = () => {
    updTrip((t) => chosen.forEach((p) => applyProposal(t, p)));
    const upd = chosen.filter((p) => p.target !== "new").length;
    const parts = [chosen.length - upd && `added ${chosen.length - upd}`, upd && `updated ${upd}`].filter(Boolean).join(", ");
    onDone(`${parts.charAt(0).toUpperCase()}${parts.slice(1)} from the email.`, chosen[0]?.kind);
  };

  return (
    <section className="panel p-4 mb-5" style={{ borderColor: "var(--gold)" }} aria-label="Import a booking">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="display text-xl font-bold">Import a booking</h2>
          <p className="text-sm muted">
            Paste a confirmation email, or add the .eml, PDF voucher or a screenshot. Flights, hotels and transfers are read out and matched to what you've already logged; nothing is saved until you confirm.
          </p>
        </div>
        <button className="btn btn-quiet" aria-label="Close import" onClick={onClose}><X size={16} /></button>
      </div>

      {!ready && (
        <div className="verdict text-sm mt-3">
          Set up an AI provider first: Wallet and rules → This device → AI features. DeepSeek, Qwen, Kimi and GLM work without a VPN.
        </div>
      )}

      {!review && (
        <div
          className="mt-3 grid gap-3"
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
          style={drag ? { outline: "2px dashed var(--gold)", outlineOffset: 4, borderRadius: 8 } : undefined}
        >
          <F label="Email text">
            <textarea rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} onPaste={onPaste} placeholder="Paste the whole confirmation email here (screenshots can be pasted too)" />
          </F>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" multiple hidden accept=".eml,.mht,.txt,.html,.htm,.pdf,message/rfc822,application/pdf,text/*,image/*" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            <button className="btn" onClick={() => fileRef.current?.click()}><Paperclip size={14} /> Add files</button>
            {files.map((f, i) => (
              <span key={i} className="chip">
                {f.name}
                <button aria-label={`Remove ${f.name}`} onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} style={{ background: "none", border: 0, cursor: "pointer", padding: 0, display: "inline-flex" }}><X size={12} /></button>
              </span>
            ))}
            <span className="text-xs muted">.eml, PDF, HTML, text or images{files.length ? "" : "; you can also drop them here"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <AIButton busy={!!busy} onClick={read}>Read booking</AIButton>
            {busy ? <span className="text-sm muted" role="status">{busy}</span> : (
              <span className="text-xs muted">Sent from this browser to {ai.label} only; delete what you don't want from the text first.</span>
            )}
          </div>
          <ErrorLine msg={err} />
        </div>
      )}

      {review && (
        <div className="mt-4">
          <p className="font-semibold mb-2">Found {review.props.filter((p) => p.kind !== "note").length}. Tick what to save:</p>
          <ul className="space-y-2">
            {review.props.map((p) => {
              const Icon = KIND_ICON[p.kind] || Info;
              return (
                <li key={p.key} className="panel p-3 flex flex-wrap items-center gap-3">
                  {p.kind !== "note" && (
                    <input type="checkbox" aria-label={`Include ${p.title}`} checked={p.include} onChange={(e) => setProp(p.key, { include: e.target.checked })} />
                  )}
                  <Icon size={16} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{p.title}</div>
                    <div className="text-sm muted num">{p.sub}</div>
                    {!!p.warnings.length && <div className="flex flex-wrap gap-1 mt-1">{p.warnings.map((w) => <Chip key={w} s="warn">{w}</Chip>)}</div>}
                  </div>
                  {p.kind !== "note" && (
                    <select value={p.target} onChange={(e) => setProp(p.key, { target: e.target.value })} style={{ width: "auto", maxWidth: 280 }} aria-label="Save as">
                      {p.status !== "cancelled" && <option value="new">Add as new</option>}
                      {p.matches.map((m) => <option key={m.id} value={m.id}>{p.status === "cancelled" ? "Mark cancelled: " : "Update: "}{m.label}</option>)}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
          {review.ignored && <p className="text-sm muted mt-2">Not imported: {review.ignored}</p>}
          {review.warnings.map((w) => <p key={w} className="text-sm muted mt-1">{w}</p>)}
          <p className="text-xs muted mt-2">Saved items are marked Booked and Picked. Unbooked alternatives for the same dates or leg are unpicked; other bookings stay as they are.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="btn btn-solid" disabled={!chosen.length} onClick={apply}><Check size={14} /> Save {chosen.length} to {trip.name}</button>
            <button className="btn btn-quiet" onClick={() => setReview(null)}>Back</button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------- Itinerary ---------------- */

function destForDay(trip, date) {
  return trip.destinations.find((d) => date >= d.start && date < d.end) ||
    trip.destinations.find((d) => date === d.end) || null;
}

function ItineraryTab({ trip, state, updTrip }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const total = nightsBetween(trip.start, trip.end);
  const dates = validD(trip.start) ? Array.from({ length: Math.min(total + 1, 60) }, (_, i) => addDays(trip.start, i)) : [];
  const people = state.travelers.filter((t) => trip.travelerIds.includes(t.id));

  const draft = async (d) => {
    setBusy(d.id); setErr("");
    try {
      const n = nightsBetween(d.start, d.end) + 1;
      const prompt = `Draft a day-by-day plan for ${d.name}, ${d.start} to ${d.end} (${n} days including travel days).
Travelers: ${people.map((p) => `${p.name} (${p.notes || "no notes"})`).join("; ")}.
Trip notes: ${trip.notes || "none"}.
Keep pacing realistic, group nearby places on the same day, and keep arrival and departure days light.
${JSON_ONLY}
Format: [{"d":"YYYY-MM-DD","plan":"one line under 25 words"}] with one entry per date.`;
      const arr = await askClaude(prompt, { search: false });
      if (!Array.isArray(arr)) throw new Error("Unexpected format");
      updTrip((t) => {
        arr.forEach((x) => {
          if (!validD(x.d) || !x.plan) return;
          const cur = t.days[x.d]?.notes;
          if (cur && !overwrite) return;
          t.days[x.d] = { ...(t.days[x.d] || {}), notes: x.plan };
        });
      });
    } catch (e) {
      setErr(`Draft failed: ${e.message}. Try again in a moment.`);
    }
    setBusy(null);
  };

  return (
    <div className="space-y-4">
      <section className="panel p-4 flex flex-wrap items-center gap-2">
        <span className="font-semibold mr-2">Draft days with AI:</span>
        {trip.destinations.map((d) => (
          <AIButton key={d.id} busy={busy === d.id} onClick={() => draft(d)} solid={false}>{d.name}</AIButton>
        ))}
        <label className="flex items-center gap-2 ml-auto text-sm">
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> Replace days I've already written
        </label>
        <ErrorLine msg={err} />
      </section>

      {!dates.length && <Empty>Set trip dates in Overview to see the day list.</Empty>}

      <ol className="space-y-2">
        {dates.map((date, i) => {
          const d = destForDay(trip, date);
          const isMove = trip.destinations.some((x) => x.start === date) && i > 0;
          return (
            <li key={date} className="panel p-3 grid gap-3" style={{ gridTemplateColumns: "96px 1fr" }}>
              <div>
                <div className="display text-lg font-bold leading-tight">{fmtDate(date)}</div>
                <div className="text-xs muted">{fmtDow(date)}, day {i + 1}</div>
                <div className="text-xs mt-1 font-semibold">{d?.name || ""}</div>
                {(i === 0 || i === dates.length - 1 || isMove) && <span className="chip chip-warn mt-1">Travel day</span>}
              </div>
              <textarea
                aria-label={`Plan for ${fmtDate(date)}`}
                rows={2}
                value={trip.days[date]?.notes || ""}
                placeholder="Plans, bookings, reservations"
                onChange={(e) => updTrip((t) => { t.days[date] = { ...(t.days[date] || {}), notes: e.target.value }; })}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ---------------- Weather ---------------- */
// Open-Meteo: free, no key, reachable from mainland China.
// Up to 16 days out: daily forecast. Further out: the same dates last year.

const WMO = {
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Light showers", 81: "Showers", 82: "Heavy showers", 85: "Snow showers", 86: "Snow showers",
  95: "Thunderstorms", 96: "Thunderstorms, hail", 99: "Thunderstorms, hail",
};

const addYears = (iso, n) => {
  const [y, m, d] = iso.split("-");
  const day = m === "02" && d === "29" ? "28" : d;
  return `${Number(y) + n}-${m}-${day}`;
};

async function getJSON(url) {
  let r;
  try { r = await fetch(url); } catch (e) { throw new Error("Can't reach the weather service"); }
  if (!r.ok) {
    let msg = "";
    try { msg = (await r.json()).reason || ""; } catch (e) { /* ignore */ }
    throw new Error(`Weather service error${msg ? `: ${msg}` : ` ${r.status}`}`);
  }
  return r.json();
}

async function fetchWeather(query, start, end) {
  const g = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`);
  const p = g.results?.[0];
  if (!p) throw new Error(`No place called "${query}". Try the nearest city, e.g. Denpasar for Bali`);
  const place = [p.name, p.admin1, p.country].filter(Boolean).join(", ");
  const base = `latitude=${p.latitude}&longitude=${p.longitude}&timezone=auto`;
  const today = todayISO();
  const lastForecast = addDays(today, 15);
  const tripDays = nightsBetween(start, end) + 1;
  let kind;
  let rows;
  let yearsBack = 0;

  if (start <= lastForecast && end >= today) {
    const s = start < today ? today : start;
    const e = end > lastForecast ? lastForecast : end;
    const j = await getJSON(`https://api.open-meteo.com/v1/forecast?${base}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&start_date=${s}&end_date=${e}`);
    kind = "forecast";
    rows = j.daily.time.map((d, i) => ({
      d,
      h: j.daily.temperature_2m_max[i],
      l: j.daily.temperature_2m_min[i],
      c: WMO[j.daily.weather_code[i]] || "",
      r: j.daily.precipitation_probability_max?.[i] ?? null,
    }));
  } else {
    yearsBack = 1;
    while (addYears(end, -yearsBack) > addDays(today, -6)) yearsBack += 1;
    const cappedEnd = nightsBetween(start, end) > 20 ? addDays(start, 20) : end;
    const s = addYears(start, -yearsBack);
    const e = addYears(cappedEnd, -yearsBack);
    const j = await getJSON(`https://archive-api.open-meteo.com/v1/archive?${base}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&start_date=${s}&end_date=${e}`);
    kind = "lastyear";
    rows = j.daily.time.map((d, i) => ({
      d: addYears(d, yearsBack),
      h: j.daily.temperature_2m_max[i],
      l: j.daily.temperature_2m_min[i],
      c: WMO[j.daily.weather_code[i]] || "",
      mm: j.daily.precipitation_sum[i],
    }));
  }

  rows = rows.filter((r) => typeof r.h === "number" && typeof r.l === "number");
  const avg = (k) => Math.round(rows.reduce((a, r) => a + r[k], 0) / rows.length);
  let summary = "No data for these dates.";
  if (rows.length) {
    if (kind === "forecast") {
      const wet = rows.filter((r) => (r.r ?? 0) >= 50).length;
      summary = `Highs around ${avg("h")}°C, lows around ${avg("l")}°C. Rain likely on ${wet} of ${rows.length} days.`;
      if (rows.length < tripDays) summary += ` The forecast covers ${rows.length} of ${tripDays} trip days; refresh closer to the date.`;
    } else {
      const wet = rows.filter((r) => (r.mm ?? 0) >= 1).length;
      summary = `On these dates in ${Number(start.slice(0, 4)) - yearsBack}: highs around ${avg("h")}°C, lows around ${avg("l")}°C, rain on ${wet} of ${rows.length} days. A real forecast appears about 16 days out.`;
    }
  }
  return { kind, place, summary, rows, fetchedAt: today };
}

function WeatherTab({ trip, updTrip }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");

  const load = async (d) => {
    setBusy(d.id); setErr("");
    try {
      const w = await fetchWeather((d.wxQuery || d.name).trim(), d.start, d.end);
      updTrip((t) => { t.weather[d.id] = w; });
    } catch (e) {
      setErr(`${d.name}: ${e.message}.`);
    }
    setBusy(null);
  };

  return (
    <div className="space-y-6">
      <ErrorLine msg={err} />
      {trip.destinations.map((d) => {
        const w = trip.weather[d.id];
        const rows = (w?.rows || []).filter((r) => typeof r.h === "number" && typeof r.l === "number");
        const lo = rows.length ? Math.min(...rows.map((r) => r.l)) : 0;
        const hi = rows.length ? Math.max(...rows.map((r) => r.h)) : 1;
        const span = Math.max(1, hi - lo);
        return (
          <section key={d.id} className="panel p-4">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
              <div>
                <h2 className="display text-xl font-bold">{d.name}</h2>
                <p className="text-sm muted">
                  {fmtDate(d.start)} to {fmtDate(d.end)}
                  {w ? `, ${w.place}, ${w.kind === "forecast" ? "forecast" : "last year's weather"} checked ${fmtDate(w.fetchedAt)}` : ""}
                </p>
              </div>
              <div className="flex items-end gap-2">
                <F label="Weather location">
                  <input
                    value={d.wxQuery ?? d.name}
                    onChange={(e) => updTrip((t) => { const x = t.destinations.find((y) => y.id === d.id); if (x) x.wxQuery = e.target.value; })}
                    placeholder="City name"
                    style={{ minWidth: 160 }}
                  />
                </F>
                <button className={`btn ${w ? "" : "btn-solid"}`} onClick={() => load(d)} disabled={busy === d.id}>
                  {busy === d.id ? <Loader2 size={14} className="spin" /> : <CloudSun size={14} />}
                  {w ? "Refresh" : "Get weather"}
                </button>
              </div>
            </div>
            {!w ? (
              <p className="muted">
                Up to 16 days out you get a daily forecast. Further out you get the same dates last year.
                If the place name is a region (like Bali), use a nearby city such as Denpasar.
              </p>
            ) : (
              <>
                <p className="mb-3">{w.summary}</p>
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr><th>Day</th><th>Conditions</th><th>Range (°C)</th><th className="text-right">{w.kind === "forecast" ? "Rain chance" : "Rain"}</th></tr>
                    </thead>
                    <tbody className="num">
                      {rows.map((r, i) => (
                        <tr key={i}>
                          <td className="whitespace-nowrap">{validD(r.d) ? `${fmtDow(r.d)} ${fmtDate(r.d)}` : r.d}</td>
                          <td>{r.c}</td>
                          <td style={{ minWidth: 180 }}>
                            <div className="flex items-center gap-2">
                              <span className="w-6 text-right muted">{Math.round(r.l)}</span>
                              <div className="relative flex-1 h-2 rounded-full" style={{ background: "var(--page)" }}>
                                <div
                                  className="absolute h-2 rounded-full"
                                  style={{
                                    left: `${((r.l - lo) / span) * 100}%`,
                                    width: `${Math.max(4, ((r.h - r.l) / span) * 100)}%`,
                                    background: "linear-gradient(90deg, var(--ink2), var(--gold))",
                                  }}
                                />
                              </div>
                              <span className="w-6 font-semibold">{Math.round(r.h)}</span>
                            </div>
                          </td>
                          <td className="text-right">
                            {w.kind === "forecast"
                              ? (r.r != null ? `${r.r}%` : "—")
                              : (r.mm != null ? `${r.mm} mm` : "—")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ---------------- Packing ---------------- */

const TROPICAL_RE = /bali|lombok|thai|phuket|krabi|samui|boracay|palawan|siargao|el nido|langkawi|maldives|da nang|nha trang|beach|island/i;
const normText = (s) => (s || "").toLowerCase().trim();
const STANDARD_TEXTS = new Set(STANDARD_CARRY.map((x) => normText(x[2])));

function PackingTab({ trip, state, update, updTrip }) {
  const days = Math.max(1, nightsBetween(trip.start, trip.end));
  const place = `${trip.name} ${trip.destinations.map((d) => d.name).join(" ")}`;
  const userPresets = state.packPresets || [];
  const bases = [
    ...BUILTIN_PRESETS.filter((p) => p.kind === "base"),
    ...userPresets.map((p) => ({ ...p, kind: "base", user: true })),
  ];
  const addons = BUILTIN_PRESETS.filter((p) => p.kind === "addon");

  const [baseId, setBaseId] = useState(TROPICAL_RE.test(place) ? "p_tropical" : "p_hotcity");
  const [addonIds, setAddonIds] = useState(() => (/brazil|são paulo|sao paulo|gru/i.test(place) ? ["a_longhaul", "a_brazil"] : []));
  const [withStandard, setWithStandard] = useState(true);
  const [presetMsg, setPresetMsg] = useState("");
  const [presetName, setPresetName] = useState("");
  const [text, setText] = useState("");
  const [cat, setCat] = useState("Clothing");
  const [bag, setBag] = useState("Suitcase");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const items = trip.packing.map((i) => ({ ...i, bag: i.bag || bagFor(i.cat), qty: i.qty ?? null }));
  const done = items.filter((i) => i.done).length;
  const base = bases.find((p) => p.id === baseId);

  const expand = (arr) => arr.map(([b, c, t, q]) => ({ bag: b, cat: c, text: t, qty: qtyFor(q, days) }));

  const addItems = (list) => {
    const have = new Set(trip.packing.map((x) => normText(x.text)));
    const fresh = [];
    list.forEach((x) => {
      const k = normText(x.text);
      if (!k || have.has(k)) return;
      have.add(k);
      fresh.push(x);
    });
    if (fresh.length) {
      updTrip((t) => {
        fresh.forEach((x) => t.packing.push({
          id: uid(),
          bag: BAGS.includes(x.bag) ? x.bag : bagFor(x.cat),
          cat: PACK_CATS.includes(x.cat) ? x.cat : "Other",
          text: x.text,
          qty: x.qty ?? null,
          done: false,
        }));
      });
    }
    return { added: fresh.length, skipped: list.length - fresh.length };
  };

  const loadPreset = () => {
    const list = [];
    if (withStandard) list.push(...expand(STANDARD_CARRY));
    if (base) list.push(...(base.user ? base.items : expand(base.items)));
    addonIds.forEach((id) => { const a = addons.find((x) => x.id === id); if (a) list.push(...expand(a.items)); });
    const r = addItems(list);
    setPresetMsg(`Added ${r.added} item${r.added === 1 ? "" : "s"}${r.skipped ? `, skipped ${r.skipped} already on the list` : ""}.`);
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const saved = items
      .filter((i) => !STANDARD_TEXTS.has(normText(i.text)))
      .map(({ bag, cat, text, qty }) => ({ bag, cat, text, qty }));
    update((s) => {
      s.packPresets = s.packPresets || [];
      s.packPresets.push({ id: "u_" + uid(), name, desc: `Saved from ${trip.name}, ${days} nights`, items: saved });
    });
    setPresetName("");
    setPresetMsg(`Saved "${name}" with ${saved.length} items. It's now in the preset list.`);
  };

  const suggest = async () => {
    setBusy(true); setErr("");
    try {
      const weather = trip.destinations.map((d) => `${d.name}: ${trip.weather[d.id]?.summary || "no weather fetched"}`).join("\n");
      const plans = Object.entries(trip.days).filter(([, v]) => v.notes).map(([k, v]) => `${k}: ${v.notes}`).slice(0, 20).join("\n");
      const current = items.map((i) => i.text).join("; ");
      const prompt = `Suggest additions to a packing list for a ${days}-night trip. Destinations and weather:\n${weather}\nPlans:\n${plans || "none yet"}\nNotes: ${trip.notes || "none"}.
Already packed: ${current || "nothing yet"}.
Only suggest items missing from that list and specific to this trip. The traveler does not carry umbrellas (Chinese airport security). Max 12 items.
${JSON_ONLY}
Format: [{"bag":"Suitcase","cat":"Clothing","text":"Light rain jacket"}] with bag one of ${BAGS.join(", ")} and cat one of ${PACK_CATS.join(", ")}.`;
      const arr = await askClaude(prompt, { search: false });
      if (!Array.isArray(arr)) throw new Error("Unexpected format");
      const r = addItems(arr.map((x) => ({ bag: x.bag, cat: x.cat, text: x.text })));
      setPresetMsg(`Added ${r.added} suggestion${r.added === 1 ? "" : "s"}.`);
    } catch (e) {
      setErr(`Suggestions failed: ${e.message}.`);
    }
    setBusy(false);
  };

  const addOne = () => {
    if (!text.trim()) return;
    addItems([{ bag, cat, text: text.trim() }]);
    setText("");
  };

  const setItem = (id, k, v) => updTrip((t) => { const x = t.packing.find((y) => y.id === id); if (x) x[k] = v; });

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <h2 className="display text-xl font-bold mb-1">Start from a preset</h2>
        <p className="text-sm muted mb-3">
          Built from your Hong Kong, Beijing and Brazil packing lists. Quantities scale to this trip ({days} nights, with laundry assumed after a week).
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <span className="lbl">Trip type</span>
            <div className="space-y-2">
              {bases.map((p) => (
                <label key={p.id} className="flex gap-2 items-start">
                  <input type="radio" name="packbase" checked={baseId === p.id} onChange={() => setBaseId(p.id)} style={{ width: "auto", marginTop: 4 }} />
                  <span>
                    <span className="font-semibold">{p.name}</span>
                    <span className="block text-xs muted">{p.desc}</span>
                  </span>
                  {p.user && (
                    <button
                      className="btn btn-quiet ml-auto"
                      aria-label={`Delete preset ${p.name}`}
                      onClick={() => {
                        update((s) => { s.packPresets = (s.packPresets || []).filter((x) => x.id !== p.id); });
                        if (baseId === p.id) setBaseId("p_hotcity");
                      }}
                    ><Trash2 size={12} /></button>
                  )}
                </label>
              ))}
            </div>
          </div>
          <div>
            <span className="lbl">Add-ons</span>
            <div className="space-y-2">
              <label className="flex gap-2 items-start">
                <input type="checkbox" checked={withStandard} onChange={(e) => setWithStandard(e.target.checked)} style={{ marginTop: 4 }} />
                <span>
                  <span className="font-semibold">Standard carry</span>
                  <span className="block text-xs muted">Documents and tech, same every trip ({STANDARD_CARRY.length} items).</span>
                </span>
              </label>
              {addons.map((a) => (
                <label key={a.id} className="flex gap-2 items-start">
                  <input
                    type="checkbox"
                    checked={addonIds.includes(a.id)}
                    onChange={(e) => setAddonIds(e.target.checked ? [...addonIds, a.id] : addonIds.filter((x) => x !== a.id))}
                    style={{ marginTop: 4 }}
                  />
                  <span>
                    <span className="font-semibold">{a.name}</span>
                    <span className="block text-xs muted">{a.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <button className="btn btn-solid self-start" onClick={loadPreset}><Plus size={14} /> Load into list</button>
            <p className="text-xs muted">Loading adds to your list and skips anything already on it.</p>
            <div className="mt-auto">
              <F label="Save this trip's list as a preset">
                <div className="flex gap-2">
                  <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="e.g. Bali, 9 nights" />
                  <button className="btn" disabled={!presetName.trim() || !items.length} onClick={savePreset}>Save</button>
                </div>
              </F>
              <p className="text-xs muted mt-1">Standard carry items are left out so they stay in one place.</p>
            </div>
          </div>
        </div>
        {presetMsg && <p className="text-sm mt-3" role="status">{presetMsg}</p>}
      </section>

      <section className="panel p-4 flex flex-wrap items-end gap-2">
        <F label="Item" className="flex-1">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addOne(); }} placeholder="Add an item and press Enter" />
        </F>
        <F label="Bag"><select value={bag} onChange={(e) => setBag(e.target.value)}>{BAGS.map((b) => <option key={b}>{b}</option>)}</select></F>
        <F label="Category"><select value={cat} onChange={(e) => setCat(e.target.value)}>{PACK_CATS.map((c) => <option key={c}>{c}</option>)}</select></F>
        <button className="btn" disabled={!text.trim()} onClick={addOne}><Plus size={14} /> Add</button>
        <AIButton busy={busy} onClick={suggest} solid={false}>Suggest what's missing</AIButton>
        <ErrorLine msg={err} />
      </section>

      {!items.length ? (
        <Empty>Your list is empty. Pick a trip type above and load it.</Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold num">{done} of {items.length} packed</p>
            <div className="flex gap-2">
              <button className="btn btn-quiet" onClick={() => updTrip((t) => { t.packing.forEach((x) => { x.done = false; }); })}><RefreshCw size={14} /> Uncheck all</button>
              <ConfirmButton className="btn btn-quiet" onConfirm={() => updTrip((t) => { t.packing = []; })}>Clear list</ConfirmButton>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {BAGS.map((b) => {
              const list = items
                .filter((i) => i.bag === b)
                .sort((x, y) => PACK_CATS.indexOf(x.cat) - PACK_CATS.indexOf(y.cat));
              if (!list.length) return null;
              const packed = list.filter((i) => i.done).length;
              return (
                <section key={b} className="panel p-3">
                  <h3 className="display text-lg font-bold">{b}</h3>
                  <p className="text-xs muted mb-2 num">{packed} of {list.length} packed</p>
                  <ul>
                    {list.map((i, idx) => (
                      <li key={i.id}>
                        {(idx === 0 || list[idx - 1].cat !== i.cat) && (
                          <div className="text-xs font-semibold muted mt-3 mb-1">{i.cat}</div>
                        )}
                        <div className="flex items-center gap-2 py-0.5">
                          <input type="checkbox" id={`pk_${i.id}`} checked={i.done} onChange={(e) => setItem(i.id, "done", e.target.checked)} />
                          <label
                            htmlFor={`pk_${i.id}`}
                            className="flex-1"
                            style={{ textDecoration: i.done ? "line-through" : "none", color: i.done ? "var(--muted)" : undefined }}
                          >
                            {i.text}
                          </label>
                          {i.qty !== null && (
                            <input
                              type="number"
                              min={1}
                              aria-label={`Quantity of ${i.text}`}
                              value={i.qty}
                              onChange={(e) => setItem(i.id, "qty", numOrNull(e.target.value))}
                              style={{ width: 56, padding: "2px 6px" }}
                              className="num"
                            />
                          )}
                          <button className="btn btn-quiet" aria-label={`Remove ${i.text}`} onClick={() => updTrip((t) => { t.packing = t.packing.filter((y) => y.id !== i.id); })}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Wallet and rules                                                    */
/* ------------------------------------------------------------------ */

function WalletView({ state, update, device, onSaveDevice, sync, onSyncNow }) {
  const st = state.settings;
  const [newRule, setNewRule] = useState("");
  const [fxBusy, setFxBusy] = useState(false);
  const [fxErr, setFxErr] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const setS = (k, v) => update((s) => { s.settings[k] = v; });

  const refreshFx = async () => {
    setFxBusy(true); setFxErr("");
    const symbols = CURRENCIES.filter((c) => c !== "USD").join(",");
    const sources = [
      `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${symbols}`,
      `https://api.frankfurter.app/latest?from=USD&to=${symbols}`,
    ];
    let data = null;
    for (const u of sources) {
      try {
        const r = await fetch(u);
        if (r.ok) { data = await r.json(); if (data?.rates) break; }
      } catch (e) { /* try the next source */ }
    }
    if (!data?.rates) {
      setFxErr("Couldn't reach the exchange-rate service. Type the rates in directly.");
    } else {
      update((s) => {
        CURRENCIES.forEach((c) => {
          const v = data.rates[c];
          if (c !== "USD" && typeof v === "number" && v > 0) s.settings.fx[c] = v;
        });
        s.settings.fxUpdated = data.date || todayISO();
      });
    }
    setFxBusy(false);
  };

  const restore = (raw, label) => {
    try {
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.trips)) throw new Error("this doesn't look like a Travel HQ file");
      const clean = migrate(s);
      update((cur) => { Object.keys(cur).forEach((k) => delete cur[k]); Object.assign(cur, clean); });
      setImportMsg(`Restored from ${label}: ${clean.trips.length} trip${clean.trips.length === 1 ? "" : "s"}.`);
      setImportText("");
    } catch (e) {
      setImportMsg(`Restore failed: ${e.message}.`);
    }
  };
  const doImport = () => restore(importText, "pasted text");
  const importFile = (file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => restore(String(r.result), file.name);
    r.onerror = () => setImportMsg("Couldn't read that file.");
    r.readAsText(file);
  };
  const downloadBackup = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `travel-hq-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-8">
      <section>
        <h1 className="display text-4xl font-extrabold mb-4">Wallet and rules</h1>
        <DevicePanel device={device} onSave={onSaveDevice} sync={sync} onSyncNow={onSyncNow} />
        <div className="panel p-4 overflow-x-auto mt-6">
          <h2 className="display text-xl font-bold mb-2">Balances</h2>
          <table>
            <thead><tr><th>Program</th><th>Balance</th><th>Status</th><th>Notes and expiry</th><th /></tr></thead>
            <tbody>
              {state.balances.map((b, i) => (
                <tr key={b.id}>
                  <td style={{ minWidth: 160 }}><input value={b.program} onChange={(e) => update((s) => { s.balances[i].program = e.target.value; })} /></td>
                  <td style={{ width: 120 }}><Num value={b.balance} onChange={(v) => update((s) => { s.balances[i].balance = v; })} /></td>
                  <td style={{ width: 110 }}><input value={b.status} onChange={(e) => update((s) => { s.balances[i].status = e.target.value; })} /></td>
                  <td style={{ minWidth: 260 }}><input value={b.notes} onChange={(e) => update((s) => { s.balances[i].notes = e.target.value; })} /></td>
                  <td><button className="btn btn-quiet" aria-label={`Remove ${b.program}`} onClick={() => update((s) => { s.balances.splice(i, 1); })}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn btn-quiet mt-2" onClick={() => update((s) => { s.balances.push({ id: uid(), program: "", balance: 0, status: "", notes: "" }); })}>
            <Plus size={14} /> Add program
          </button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-4">
          <h2 className="display text-xl font-bold mb-1">Booking rules</h2>
          <p className="text-sm muted mb-3">Your reference list. The flight tags use the band and floor settings below.</p>
          <ul className="space-y-2">
            {state.rules.map((r, i) => (
              <li key={i} className="flex gap-2">
                <input value={r} onChange={(e) => update((s) => { s.rules[i] = e.target.value; })} />
                <button className="btn btn-quiet" aria-label="Remove rule" onClick={() => update((s) => { s.rules.splice(i, 1); })}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 mt-3">
            <input value={newRule} onChange={(e) => setNewRule(e.target.value)} placeholder="New rule" />
            <button className="btn" disabled={!newRule.trim()} onClick={() => { update((s) => { s.rules.push(newRule.trim()); }); setNewRule(""); }}><Plus size={14} /> Add</button>
          </div>

          <h3 className="display font-bold mt-6 mb-2">How the app applies them</h3>
          <div className="grid grid-cols-2 gap-3">
            <F label="Price band ($)"><Num value={st.bandUsd} onChange={(v) => setS("bandUsd", v ?? 0)} /></F>
            <F label="Price band (%)"><Num value={st.bandPct} onChange={(v) => setS("bandPct", v ?? 0)} /></F>
            <F label="Use whichever band is" className="col-span-2">
              <select value={st.bandMode} onChange={(e) => setS("bandMode", e.target.value)}>
                <option value="larger">Larger (more room for alliance fares)</option>
                <option value="smaller">Smaller (stricter)</option>
              </select>
            </F>
            <F label="Redemption floor, low (¢)"><Num value={st.floorLow} step="0.1" onChange={(v) => setS("floorLow", v ?? 0)} /></F>
            <F label="Redemption floor, good (¢)"><Num value={st.floorHigh} step="0.1" onChange={(v) => setS("floorHigh", v ?? 0)} /></F>
          </div>
        </section>

        <section className="panel p-4">
          <h2 className="display text-xl font-bold mb-3">Travelers</h2>
          <div className="space-y-3">
            {state.travelers.map((p, i) => (
              <div key={p.id} className="grid gap-2" style={{ gridTemplateColumns: "1fr 80px auto" }}>
                <input aria-label="Name" value={p.name} onChange={(e) => update((s) => { s.travelers[i].name = e.target.value; })} />
                <input aria-label="Home airport" value={p.home} maxLength={3} onChange={(e) => update((s) => { s.travelers[i].home = e.target.value.toUpperCase(); })} />
                <button
                  className="btn btn-quiet"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => update((s) => {
                    s.travelers.splice(i, 1);
                    s.trips.forEach((t) => {
                      t.travelerIds = t.travelerIds.filter((x) => x !== p.id);
                      t.flights.forEach((f) => { f.travelerIds = f.travelerIds.filter((x) => x !== p.id); });
                    });
                  })}
                ><Trash2 size={14} /></button>
                <textarea
                  aria-label={`Preferences for ${p.name}`}
                  className="col-span-3"
                  rows={2}
                  value={p.notes}
                  placeholder="Food likes and dislikes, pace, interests. The AI uses this when drafting days."
                  onChange={(e) => update((s) => { s.travelers[i].notes = e.target.value; })}
                />
              </div>
            ))}
          </div>
          <button className="btn btn-quiet mt-2" onClick={() => update((s) => { s.travelers.push({ id: "t_" + uid(), name: "New traveler", home: "", notes: "" }); })}>
            <Plus size={14} /> Add traveler
          </button>
        </section>

        <section className="panel p-4">
          <h2 className="display text-xl font-bold mb-3">Currency</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <F label="Show totals in"><CurSelect value={st.displayCurrency} onChange={(v) => setS("displayCurrency", v)} /></F>
            <F label="Also show"><CurSelect value={st.secondaryCurrency} onChange={(v) => setS("secondaryCurrency", v)} /></F>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm muted">Units per 1 USD{st.fxUpdated ? `, updated ${fmtDate(st.fxUpdated)}` : ", starter values: refresh before relying on them"}</span>
            <button className="btn" onClick={refreshFx} disabled={fxBusy}>
              {fxBusy ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Update rates
            </button>
          </div>
          <ErrorLine msg={fxErr} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CURRENCIES.filter((c) => c !== "USD").map((c) => (
              <F key={c} label={c}><Num value={st.fx[c]} step="0.01" onChange={(v) => update((s) => { if (v) s.settings.fx[c] = v; })} /></F>
            ))}
          </div>
        </section>

        <section className="panel p-4">
          <h2 className="display text-xl font-bold mb-1">What your points are worth</h2>
          <p className="text-sm muted mb-3">Cents per point. Used to value miles earned on flights and hotels.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(PROGRAMS).map(([k, label]) => (
              <F key={k} label={label}>
                <Num value={st.valuation[k]} step="0.1" onChange={(v) => update((s) => { s.settings.valuation[k] = v ?? 0; })} />
              </F>
            ))}
          </div>
          <p className="text-xs muted mt-3">Hotel earning: LATAM × Booking.com gives 6 miles and 6 qualifying points per USD. Qatar × Booking.com gives 3 Avios per USD on Avios-badged properties.</p>
        </section>
      </div>

      <section className="panel p-4">
        <h2 className="display text-xl font-bold mb-1">Backup</h2>
        <p className="text-sm muted mb-3">GitHub keeps every synced version in the repo's history. A file backup is a second copy you control.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          <button className="btn" onClick={downloadBackup}><Download size={14} /> Download backup file</button>
          <label className="btn" style={{ cursor: "pointer" }}>
            <Upload size={14} /> Restore from file
            <input type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <button className="btn btn-quiet" onClick={() => setShowExport(!showExport)}>{showExport ? "Hide text" : "Show as text"}</button>
        </div>
        {showExport && (
          <F label="Copy this and keep it somewhere safe">
            <textarea readOnly rows={6} value={JSON.stringify(state)} onFocus={(e) => e.target.select()} />
          </F>
        )}
        <F label="Or restore from pasted text" className="mt-3">
          <textarea rows={3} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste backup text here" />
        </F>
        <div className="flex items-center gap-3 mt-2">
          <button className="btn" disabled={!importText.trim()} onClick={doImport}>Restore</button>
          {importMsg && <span className="text-sm" role="status">{importMsg}</span>}
        </div>
      </section>
    </div>
  );
}

/* ---------------- Device settings (not synced) ---------------- */

function DevicePanel({ device, onSave, sync, onSyncNow }) {
  const [d, setD] = useState(device);
  const [showToken, setShowToken] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState(null);
  useEffect(() => { setD(device); }, [device]);
  const prov = AI_PROVIDERS[d.aiProvider] ? d.aiProvider : "anthropic";
  const runTest = async () => {
    setTest("busy");
    // Save first: imports use the saved settings, so a passing test must mean it's saved.
    if (changed) onSave(d);
    try { await testAI(d); setTest({ ok: true, text: `Working and saved. ${aiConfig(d).label} answered from this browser.` }); }
    catch (e) { setTest({ ok: false, text: e.message }); }
  };
  const changed = JSON.stringify(d) !== JSON.stringify(device);
  const connected = syncConfigured(device);
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });

  return (
    <section className="panel p-4" style={{ borderColor: connected ? "var(--line)" : "var(--gold)" }}>
      <h2 className="display text-xl font-bold mb-1">This device</h2>
      <p className="text-sm muted mb-4">
        These settings stay in this browser and never sync. Enter them once on each phone or computer.
      </p>

      <h3 className="font-semibold mb-2 flex items-center gap-2">
        <Cloud size={15} aria-hidden="true" /> GitHub sync
        <span className={`chip ${connected ? (sync.kind === "error" ? "chip-bad" : "chip-ok") : "chip-info"}`}>
          {connected ? (sync.kind === "error" ? "Error" : "Connected") : "Not connected"}
        </span>
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <F label="GitHub username"><input value={d.owner} onChange={set("owner")} placeholder="fesil03" autoCapitalize="off" autoCorrect="off" /></F>
        <F label="Private data repo"><input value={d.repo} onChange={set("repo")} placeholder="travel-hq-data" autoCapitalize="off" autoCorrect="off" /></F>
        <F label="Branch"><input value={d.branch} onChange={set("branch")} placeholder="main" autoCapitalize="off" /></F>
        <F label="File"><input value={d.path} onChange={set("path")} placeholder="travel-hq.json" autoCapitalize="off" /></F>
        <F label="Access token (fine-grained, this repo only)" className="sm:col-span-2 lg:col-span-3">
          <input type={showToken ? "text" : "password"} value={d.token} onChange={set("token")} placeholder="github_pat_…" autoComplete="off" autoCapitalize="off" />
        </F>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={showToken} onChange={(e) => setShowToken(e.target.checked)} /> Show token
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button className="btn btn-solid" disabled={!d.owner || !d.repo || !d.token} onClick={() => { onSave(d); setTimeout(onSyncNow, 0); }}>
          <Cloud size={14} /> {changed || !connected ? "Save and sync" : "Sync now"}
        </button>
        {connected && (
          <button className="btn btn-quiet" onClick={() => onSave({ ...device, token: "" })}>
            <CloudOff size={14} /> Disconnect this device
          </button>
        )}
        {connected && <span className="text-sm" style={{ color: sync.kind === "error" ? "var(--bad)" : "var(--muted)" }} role="status">{sync.text}</span>}
      </div>
      <p className="text-xs muted mt-2">
        If this device has no trips yet, connecting loads everything from GitHub. If the file doesn't exist, this device's data creates it.
      </p>

      <h3 className="font-semibold mt-6 mb-2 flex items-center gap-2"><Sparkles size={15} aria-hidden="true" /> AI features (optional)</h3>
      <p className="text-sm muted mb-2">Importing bookings from emails, drafting itinerary days and suggesting packing items. Everything else works without this.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <F label="Provider" className="sm:col-span-2">
          <select value={prov} onChange={(e) => { const p = AI_PROVIDERS[e.target.value]; setTest(null); setD({ ...d, aiProvider: e.target.value, aiBase: p.base, aiModel: p.model, aiVisionModel: p.visionModel }); }}>
            {Object.entries(AI_PROVIDERS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
          </select>
        </F>
        <F label="API key" className="sm:col-span-2">
          <input type={showKey ? "text" : "password"} value={d.aiKey} onChange={set("aiKey")} placeholder={AI_PROVIDERS[prov].keyHint} autoComplete="off" autoCapitalize="off" />
        </F>
        <F label="Endpoint" className="sm:col-span-2">
          <input value={d.aiBase || ""} onChange={set("aiBase")} placeholder={AI_PROVIDERS[prov].base || "https://…/v1"} autoCapitalize="off" autoCorrect="off" />
        </F>
        <F label="Model"><input value={d.aiModel} onChange={set("aiModel")} autoCapitalize="off" autoCorrect="off" /></F>
        {prov !== "anthropic" ? (
          <F label="Vision model (screenshots)"><input value={d.aiVisionModel ?? AI_PROVIDERS[prov].visionModel} onChange={set("aiVisionModel")} placeholder="none" autoCapitalize="off" autoCorrect="off" /></F>
        ) : <div />}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showKey} onChange={(e) => setShowKey(e.target.checked)} /> Show key
        </label>
      </div>
      <p className="text-xs muted mt-2">{AI_PROVIDERS[prov].note} Calls go straight from this browser to the provider; the key never syncs.</p>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button className={`btn ${changed ? "btn-solid" : ""}`} disabled={!changed} onClick={() => onSave(d)}>{changed ? "Save" : "Saved"}</button>
        <button className="btn btn-quiet" disabled={!d.aiKey || test === "busy"} onClick={runTest}>
          {test === "busy" ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Save and test
        </button>
        {changed && test !== "busy" && !test && <span className="text-sm" style={{ color: "var(--bad)" }}>Not saved yet</span>}
        {test && test !== "busy" && (
          <span className="text-sm" role="status" style={{ color: test.ok ? "var(--ok)" : "var(--bad)" }}>{test.text}</span>
        )}
      </div>
    </section>
  );
}
