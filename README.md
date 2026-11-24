# École IA — Application de bureau Windows

Plateforme éducative : les étudiants écrivent sur WhatsApp, un Agent IA local (Ollama) comprend la demande, met à jour PostgreSQL et prévient le professeur par email. Le professeur gère tout depuis une **application Windows installable** (Electron + React).

## Architecture

```
Étudiant (WhatsApp)
      │
      ▼
Evolution API (whatsapp-bot) ──webhook──▶ n8n ──POST /analyze──▶ Agent IA (ia-agent)
                                           ▲                       │      │
                                           │ email (Gmail)         │      └─▶ Ollama (llama3.2)
                                           └───────────────────────┤
                                                                   ▼
                                                              PostgreSQL
                                                                   ▲
                                          Application Windows (Electron + React) ──┘
```

| Dossier | Rôle |
|---|---|
| `electron/` | Coque de l'application Windows (fenêtre, installateur) |
| `student-frontend/` | Interface React (Vite) : tableau de bord, étudiants, assistant IA |
| `ia-agent/` | Agent IA (Express) : `/analyze`, `/students`, `/stats` |
| `whatsapp-bot/` | Passerelle WhatsApp (Evolution API) |
| `docker-compose.yml` | PostgreSQL, Ollama, n8n, Evolution API, Agent IA |

## Flux de données (8 étapes)

1. L'étudiant écrit « Ajoute-moi au cours Python » sur WhatsApp.
2. Evolution API reçoit le message et appelle le webhook n8n (`/webhook/whatsapp`).
3. n8n extrait numéro, nom et texte, puis appelle `POST http://ia-agent:3001/analyze`.
4. L'Agent IA demande à Ollama l'intention (inscription, désinscription, liste, aide…).
5. L'Agent exécute l'action dans PostgreSQL (INSERT / DELETE / SELECT).
6. L'Agent appelle le webhook n8n `/webhook/notify-professor` : n8n envoie l'email au professeur via Gmail.
7. n8n renvoie le champ `reply` de l'Agent à l'étudiant via Evolution API.
8. Le professeur voit l'étudiant apparaître dans l'application Windows (actualisation toutes les 10 s).

## Lancer l'interface seule (sans serveur)

L'application bascule automatiquement en **mode démo** avec des données d'exemple si l'Agent IA est injoignable.

Depuis le dossier `projet-ia-ecole` (celui qui contient `package.json`) :

```bash
npm install     # installe Electron ET les dépendances de l'interface (obligatoire avant le premier start)
npm run start   # build de l'interface + ouverture dans Electron
```

Prérequis : Node.js 20.19 ou plus récent (ou 22.12+), nécessaire pour Vite.

Mode développement avec rechargement à chaud : `npm run dev`.

## Créer l'installateur Windows (.exe)

À faire **sur une machine Windows** (ou en CI Windows) :

```bash
npm install
npm run dist
```

L'installateur NSIS est généré dans `release/` (« École IA Setup 1.0.0.exe »).

## Démarrer les services

1. Modifiez `.env` (mots de passe, email du professeur).
2. `docker compose up -d --build`
3. Téléchargez le modèle : `docker compose exec ollama ollama pull llama3.2`
4. Dans n8n (http://localhost:5678), créez deux workflows :
   - **whatsapp** : Webhook `POST /whatsapp` → HTTP Request vers `http://ia-agent:3001/analyze` (`message`, `phone`, `name`) → HTTP Request vers Evolution API pour renvoyer `reply`.
   - **notify-professor** : Webhook `POST /notify-professor` → nœud Gmail (envoi à `{{$json.body.to}}`).
5. Dans l'application Windows, renseignez l'adresse de l'Agent (`http://localhost:3001` par défaut) en bas à gauche.

## Points à vérifier

- Les variables d'environnement d'Evolution API (section `whatsapp-bot` du compose) dépendent de la version de l'image : épinglez une version et comparez avec sa documentation.
- WhatsApp : appairez le numéro via le QR code d'Evolution API (http://localhost:8080).
- L'Agent IA n'a pas d'authentification : à protéger avant toute exposition hors de votre réseau.
