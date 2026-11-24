import * as db from './database.js';
import { notifyProfessor } from './notify.js';

const S = (description) => ({ type: 'string', description });
const noParams = { type: 'object', properties: {} };

// admin: true  => réservé au professeur (vérifié ICI, dans le code, jamais seulement dans le prompt)
export const TOOLS = [
  {
    admin: false,
    def: {
      name: 'list_courses',
      description: 'Liste tous les cours proposés avec description, horaires, prix et places restantes.',
      parameters: noParams,
    },
    run: async () => {
      const courses = await db.listCourses();
      return courses.map((c) => ({
        name: c.name,
        description: c.description,
        schedule: c.schedule,
        price: c.price,
        teacher: c.teacher,
        places_left: c.capacity ? Math.max(0, c.capacity - c.enrolled) : null,
      }));
    },
  },
  {
    admin: false,
    def: {
      name: 'get_course_info',
      description: "Donne les détails d'un cours précis (description, horaires, prix, enseignant, places).",
      parameters: { type: 'object', properties: { course: S('Nom du cours') }, required: ['course'] },
    },
    run: async ({ course }) => {
      const c = await db.findCourse(course);
      if (!c) return { error: 'Cours introuvable', available: (await db.listCourses()).map((x) => x.name) };
      return { ...c, places_left: c.capacity ? Math.max(0, c.capacity - c.enrolled) : null };
    },
  },
  {
    admin: false,
    def: {
      name: 'my_enrollments',
      description: "Liste les cours auxquels l'utilisateur courant est inscrit.",
      parameters: noParams,
    },
    run: async (_args, ctx) => db.studentsByPhone(ctx.phone),
  },
  {
    admin: false,
    def: {
      name: 'enroll',
      description:
        "Inscrit l'utilisateur à un cours. Le professeur peut aussi inscrire quelqu'un d'autre (student_name + student_phone).",
      parameters: {
        type: 'object',
        properties: {
          course: S('Nom du cours'),
          student_name: S('Réservé au professeur : nom de l’étudiant'),
          student_phone: S('Réservé au professeur : téléphone de l’étudiant'),
        },
        required: ['course'],
      },
    },
    run: async ({ course, student_name, student_phone }, ctx) => {
      const c = await db.findCourse(course);
      if (!c) return { error: 'Cours introuvable', available: (await db.listCourses()).map((x) => x.name) };

      let name = ctx.name;
      let phone = ctx.phone;
      if (ctx.role === 'admin' && student_phone) {
        phone = db.cleanPhone(student_phone);
        name = student_name || phone;
      }
      if (!/^\+\d{6,}$/.test(phone)) return { error: "Il faut le nom et le numéro de téléphone de l'étudiant." };
      if (c.capacity && c.enrolled >= c.capacity) return { error: 'Ce cours est complet.' };

      const { student, alreadyEnrolled } = await db.addStudent({ name, phone, course: c.name });
      if (!alreadyEnrolled) notifyProfessor({ event: 'inscription', name, phone, course: c.name });
      return { ok: true, alreadyEnrolled, student };
    },
  },
  {
    admin: false,
    def: {
      name: 'unenroll',
      description:
        "Désinscrit l'utilisateur d'un cours. Si aucun cours n'est précisé, il est retiré de TOUS ses cours : demande d'abord confirmation.",
      parameters: {
        type: 'object',
        properties: {
          course: S('Nom du cours (optionnel)'),
          student_phone: S('Réservé au professeur : téléphone de l’étudiant à désinscrire'),
        },
      },
    },
    run: async ({ course, student_phone }, ctx) => {
      const phone = ctx.role === 'admin' && student_phone ? db.cleanPhone(student_phone) : ctx.phone;
      const c = course ? await db.findCourse(course) : null;
      const removed = await db.removeStudentByPhone(phone, c ? c.name : course || null);
      return removed ? { ok: true, removed } : { error: 'Aucune inscription trouvée.' };
    },
  },

  // ---------- Outils réservés au professeur ----------
  {
    admin: false,
    def: {
      name: 'list_students',
      description: 'Liste les étudiants inscrits (tous, ou pour un cours donné).',
      parameters: { type: 'object', properties: { course: S('Nom du cours (optionnel)') } },
    },
    run: async ({ course }) => {
      let rows;
      if (course) {
        const c = await db.findCourse(course);
        rows = await db.studentsByCourse(c ? c.name : course);
      } else {
        rows = await db.listStudents();
      }
      return { total: rows.length, students: rows.slice(0, 50) };
    },
  },
  {
    admin: false,
    def: {
      name: 'search_student',
      description: 'Cherche un étudiant par nom ou par numéro de téléphone.',
      parameters: { type: 'object', properties: { query: S('Nom ou numéro') }, required: ['query'] },
    },
    run: async ({ query }) => db.searchStudents(query),
  },
  {
    admin: false,
    def: {
      name: 'get_stats',
      description: "Statistiques : nombre total d'inscrits, répartition par cours, dernières inscriptions.",
      parameters: noParams,
    },
    run: async () => db.getStats(),
  },
  {
    admin: false,
    def: {
      name: 'save_course',
      description: 'Crée un cours, ou met à jour un cours existant (seuls les champs fournis changent).',
      parameters: {
        type: 'object',
        properties: {
          name: S('Nom du cours'),
          description: S('Description'),
          schedule: S('Horaires'),
          price: { type: 'number', description: 'Prix' },
          capacity: { type: 'integer', description: 'Nombre de places' },
          teacher: S('Enseignant'),
        },
        required: ['name'],
      },
    },
    run: async (args) => db.saveCourse(args),
  },
];

export function toolDefs() {
  return TOOLS.map((t) => ({
    type: 'function',
    function: t.def
  }));
}

export async function executeTool(name, rawArgs, ctx) {
  const tool = TOOLS.find((t) => t.def.name === name);

  if (!tool) return { error: `Outil inconnu : ${name}` };

  let args = rawArgs || {};

  if (typeof args === 'string') {
    try {
      args = JSON.parse(args);
    } catch {
      return { error: 'Arguments invalides.' };
    }
  }

  return tool.run(args, ctx);
}