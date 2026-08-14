import { writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SHEET_CSV,
  parseCsv,
  rowsToSchools,
  scoreSchools,
} from "../src/sheet.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const CACHE_PATH = path.join(ROOT, "scripts", "geocode-cache.json");
const UA = "mapa-escolas/1.0 (heatmap de escolas prospectadas)";

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

function isCoordNaRegiao(lat, lng) {
  return lat >= -8.7 && lat <= -7.3 && lng >= -35.55 && lng <= -34.7;
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
    if (Object.prototype.hasOwnProperty.call(cache, key)) {
      const cached = cache[key];
      if (cached && isCoordNaRegiao(cached.lat, cached.lng)) return cached;
      if (cached && !isCoordNaRegiao(cached.lat, cached.lng)) {
        continue;
      }
      return cached;
    }
  }

  const query = school.geoQuery || "";
  if (!school.cepDigits && /^pernambuco,\s*brasil$/i.test(query.trim())) {
    for (const key of keys) cache[key] = null;
    return null;
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
  if (!result && school.geoQuery && !/^pernambuco,\s*brasil$/i.test(query.trim())) {
    result = await geocodeNominatim(school.geoQuery);
    await sleep(1050);
  }

  if (result && !isCoordNaRegiao(result.lat, result.lng)) {
    result = null;
  }

  for (const key of keys) cache[key] = result;
  return result;
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
