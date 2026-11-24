// Appels vers l'Agent IA (ia-agent, port 3001 par défaut).
// Si l'agent est injoignable, l'interface bascule en "mode démo" avec des données locales.

// const DEFAULT_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
//const DEFAULT_URL = 'https://operable-brook-tipped.ngrok-free.dev/agent';
const DEFAULT_URL = import.meta.env.VITE_API_URL || 'https://operable-brook-tipped.ngrok-free.dev/agent';

export function getApiUrl() {
  try {
    return localStorage.getItem('apiUrl') || DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}

export function setApiUrl(url) {
  try {
    localStorage.setItem('apiUrl', url.replace(/\/+$/, ''));
  } catch {
    /* stockage indisponible : on ignore */
  }
}

// ---------- Mode démo ----------
let demoMode = false;
const demoListeners = new Set();

export function isDemo() {
  return demoMode;
}

export function onDemoChange(fn) {
  demoListeners.add(fn);
  return () => demoListeners.delete(fn);
}

function setDemo(value) {
  if (demoMode !== value) {
    demoMode = value;
    demoListeners.forEach((fn) => fn(value));
  }
}

let demoStudents = [
  { id: 1, name: 'Aina Rakoto', phone: '+261340000001', course: 'Python', created_at: '2026-11-02T09:15:00Z' },
  { id: 2, name: 'Hery Andria', phone: '+261340000002', course: 'JavaScript', created_at: '2026-11-05T14:30:00Z' },
  { id: 3, name: 'Miora Razafy', phone: '+261340000003', course: 'Python', created_at: '2026-11-11T08:05:00Z' },
  { id: 4, name: 'Tiana Ravelo', phone: '+261340000004', course: 'React', created_at: '2026-11-17T16:45:00Z' },
];
let demoNextId = 5;

// ---------- Requêtes ----------
async function request(path, options = {}) {
  const baseUrl = getApiUrl().replace(/\/+$/, '');
  const endpoint = `${baseUrl}${path}`;

  const res = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...(options.headers || {}),
    },
  });

  const contentType = res.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const body = await res.text();

    throw new Error(
      `Réponse non JSON (${res.status}) pour ${endpoint}. ` +
      `Contenu reçu : ${body.slice(0, 150)}`
    );
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Erreur HTTP ${res.status}`);
  }

  return data;
}

// Exécute l'appel réel ; en cas d'échec réseau (agent éteint), bascule sur la démo.
async function withFallback(real, fake) {
  try {
    const result = await real();
    setDemo(false);
    return result;
  } catch (err) {
    if (err instanceof TypeError) {
      setDemo(true);
      return fake();
    }
    throw err;
  }
}

export function fetchStudents() {
  return withFallback(
    () => request('/students'),
    () => [...demoStudents].sort((a, b) => b.id - a.id)
  );
}

export function addStudent({ name, phone, course }) {
  return withFallback(
    () => request('/students', { method: 'POST', body: JSON.stringify({ name, phone, course }) }),
    () => {
      const student = { id: demoNextId++, name, phone, course, created_at: new Date().toISOString() };
      demoStudents = [...demoStudents, student];
      return student;
    }
  );
}

export function deleteStudent(id) {
  return withFallback(
    () => request(`/students/${id}`, { method: 'DELETE' }),
    () => {
      demoStudents = demoStudents.filter((s) => s.id !== id);
      return { ok: true };
    }
  );
}

export function fetchStats() {
  return withFallback(
    () => request('/stats'),
    () => {
      const counts = {};
      demoStudents.forEach((s) => {
        counts[s.course] = (counts[s.course] || 0) + 1;
      });
      return {
        total: demoStudents.length,
        byCourse: Object.entries(counts).map(([course, count]) => ({ course, count })),
        recent: [...demoStudents].sort((a, b) => b.id - a.id).slice(0, 5),
      };
    }
  );
}

export function sendChatMessage({ message, phone = 'interface-web', name = 'Professeur' }) {
  return withFallback(
    () => request('/analyze', { method: 'POST', body: JSON.stringify({ message, phone, name }) }),
    () => ({
      intent: 'demo',
      reply: "Mode démo : l'Agent IA n'est pas joignable. Veuiller laiser seulement un message au numeno 034 83 154 40 et je demarre vite le serveur",
    })
  );
}
