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
import { HistoryPanel } from './HistoryPanel.js';
import { LoginPage } from './LoginPage.js';
import { fetchSession, signOut, type SessionUser, type SheetRequest } from './api.js';

type View = 'generator' | 'history' | 'accounts';

export function Shell(): JSX.Element {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [known, setKnown] = useState(false);
  const [view, setView] = useState<View>('generator');
  /** A request picked out of the history, on its way back into the picker. */
  const [reuse, setReuse] = useState<SheetRequest | null>(null);

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
          <button
            type="button"
            className={view === 'history' ? 'tab current' : 'tab'}
            onClick={() => setView('history')}
          >
            History
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
      {view === 'generator' ? <App reuse={reuse} /> : null}
      {view === 'history' ? (
        <div className="app">
          <HistoryPanel
            onReuse={(request) => {
              setReuse(request);
              setView('generator');
            }}
          />
        </div>
      ) : null}
      {view === 'accounts' ? (
        <div className="app">
          <AccountsPanel />
        </div>
      ) : null}
    </>
  );
}
