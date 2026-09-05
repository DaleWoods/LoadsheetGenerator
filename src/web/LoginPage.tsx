/**
 * Signing in, and the forced password change that follows a handed-out one.
 *
 * Deliberately plain: the same form does both, because a person given a
 * temporary password should meet the change immediately rather than finding the
 * app half-working.
 */

import { useState } from 'react';
import { changePassword, signIn, type SessionUser } from './api.js';

interface Props {
  /** Set when the user is signed in but holding a password somebody else chose. */
  user: SessionUser | null;
  onSignedIn: (user: SessionUser) => void;
}

export function LoginPage({ user, onSignedIn }: Props): JSX.Element {
  const mustChange = user?.mustChange === true;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeated, setRepeated] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      if (mustChange) {
        if (newPassword !== repeated) {
          setError('The two new passwords are not the same.');
          return;
        }
        onSignedIn(await changePassword(password, newPassword));
      } else {
        onSignedIn(await signIn(username, password));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="signin">
      <form className="panel" onSubmit={(event) => void submit(event)}>
        <h1>Load Sheet Generator</h1>
        {mustChange ? (
          <>
            <p className="muted">
              You are signed in as {user?.displayName}. This password was set by somebody else — choose your own before
              carrying on.
            </p>
            <label className="stacked">
              The password you were given
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </label>
            <label className="stacked">
              New password
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </label>
            <label className="stacked">
              New password again
              <input type="password" value={repeated} onChange={(e) => setRepeated(e.target.value)} />
            </label>
          </>
        ) : (
          <>
            <p className="muted">This is an internal tool. Sign in with the account you were given.</p>
            <label className="stacked">
              Username
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
              />
            </label>
            <label className="stacked">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
          </>
        )}

        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={working}>
          {working ? 'One moment…' : mustChange ? 'Set my password' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
