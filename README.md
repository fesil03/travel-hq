# Travel HQ

Personal trip planner: one tab per trip with flight and hotel logs checked against your booking rules, costs per night and per destination, ground transfers with a pre-trip checklist per leg, itinerary, weather and packing presets.

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
- If two devices both changed things before syncing, the most recent edit wins for the whole file. Anything overwritten is still in the data repo's commit history.
- The token and optional Anthropic key live only in that browser's storage. Anyone with access to the unlocked device could read them; revoke the token on GitHub if a device is lost.

## Network notes (mainland China)
- App files, fonts and icons are bundled and cached offline. No CDNs.
- Weather: Open-Meteo, no key. Up to 16 days out it shows the forecast; further out, the same dates last year. For regions (e.g. Bali), set the weather location to a city (Denpasar).
- Exchange rates: Frankfurter (ECB rates), no key. Rates can always be typed in.
- GitHub API can be slow or blocked without a VPN; the app keeps working locally and syncs later.
- AI features (itinerary drafts, packing suggestions) are optional, need your own Anthropic API key, and need a VPN.

## Development
```bash
npm install
npm run dev      # http://localhost:5173/travel-hq/
npm run build
```
Main code: `src/App.jsx` (UI and rules), `src/sync.js` (local storage and GitHub sync).
