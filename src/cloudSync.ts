import { invoke } from "@tauri-apps/api/core";
import { getDb } from "./db";

// All user tables (read from sqlite_master so the schema mirrors exactly).
const TABLES_SQL =
  "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL";

const q = (n: string) => `"${n.replace(/"/g, '""')}"`;

export function getCreds() {
  return {
    url: localStorage.getItem("sync.url") || "",
    token: localStorage.getItem("sync.token") || "",
  };
}
export function setCreds(url: string, token: string) {
  localStorage.setItem("sync.url", url.trim());
  localStorage.setItem("sync.token", token.trim());
}
export function isConfigured() {
  const { url, token } = getCreds();
  return !!url && !!token;
}
export function autoPushEnabled() { return localStorage.getItem("sync.autoPush") === "1"; }
export function setAutoPush(on: boolean) { localStorage.setItem("sync.autoPush", on ? "1" : "0"); }
export function lastPush(): number { return parseInt(localStorage.getItem("sync.lastPush") || "0", 10); }
export function lastPull(): number { return parseInt(localStorage.getItem("sync.lastPull") || "0", 10); }

export async function testConnection(url: string, token: string) {
  await invoke("turso_test", { url: url.trim(), token: token.trim() });
}

/** Upload the whole local database to Turso (replace remote with local). */
export async function pushToCloud(): Promise<{ tables: number; rows: number }> {
  const { url, token } = getCreds();
  if (!url || !token) throw new Error("Cloud not configured");
  const db = await getDb();
  const tables = await db.select<{ name: string; sql: string }[]>(TABLES_SQL);

  const stmts: { sql: string; params: any[] }[] = [];
  // Belt-and-suspenders against foreign-key constraints (Turso enforces them):
  // (1) disable enforcement, and (2) delete children-first, insert parents-first.
  stmts.push({ sql: "PRAGMA foreign_keys=OFF", params: [] });

  // 1. Create every table (sqlite_master order = parents before children).
  for (const t of tables) {
    stmts.push({ sql: t.sql.replace(/^CREATE TABLE\s+/i, "CREATE TABLE IF NOT EXISTS "), params: [] });
  }
  // 2. Clear them children-first (reverse order).
  for (let i = tables.length - 1; i >= 0; i--) {
    stmts.push({ sql: `DELETE FROM ${q(tables[i].name)}`, params: [] });
  }
  // 3. Insert rows parents-first (forward order).
  let rowCount = 0;
  for (const t of tables) {
    const rows = await db.select<Record<string, any>[]>(`SELECT * FROM ${q(t.name)}`);
    for (const row of rows) {
      const cols = Object.keys(row);
      if (cols.length === 0) continue;
      stmts.push({
        sql: `INSERT INTO ${q(t.name)} (${cols.map(q).join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
        params: cols.map(c => row[c]),
      });
      rowCount++;
    }
  }
  await invoke<number>("turso_exec_batch", { url, token, stmts });
  localStorage.setItem("sync.lastPush", String(Date.now()));
  return { tables: tables.length, rows: rowCount };
}

/** Download the whole Turso database into local (replace local with remote). */
export async function pullFromCloud(): Promise<{ tables: number; rows: number; skipped: number; failed: string[] }> {
  const { url, token } = getCreds();
  if (!url || !token) throw new Error("Cloud not configured");
  const db = await getDb();
  const remoteTables = await invoke<{ name: string; sql: string }[]>("turso_query", { url, token, sql: TABLES_SQL });

  // Fetch everything first, then apply (so we can delete children-first / insert parents-first).
  const data: { name: string; sql: string; rows: Record<string, any>[] }[] = [];
  for (const t of remoteTables) {
    const rows = await invoke<Record<string, any>[]>("turso_query", { url, token, sql: `SELECT * FROM ${q(t.name)}` });
    data.push({ name: t.name, sql: t.sql, rows });
  }

  // Ensure local tables exist. Older installs may predate some tables (e.g. the
  // personal-finance ones), so recreate them from the remote schema first.
  for (const t of data) {
    await db.execute(t.sql.replace(/^CREATE TABLE\s+/i, "CREATE TABLE IF NOT EXISTS ")).catch(() => {});
  }
  // Clear children-first (reverse), so local FK enforcement doesn't block deletes.
  // Isolated per table — a stray failure here must never abort the whole pull.
  for (let i = data.length - 1; i >= 0; i--) {
    await db.execute(`DELETE FROM ${q(data[i].name)}`).catch(e => console.warn(`[sync] pull: clearing ${data[i].name} failed`, e));
  }
  // Insert parents-first (forward). Every table and row is isolated so a single
  // bad row can't stop the tables that come after it — notably the personal_*
  // tables, which sort last and were silently dropped on any earlier error.
  let rowCount = 0, skipped = 0;
  const failed: string[] = [];
  for (const t of data) {
    let tableFailed = false;
    for (const row of t.rows) {
      const cols = Object.keys(row);
      if (cols.length === 0) continue;
      try {
        await db.execute(
          `INSERT INTO ${q(t.name)} (${cols.map(q).join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
          cols.map(c => row[c])
        );
        rowCount++;
      } catch (e) {
        skipped++; tableFailed = true;
        console.warn(`[sync] pull: insert into ${t.name} failed`, e);
      }
    }
    if (tableFailed) failed.push(t.name);
  }
  localStorage.setItem("sync.lastPull", String(Date.now()));
  return { tables: data.length, rows: rowCount, skipped, failed };
}
