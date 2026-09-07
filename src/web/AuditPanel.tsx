/**
 * Who did what (§ Audit tab, administrators only).
 *
 * Every action gets its own shape rather than one row of JSON. A download and
 * a refused sign-in are not the same kind of event and reading them in the same
 * columns means reading neither - the point of a log somebody actually looks at
 * is that the unusual thing catches the eye.
 *
 * The summary is whatever was written when the event happened, so an old entry
 * reads as it did then. Only the detail is rendered fresh, and it renders
 * whatever is there: a row written before a field existed still has to show.
 */

import { useEffect, useState } from 'react';
import { fetchAudit, type AuditEvent } from './api.js';

/** What each action is called on screen, and how loud it is. */
const ACTIONS: Record<string, { label: string; tone: 'plain' | 'notable' | 'warn' }> = {
  'sheet.described': { label: 'Load sheet described', tone: 'plain' },
  'sheet.downloaded': { label: 'Load sheet downloaded', tone: 'notable' },
  'sheet.saved': { label: 'Saved to the repository', tone: 'plain' },
  'repository.removed': { label: 'Removed from the repository', tone: 'warn' },
  'query.written': { label: 'Query written', tone: 'plain' },
  'session.signedIn': { label: 'Signed in', tone: 'plain' },
  'session.signedOut': { label: 'Signed out', tone: 'plain' },
  'session.refused': { label: 'Sign-in refused', tone: 'warn' },
  'session.passwordChanged': { label: 'Password changed', tone: 'plain' },
  'account.created': { label: 'Account created', tone: 'notable' },
  'account.updated': { label: 'Account changed', tone: 'notable' },
};

function describe(action: string): { label: string; tone: 'plain' | 'notable' | 'warn' } {
  return ACTIONS[action] ?? { label: action, tone: 'plain' };
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function day(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** The part of an event that is particular to what happened. */
function Detail({ event }: { event: AuditEvent }): JSX.Element | null {
  const d = event.detail;

  if (event.action === 'sheet.downloaded') {
    const fields = list(d.fields);
    const unverified = list(d.unverified);
    return (
      <>
        <p className="audit-line">{str(d.summary)}</p>
        <div className="audit-facts">
          <span className="tag">{str(d.filename)}</span>
          <span className="tag">{str(d.itemType)}</span>
          {d.direction === 'export' ? <span className="badge">export</span> : null}
          <span className="tag">
            {Number(d.rows ?? 0)} row{Number(d.rows ?? 0) === 1 ? '' : 's'}
          </span>
          {fields.length > 0 ? <span className="tag">{fields.join(', ')}</span> : null}
        </div>
        {unverified.length > 0 ? (
          <p className="audit-line audit-flag">
            Carried {unverified.join(', ')} — unverified when it went out, and confirmed by hand.
          </p>
        ) : null}
      </>
    );
  }

  if (event.action === 'sheet.saved') {
    const learned = list(d.learned);
    return (
      <div className="audit-facts">
        <span className="tag">{str(d.filename)}</span>
        <span className="tag">{str(d.itemType)}</span>
        {d.imported === true ? <span className="badge badge-declared">imported cleanly</span> : null}
        {learned.length > 0 ? <span className="badge badge-key">{learned.join(', ')} now known</span> : null}
        {str(d.note) ? <span className="audit-note">“{str(d.note)}”</span> : null}
      </div>
    );
  }

  if (event.action === 'sheet.described') {
    const fields = list(d.fields);
    return (
      <>
        <p className="audit-line">“{str(d.asked)}”</p>
        <div className="audit-facts">
          {str(d.itemType) ? <span className="tag">{str(d.itemType)}</span> : null}
          {fields.length > 0 ? <span className="tag">{fields.join(', ')}</span> : null}
        </div>
        {str(d.clarification) ? (
          <p className="audit-line audit-flag">Asked back: {str(d.clarification)}</p>
        ) : null}
      </>
    );
  }

  if (event.action === 'query.written') {
    const findings = list(d.findings);
    return (
      <>
        <p className="audit-line">“{str(d.asked)}”</p>
        <pre className="file audit-query">{str(d.query)}</pre>
        {findings.length > 0 ? <p className="audit-line audit-flag">{findings.join(' · ')}</p> : null}
      </>
    );
  }

  if (event.action === 'session.refused') {
    return (
      <div className="audit-facts">
        <span className="tag">
          {d.reason === 'throttled'
            ? 'too many attempts'
            : d.reason === 'disabled'
              ? 'account switched off'
              : 'wrong username or password'}
        </span>
      </div>
    );
  }

  if (event.action === 'account.updated' || event.action === 'account.created') {
    return (
      <div className="audit-facts">
        <span className="tag">{str(d.account)}</span>
        {d.passwordReset === true ? <span className="badge">password reset</span> : null}
        {str(d.role) ? <span className="badge badge-key">{str(d.role)}</span> : null}
        {d.disabled === true ? <span className="badge badge-observed">switched off</span> : null}
        {d.disabled === false ? <span className="badge badge-declared">switched on</span> : null}
      </div>
    );
  }

  if (event.action === 'repository.removed') {
    return (
      <div className="audit-facts">
        <span className="tag">{str(d.name) ?? str(d.id)}</span>
      </div>
    );
  }

  return null;
}

export function AuditPanel(): JSX.Element {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [facets, setFacets] = useState<{ actions: string[]; usernames: string[] }>({ actions: [], usernames: [] });
  const [action, setAction] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAudit({ ...(action ? { action } : {}), ...(username ? { username } : {}) })
      .then((data) => {
        setEvents(data.events);
        setFacets(data.facets);
      })
      .catch((err: Error) => setError(err.message));
  }, [action, username]);

  // Grouped by day, so a run of attempts in one afternoon reads as one thing.
  const days: { day: string; events: AuditEvent[] }[] = [];
  for (const event of events) {
    const label = day(event.at);
    const last = days[days.length - 1];
    if (last && last.day === label) last.events.push(event);
    else days.push({ day: label, events: [event] });
  }

  return (
    <>
      <div className="page-head">
        <h1>Audit</h1>
        <p>
          Every action anybody has taken: what left the app, what was saved, who signed in and who could not. Written
          when it happened and never edited.
        </p>
      </div>

      <section className="card">
        <div className="chips">
          <button type="button" className={action === '' ? 'chip on' : 'chip'} onClick={() => setAction('')}>
            Everything
          </button>
          {facets.actions.map((code) => (
            <button
              key={code}
              type="button"
              className={action === code ? 'chip on' : 'chip'}
              onClick={() => setAction(action === code ? '' : code)}
            >
              {describe(code).label}
            </button>
          ))}
        </div>
        {facets.usernames.length > 1 ? (
          <div className="chips" style={{ marginTop: 8 }}>
            <button type="button" className={username === '' ? 'chip on' : 'chip'} onClick={() => setUsername('')}>
              Anybody
            </button>
            {facets.usernames.map((name) => (
              <button
                key={name}
                type="button"
                className={username === name ? 'chip on' : 'chip'}
                onClick={() => setUsername(username === name ? '' : name)}
              >
                {name}
              </button>
            ))}
          </div>
        ) : null}

        {error ? <p className="error">{error}</p> : null}
        {events.length === 0 && !error ? (
          <p className="repo-empty" style={{ marginTop: 16 }}>
            Nothing recorded yet that matches.
          </p>
        ) : null}

        {days.map(({ day: label, events: onDay }) => (
          <div key={label} className="audit-day">
            <h2 className="audit-day-head">
              {label}
              <span className="repo-folder-count">{onDay.length}</span>
            </h2>
            <ul className="audit-list">
              {onDay.map((event) => {
                const { label: name, tone } = describe(event.action);
                return (
                  <li key={event.id} className={`audit-event audit-${tone}`}>
                    <span className="audit-when">{time(event.at)}</span>
                    <div className="audit-body">
                      <span className="audit-head">
                        <strong>{name}</strong>
                        <span className="muted">{event.summary}</span>
                      </span>
                      <Detail event={event} />
                      <span className="audit-who">
                        {event.username}
                        {event.ip ? ` · ${event.ip}` : ''}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </>
  );
}
