# Travel HQ

Personal trip planner: one tab per trip with colour-coded readiness tiles, flight and hotel logs checked against your booking rules, a costs breakdown (per hotel, per night, per person), ground transfers with pre-trip checklists, trains/buses/ferries/rental cars (Rail & road), itinerary, a day-by-day map (import from Google My Maps), weather and packing presets. Paste your own packing list or day-by-day plan and it's sorted for you.

- **App (public repo `travel-hq`)**: static site on GitHub Pages at https://fesil03.github.io/travel-hq/. Contains no personal data.
- **Data (private repo `travel-hq-data`)**: one file, `travel-hq.json`. Every sync is a commit, so the repo history is your version history.
- **Each device** keeps a full local copy (IndexedDB), works offline, and syncs with the data repo when GitHub is reachable.

## One-time setup

### 1. Publish the app
```bash
cd travel-hq
git init -b main
git add .
git commit -m "Travel HQ"
git remote add origin https://github.com/fesil03/travel-hq.git   # create the empty public repo first
git push -u origin main
```
Then in the repo: **Settings → Pages → Source: GitHub Actions**. The workflow in `.github/workflows/deploy.yml` builds and deploys on every push to `main` (Actions tab shows progress, about a minute).

### 2. Create the data repo
New repository → name `travel-hq-data` → **Private** → tick **Add a README** (so the `main` branch exists).

### 3. Create a token that can only touch the data repo
GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token:
- Repository access: **Only select repositories** → `travel-hq-data`
- Permissions → Repository permissions → **Contents: Read and write** (nothing else)
- Expiration: your choice. When it expires, generate a new one and paste it on each device.

### 4. First device
1. Open https://fesil03.github.io/travel-hq/
2. Wallet and rules → Backup → **Restore from file** → `travel-hq-starter-data.json`
3. Wallet and rules → This device → username `fesil03`, repo `travel-hq-data`, paste the token → **Save and sync**. The status should say it created `travel-hq.json`.

### 5. Every other device
Open the same URL, add it to the home screen, enter the same three sync fields → **Save and sync**. Your trips load from GitHub.

## How sync behaves
- Edits save on the device instantly and push to GitHub about 6 seconds after you stop typing.
- Opening or returning to the app pulls changes from other devices.
- Offline: edits stay on the device and push when you're back online.
- While the app is open it also checks for other people's edits every couple of minutes.
- If two devices or people changed things before syncing, the changes are combined item by item (hotels, flights, transfers, packing items, checklist steps, rules…): additions from both sides are kept, deletions are respected unless the other side edited that item. Only when both changed the very same field does the later edit win. Every sync is a commit, so anything overwritten is still in the data repo's history.

## Sharing with other people
Everyone connected to the same data repo sees and edits the same data, including your wallet and rules.
1. Create one fine-grained token per person (name it after them): Only select repositories → `travel-hq-data`, Contents: Read and write.
2. Send them the app link, the token, username `fesil03` and repo `travel-hq-data`.
3. They open the link → Wallet and rules → This device → fill those in plus their name → Save and sync. No GitHub account needed.
4. To stop sharing with someone, delete their token. Their name appears in commit messages ("Travel HQ sync by Lucia").
- The token and optional AI key live only in that browser's storage. Anyone with access to the unlocked device could read them; revoke the token on GitHub if a device is lost.

## Network notes (mainland China)
- App files, fonts and icons are bundled and cached offline. No CDNs.
- Weather: Open-Meteo, no key. Up to 16 days out it shows the forecast; further out, the same dates last year. For regions (e.g. Bali), set the weather location to a city (Denpasar).
- Exchange rates: Frankfurter (ECB rates), no key. Rates can always be typed in.
- GitHub API can be slow or blocked without a VPN; the app keeps working locally and syncs later.
- AI features (importing bookings from emails, itinerary drafts, packing suggestions) are optional and use your own API key, set per device under Wallet and rules → This device. Providers: Claude (needs a VPN on a mainland network), DeepSeek, Qwen, Kimi, GLM, or any OpenAI-compatible endpoint. Use *Test connection* to confirm a provider accepts calls from the browser.
- **Map** (on each trip): Import My Maps (.kmz/.kml) — in Google My Maps, ⋮ next to the title → Export to KML/KMZ. Each layer becomes a day; layers named "Day N" land on the Nth day of the trip (change any day's date with its pencil). Re-importing skips places already on the map. Days show numbered stops joined in order; reorder with the arrows or *Shortest order*, move stops between days, add places by search (OpenStreetMap), a Google Maps link with coordinates, or tapping the map. Every stop opens in Google or Apple Maps, with leg-by-leg transit directions. Base map tiles come from CARTO or OpenStreetMap (no key); tiles you've viewed are cached for offline use. If tiles don't load on a mainland network, switch base map or use a VPN — pins, order and links still work. Map days with a date also appear on the Itinerary tab.
- **Import booking** (on each trip): paste a confirmation email or add the `.eml`, PDF voucher or screenshots. Flights, hotels and transfers are extracted, matched to what's already logged, and shown for review; confirmed items are marked Booked with their confirmation number. Email text goes only to the AI provider you picked.

## Versions, releases and rolling back
- `main` is what's live. New work happens on a branch (`feature/…`), is built and tested, then merged into `main` and tagged `vMAJOR.MINOR.PATCH`. Each tag has a GitHub Release with notes; [CHANGELOG.md](CHANGELOG.md) lists them all.
- The version a device is running shows at the bottom of Wallet and rules.
- **Roll back the app** to an earlier version without losing history: `git revert --no-edit <first-bad-commit>^..main && git push`, or put a tag's code back with `git checkout v1.5.0 -- . && git commit -m "Roll back to v1.5.0" && git push`. Pages redeploys in about a minute.
- **Your data** is versioned separately: every sync is a commit in the private `travel-hq-data` repo, so any earlier copy of `travel-hq.json` can be restored from its history (or from a backup file via Wallet and rules → Backup).
- App versions only ever add fields to the data, so an older version still reads newer data.

## Development
```bash
npm install
npm run dev      # http://localhost:5173/travel-hq/
npm run build
```
Main code: `src/App.jsx` (UI, rules, booking import, costs, readiness, paste-a-list), `src/MapTab.jsx` + `src/maps.js` (trip map, KMZ/KML import), `src/sync.js` (local storage and GitHub sync), `src/merge.js` (combining edits from several people), `src/ai.js` (AI providers), `src/emailinput.js` (reading .eml, PDF, HTML and images).
