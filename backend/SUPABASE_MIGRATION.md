# Moving Atlas's memory to Supabase

## What changed

Every memory module now talks to Supabase (Postgres) instead of a mix of
`atlas.db` (better-sqlite3) and JSON files under `src/memory/`:

| Old storage | New Supabase table |
|---|---|
| `atlas.db` → `sessions` | `sessions` |
| `atlas.db` → `conversations` | `conversations` |
| `atlas.db` → `user_profile` | `user_profile` |
| `src/memory/projectMemory.json` | `project_memory` |
| `src/memory/knowledgeLibrary.json` | `knowledge_library` |
| `src/memory/proceduralMemory.json` | `procedural_memory` |
| `src/memory/devState.json` | `dev_state` |
| `src/memory/reflections.json` | `reflections` |
| `src/memory/worldModel.json` | `world_model` (single JSONB row) |

`atlas.db` also had three tables (`memories`, `reflections`, `user_memory`)
that nothing in the code actually read or wrote — confirmed empty (0 rows
each) before migration. Those were dropped rather than carried forward; if
you were relying on them for something outside of Atlas's own code, say so
before running the migration.

The old `src/database/database.js`, `schema.sql`, and `tableEditor.sql` have
been moved to `legacy_sqlite/` for reference — nothing in `src/` imports them
anymore.

## Steps

1. **Create the schema.** Open your Supabase project → SQL Editor → New
   query, paste in `src/database/supabase_schema.sql`, and run it. This is
   idempotent (`create table if not exists`), safe to re-run.

2. **Add credentials.** Copy `.env.example` → `.env` if you haven't, then
   fill in:
   ```
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
   Get both from Project Settings → API. Use the **service_role** key, not
   `anon` — Atlas runs as a trusted backend process, not a browser client, so
   it needs to bypass Row Level Security to read/write freely. Never commit
   this key or ship it in anything client-facing.

3. **Install dependencies.**
   ```
   npm install
   ```
   This pulls in `@supabase/supabase-js` (new runtime dependency) and
   `better-sqlite3` (now a dev-only dependency, needed just to read the old
   `atlas.db` during migration).

4. **Verify the connection before migrating.**
   ```
   npm run check:supabase
   ```
   Confirms your credentials work and every table from step 1 exists and is
   reachable, so you find out about a typo'd key or a schema you forgot to
   run *before* the migration script does anything, not partway through it.

5. **Run the migration once.**
   ```
   npm run migrate:supabase
   ```
   This reads `atlas.db` + every `src/memory/*.json` file and pushes the data
   into the new Supabase tables. It logs a per-table count as it goes. It's
   safe to re-run — the tables that use natural keys (`user_profile`,
   `knowledge_library`, `world_model`) upsert, and the append-only ones
   (`conversations`, `project_memory`, `procedural_memory`, `dev_state`,
   `reflections`) will just insert duplicates if you run it twice, so don't
   run it twice unless you mean to.

6. **Spot-check in the Supabase table editor** — row counts should roughly
   match what the migration script logged.

7. **Run Atlas as normal** (`npm start`). Everything reads/writes through
   Supabase from here on.

8. Once you're confident, you can delete `atlas.db`, `legacy_sqlite/`, and
   the `src/memory/*.json` files — nothing reads them anymore. They're
   git-ignored in the meantime so they don't accidentally get committed
   alongside the new setup.

## Behavioral notes

- Everything that used to be synchronous (`sessionManager.startSession()`,
  `workingMemory.getHistory()`, etc., backed by better-sqlite3) is now
  `async` (network calls to Supabase). Every call site in `index.js` and
  `conversationEngine.js` was updated to `await` these — if you have any
  other scripts or forks that call into `src/memory/*` directly, they'll need
  the same treatment.
- `dev_state` and `procedural_memory` still do their fuzzy/case-insensitive
  matching in JS after fetching all rows, same as the JSON version did — that
  logic doesn't translate to a single SQL upsert, and both tables are small
  enough that this isn't a real cost.
- `world_model` is a single-row config table (`id = 1`), not something Atlas
  writes to at runtime — edit it directly in the Supabase table editor (or
  re-run the migration after editing `worldModel.json`) the same way you'd
  hand-edit the JSON file before.
