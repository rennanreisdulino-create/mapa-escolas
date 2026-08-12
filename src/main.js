import { downloadEscolaPdf, downloadIconSvg } from "./pdf.js";
import { getSession, login, logout } from "./auth.js";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const loginGate = document.querySelector("#login-gate");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const appEl = document.querySelector("#app");
const sessionEmailEl = document.querySelector("#session-email");
const logoutBtn = document.querySelector("#logout-btn");

let map;
let heatLayer;
let clusters;
let form;
let rankEl;
let statsEl;
let listCountEl;
let geoNoteEl;
let cidadeSelect;

let payload = { escolas: [] };
let escolasById = new Map();
let markersById = new Map();
let didFit = false;
let appStarted = false;

function downloadButtonHtml(escolaId) {
  return `<button type="button" class="btn-download" data-id="${escolaId}" title="Baixar PDF" aria-label="Baixar informações em PDF">${downloadIconSvg}</button>`;
}

function scoreColor(score) {
  if (score >= 70) return "#ff6b3d";
  if (score >= 40) return "#f4c15d";
  return "#3dd6c6";
}

function applyFilters(escolas) {
  const q = form.elements.q.value.trim().toLowerCase();
  const ticketAlto = form.elements.ticketAlto.checked;
  const minAlunos = Number(form.elements.minAlunos.value || 0);
  const cidade = form.elements.cidade.value;

  return escolas.filter((escola) => {
    if (ticketAlto && !escola.ticketAlto) return false;
    if (minAlunos && (escola.alunos || 0) < minAlunos) return false;
    if (cidade && escola.cidade !== cidade) return false;
    if (q) {
      const blob = `${escola.nome} ${escola.bairro} ${escola.cidade} ${escola.endereco}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

function renderStats(all, visible) {
  const comTicket = visible.filter((e) => e.ticket != null).length;
  const altas = visible.filter((e) => e.ticketAlto).length;
  statsEl.innerHTML = `
    <div class="stat"><b>${visible.length}</b><span>na lista / ${all.length} total</span></div>
    <div class="stat"><b>${altas}</b><span>ticket ≥ R$ 300</span></div>
    <div class="stat"><b>${comTicket}</b><span>com ticket preenchido</span></div>
    <div class="stat"><b>${payload.semCoordenada || 0}</b><span>sem coordenada</span></div>
  `;
}

function popupHtml(escola) {
  const ticket = escola.ticket != null ? money.format(escola.ticket) : "não informado";
  const alunos = escola.alunos != null ? escola.alunos.toLocaleString("pt-BR") : "não informado";
  const hot = escola.ticketAlto ? `<span class="badge hot">ticket alto</span>` : "";
  const grupo = escola.grupo ? `<span class="badge">${escola.grupo}</span>` : "";
  const end = [escola.endereco, escola.bairro, escola.cidade].filter(Boolean).join(" · ");
  return `
    <div class="popup">
      <div class="popup-head">
        <h3>${escola.nome}</h3>
        ${downloadButtonHtml(escola.id)}
      </div>
      <p>${hot}${grupo}</p>
      <p>${end}</p>
      <p>Nota <b>${escola.score}</b> · Ticket ${ticket} · ${alunos} alunos</p>
      ${escola.telefone ? `<p>${escola.telefone}</p>` : ""}
      ${escola.email ? `<p>${escola.email}</p>` : ""}
    </div>
  `;
}

function renderMap(escolas) {
  clusters.clearLayers();
  markersById = new Map();
  const heat = [];
  const withGeo = escolas.filter((e) => e.lat != null && e.lng != null);

  for (const escola of withGeo) {
    const intensity = Math.max(0.15, (escola.score || 0) / 100);
    heat.push([escola.lat, escola.lng, intensity]);
    const marker = L.circleMarker([escola.lat, escola.lng], {
      radius: 8,
      color: scoreColor(escola.score),
      weight: 2,
      fillOpacity: 0.85,
      fillColor: scoreColor(escola.score),
    });
    marker.bindPopup(popupHtml(escola));
    marker.escolaId = escola.id;
    clusters.addLayer(marker);
    markersById.set(escola.id, marker);
  }

  heatLayer.setLatLngs(heat);
  if (withGeo.length && !didFit) {
    const bounds = L.latLngBounds(withGeo.map((e) => [e.lat, e.lng]));
    map.fitBounds(bounds.pad(0.08));
    didFit = true;
  }
}

function renderList(escolas) {
  const ranked = [...escolas].sort((a, b) => b.score - a.score || (b.alunos || 0) - (a.alunos || 0));
  listCountEl.textContent = `${ranked.length} escolas`;
  rankEl.innerHTML = ranked
    .slice(0, 250)
    .map((escola, index) => {
      const meta = [
        escola.cidade,
        escola.ticket != null ? money.format(escola.ticket) : "s/ ticket",
        escola.alunos != null ? `${escola.alunos} alunos` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return `
        <li data-id="${escola.id}">
          <span class="pos">${index + 1}</span>
          <div class="rank-body">
            <strong>${escola.nome}</strong>
            <small>${meta}</small>
          </div>
          ${downloadButtonHtml(escola.id)}
          <span class="score">${escola.score}</span>
        </li>
      `;
    })
    .join("");
}

function refresh() {
  const visible = applyFilters(payload.escolas);
  renderStats(payload.escolas, visible);
  renderMap(visible);
  renderList(visible);
}

function fillCidades(escolas) {
  const cidades = [...new Set(escolas.map((e) => e.cidade).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
  cidadeSelect.innerHTML =
    `<option value="">Todas</option>` + cidades.map((c) => `<option value="${c}">${c}</option>`).join("");
}

function initMapApp() {
  map = L.map("map", { zoomControl: true }).setView([-8.05, -34.9], 11);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);

  heatLayer = L.heatLayer([], {
    radius: 28,
    blur: 22,
    maxZoom: 15,
    gradient: {
      0.2: "#3dd6c6",
      0.45: "#f4c15d",
      0.7: "#ff6b3d",
      1: "#ff3b3b",
    },
  }).addTo(map);

  clusters = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 48,
  });
  map.addLayer(clusters);

  form = document.querySelector("#filters");
  rankEl = document.querySelector("#rank");
  statsEl = document.querySelector("#stats");
  listCountEl = document.querySelector("#listCount");
  geoNoteEl = document.querySelector("#geoNote");
  cidadeSelect = form.elements.cidade;

  rankEl.addEventListener("click", (event) => {
    const downloadBtn = event.target.closest(".btn-download");
    if (downloadBtn) {
      event.stopPropagation();
      const escola = escolasById.get(Number(downloadBtn.dataset.id));
      if (escola) downloadEscolaPdf(escola);
      return;
    }

    const item = event.target.closest("li");
    if (!item) return;
    rankEl.querySelectorAll("li").forEach((el) => el.classList.remove("active"));
    item.classList.add("active");
    const marker = markersById.get(Number(item.dataset.id));
    if (!marker) return;
    clusters.zoomToShowLayer(marker, () => marker.openPopup());
  });

  document.addEventListener("click", (event) => {
    const downloadBtn = event.target.closest(".leaflet-popup .btn-download");
    if (!downloadBtn) return;
    event.preventDefault();
    event.stopPropagation();
    const escola = escolasById.get(Number(downloadBtn.dataset.id));
    if (escola) downloadEscolaPdf(escola);
  });

  form.addEventListener("input", refresh);
  form.addEventListener("change", refresh);
}

async function loadData() {
  const data = await fetch("/escolas.json").then((r) => {
    if (!r.ok) throw new Error("Não foi possível carregar escolas.json");
    return r.json();
  });

  payload = data;
  escolasById = new Map(payload.escolas.map((e) => [e.id, e]));
  fillCidades(payload.escolas);
  geoNoteEl.textContent = payload.semCoordenada
    ? `${payload.semCoordenada} escolas sem coordenada — confira endereço/CEP na planilha.`
    : `${payload.comCoordenada} escolas no mapa · atualizado ${payload.updatedAt || ""}`;
  refresh();
  requestAnimationFrame(() => map.invalidateSize());
}

async function enterApp(session) {
  loginGate.hidden = true;
  appEl.hidden = false;
  sessionEmailEl.textContent = session.email;

  if (!appStarted) {
    initMapApp();
    appStarted = true;
    try {
      await loadData();
    } catch (err) {
      geoNoteEl.textContent = err.message;
      console.error(err);
    }
  } else {
    requestAnimationFrame(() => map.invalidateSize());
  }
}

function showLogin() {
  appEl.hidden = true;
  loginGate.hidden = false;
  loginError.hidden = true;
  loginForm.reset();
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = loginForm.elements.email.value;
  const password = loginForm.elements.password.value;
  const result = login(email, password);
  if (!result.ok) {
    loginError.hidden = false;
    loginError.textContent = result.error;
    return;
  }
  enterApp(result.session);
});

logoutBtn.addEventListener("click", () => {
  logout();
  showLogin();
});

const existing = getSession();
if (existing) {
  enterApp(existing);
} else {
  showLogin();
}
