import express from 'express';
import cors from 'cors';
import {
  addStudent,
  cleanPhone,
  ensureSchema,
  findCourse,
  getHistory,
  getStats,
  listCourses,
  listStudents,
  removeStudentById,
  saveMessage,
} from './lib/database.js';
import { runAgent } from './lib/llm-agent.js';
import { notifyProfessor } from './lib/notify.js';

const app = express();
app.use(cors()); // l'application Windows (file://) appelle cette API
app.use(express.json());

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  });

// ---------- Droits ----------
// Professeur = numéro listé dans PROFESSOR_PHONES (ex. "261340000000,261330000000"),
// ou requête portant l'en-tête x-admin-key égal à ADMIN_API_KEY (application Windows).
const professorPhones = (process.env.PROFESSOR_PHONES || '')
  .split(',')
  .map((p) => p.replace(/\D/g, ''))
  .filter(Boolean);

function isAdmin(phone, req) {
  const key = process.env.ADMIN_API_KEY;
  if (key && req.get('x-admin-key') === key) return true;
  return professorPhones.includes(String(phone).replace(/\D/g, ''));
}

app.get('/health', (_req, res) => res.json({ ok: true }));

// ---------- API utilisée par l'interface ----------
app.get('/students', wrap(async (_req, res) => res.json(await listStudents())));
app.get('/courses', wrap(async (_req, res) => res.json(await listCourses())));

app.post(
  '/students',
  wrap(async (req, res) => {
    const { name, phone, course } = req.body || {};
    if (!name || !phone || !course) return res.status(400).json({ error: 'Nom, téléphone et cours sont requis' });
    const known = await findCourse(course);
    const { student } = await addStudent({ name, phone, course: known ? known.name : course });
    notifyProfessor({ event: 'inscription', name, phone, course: student.course });
    res.status(201).json(student);
  })
);

app.delete(
  '/students/:id',
  wrap(async (req, res) => {
    const removed = await removeStudentById(Number(req.params.id));
    if (!removed) return res.status(404).json({ error: 'Étudiant introuvable' });
    res.json({ ok: true });
  })
);

app.get('/stats', wrap(async (_req, res) => res.json(await getStats())));

// ---------- Assistant IA (appelé par n8n ou par l'interface) ----------
app.post(
  '/analyze',
  wrap(async (req, res) => {
    const { message, phone: rawPhone, name } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Le message est requis' });

    const phone = cleanPhone(rawPhone) || 'inconnu';
    const role = 'student';
    const history = await getHistory(phone);

    let reply;
    try {
      reply = await runAgent({ message, phone, name, role, history });
    } catch (err) {
      console.error('[agent]', err.message);
      reply = "Je rencontre un souci technique momentané. Réessayez dans un instant s'il vous plaît.";
    }

    await saveMessage(phone, 'user', message);
    await saveMessage(phone, 'assistant', reply);
    // Même format qu'avant : n8n et l'interface n'ont besoin que de "reply".
    res.json({ intent: 'agent', course: null, reply });
  })
);

const port = Number(process.env.PORT) || 3001;

ensureSchema()
  .then(() => app.listen(port, () => console.log(`Agent IA prêt sur le port ${port}`)))
  .catch((err) => {
    console.error('Impossible de préparer la base de données :', err.message);
    process.exit(1);
  });