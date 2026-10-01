// Three-way merge for the synced state, so several people (or devices) can
// edit at different times without overwriting each other.
//
//   base   = the copy this device last agreed on with GitHub
//   mine   = this device's copy now
//   theirs = GitHub's copy now (someone else's edits)
//
// Rules: anything only one side changed is taken from that side. Lists of
// items with an `id` (trips, hotels, flights, packing items, tasks…) merge
// item by item: additions from both sides are kept, an item deleted on one
// side stays deleted unless the other side edited it. Only when both sides
// changed the very same field does one value win: the side edited last.

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

const hasIds = (arr) => Array.isArray(arr) && arr.length > 0 && arr.every((x) => isObj(x) && (typeof x.id === "string" || typeof x.id === "number"));
const isScalarList = (arr) => Array.isArray(arr) && arr.every((x) => x === null || typeof x !== "object");

function mergeIdList(base, mine, theirs, ctx) {
  const B = new Map((base || []).map((x) => [x.id, x]));
  const M = new Map(mine.map((x) => [x.id, x]));
  const T = new Map(theirs.map((x) => [x.id, x]));
  const keep = (id) => {
    const b = B.get(id), m = M.get(id), t = T.get(id);
    if (m && t) return merge3(b, m, t, ctx);
    if (!b) return m || t; // added on one side
    // in base, deleted on one side: stays deleted unless the other side edited it
    const other = m || t;
    return deepEqual(other, b) ? undefined : other;
  };
  // Order: theirs, with my new items slotted in after their neighbour in my list.
  const out = [];
  const placed = new Set();
  theirs.forEach((x) => { const v = keep(x.id); placed.add(x.id); if (v !== undefined) out.push(v); });
  mine.forEach((x, i) => {
    if (placed.has(x.id)) return;
    placed.add(x.id);
    const v = keep(x.id);
    if (v === undefined) return;
    const prev = mine.slice(0, i).reverse().find((y) => out.some((o) => o.id === y.id));
    const at = prev ? out.findIndex((o) => o.id === prev.id) + 1 : 0;
    out.splice(at, 0, v);
  });
  return out;
}

// Lists of plain values (your rules, traveller ids): keep both sides' additions,
// honour both sides' removals.
function mergeScalarList(base, mine, theirs) {
  const b = base || [];
  const removedByMe = new Set(b.filter((x) => !mine.includes(x)));
  const out = theirs.filter((x) => !removedByMe.has(x));
  mine.forEach((x, i) => {
    if (out.includes(x) || b.includes(x)) return; // already there, or theirs removed it
    const prev = mine.slice(0, i).reverse().find((y) => out.includes(y));
    out.splice(prev !== undefined ? out.indexOf(prev) + 1 : 0, 0, x);
  });
  return out;
}

export function merge3(base, mine, theirs, ctx = { mineWins: true }) {
  if (deepEqual(mine, theirs)) return mine;
  if (base !== undefined && deepEqual(mine, base)) return theirs;
  if (base !== undefined && deepEqual(theirs, base)) return mine;

  if (isObj(mine) && isObj(theirs)) {
    const b = isObj(base) ? base : undefined;
    const out = {};
    const keys = new Set([...Object.keys(theirs), ...Object.keys(mine)]);
    keys.forEach((k) => {
      const inM = Object.prototype.hasOwnProperty.call(mine, k);
      const inT = Object.prototype.hasOwnProperty.call(theirs, k);
      const bv = b ? b[k] : undefined;
      let v;
      if (inM && inT) v = merge3(bv, mine[k], theirs[k], ctx);
      else if (inM) v = b && Object.prototype.hasOwnProperty.call(b, k) && deepEqual(mine[k], bv) ? undefined : mine[k];
      else v = b && Object.prototype.hasOwnProperty.call(b, k) && deepEqual(theirs[k], bv) ? undefined : theirs[k];
      if (v !== undefined) out[k] = v;
    });
    return out;
  }

  if (Array.isArray(mine) && Array.isArray(theirs)) {
    const b = Array.isArray(base) ? base : undefined;
    const all = [...mine, ...theirs, ...(b || [])];
    if ((hasIds(mine) || hasIds(theirs) || hasIds(b)) && all.every((x) => isObj(x) && x.id !== undefined)) return mergeIdList(b, mine, theirs, ctx);
    if (isScalarList(all)) return mergeScalarList(b, mine, theirs);
  }

  // Same field changed on both sides (or no common base): the later edit wins.
  ctx.conflicts = (ctx.conflicts || 0) + 1;
  return ctx.mineWins ? mine : theirs;
}

/** Merge whole app states. Returns { state, conflicts }. */
export function mergeStates(base, mine, theirs) {
  const ctx = { mineWins: (mine?.updatedAt || 0) >= (theirs?.updatedAt || 0), conflicts: 0 };
  const strip = (s) => (s && typeof s === "object" ? { ...s, updatedAt: 0, activeTripId: null } : s);
  const state = merge3(base ? strip(base) : undefined, strip(mine), strip(theirs), ctx);
  state.updatedAt = Math.max(mine?.updatedAt || 0, theirs?.updatedAt || 0, Date.now());
  // Which trip is open is a per-device choice.
  const ids = (state.trips || []).map((t) => t.id);
  state.activeTripId = ids.includes(mine?.activeTripId) ? mine.activeTripId : ids.includes(theirs?.activeTripId) ? theirs.activeTripId : ids[0] || null;
  return { state, conflicts: ctx.conflicts };
}
