import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Served from https://fesil03.github.io/travel-hq/
export default defineConfig({
  base: "/travel-hq/",
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
      },
    }),
  ],
});
