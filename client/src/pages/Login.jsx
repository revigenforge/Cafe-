import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import { ErrorBox, Loading, initials } from '../components/ui.jsx';

/**
 * A user picker, not authentication. It exists so the team workflow can
 * be tested from every role. The API is equally unauthenticated for now
 * — this screen is honest about that rather than pretending otherwise.
 */
export default function Login() {
  const { signIn } = useApp();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    setError(null);
    try {
      setUsers(await api.sessionUsers());
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="login">
      <div className="login__card">
        <h1>Sales CRM</h1>
        <p>Choose who you are working as.</p>

        {error && <ErrorBox error={error} onRetry={load} />}
        {!users && !error && <Loading rows={4} />}

        {users?.length === 0 && (
          <div className="warnbox">
            No users yet. Run <code>npm run db:seed</code> in <code>/server</code> to load the demo team.
          </div>
        )}

        {users?.map((u) => (
          <button key={u.id} className="login__user" onClick={() => signIn(u.id)}>
            <span className="whoami__av" style={{ background: u.role === 'ADMIN' ? '#1f6feb' : u.role === 'MANAGER' ? '#5b3bb0' : '#10685a' }}>
              {initials(u.name)}
            </span>
            <span style={{ minWidth: 0 }}>
              <strong style={{ display: 'block' }}>{u.name}</strong>
              <span className="muted small">{u.role} · {u.email}</span>
            </span>
          </button>
        ))}

        <div className="login__note">
          <strong>This is not authentication.</strong> The chosen id is sent with each request so
          roles and ownership can be tested. Add real sign-in before putting this on a network
          anyone else can reach.
        </div>
      </div>
    </div>
  );
}
