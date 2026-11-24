import { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard.jsx';
import StudentList from './components/StudentList.jsx';
import ChatInterface from './components/ChatInterface.jsx';
import { getApiUrl, setApiUrl, isDemo, onDemoChange } from './services/api.js';

const TABS = [
  { id: 'dashboard', label: 'Tableau de bord', icon: '▦' },
  { id: 'students', label: 'Étudiants', icon: '☰' },
  { id: 'chat', label: 'Assistant IA', icon: '✦' },
];

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [demo, setDemo] = useState(isDemo());
  const [apiUrl, setUrl] = useState(getApiUrl());
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => onDemoChange(setDemo), []);

  function saveUrl() {
    setApiUrl(apiUrl);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">É</span>
          <div>
            <strong>École IA</strong>
            <small>Gestion des inscriptions</small>
          </div>
        </div>

        <nav>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`nav-item ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="nav-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="settings">
          <label htmlFor="api-url">Adresse de l'Agent IA</label>
          <input
            id="api-url"
            value={apiUrl}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveUrl()}
            spellCheck={false}
          />
          <button className="btn small" onClick={saveUrl}>Appliquer</button>
          <div className={`status ${demo ? 'off' : 'on'}`}>
            <span className="dot" />
            {demo ? 'Mode démo (agent hors ligne)' : 'Agent IA connecté'}
          </div>
        </div>
      </aside>

      <main className="content">
        {demo && (
          <div className="banner">
            L'Agent IA est injoignable : les données affichées sont des exemples locales.
              <h1>Veuiller laiser un message au numero 034 83 154 40 pour demarrer le serveur distant</h1>
          </div>
        )}
        {tab === 'dashboard' && <Dashboard key={refreshKey} />}
        {tab === 'students' && <StudentList key={refreshKey} />}
        {tab === 'chat' && <ChatInterface key={refreshKey} />}
      </main>
    </div>
  );
}
