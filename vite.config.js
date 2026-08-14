import { defineConfig } from "vite";
import { SHEET_CSV } from "./src/sheet.js";

function sheetProxy() {
  async function handle(_req, res) {
    try {
      const upstream = await fetch(SHEET_CSV, {
        headers: {
          "User-Agent": "mapa-escolas/1.0 (heatmap de escolas prospectadas)",
          Accept: "text/csv,*/*",
        },
      });
      const csv = await upstream.text();
      res.statusCode = upstream.ok ? 200 : upstream.status;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(csv);
    } catch (err) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(err?.message || "Falha ao atualizar a planilha.");
    }
  }

  return {
    name: "sheet-proxy",
    configureServer(server) {
      server.middlewares.use("/api/sheet", handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/sheet", handle);
    },
  };
}

export default defineConfig({
  plugins: [sheetProxy()],
  server: {
    port: 5173,
  },
});
