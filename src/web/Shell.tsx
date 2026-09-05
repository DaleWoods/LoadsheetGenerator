/**
 * Who is signed in, and what they see.
 *
 * The app is behind a login (§4), so nothing is rendered until the session is
 * known: showing the generator and then snatching it away would be worse than a
 * moment's blank page. A user still holding a password somebody else chose gets
 * the change form and nothing else.
 */

import { useEffect, useState } from 'react';
import { App } from './App.js';
import { AccountsPanel } from './AccountsPanel.js';
import { LoginPage } from './LoginPage.js';
import { fetchSession, signOut, type SessionUser } from './api.js';

type View = 'generator' | 'accounts';

export function Shell(): JSX.Element {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [known, setKnown] = useState(false);
  const [view, setView] = useState<View>('generator');

  useEffect(() => {
    fetchSession()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setKnown(true));
  }, []);

  if (!known) return <div className="app" />;
  if (!user || user.mustChange) return <LoginPage user={user} onSignedIn={setUser} />;

  return (
    <>
      <div className="topbar">
        <nav>
          <button
            type="button"
            className={view === 'generator' ? 'tab current' : 'tab'}
            onClick={() => setView('generator')}
          >
            Load sheets
          </button>
          {user.role === 'admin' ? (
            <button
              type="button"
              className={view === 'accounts' ? 'tab current' : 'tab'}
              onClick={() => setView('accounts')}
            >
              Accounts
            </button>
          ) : null}
        </nav>
        <span className="who">
          {user.displayName}
          <button
            type="button"
            className="link"
            onClick={() => {
              void signOut().then(() => setUser(null));
            }}
          >
            sign out
          </button>
        </span>
      </div>
      {view === 'generator' ? (
        <App />
      ) : (
        <div className="app">
          <AccountsPanel />
        </div>
      )}
    </>
  );
}
