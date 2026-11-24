// A stand-in for Cloudflare D1, backed by Node's built-in SQLite, for tests and local development only.
// It implements just what the Worker uses: prepare(sql).bind(...).first() and .run().
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function localD1(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  return {
    raw: db,
    prepare(sql) {
      const stmt = db.prepare(sql);
      const bound = (args) => ({
        first: async () => stmt.get(...args) ?? null,
        run: async () => { const r = stmt.run(...args); return { success: true, meta: { changes: r.changes } }; },
      });
      return { ...bound([]), bind: (...args) => bound(args) };
    },
  };
}
