// Demande à n8n d'envoyer l'email de confirmation au professeur (Gmail).
export async function notifyProfessor(payload) {
  const url = process.env.N8N_NOTIFY_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: process.env.PROFESSOR_EMAIL, ...payload }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.warn('[n8n] notification non envoyée :', err.message);
  }
}