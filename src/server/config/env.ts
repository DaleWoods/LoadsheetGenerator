import 'dotenv/config';

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? undefined : value.trim();
}

function flag(name: string, fallback = false): boolean {
  const value = optional(name);
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true' || value === '1';
}

const driver = (optional('DB_DRIVER') ?? 'sqlite') === 'postgres' ? 'postgres' : 'sqlite';

export const env = {
  port: Number(optional('PORT') ?? 3000),
  db: {
    driver: driver as 'postgres' | 'sqlite',
    url: optional('DATABASE_URL'),
    ssl: flag('DATABASE_SSL'),
    sqliteFile: optional('SQLITE_FILE') ?? 'data/loadsheets.db',
  },
  /**
   * Read from the environment, never from the repository. Without it the
   * natural-language mode is off and the field picker still works.
   */
  anthropicApiKey: optional('ANTHROPIC_API_KEY'),
  /** Off only for local http; a session cookie should not travel in the clear. */
  cookieSecure: flag('SESSION_COOKIE_SECURE', optional('NODE_ENV') === 'production'),
  /**
   * The first way in. A fresh database has no accounts and sign-in needs one,
   * so these create an administrator on boot - and setting them again resets
   * that password, which is the way back when the only administrator is locked
   * out.
   */
  bootstrapAdmin: {
    username: optional('BOOTSTRAP_ADMIN_USERNAME'),
    password: optional('BOOTSTRAP_ADMIN_PASSWORD'),
    displayName: optional('BOOTSTRAP_ADMIN_NAME'),
  },
};
