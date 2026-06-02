import { useEffect, useState, createContext, useContext, useRef } from "react";
import { LayoutDashboard, NotebookPen, CheckSquare, CalendarDays, DollarSign, Bell, Target, Folder, Settings as SettingsIcon, Search, Trophy, Zap, Wallet } from "lucide-react";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { warmupAudio, startAlarm, stopAlarm } from "./sounds";
import { todayStr, nowStamp, stampWIB, monthStrWIB } from "./time";
import { getDb } from "./db";
import Dashboard from "./pages/Dashboard";
import Notes from "./pages/Notes";
import Todos from "./pages/Todos";
import CalendarPage from "./pages/CalendarPage";
import Habits from "./pages/Habits";
import DailyLog from "./pages/DailyLog";
import Projects from "./pages/Projects";
import Goals from "./pages/Goals";
import Finance from "./pages/Finance";
import Personal from "./pages/Personal";
import Settings from "./pages/Settings";
import GlobalSearch from "./components/GlobalSearch";
import TitleBar from "./components/TitleBar";
import QuickCapture from "./components/QuickCapture";
import "./App.css";

type Page = "dashboard" | "notes" | "todos" | "calendar" | "habits" | "daily" | "projects" | "goals" | "finance" | "personal" | "settings";

interface RunningTimer {
  projectId: number;
  projectName: string;
  entryId: number;
  startedAt: number; // epoch ms
  display: string;   // formatted elapsed
}

interface ConfirmOpts {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface AppCtx {
  pendingCount: number;
  refresh: () => void;
  toast: (title: string, body?: string) => void;
  openSearch: () => void;
  openQuickCapture: () => void;
  currency: string;
  setCurrency: (c: string) => void;
  money: (n: number, decimals?: number) => string;
  runningTimer: RunningTimer | null;
  startTimer: (projectId: number, projectName: string) => Promise<void>;
  stopTimer: () => Promise<void>;
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  openProjectFinance: (projectId: number) => void;
}
export const AppContext = createContext<AppCtx>({
  pendingCount: 0, refresh: () => {}, toast: () => {}, openSearch: () => {}, openQuickCapture: () => {},
  currency: "$", setCurrency: () => {}, money: () => "",
  runningTimer: null, startTimer: async () => {}, stopTimer: async () => {},
  openProjectFinance: () => {},
  confirm: async () => false,
});
export function useApp() { return useContext(AppContext); }

interface Toast { id: number; title: string; body?: string; }
interface ConfirmState extends ConfirmOpts { resolve: (v: boolean) => void; }

const ACCENT_HEX: Record<string, string> = {
  violet:"#7c5af6", blue:"#3b82f6", teal:"#14b8a6", emerald:"#10b981",
  amber:"#f59e0b", rose:"#f43f5e", pink:"#ec4899",
};

const CURRENCY_LOCALE: Record<string, string> = {
  "$":"en-US", "Rp":"id-ID", "€":"de-DE", "£":"en-GB",
  "¥":"ja-JP", "₹":"en-IN", "A$":"en-AU", "C$":"en-CA",
};

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [pendingCount, setPendingCount] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [currency, setCurrencyState] = useState<string>(() => localStorage.getItem("settings.currency") ?? "$");
  const [runningTimer, setRunningTimer] = useState<RunningTimer | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [alarms, setAlarms] = useState<{ key: string; id: number; kind: "todo" | "reminder"; title: string }[]>([]);
  const [financeFocus, setFinanceFocus] = useState<number | null>(null);
  const toastIdRef = useRef(0);

  function openProjectFinance(projectId: number) {
    setFinanceFocus(projectId);
    setPage("finance");
  }

  function confirm(opts: ConfirmOpts): Promise<boolean> {
    return new Promise((resolve) => setConfirmState({ ...opts, resolve }));
  }
  function resolveConfirm(v: boolean) {
    confirmState?.resolve(v);
    setConfirmState(null);
  }

  function setCurrency(c: string) {
    setCurrencyState(c);
    localStorage.setItem("settings.currency", c);
  }

  function money(n: number, decimals = 2) {
    const locale = CURRENCY_LOCALE[currency] || "en-US";
    const formatted = n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return currency + formatted;
  }

  // Apply saved accent on startup
  useEffect(() => {
    const accent = localStorage.getItem("settings.accent") ?? "violet";
    const hex = ACCENT_HEX[accent] ?? ACCENT_HEX.violet;
    document.documentElement.style.setProperty("--accent", hex);
    document.documentElement.style.setProperty("--accent2", hex + "cc");
    document.documentElement.style.setProperty("--accent-glow", hex + "33");
  }, []);

  // Warm up the audio engine on the first user interaction so sounds play
  // reliably from the very first click (browsers start audio suspended).
  useEffect(() => {
    const warm = () => warmupAudio();
    window.addEventListener("pointerdown", warm, { once: true });
    window.addEventListener("keydown", warm, { once: true });
    return () => {
      window.removeEventListener("pointerdown", warm);
      window.removeEventListener("keydown", warm);
    };
  }, []);

  // ── Make it feel native: kill browser-isms ──
  useEffect(() => {
    // Disable right-click context menu (the browser one)
    const onContext = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      // Allow context menu inside text inputs/textareas so paste/cut/copy still work
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      e.preventDefault();
    };
    window.addEventListener("contextmenu", onContext);

    // Block browser shortcuts that don't belong in a desktop app
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // F5, Ctrl+R, Ctrl+Shift+R — reload
      if (k === "f5" || ((e.ctrlKey || e.metaKey) && k === "r")) { e.preventDefault(); return; }
      // Ctrl+P — print dialog
      if ((e.ctrlKey || e.metaKey) && k === "p") { e.preventDefault(); return; }
      // Ctrl+J — downloads
      if ((e.ctrlKey || e.metaKey) && k === "j") { e.preventDefault(); return; }
      // Ctrl+U — view source
      if ((e.ctrlKey || e.metaKey) && k === "u") { e.preventDefault(); return; }
      // Ctrl+F — browser find (we have global search via Ctrl+K)
      if ((e.ctrlKey || e.metaKey) && k === "f" && !e.shiftKey) {
        const t = e.target as HTMLElement;
        if (t.tagName !== "INPUT" && t.tagName !== "TEXTAREA") { e.preventDefault(); setSearchOpen(true); return; }
      }
    };
    window.addEventListener("keydown", onKey);

    // Block native drag of images (the "drag image to other window" gesture)
    const onDragStart = (e: DragEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "IMG") e.preventDefault();
    };
    window.addEventListener("dragstart", onDragStart);

    return () => {
      window.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("dragstart", onDragStart);
    };
  }, []);

  useEffect(() => {
    (async () => { await migrateLegacyReminders(); refreshPending(); })();
    initNotifications();
    restoreTimer();
    registerGlobalHotkey();
    maybeAutoBackup();
    return () => { unregisterAll().catch(() => {}); };
  }, []);

  // One-time cleanup: tasks created before reminders were split out still live in
  // the todos table with a reminder_at. Move them into the reminders table so they
  // stop cluttering To-Dos. Runs once (guarded by a flag).
  async function migrateLegacyReminders() {
    try {
      if (localStorage.getItem("migrated.reminders.v1") === "1") return;
      const db = await getDb();
      const rows = await db.select<{ id:number; title:string; reminder_at:string }[]>(
        "SELECT id, title, reminder_at FROM todos WHERE reminder_at IS NOT NULL AND done = 0"
      );
      const now = nowStamp();
      for (const r of rows) {
        const fired = r.reminder_at <= now ? 1 : 0; // don't re-alarm past reminders
        await db.execute("INSERT INTO reminders (title, remind_at, fired) VALUES (?,?,?)", [r.title, r.reminder_at, fired]);
        await db.execute("DELETE FROM todos WHERE id = ?", [r.id]);
      }
      localStorage.setItem("migrated.reminders.v1", "1");
      if (rows.length > 0) toast(`Moved ${rows.length} reminder${rows.length > 1 ? "s" : ""} out of To-Dos`);
    } catch {}
  }

  // ── Scheduled reminders → alarm ──
  // reminder_at is stored as a LOCAL-naive timestamp ("YYYY-MM-DDTHH:MM[:SS]"),
  // so we must compare against a local-naive "now", NOT toISOString() (UTC).
  useEffect(() => {
    const check = async () => {
      try {
        const db = await getDb();
        const now = nowStamp();
        // Two sources: standalone reminders + tasks that carry a reminder.
        const dueReminders = await db.select<{id:number;title:string}[]>(
          "SELECT id, title FROM reminders WHERE remind_at <= ? AND fired = 0", [now]
        );
        const dueTasks = await db.select<{id:number;title:string}[]>(
          "SELECT id, title FROM todos WHERE reminder_at IS NOT NULL AND reminder_at <= ? AND COALESCE(reminder_fired,0) = 0 AND done = 0",
          [now]
        );
        if (dueReminders.length === 0 && dueTasks.length === 0) return;

        const items: { key: string; id: number; kind: "todo" | "reminder"; title: string }[] = [];
        for (const r of dueReminders) {
          await db.execute("UPDATE reminders SET fired = 1 WHERE id = ?", [r.id]);
          sendNotification({ title: "⏰ Reminder", body: r.title });
          items.push({ key: `reminder-${r.id}`, id: r.id, kind: "reminder", title: r.title });
        }
        for (const t of dueTasks) {
          await db.execute("UPDATE todos SET reminder_fired = 1 WHERE id = ?", [t.id]);
          sendNotification({ title: "⏰ Task reminder", body: t.title });
          items.push({ key: `todo-${t.id}`, id: t.id, kind: "todo", title: t.title });
        }
        // Bring the window forward so the alarm is seen even if minimized/in tray.
        try {
          const w = getCurrentWindow();
          await w.show(); await w.unminimize(); await w.setFocus();
        } catch {}
        startAlarm();
        setAlarms(prev => [...prev, ...items]);
      } catch {}
    };
    // Once-a-day notification for recurring bills due/overdue this month.
    const checkBills = async () => {
      try {
        const day = parseInt(todayStr().slice(8, 10), 10);
        const notifiedKey = "bills.notifiedOn";
        if (localStorage.getItem(notifiedKey) === todayStr()) return;
        const db = await getDb();
        const dueBills = await db.select<{name:string;amount:number}[]>(
          "SELECT name, amount FROM bills WHERE active=1 AND due_day <= ? AND last_paid_month != ?",
          [day, monthStrWIB()]
        );
        if (dueBills.length > 0) {
          sendNotification({
            title: `${dueBills.length} bill${dueBills.length > 1 ? "s" : ""} due`,
            body: dueBills.map(b => `• ${b.name}`).join("\n"),
          });
        }
        localStorage.setItem(notifiedKey, todayStr());
      } catch {}
    };
    check();
    checkBills();
    const id = setInterval(check, 15_000); // tight enough to feel "on time"
    return () => clearInterval(id);
  }, []);

  async function snoozeAlarm(item: { key: string; id: number; kind: "todo" | "reminder" }) {
    try {
      const db = await getDb();
      const next = stampWIB(new Date(Date.now() + 10 * 60_000));
      if (item.kind === "reminder") {
        await db.execute("UPDATE reminders SET remind_at=?, fired=0 WHERE id=?", [next, item.id]);
      } else {
        await db.execute("UPDATE todos SET reminder_at=?, reminder_fired=0 WHERE id=?", [next, item.id]);
      }
      toast("Snoozed 10 minutes");
    } catch {}
    dismissAlarm(item.key);
  }

  function dismissAlarm(key: string) {
    setAlarms(prev => {
      const next = prev.filter(a => a.key !== key);
      if (next.length === 0) stopAlarm();
      return next;
    });
  }

  function dismissAllAlarms() {
    stopAlarm();
    setAlarms([]);
  }

  // ── True OS global hotkey: Ctrl+Shift+Space → bring app forward + open quick capture ──
  async function registerGlobalHotkey() {
    try {
      await register("CommandOrControl+Shift+Space", async (e) => {
        if (e.state === "Pressed") {
          try {
            const w = getCurrentWindow();
            await w.show();
            await w.unminimize();
            await w.setFocus();
          } catch {}
          setQuickCaptureOpen(true);
        }
      });
    } catch (e) {
      // Shortcut might already be registered system-wide — fail silently
      console.warn("Global shortcut register failed:", e);
    }
  }

  // ── Auto-backup ──
  async function maybeAutoBackup() {
    try {
      if (localStorage.getItem("settings.autoBackup.enabled") !== "1") return;
      const intervalDays = parseInt(localStorage.getItem("settings.autoBackup.days") ?? "7", 10) || 7;
      const folder = localStorage.getItem("settings.autoBackup.folder");
      if (!folder) return;
      const lastAt = parseInt(localStorage.getItem("settings.autoBackup.lastAt") ?? "0", 10);
      const dueAt = lastAt + intervalDays * 86400_000;
      if (Date.now() < dueAt) return;

      const db = await getDb();
      const [notes, todos, txs, logs, projects, habits, checks, goals, entries] = await Promise.all([
        db.select("SELECT * FROM notes"),
        db.select("SELECT * FROM todos"),
        db.select("SELECT * FROM transactions"),
        db.select("SELECT * FROM daily_logs"),
        db.select("SELECT * FROM projects"),
        db.select("SELECT * FROM habits"),
        db.select("SELECT * FROM habit_checks"),
        db.select("SELECT * FROM goals"),
        db.select("SELECT * FROM time_entries"),
      ]);
      const data = { exportedAt: new Date().toISOString(), notes, todos, transactions: txs, daily_logs: logs, projects, habits, habit_checks: checks, goals, time_entries: entries };
      const folderExists = await exists(folder).catch(() => false);
      if (!folderExists) await mkdir(folder, { recursive: true }).catch(() => {});
      const filename = `alex-tracker-backup-${todayStr()}.json`;
      const path = `${folder.replace(/[\\/]$/, "")}/${filename}`;
      await writeTextFile(path, JSON.stringify(data, null, 2));
      localStorage.setItem("settings.autoBackup.lastAt", String(Date.now()));
      toast("Auto-backup saved", filename);
    } catch (e) {
      console.warn("Auto-backup failed:", e);
    }
  }

  // Live tick for running timer
  useEffect(() => {
    if (!runningTimer) return;
    const interval = setInterval(() => {
      setRunningTimer(t => t ? { ...t, display: formatElapsed(Math.floor((Date.now() - t.startedAt) / 1000)) } : null);
    }, 1000);
    return () => clearInterval(interval);
  }, [runningTimer?.entryId]);

  // Keyboard shortcuts: Ctrl+K (search), Ctrl+N or Ctrl+Shift+N (quick capture)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "k") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (mod && k === "n") {
        // Ctrl+Shift+N always opens; plain Ctrl+N opens unless typing in a field.
        const tag = (e.target as HTMLElement)?.tagName;
        const typing = tag === "INPUT" || tag === "TEXTAREA";
        if (e.shiftKey || !typing) {
          e.preventDefault();
          setQuickCaptureOpen(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function initNotifications() {
    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === "granted";
    }
    if (granted) checkDueTodos();
  }

  async function checkDueTodos() {
    try {
      const db = await getDb();
      const today = todayStr();
      const overdue = await db.select<{ title: string }[]>(
        "SELECT title FROM todos WHERE done=0 AND due_date <= ? LIMIT 5", [today]
      );
      if (overdue.length > 0) {
        sendNotification({
          title: `${overdue.length} task${overdue.length > 1 ? "s" : ""} due today`,
          body: overdue.map(t => `• ${t.title}`).join("\n"),
        });
      }
    } catch {}
  }

  async function refreshPending() {
    try {
      const db = await getDb();
      const today = todayStr();
      const rows = await db.select<{ c: number }[]>(
        "SELECT COUNT(*) as c FROM todos WHERE done=0 AND due_date <= ?", [today]
      );
      setPendingCount(rows[0]?.c ?? 0);
    } catch {}
  }

  // ── Timer ──
  async function restoreTimer() {
    try {
      const db = await getDb();
      const rows = await db.select<{id:number;project_id:number;project_name:string;started_at:string}[]>(
        "SELECT id, project_id, project_name, started_at FROM time_entries WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1"
      );
      if (rows[0]) {
        const startedAt = new Date(rows[0].started_at + (rows[0].started_at.includes("T") ? "" : "")).getTime();
        const startMs = isNaN(startedAt) ? Date.now() : startedAt;
        setRunningTimer({
          projectId: rows[0].project_id,
          projectName: rows[0].project_name,
          entryId: rows[0].id,
          startedAt: startMs,
          display: formatElapsed(Math.floor((Date.now() - startMs) / 1000)),
        });
      }
    } catch {}
  }

  async function startTimer(projectId: number, projectName: string) {
    try {
      if (runningTimer) await stopTimer();
      const db = await getDb();
      const startedAt = new Date().toISOString();
      await db.execute(
        "INSERT INTO time_entries (project_id, project_name, started_at) VALUES (?,?,?)",
        [projectId, projectName, startedAt]
      );
      const rows = await db.select<{id:number}[]>("SELECT id FROM time_entries ORDER BY id DESC LIMIT 1");
      const id = rows[0]?.id ?? 0;
      setRunningTimer({
        projectId, projectName, entryId: id,
        startedAt: Date.now(),
        display: "0:00",
      });
      toast("Timer started", projectName);
    } catch (e) { toast("Failed", String(e)); }
  }

  async function stopTimer() {
    if (!runningTimer) return;
    try {
      const db = await getDb();
      const seconds = Math.floor((Date.now() - runningTimer.startedAt) / 1000);
      await db.execute(
        "UPDATE time_entries SET ended_at=?, duration_seconds=? WHERE id=?",
        [new Date().toISOString(), seconds, runningTimer.entryId]
      );
      toast("Timer stopped", `${formatElapsed(seconds)} logged to ${runningTimer.projectName}`);
      setRunningTimer(null);
    } catch (e) { toast("Failed", String(e)); }
  }

  function toast(title: string, body?: string) {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, title, body }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }

  const nav = [
    { id: "dashboard" as Page, label: "Dashboard", icon: LayoutDashboard, section: "MAIN" },
    { id: "notes"     as Page, label: "Notes",     icon: NotebookPen },
    { id: "todos"     as Page, label: "To-Dos",    icon: CheckSquare, badge: pendingCount || undefined },
    { id: "calendar"  as Page, label: "Calendar",  icon: CalendarDays },
    { id: "habits"    as Page, label: "Habits",    icon: Target, section: "TRACK" },
    { id: "daily"     as Page, label: "Daily Log", icon: Bell },
    { id: "goals"     as Page, label: "Goals",     icon: Trophy },
    { id: "projects"  as Page, label: "Projects",  icon: Folder, section: "WORK" },
    { id: "finance"   as Page, label: "Finance",   icon: DollarSign },
    { id: "personal"  as Page, label: "Personal",  icon: Wallet, section: "MONEY" },
  ];

  return (
    <AppContext.Provider value={{
      pendingCount, refresh: refreshPending, toast,
      openSearch: () => setSearchOpen(true),
      openQuickCapture: () => setQuickCaptureOpen(true),
      currency, setCurrency, money,
      runningTimer, startTimer, stopTimer,
      confirm, openProjectFinance,
    }}>
      <TitleBar />
      <div className="app">
        <aside className="sidebar">
          <button className="search-trigger" onClick={() => setSearchOpen(true)}>
            <Search size={13} />
            <span>Search…</span>
            <kbd>⌘K</kbd>
          </button>

          <button className="search-trigger" onClick={() => setQuickCaptureOpen(true)} style={{ marginTop: -8 }}>
            <Zap size={13} />
            <span>Quick capture…</span>
            <kbd>⌘N</kbd>
          </button>

          {nav.map(({ id, label, icon: Icon, badge, section }) => (
            <div key={id}>
              {section && <div className="nav-section">{section}</div>}
              <button
                className={`nav-btn ${page === id ? "active" : ""}`}
                onClick={() => setPage(id)}
              >
                <span className="nav-icon"><Icon size={16} /></span>
                {label}
                {badge ? <span className="nav-badge">{badge}</span> : null}
              </button>
            </div>
          ))}

          <div style={{ flex: 1 }} />
          <button className={`nav-btn ${page === "settings" ? "active" : ""}`} onClick={() => setPage("settings")}>
            <span className="nav-icon"><SettingsIcon size={16} /></span>
            Settings
          </button>
        </aside>

        <main className="content">
          {page === "dashboard" && <Dashboard onNavigate={setPage} />}
          {page === "notes"     && <Notes />}
          {page === "todos"     && <Todos />}
          {page === "calendar"  && <CalendarPage onNavigate={setPage} />}
          {page === "habits"    && <Habits />}
          {page === "daily"     && <DailyLog />}
          {page === "goals"     && <Goals />}
          {page === "projects"  && <Projects onNavigate={setPage} />}
          {page === "finance"   && <Finance focusProjectId={financeFocus} onConsumeFocus={() => setFinanceFocus(null)} />}
          {page === "personal"  && <Personal />}
          {page === "settings"  && <Settings />}
        </main>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} onNavigate={setPage} />
      <QuickCapture open={quickCaptureOpen} onClose={() => setQuickCaptureOpen(false)} onToast={toast} />

      <div className="toast-area">
        {toasts.map(t => (
          <div key={t.id} className="toast">
            <span className="toast-icon">🔔</span>
            <div>
              <div className="toast-title">{t.title}</div>
              {t.body && <div className="toast-body">{t.body}</div>}
            </div>
          </div>
        ))}
      </div>

      {confirmState && (
        <div className="modal-backdrop" onMouseDown={() => resolveConfirm(false)}>
          <div className="modal" onMouseDown={e => e.stopPropagation()} style={{ width: 420 }}>
            <h2 style={{ color: confirmState.danger ? "var(--red)" : "var(--text)" }}>{confirmState.title}</h2>
            {confirmState.message && (
              <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>{confirmState.message}</p>
            )}
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => resolveConfirm(false)} autoFocus>
                {confirmState.cancelLabel ?? "Cancel"}
              </button>
              <button
                className={`btn ${confirmState.danger ? "btn-danger" : "btn-primary"}`}
                onClick={() => resolveConfirm(true)}
              >
                {confirmState.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alarm overlay — fires when a reminder is due */}
      {alarms.length > 0 && (
        <div className="modal-backdrop" style={{ zIndex: 600 }}>
          <div className="modal alarm-modal" style={{ width: 440 }}>
            <div className="alarm-bell">⏰</div>
            <h2 style={{ textAlign: "center", fontSize: 18 }}>
              {alarms.length === 1 ? "Reminder" : `${alarms.length} Reminders`}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
              {alarms.map(a => (
                <div key={a.key} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                  background: "var(--surface2)", borderRadius: 10, borderLeft: "3px solid var(--accent)",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{a.title}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {a.kind === "reminder" ? "Reminder" : "Task"}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => snoozeAlarm(a)}>Snooze 10m</button>
                  <button className="btn btn-primary btn-sm" onClick={() => dismissAlarm(a.key)}>Done</button>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { stopAlarm(); }}>Silence</button>
              <button className="btn btn-primary" onClick={dismissAllAlarms}>Dismiss all</button>
            </div>
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
}
