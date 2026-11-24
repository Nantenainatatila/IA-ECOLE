import { useEffect, useMemo, useState } from 'react';
import { addStudent, deleteStudent, fetchStudents } from '../services/api.js';

const EMPTY = { name: '', phone: '', course: '' };

export default function StudentList() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setStudents(await fetchStudents());
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      [s.name, s.phone, s.course].some((v) => String(v).toLowerCase().includes(q))
    );
  }, [students, query]);

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await addStudent(form);
      setForm(EMPTY);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(student) {
    if (!window.confirm(`Supprimer ${student.name} ?`)) return;
    try {
      await deleteStudent(student.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section>
      <h1>Étudiants` Létudiant peut s'inscrire directement dans le numero whatsapp 034 83 154 40`</h1>

      <form className="panel form-row" onSubmit={onSubmit}>
        <input
          required
          placeholder="Nom complet"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          required
          placeholder="Téléphone (+261…)"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <input
          required
          placeholder="Cours"
          value={form.course}
          onChange={(e) => setForm({ ...form, course: e.target.value })}
        />
        <button className="btn" disabled={saving}>{saving ? 'Ajout…' : 'Ajouter'}</button>
      </form>

      {error && <p className="error">{error}</p>}

      <div className="panel">
        <div className="table-head">
          <h2>{filtered.length} étudiant{filtered.length > 1 ? 's' : ''}</h2>
          <input
            className="search"
            placeholder="Rechercher…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="muted">Chargement…</p>
        ) : filtered.length === 0 ? (
          <p className="muted">Aucun étudiant trouvé.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Téléphone</th>
                <th>Cours</th>
                <th>Inscrit le</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.phone}</td>
                  <td><span className="tag">{s.course}</span></td>
                  <td>{new Date(s.created_at).toLocaleDateString('fr-FR')}</td>
                  <td className="actions">
                    <button className="btn danger small" onClick={() => onDelete(s)}>Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
