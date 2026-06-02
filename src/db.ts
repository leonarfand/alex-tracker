import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;
let initPromise: Promise<Database> | null = null;
let lastError: string | null = null;

export function getLastDbError() { return lastError; }

export async function getDb(): Promise<Database> {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const loaded = await Database.load("sqlite:tracker.db");
      await initSchema(loaded);
      db = loaded;
      lastError = null;
      return loaded;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastError = msg;
      console.error("[DB] init failed:", e);
      initPromise = null;
      throw e;
    }
  })();

  return initPromise;
}

async function tryExec(db: Database, sql: string) {
  try { await db.execute(sql); }
  catch (e) { /* ignore migration errors (column already exists, etc.) */ }
}

async function initSchema(db: Database) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT 'default',
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'medium',
      due_date TEXT,
      reminder_at TEXT,
      project TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS daily_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      mood TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(log_date)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#6366f1',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      type TEXT NOT NULL CHECK(type IN ('income','expense')),
      amount REAL NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      tx_date TEXT NOT NULL DEFAULT (date('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(project_id) REFERENCES projects(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '✨',
      color TEXT NOT NULL DEFAULT '#7c5af6',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS habit_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      check_date TEXT NOT NULL,
      UNIQUE(habit_id, check_date),
      FOREIGN KEY(habit_id) REFERENCES habits(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      target_date TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      color TEXT NOT NULL DEFAULT '#7c5af6',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      task_id INTEGER,
      project_name TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT ''
    )
  `);

  // ── Personal finance (life money — separate from project transactions) ──
  await db.execute(`
    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'cash',
      opening_balance REAL NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#7c5af6',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS personal_tx (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id INTEGER,
      type TEXT NOT NULL CHECK(type IN ('income','expense')),
      amount REAL NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      tx_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_wallet_id INTEGER,
      to_wallet_id INTEGER,
      amount REAL NOT NULL,
      tx_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL UNIQUE,
      monthly_limit REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'Bills',
      due_day INTEGER NOT NULL DEFAULT 1,
      wallet_id INTEGER,
      last_paid_month TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Idempotent migrations for users coming from earlier builds
  await tryExec(db, "ALTER TABLE notes ADD COLUMN color TEXT NOT NULL DEFAULT 'default'");
  await tryExec(db, "ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
  await tryExec(db, "ALTER TABLE todos ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'");
  await tryExec(db, "ALTER TABLE todos ADD COLUMN reminder_at TEXT");
  await tryExec(db, "ALTER TABLE daily_logs ADD COLUMN mood TEXT NOT NULL DEFAULT ''");
  await tryExec(db, "ALTER TABLE todos ADD COLUMN project_id INTEGER");
  await tryExec(db, "ALTER TABLE projects ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  await tryExec(db, "ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  await tryExec(db, "ALTER TABLE projects ADD COLUMN deadline TEXT");
  await tryExec(db, "ALTER TABLE notes ADD COLUMN project TEXT NOT NULL DEFAULT ''");
  await tryExec(db, "ALTER TABLE projects ADD COLUMN tracks_finance INTEGER NOT NULL DEFAULT 1");
  await tryExec(db, "ALTER TABLE todos ADD COLUMN reminder_fired INTEGER NOT NULL DEFAULT 0");
  await tryExec(db, "ALTER TABLE projects ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
  await tryExec(db, "ALTER TABLE projects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
  await tryExec(db, "ALTER TABLE todos ADD COLUMN completed_at TEXT");
}
