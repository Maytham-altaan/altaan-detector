import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* On GitHub Pages the site is served from /altaan-detector/, so we need
   to tell Vite to prefix all asset URLs accordingly. The deploy workflow
   sets GITHUB_PAGES=true. Local dev and Vercel deploys keep the root "/". */
const base = process.env.GITHUB_PAGES === "true" ? "/altaan-detector/" : "/";

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
    // During `npm run dev`, proxy /api/* to vercel dev on :3000 so backend
    // and frontend share an origin. If you're not using vercel dev locally,
    // remove this block and use mock data only.
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
