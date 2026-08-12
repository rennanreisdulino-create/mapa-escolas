/** Acesso restrito — lista nativa no código (sem banco). */
export const ALLOWED_USERS = [
  { email: "taffarel@dulino.com.br", password: "Dulino@2026" },
  { email: "priscilaramos@dulino.com.br", password: "Dulino@2026" },
  { email: "rennanreis@dulino.com.br", password: "Dulino@2026" },
];

const SESSION_KEY = "mapa-escolas-auth";

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.email) return null;
    const allowed = ALLOWED_USERS.some((u) => u.email === normalizeEmail(data.email));
    return allowed ? data : null;
  } catch {
    return null;
  }
}

export function login(email, password) {
  const normalized = normalizeEmail(email);
  const user = ALLOWED_USERS.find((u) => u.email === normalized);
  if (!user || user.password !== String(password || "")) {
    return { ok: false, error: "E-mail ou senha inválidos." };
  }
  const session = { email: user.email, at: Date.now() };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { ok: true, session };
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
}
