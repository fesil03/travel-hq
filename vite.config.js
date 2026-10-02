import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Served from https://fesil03.github.io/travel-hq/
export default defineConfig({
  base: "/travel-hq/",
  // Shown at the bottom of Wallet and rules, so you can tell which version a device is running.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Travel HQ",
        short_name: "Travel HQ",
        description: "Trips, flights, hotels, itinerary, weather and packing.",
        theme_color: "#14323A",
        background_color: "#EEF3F1",
        display: "standalone",
        start_url: "/travel-hq/",
        scope: "/travel-hq/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // never cache API traffic: GitHub, Open-Meteo, exchange rates, Anthropic
        navigateFallbackDenylist: [/^\/api/],
        // Map tiles seen once stay available offline (e.g. checking a day's
        // stops on the metro). Up to ~3000 tiles, kept 60 days.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/([a-d]\.basemaps\.cartocdn\.com|tile\.openstreetmap\.org)\//,
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles",
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
