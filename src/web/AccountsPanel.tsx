/**
 * Accounts, for an administrator (§4).
 *
 * Adding somebody is the common case and is one line of form. A password set
 * here is temporary by construction - the app makes its owner replace it on
 * first use - so it is shown once, plainly, to be passed on.
 */

import { useEffect, useState } from 'react';
import { createAccount, fetchUsers, updateAccount, type Account } from './api.js';

export function AccountsPanel(): JSX.Element {
  const [users, setUsers] = useState<Account[]>([]);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function reload(): void {
    fetchUsers()
      .then(setUsers)
      .catch((err: Error) => setError(err.message));
  }
  useEffect(reload, []);

  async function add(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setNote(null);
    try {
      await createAccount({ username, displayName: displayName || undefined, password });
      setNote(`${username} can sign in with that password once, then has to choose their own.`);
      setUsername('');
      setDisplayName('');
      setPassword('');
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function change(id: string, patch: Parameters<typeof updateAccount>[1]): Promise<void> {
    setError(null);
    setNote(null);
    try {
      await updateAccount(id, patch);
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Accounts</h1>
        <p>Everybody who can use the app. A password you set here has to be replaced by its owner on first use.</p>
      </div>
      <section className="card">

      <ul className="accounts">
        {users.map((user) => (
          <li key={user.id} className={user.disabled ? 'account disabled' : 'account'}>
            <span className="chosen-name">{user.displayName}</span>
            <code>{user.username}</code>
            {user.role === 'admin' ? <span className="badge badge-key">administrator</span> : null}
            {user.mustChange ? <span className="badge badge-observed">password not set yet</span> : null}
            {user.disabled ? <span className="badge">switched off</span> : null}
            <span className="chosen-buttons">
              <button
                type="button"
                className="link"
                onClick={() => {
                  const next = window.prompt(`A new password for ${user.username}. They will have to change it.`);
                  if (next) void change(user.id, { password: next });
                }}
              >
                reset password
              </button>
              <button
                type="button"
                className="link"
                onClick={() => void change(user.id, { role: user.role === 'admin' ? 'member' : 'admin' })}
              >
                {user.role === 'admin' ? 'make a member' : 'make an administrator'}
              </button>
              <button type="button" className="link" onClick={() => void change(user.id, { disabled: !user.disabled })}>
                {user.disabled ? 'switch on' : 'switch off'}
              </button>
            </span>
          </li>
        ))}
      </ul>

      <form className="add-account" onSubmit={(event) => void add(event)}>
        <h2 className="step">Add somebody</h2>
        <label className="stacked">
          Username
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="stacked">
          Name (optional)
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label className="stacked">
          A password to give them
          <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" disabled={username.trim().length < 2 || password.length < 10}>
          Add
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}
      {note ? <p className="muted">{note}</p> : null}
      </section>
    </>
  );
}
