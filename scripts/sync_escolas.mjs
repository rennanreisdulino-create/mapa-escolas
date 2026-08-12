import { writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const CACHE_PATH = path.join(ROOT, "scripts", "geocode-cache.json");
const SHEET_CSV =
  "https://docs.google.com/spreadsheets/d/1s04lCnb1XQYq9PHb_3cZ66QS8aElfV-t/export?format=csv&gid=1028988662";
const UA = "mapa-escolas/1.0 (heatmap de escolas prospectadas)";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "").replace(/\0/g, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function clean(value) {
  const text = String(value || "")
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (["**", "*", "-", "—", "N/A", "n/a"].includes(text)) return "";
  return text;
}

function parseNumber(value) {
  let text = clean(value);
  if (!text || text.includes("/")) return null;
  text = text.replace("R$", "").replace(/ /g, "");
  if (/\d+\.\d{3}/.test(text) && text.includes(",")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if ((text.match(/,/g) || []).length === 1 && !text.includes(".")) {
    text = text.replace(",", ".");
  }
  text = text.replace(/[^0-9.]/g, "");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function parseTicket(value) {
  const number = parseNumber(value);
  if (number == null || number <= 0 || number > 10000) return null;
  return number;
}

function parseAlunos(value) {
  const number = parseNumber(value);
  if (number == null) return null;
  return Math.round(number);
}

function digitsCep(value) {
  return clean(value).replace(/\D/g, "").slice(0, 8);
}

function col(row, ...parts) {
  for (const [key, value] of Object.entries(row)) {
    const norm = (key || "").toUpperCase();
    if (parts.every((part) => norm.includes(part.toUpperCase()))) return clean(value);
  }
  return "";
}

async function get(url, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json,text/csv,*/*" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function loadCache() {
  if (!existsSync(CACHE_PATH)) return {};
  return JSON.parse(await readFile(CACHE_PATH, "utf8"));
}

async function saveCache(cache) {
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function geocodeBrasilApi(cep) {
  try {
    const payload = await (await get(`https://brasilapi.com.br/api/cep/v2/${cep}`)).json();
    const coords = payload?.location?.coordinates || {};
    const lat = Number(coords.latitude);
    const lng = Number(coords.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, source: "brasilapi" };
  } catch {
    return null;
  }
}

async function geocodeAwesome(cep) {
  try {
    const payload = await (await get(`https://cep.awesomeapi.com.br/json/${cep}`)).json();
    const lat = Number(payload.lat);
    const lng = Number(payload.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, source: "awesomeapi" };
  } catch {
    return null;
  }
}

async function geocodeNominatim(query) {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "1",
    countrycodes: "br",
    addressdetails: "0",
  });
  try {
    const payload = await (
      await get(`https://nominatim.openstreetmap.org/search?${params}`)
    ).json();
    if (!payload?.[0]) return null;
    const lat = Number(payload[0].lat);
    const lng = Number(payload[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, source: "nominatim" };
  } catch {
    return null;
  }
}

async function geocodeOne(school, cache) {
  const keys = [];
  if (school.cepDigits.length === 8) keys.push(`cep:${school.cepDigits}`);
  keys.push(`q:${school.geoQuery}`);
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
  }

  let result = null;
  if (school.cepDigits.length === 8) {
    result = await geocodeBrasilApi(school.cepDigits);
    await sleep(120);
    if (!result) {
      result = await geocodeAwesome(school.cepDigits);
      await sleep(120);
    }
  }
  if (!result && school.geoQuery) {
    result = await geocodeNominatim(school.geoQuery);
    await sleep(1050);
  }

  for (const key of keys) cache[key] = result;
  return result;
}

function rowsToSchools(rows) {
  const headers = rows[0].map((h) => h.trim());
  const schools = [];
  for (let i = 1; i < rows.length; i++) {
    const raw = {};
    headers.forEach((h, idx) => {
      raw[h] = rows[i][idx] || "";
    });
    const nome = col(raw, "GIOS") || col(raw, "COL");
    if (!nome) continue;
    const endereco = col(raw, "ENDERE");
    const bairro = col(raw, "BAIRRO");
    const cidade = col(raw, "CIDADE");
    const cep = col(raw, "CEP");
    const cepDigits = digitsCep(cep);
    const queryParts = [endereco, bairro, cidade, "Pernambuco", "Brasil"].filter(Boolean);
    let geoQuery = queryParts.join(", ");
    if (cepDigits) geoQuery += `, ${cepDigits}`;
    schools.push({
      id: i + 1,
      nome,
      endereco,
      bairro,
      cidade,
      cep,
      cepDigits,
      telefone: col(raw, "TELEFONE"),
      email: col(raw, "E-MAIL") || col(raw, "EMAIL"),
      status: col(raw, "STATUS"),
      grupo: col(raw, "Grupo") || col(raw, "GRUPO"),
      obs: col(raw, "OBS"),
      ticket: parseTicket(col(raw, "TICKET")),
      alunos: parseAlunos(col(raw, "ALUNADO")),
      geoQuery,
    });
  }
  return schools;
}

function scoreSchools(schools) {
  const alunosVals = schools.map((s) => s.alunos).filter((n) => n && n > 0);
  const maxAlunos = alunosVals.length ? Math.max(...alunosVals) : 1;
  for (const school of schools) {
    const ticketPts = school.ticket != null && school.ticket >= 300 ? 50 : 0;
    const alunosPts = school.alunos && school.alunos > 0 ? 50 * (school.alunos / maxAlunos) : 0;
    school.score = Math.round((ticketPts + alunosPts) * 10) / 10;
    school.ticketAlto = school.ticket != null && school.ticket >= 300;
  }
}

async function main() {
  console.log("Baixando planilha…");
  const csvText = await (await get(SHEET_CSV)).text();
  const schools = rowsToSchools(parseCsv(csvText));
  console.log(`${schools.length} escolas com nome`);

  const cache = await loadCache();
  let missing = 0;
  for (let i = 0; i < schools.length; i++) {
    const school = schools[i];
    const result = await geocodeOne(school, cache);
    if (result) {
      school.lat = result.lat;
      school.lng = result.lng;
      school.geoSource = result.source;
    } else {
      school.lat = null;
      school.lng = null;
      school.geoSource = null;
      missing += 1;
    }
    delete school.cepDigits;
    delete school.geoQuery;
    if ((i + 1) % 25 === 0 || i + 1 === schools.length) {
      await saveCache(cache);
      console.log(
        `Geocodificado ${i + 1}/${schools.length} (${i + 1 - missing} com coordenada, ${missing} sem)`
      );
    }
  }

  await saveCache(cache);
  scoreSchools(schools);
  await mkdir(PUBLIC, { recursive: true });
  const payload = {
    updatedAt: new Date().toISOString(),
    ticketMinimo: 300,
    total: schools.length,
    comCoordenada: schools.filter((s) => s.lat != null).length,
    semCoordenada: schools.filter((s) => s.lat == null).length,
    escolas: schools,
  };
  const out = path.join(PUBLIC, "escolas.json");
  await writeFile(out, JSON.stringify(payload), "utf8");
  console.log(
    `Gravado ${out} — ${payload.comCoordenada} no mapa, ${payload.semCoordenada} sem coordenada`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
