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
  let rowCount = 0;
  for (const t of tables) {
    const createSql = t.sql.replace(/^CREATE TABLE\s+/i, "CREATE TABLE IF NOT EXISTS ");
    stmts.push({ sql: createSql, params: [] });
    stmts.push({ sql: `DELETE FROM ${q(t.name)}`, params: [] });
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
export async function pullFromCloud(): Promise<{ tables: number; rows: number }> {
  const { url, token } = getCreds();
  if (!url || !token) throw new Error("Cloud not configured");
  const db = await getDb();
  const remoteTables = await invoke<{ name: string; sql: string }[]>("turso_query", { url, token, sql: TABLES_SQL });

  let rowCount = 0;
  for (const t of remoteTables) {
    const rows = await invoke<Record<string, any>[]>("turso_query", { url, token, sql: `SELECT * FROM ${q(t.name)}` });
    // Make sure the local table exists, then replace its contents.
    await db.execute(t.sql.replace(/^CREATE TABLE\s+/i, "CREATE TABLE IF NOT EXISTS ")).catch(() => {});
    await db.execute(`DELETE FROM ${q(t.name)}`);
    for (const row of rows) {
      const cols = Object.keys(row);
      if (cols.length === 0) continue;
      await db.execute(
        `INSERT INTO ${q(t.name)} (${cols.map(q).join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
        cols.map(c => row[c])
      );
      rowCount++;
    }
  }
  localStorage.setItem("sync.lastPull", String(Date.now()));
  return { tables: remoteTables.length, rows: rowCount };
}
