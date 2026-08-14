import { SHEET_CSV } from "../src/sheet.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, POST");
    res.end("Method Not Allowed");
    return;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const upstream = await fetch(SHEET_CSV, {
      headers: {
        "User-Agent": "mapa-escolas/1.0 (heatmap de escolas prospectadas)",
        Accept: "text/csv,*/*",
      },
      signal: ctrl.signal,
    });
    if (!upstream.ok) {
      res.statusCode = upstream.status;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(`Não foi possível baixar a planilha (HTTP ${upstream.status}).`);
      return;
    }
    const csv = await upstream.text();
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(csv);
  } catch (err) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(err?.message || "Falha ao atualizar a planilha.");
  } finally {
    clearTimeout(timer);
  }
}
