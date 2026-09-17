// Local-first storage with optional GitHub sync.
// The full app state lives in IndexedDB on each device. When a GitHub repo is
// connected, the same state is kept as one JSON file in that (private) repo.
// Every sync is a commit, so GitHub also gives you version history.

import { get, set } from "idb-keyval";

const LOCAL_KEY = "travelhq:state";
const DEVICE_KEY = "travelhq:device";
const META_KEY = "travelhq:syncmeta";

/* ---------- device-only settings (never synced) ---------- */

export function getDevice() {
  try {
    return { owner: "", repo: "", branch: "main", path: "travel-hq.json", token: "", aiKey: "", aiModel: "claude-sonnet-5", ...JSON.parse(localStorage.getItem(DEVICE_KEY) || "{}") };
  } catch (e) {
    return { owner: "", repo: "", branch: "main", path: "travel-hq.json", token: "", aiKey: "", aiModel: "claude-sonnet-5" };
  }
}
export function setDevice(d) {
  localStorage.setItem(DEVICE_KEY, JSON.stringify(d));
}
export const syncConfigured = (d = getDevice()) => !!(d.owner && d.repo && d.path && d.token);

/* ---------- local copy ---------- */

export async function loadLocal() {
  try {
    const v = await get(LOCAL_KEY);
    if (v) return v;
  } catch (e) { /* fall back below */ }
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
export async function saveLocal(state) {
  try {
    await set(LOCAL_KEY, state);
  } catch (e) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
  }
}

/* ---------- sync bookkeeping ---------- */

const metaId = (d) => `${d.owner}/${d.repo}@${d.branch}:${d.path}`;
export function getMeta(d = getDevice()) {
  try {
    const all = JSON.parse(localStorage.getItem(META_KEY) || "{}");
    return { sha: null, dirty: false, lastSyncedAt: null, ...(all[metaId(d)] || {}) };
  } catch (e) {
    return { sha: null, dirty: false, lastSyncedAt: null };
  }
}
export function setMeta(patch, d = getDevice()) {
  let all = {};
  try { all = JSON.parse(localStorage.getItem(META_KEY) || "{}"); } catch (e) { all = {}; }
  all[metaId(d)] = { ...getMeta(d), ...patch };
  localStorage.setItem(META_KEY, JSON.stringify(all));
}

/* ---------- GitHub contents API ---------- */

const b64enc = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64dec = (b64) => {
  const bin = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

const headers = (d, accept = "application/vnd.github+json") => ({
  Accept: accept,
  Authorization: `Bearer ${d.token.trim()}`,
  "X-GitHub-Api-Version": "2022-11-28",
});
const fileUrl = (d) =>
  `https://api.github.com/repos/${encodeURIComponent(d.owner.trim())}/${encodeURIComponent(d.repo.trim())}/contents/${d.path
    .trim()
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

async function explain(res) {
  let msg = "";
  try { msg = (await res.json()).message || ""; } catch (e) { /* ignore */ }
  if (res.status === 401) return "GitHub rejected the token (expired or mistyped)";
  if (res.status === 403) return `GitHub refused access${msg ? `: ${msg}` : ""}. Check the token has Contents read and write on this repo`;
  return `GitHub error ${res.status}${msg ? `: ${msg}` : ""}`;
}

export class ConflictError extends Error {}
export class NetworkError extends Error {}

async function call(url, opts) {
  try {
    return await fetch(url, { cache: "no-store", ...opts });
  } catch (e) {
    throw new NetworkError("Can't reach GitHub right now");
  }
}

// Returns { sha, data } or null when the file doesn't exist yet.
export async function pull(d = getDevice()) {
  const url = `${fileUrl(d)}?ref=${encodeURIComponent(d.branch || "main")}`;
  const res = await call(url, { headers: headers(d) });
  if (res.status === 404) {
    // Either the file is missing (fine) or the repo/token is wrong (not fine).
    const repo = await call(`https://api.github.com/repos/${encodeURIComponent(d.owner.trim())}/${encodeURIComponent(d.repo.trim())}`, { headers: headers(d) });
    if (!repo.ok) throw new Error(`Repo ${d.owner}/${d.repo} not found, or the token can't see it`);
    return null;
  }
  if (!res.ok) throw new Error(await explain(res));
  const j = await res.json();
  let text;
  if (j.content) {
    text = b64dec(j.content);
  } else {
    const raw = await call(url, { headers: headers(d, "application/vnd.github.raw+json") });
    if (!raw.ok) throw new Error(await explain(raw));
    text = await raw.text();
  }
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error(`${d.path} on GitHub isn't valid JSON. Fix or delete it there.`); }
  return { sha: j.sha, data };
}

// Writes the file. Returns the new sha. Throws ConflictError if GitHub's copy moved.
export async function push(state, sha, d = getDevice()) {
  const body = {
    message: `Travel HQ sync ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    content: b64enc(JSON.stringify(state, null, 2) + "\n"),
    branch: d.branch || "main",
  };
  if (sha) body.sha = sha;
  const res = await call(fileUrl(d), { method: "PUT", headers: { ...headers(d), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 409) throw new ConflictError("GitHub copy changed");
  if (res.status === 422) {
    let msg = "";
    try { msg = (await res.clone().json()).message || ""; } catch (e) { /* ignore */ }
    if (/sha/i.test(msg)) throw new ConflictError("GitHub copy changed");
    throw new Error(`GitHub refused the save: ${msg || "validation failed"}`);
  }
  if (!res.ok) throw new Error(await explain(res));
  const j = await res.json();
  return j.content.sha;
}
