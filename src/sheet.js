export const SHEET_CSV =
  "https://docs.google.com/spreadsheets/d/1s04lCnb1XQYq9PHb_3cZ66QS8aElfV-t/export?format=csv&gid=1028988662";

export function parseCsv(text) {
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

export function clean(value) {
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

export function parseTicket(value) {
  const number = parseNumber(value);
  if (number == null || number <= 0 || number > 10000) return null;
  return number;
}

export function parseAlunos(value) {
  const number = parseNumber(value);
  if (number == null) return null;
  return Math.round(number);
}

export function digitsCep(value) {
  return clean(value).replace(/\D/g, "").slice(0, 8);
}

function col(row, ...parts) {
  for (const [key, value] of Object.entries(row)) {
    const norm = (key || "").toUpperCase();
    if (parts.every((part) => norm.includes(part.toUpperCase()))) return clean(value);
  }
  return "";
}

export function isEscolaPublica(school) {
  const status = (school.status || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const obs = (school.obs || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const nome = (school.nome || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

  if (/colegio estadual|colegio municipal|escola estadual|escola municipal|publico adulto/.test(status)) {
    return true;
  }
  if (/^publica\b|\bppublica\b|\bpublica\b|\brede publica\b/.test(obs)) {
    return true;
  }
  if (
    /\b(escola|colegio)\s+(municipal|estadual)\b/.test(nome) ||
    /\bescola tecnica estadual\b/.test(nome)
  ) {
    return true;
  }
  return false;
}

export function isLinhaLixo(school) {
  const nome = (school.nome || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  if (!nome) return true;
  if (
    /^(grupos? de divisao|grupo [a-d]|publico e privado|numerologia|total de escolas|quantas do grupo)/.test(
      nome
    )
  ) {
    return true;
  }
  const hasPlace = Boolean(school.endereco || school.bairro || school.cidade || school.cepDigits);
  if (!hasPlace) return true;
  return false;
}

export function schoolKey(school) {
  return [school.nome, school.cidade, school.endereco, school.cep]
    .map((v) =>
      String(v || "")
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .trim()
    )
    .join("|");
}

export function rowsToSchools(rows) {
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
    const school = {
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
    };
    if (isLinhaLixo(school) || isEscolaPublica(school)) continue;
    schools.push(school);
  }
  return schools;
}

export function scoreSchools(schools) {
  const alunosVals = schools.map((s) => s.alunos).filter((n) => n && n > 0);
  const maxAlunos = alunosVals.length ? Math.max(...alunosVals) : 1;
  for (const school of schools) {
    const ticketPts = school.ticket != null && school.ticket >= 300 ? 50 : 0;
    const alunosPts = school.alunos && school.alunos > 0 ? 50 * (school.alunos / maxAlunos) : 0;
    school.score = Math.round((ticketPts + alunosPts) * 10) / 10;
    school.ticketAlto = school.ticket != null && school.ticket >= 300;
  }
}

export function mergeCoords(schools, previous = []) {
  const byKey = new Map();
  const byId = new Map();
  for (const old of previous) {
    if (old.lat == null || old.lng == null) continue;
    byKey.set(schoolKey(old), old);
    byId.set(old.id, old);
  }
  for (const school of schools) {
    const match = byKey.get(schoolKey(school)) || byId.get(school.id);
    if (match) {
      school.lat = match.lat;
      school.lng = match.lng;
      school.geoSource = match.geoSource || null;
    } else {
      school.lat = school.lat ?? null;
      school.lng = school.lng ?? null;
      school.geoSource = school.geoSource ?? null;
    }
    delete school.cepDigits;
    delete school.geoQuery;
  }
  return schools;
}

export function buildPayload(schools) {
  scoreSchools(schools);
  return {
    updatedAt: new Date().toISOString(),
    ticketMinimo: 300,
    total: schools.length,
    comCoordenada: schools.filter((s) => s.lat != null).length,
    semCoordenada: schools.filter((s) => s.lat == null).length,
    escolas: schools,
  };
}

export function payloadFromCsv(csvText, previous = []) {
  const schools = mergeCoords(rowsToSchools(parseCsv(csvText)), previous);
  return buildPayload(schools);
}
