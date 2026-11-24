
import { executeTool, toolDefs } from './tools.js';
import * as db from './database.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const MAX_STEPS = 3;
const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX) || 4096;
const TOTAL_BUDGET_MS = Number(process.env.AGENT_TIMEOUT_MS) || 90_000;
const STEP_TIMEOUT_MS = 60_000;

const NEEDS_DATA =
  /(cours|prix|tarif|horaire|place|inscri|désinscri|desinscri|quitter|liste|combien|étudiant|etudiant|statist|ajoute|crée|cree|modifie)/i;

const BAD_HISTORY =
  /^(Désolé|Je rencontre un souci|Je n'ai pas compris|Je n’ai pas bien compris|Je suis un peu lent)/i;

const HELP =
  'Je peux vous aider à : voir les cours (« quels cours avez-vous ? »), connaître un prix (« prix du cours React »), ' +
  'vous inscrire (« inscris-moi au cours Python »), vous désinscrire (« je quitte JavaScript »), voir vos cours ou consulter la liste des étudiants.';

const SLOW =
  "Je suis un peu lent à répondre. Réessayez dans un instant, ou reformulez plus simplement.";

const NEEDS_WHATSAPP =
  "Cette action nécessite un numéro WhatsApp. Depuis l'application, ajoutez l'étudiant dans l'onglet « Étudiants ».";

// ---------- Utilitaires de texte ----------

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+# ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const has = (text, word) =>
  word && ` ${text} `.includes(` ${word} `);

const isPhone = (p) => /^\+\d{6,}$/.test(p || '');

function systemPrompt({ name }) {
  const today = new Date().toLocaleDateString('fr-FR', {
    dateStyle: 'full',
    timeZone: process.env.TZ || 'UTC',
  });

  return `Tu es « Assistant École IA », l'assistant d'une école.
Nous sommes le ${today}.

Interlocuteur : ${name || 'inconnu'}.

RÈGLES

1. Pour toute question sur les cours, prix, horaires, places, inscriptions, étudiants ou statistiques, utilise les outils disponibles. Ne réponds jamais de mémoire.

2. Tu peux consulter la liste de tous les étudiants, rechercher un étudiant et consulter les statistiques.

3. Tu peux également consulter les cours, inscrire et désinscrire les étudiants et gérer les informations des cours avec les outils disponibles.

4. Après le résultat d'un outil, réponds en français, en 1 à 3 phrases courtes, avec uniquement les données reçues.

5. Si une information manque, pose une seule question.

6. Ne prétends jamais avoir effectué une opération si l'outil ne l'a pas confirmée.

7. Hors sujet : explique poliment ce que tu sais faire.`;
}

// ---------- Réponses rapides sans modèle ----------

const courseLine = (c) =>
  `• ${c.name}${c.schedule ? ` — ${c.schedule}` : ''}${c.price != null ? ` — prix : ${c.price}` : ''}`;

function courseDetails(c) {
  const left = c.capacity
    ? ` Places restantes : ${Math.max(0, c.capacity - c.enrolled)}.`
    : '';

  const teacher =
    c.teacher && c.teacher !== 'À renseigner'
      ? `\nEnseignant : ${c.teacher}`
      : '';

  return `${c.name} : ${c.description || ''}
Horaires : ${c.schedule || 'à venir'}
Prix : ${c.price ?? 'à venir'}.${left}${teacher}`;
}

function courseMatches(message, courseName) {
  const name = norm(courseName);

  if (has(message, name)) return true;

  // Accepte aussi une variante singulier/pluriel.
  const singular = name.replace(/[sx]$/, '');

  return singular !== name && has(message, singular);
}

/**
 * Répond directement lorsque la demande est claire.
 * Sinon, le modèle Ollama prend le relais.
 */
async function tryRules(message, ctx) {
  const t = norm(message);

  const courses = await db.listCourses();

  const course = courses
    .filter((c) => courseMatches(t, c.name))
    .sort((a, b) => b.name.length - a.name.length)[0];

  const priceWords =
    /\b(prix|tarifs?|cout\w*|payer|paiement|horaires?|quand|heures?|places?|details?|infos?|information|description|programme|enseignant|prof)\b/.test(t);

  // 1. Consultation de la liste des étudiants.

  const listVerb =
    /\b(liste|lister|affiche|afficher|montre|montrer|donne|donner|combien|qui est inscrit|qui sont inscrits)\b/.test(t);

  const studentWord =
    /\b(etudiants?|eleves?|inscrits)\b/.test(t);

  if (listVerb && studentWord) {
    const r = await executeTool(
      'list_students',
      course ? { course: course.name } : {},
      ctx
    );

    if (r.error) return r.error;

    if (!r.total) {
      return course
        ? `Aucun étudiant inscrit au cours ${course.name}.`
        : "Aucun étudiant n'est inscrit pour le moment.";
    }

    const rows = r.students
      .slice(0, 20)
      .map((s) => `• ${s.name} — ${s.course} (${s.phone})`);

    return `${r.total} inscription(s)${course ? ` au cours ${course.name}` : ''} :
${rows.join('\n')}${r.total > 20 ? '\n…' : ''}`;
  }

  // 2. Consultation des statistiques.

  if (/\b(statistiques?|stats?|bilan)\b/.test(t)) {
    const s = await executeTool('get_stats', {}, ctx);

    if (s.error) return s.error;

    const by = (s.byCourse || [])
      .map((c) => `• ${c.course} : ${c.count}`)
      .join('\n');

    return `${s.total} inscription(s) au total.${by ? `\n${by}` : ''}`;
  }

  // 3. Actions personnelles : inscription et désinscription.

  const unenroll =
    /\b(desinscri\w*|quitt\w*|annul\w*|retir\w*|ne veux plus)\b/.test(t);

  const mine =
    /\bmes (cours|inscriptions)\b|\bquels cours (je|suis)\b|\bsuis je inscrit\b|\bje suis inscrit\b/.test(t);

  const enroll =
    /\b(inscri\w*|ajout\w*|rejoindre|participer|suivre)\b/.test(t);

  if (unenroll || mine || enroll) {
    if (!isPhone(ctx.phone)) return NEEDS_WHATSAPP;

    if (unenroll) {
      if (!course) {
        const my = await executeTool('my_enrollments', {}, ctx);

        return my.length
          ? `De quel cours souhaitez-vous vous désinscrire ?
${my.map((s) => `• ${s.course}`).join('\n')}`
          : "Vous n'êtes inscrit(e) à aucun cours.";
      }

      const r = await executeTool(
        'unenroll',
        { course: course.name },
        ctx
      );

      return r.ok
        ? `Vous avez été désinscrit(e) du cours ${course.name}.`
        : `Vous n'êtes pas inscrit(e) au cours ${course.name}.`;
    }

    if (mine) {
      const my = await executeTool('my_enrollments', {}, ctx);

      return my.length
        ? 'Vos cours :\n' + my.map((s) => `• ${s.course}`).join('\n')
        : "Vous n'êtes inscrit(e) à aucun cours.";
    }

    if (!course) {
      return `À quel cours souhaitez-vous vous inscrire ?
${courses.map(courseLine).join('\n')}`;
    }

    const r = await executeTool(
      'enroll',
      { course: course.name },
      ctx
    );

    if (r.error) return r.error;

    return r.alreadyEnrolled
      ? `Vous êtes déjà inscrit(e) au cours ${course.name}.`
      : `✅ Inscription confirmée au cours ${course.name}.`;
  }

  // 4. Informations sur les cours.

  if (course) return courseDetails(course);

  if (
    /\bcours\b/.test(t) ||
    priceWords ||
    /\b(catalogue|que proposez|propos\w*)\b/.test(t)
  ) {
    return courses.length
      ? 'Cours disponibles :\n' + courses.map(courseLine).join('\n')
      : "Aucun cours n'est disponible pour le moment.";
  }

  // 5. Salutations.

  if (/^(bonjour|bonsoir|salut|hello|coucou|aide|help|menu)\b/.test(t)) {
    return `Bonjour ! ${HELP}`;
  }

  return null;
}

// ---------- Appel au modèle Ollama ----------

async function chat(messages, role, timeoutMs) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      keep_alive: '30m',
      messages,
      tools: toolDefs(role),
      options: {
        temperature: 0,
        num_ctx: NUM_CTX,
        num_predict: 300,
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Ollama HTTP ${res.status}`);
  }

  return (await res.json()).message;
}

// Récupère les appels d'outils que llama3.2 renvoie parfois en JSON texte.

function toolCallFromText(content, role) {
  if (!content) return null;

  const cleaned = content
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();

  if (!cleaned.startsWith('{')) return null;

  try {
    const obj = JSON.parse(cleaned);

    const fn = obj.name || obj.function?.name;
    const args =
      obj.parameters || obj.arguments || obj.function?.arguments || {};

    const allowed = toolDefs(role).map(
      (t) => t.function.name
    );

    if (allowed.includes(fn)) {
      return [{ function: { name: fn, arguments: args } }];
    }
  } catch {
    // Ce n'est pas du JSON : réponse normale.
  }

  return null;
}

/**
 * @param {{message:string, phone:string, name?:string, role?:string, history:{role:string,content:string}[]}} p
 */

export async function runAgent({
  message,
  phone,
  name,
  role,
  history,
}) {
  const ctx = { phone, name, role };
  const started = Date.now();

  // 1. Essayer les règles rapides avant Ollama.

  try {
    const quick = await tryRules(message, ctx);

    if (quick) {
      console.log(`[agent] règles (${Date.now() - started} ms)`);
      return quick;
    }
  } catch (err) {
    console.error('[agent] règles :', err.message);
  }

  // 2. Modèle : historique court sans anciennes erreurs.

  const recent = (history || [])
    .filter((m) => !BAD_HISTORY.test(m.content || ''))
    .slice(-4);

  const messages = [
    { role: 'system', content: systemPrompt(ctx) },
    ...recent,
    { role: 'user', content: message },
  ];

  const deadline = started + TOTAL_BUDGET_MS;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const remaining = deadline - Date.now();

      if (remaining < 5000) break;

      let reply = await chat(
        messages,
        role,
        Math.min(remaining, STEP_TIMEOUT_MS)
      );

      if (!reply.tool_calls?.length) {
        const parsed = toolCallFromText(reply.content, role);

        if (parsed) {
          reply = {
            ...reply,
            content: '',
            tool_calls: parsed,
          };
        }
      }

      if (!reply.tool_calls?.length) {
        if (step === 0 && NEEDS_DATA.test(message)) {
          return HELP;
        }

        console.log(`[agent] modèle (${Date.now() - started} ms)`);

        return (reply.content || '').trim() || HELP;
      }

      messages.push(reply);

      for (const call of reply.tool_calls) {
        const { name: fn, arguments: args } = call.function;

        let result;

        try {
          result = await executeTool(fn, args, ctx);
        } catch (err) {
          console.error(`[outil ${fn}]`, err);
          result = { error: "Erreur interne de l'outil" };
        }

        console.log(
          `[agent] ${fn}(${JSON.stringify(args)}) ->`,
          JSON.stringify(result).slice(0, 200)
        );

        messages.push({
          role: 'tool',
          tool_name: fn,
          content: JSON.stringify(result),
        });
      }
    }
  } catch (err) {
    console.warn(
      `[agent] modèle indisponible ou trop lent (${Date.now() - started} ms) :`,
      err.message
    );
  }

  return SLOW;
}
