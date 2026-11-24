import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchStats } from '../services/api.js';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchStats()
        .then((s) => alive && (setStats(s), setError('')))
        .catch((e) => alive && setError(e.message));
    load();
    const timer = setInterval(load, 10000); // actualisation toutes les 10 s
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!stats) return <p className="muted">Chargement…</p>;

  const topCourse = [...stats.byCourse].sort((a, b) => b.count - a.count)[0];

  return (
    <section>
      <h1>Tableau de bord</h1>

      <div className="cards">
        <div className="card">
          <span className="card-label">Étudiants inscrits</span>
          <strong className="card-value">{stats.total}</strong>
        </div>
        <div className="card">
          <span className="card-label">Cours actifs</span>
          <strong className="card-value">{stats.byCourse.length}</strong>
        </div>
        <div className="card">
          <span className="card-label">Cours le plus suivi</span>
          <strong className="card-value small">{topCourse ? topCourse.course : '—'}</strong>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h2>Inscriptions par cours</h2>
          {stats.byCourse.length === 0 ? (
            <p className="muted">Aucune inscription pour le moment.</p>
          ) : (
            <div style={{ height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={stats.byCourse}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="course" stroke="#94a3b8" />
                  <YAxis allowDecimals={false} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    cursor={{ fill: 'rgba(148,163,184,0.1)' }}
                  />
                  <Bar dataKey="count" name="Étudiants" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Dernières inscriptions</h2>
          {stats.recent.length === 0 ? (
            <p className="muted">Rien à afficher.</p>
          ) : (
            <ul className="recent">
              {stats.recent.map((s) => (
                <li key={s.id}>
                  <div>
                    <strong>{s.name}</strong>
                    <small>{s.course}</small>
                  </div>
                  <span className="muted">{formatDate(s.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
