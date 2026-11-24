import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      phone      TEXT NOT NULL,
      course     TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (phone, course)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS courses (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      schedule    TEXT,
      price       NUMERIC,
      capacity    INT,
      teacher     TEXT
    )
  `);
  // Mémoire des conversations (une "discussion" par numéro de téléphone)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id         SERIAL PRIMARY KEY,
      phone      TEXT NOT NULL,
      role       TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS messages_phone_idx ON messages (phone, id DESC)');

  // Cours d'exemple SI la table est vide : MODIFIEZ-les avec vos vrais cours.
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM courses');
  if (rows[0].n === 0) {
    await pool.query(
      `INSERT INTO courses (name, description, schedule, price, capacity, teacher) VALUES
       ('Python', 'Initiation à la programmation avec Python', 'Lundi et mercredi 17h-19h', 50000, 20, 'À renseigner'),
       ('JavaScript', 'Bases du web et de JavaScript', 'Mardi et jeudi 17h-19h', 50000, 20, 'À renseigner'),
       ('React', 'Créer des interfaces avec React', 'Samedi 9h-12h', 60000, 15, 'À renseigner')`
    );
  }
}

// ---------- Utilitaires ----------
export function cleanPhone(raw) {
  const base = String(raw || '').split('@')[0].trim();
  const digits = base.replace(/\D/g, '');
  return digits.length >= 6 ? `+${digits}` : base; // ex. "interface-web" reste tel quel
}

// ---------- Cours ----------
const COURSE_SELECT = `
  SELECT c.*, (SELECT COUNT(*)::int FROM students s WHERE LOWER(s.course) = LOWER(c.name)) AS enrolled
  FROM courses c`;

export async function listCourses() {
  const { rows } = await pool.query(`${COURSE_SELECT} ORDER BY c.name`);
  return rows;
}

// Trouve un cours par nom exact, sinon par nom approchant.
export async function findCourse(name) {
  if (!name) return null;
  const exact = await pool.query(`${COURSE_SELECT} WHERE LOWER(c.name) = LOWER($1)`, [name.trim()]);
  if (exact.rows[0]) return exact.rows[0];
  const like = await pool.query(`${COURSE_SELECT} WHERE c.name ILIKE $1 ORDER BY c.name LIMIT 1`, [`%${name.trim()}%`]);
  return like.rows[0] || null;
}

export async function saveCourse({ name, description, schedule, price, capacity, teacher }) {
  const { rows } = await pool.query(
    `INSERT INTO courses (name, description, schedule, price, capacity, teacher)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (name) DO UPDATE SET
       description = COALESCE(EXCLUDED.description, courses.description),
       schedule    = COALESCE(EXCLUDED.schedule, courses.schedule),
       price       = COALESCE(EXCLUDED.price, courses.price),
       capacity    = COALESCE(EXCLUDED.capacity, courses.capacity),
       teacher     = COALESCE(EXCLUDED.teacher, courses.teacher)
     RETURNING *`,
    [name, description ?? null, schedule ?? null, price ?? null, capacity ?? null, teacher ?? null]
  );
  return rows[0];
}

// ---------- Étudiants ----------
export async function listStudents() {
  const { rows } = await pool.query('SELECT * FROM students ORDER BY id DESC');
  return rows;
}

export async function studentsByCourse(course) {
  const { rows } = await pool.query('SELECT * FROM students WHERE LOWER(course) = LOWER($1) ORDER BY name', [course]);
  return rows;
}

export async function studentsByPhone(phone) {
  const { rows } = await pool.query('SELECT * FROM students WHERE phone = $1 ORDER BY created_at DESC', [phone]);
  return rows;
}

export async function searchStudents(query) {
  const { rows } = await pool.query(
    'SELECT * FROM students WHERE name ILIKE $1 OR phone LIKE $1 ORDER BY name LIMIT 20',
    [`%${query}%`]
  );
  return rows;
}

// Inscrit un étudiant ; si déjà inscrit à ce cours, renvoie l'existant (alreadyEnrolled = true).
export async function addStudent({ name, phone, course }) {
  const { rows } = await pool.query(
    `INSERT INTO students (name, phone, course) VALUES ($1, $2, $3)
     ON CONFLICT (phone, course) DO NOTHING RETURNING *`,
    [name, phone, course]
  );
  if (rows[0]) return { student: rows[0], alreadyEnrolled: false };
  const existing = await pool.query('SELECT * FROM students WHERE phone = $1 AND course = $2', [phone, course]);
  return { student: existing.rows[0], alreadyEnrolled: true };
}

export async function removeStudentById(id) {
  const { rowCount } = await pool.query('DELETE FROM students WHERE id = $1', [id]);
  return rowCount > 0;
}

export async function removeStudentByPhone(phone, course) {
  const { rowCount } = course
    ? await pool.query('DELETE FROM students WHERE phone = $1 AND LOWER(course) = LOWER($2)', [phone, course])
    : await pool.query('DELETE FROM students WHERE phone = $1', [phone]);
  return rowCount;
}

export async function getStats() {
  const total = await pool.query('SELECT COUNT(*)::int AS n FROM students');
  const byCourse = await pool.query(
    'SELECT course, COUNT(*)::int AS count FROM students GROUP BY course ORDER BY count DESC'
  );
  const recent = await pool.query('SELECT * FROM students ORDER BY created_at DESC LIMIT 5');
  return { total: total.rows[0].n, byCourse: byCourse.rows, recent: recent.rows };
}

// ---------- Mémoire de conversation ----------
export async function getHistory(phone, limit = 10) {
  const { rows } = await pool.query(
    `SELECT role, content FROM messages
     WHERE phone = $1 AND created_at > now() - interval '24 hours'
     ORDER BY id DESC LIMIT $2`,
    [phone, limit]
  );
  return rows.reverse();
}

export async function saveMessage(phone, role, content) {
  await pool.query('INSERT INTO messages (phone, role, content) VALUES ($1, $2, $3)', [phone, role, content]);
}