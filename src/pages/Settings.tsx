import { useEffect, useState } from "react";
import { Download, Trash2, Info, Palette, Keyboard, Database, Volume2, AlertTriangle, FolderOpen, Save, Bell, Cloud, CloudUpload, CloudDownload } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { getDb } from "../db";
import { useApp } from "../App";
import { isSoundEnabled, setSoundEnabled, sounds, previewAlarm } from "../sounds";
import { todayStr } from "../time";
import { getCreds, setCreds, isConfigured, testConnection, pushToCloud, pullFromCloud, autoPushEnabled, setAutoPush, lastPush, lastPull } from "../cloudSync";

const ACCENTS = [
  { id:"violet",  hex:"#7c5af6", label:"Violet (default)" },
  { id:"blue",    hex:"#3b82f6", label:"Blue" },
  { id:"teal",    hex:"#14b8a6", label:"Teal" },
  { id:"emerald", hex:"#10b981", label:"Emerald" },
  { id:"amber",   hex:"#f59e0b", label:"Amber" },
  { id:"rose",    hex:"#f43f5e", label:"Rose" },
  { id:"pink",    hex:"#ec4899", label:"Pink" },
];

const CURRENCIES = ["$","€","£","¥","Rp","₹","A$","C$"];

export default function Settings() {
  const [accent, setAccent] = useState("violet");
  const [soundOn, setSoundOn] = useState(true);
  const [counts, setCounts] = useState({ notes:0, todos:0, transactions:0, logs:0, habits:0, projects:0 });
  const [resetModal, setResetModal] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [backupDays, setBackupDays] = useState(7);
  const [backupFolder, setBackupFolder] = useState("");
  const [backupLastAt, setBackupLastAt] = useState(0);
  const [syncUrl, setSyncUrl] = useState("");
  const [syncToken, setSyncToken] = useState("");
  const [autoPush, setAutoPushState] = useState(false);
  const [syncBusy, setSyncBusy] = useState<null | "test" | "push" | "pull">(null);
  const [syncMsg, setSyncMsg] = useState("");
  const [lastPushAt, setLastPushAt] = useState(0);
  const [lastPullAt, setLastPullAt] = useState(0);
  const { toast, currency, setCurrency, confirm } = useApp();

  useEffect(() => {
    setAccent(localStorage.getItem("settings.accent") ?? "violet");
    setSoundOn(isSoundEnabled());
    setBackupEnabled(localStorage.getItem("settings.autoBackup.enabled") === "1");
    setBackupDays(parseInt(localStorage.getItem("settings.autoBackup.days") ?? "7", 10));
    setBackupFolder(localStorage.getItem("settings.autoBackup.folder") ?? "");
    setBackupLastAt(parseInt(localStorage.getItem("settings.autoBackup.lastAt") ?? "0", 10));
    const creds = getCreds();
    setSyncUrl(creds.url);
    setSyncToken(creds.token);
    setAutoPushState(autoPushEnabled());
    setLastPushAt(lastPush());
    setLastPullAt(lastPull());
    loadCounts();
  }, []);

  async function handleSaveTest() {
    if (!syncUrl.trim() || !syncToken.trim()) { setSyncMsg("Enter URL and token"); return; }
    setSyncBusy("test"); setSyncMsg("");
    try {
      await testConnection(syncUrl, syncToken);
      setCreds(syncUrl, syncToken);
      setSyncMsg("✓ Connected & saved");
      toast("Cloud connected");
    } catch (e) {
      setSyncMsg("✗ " + String(e));
    } finally { setSyncBusy(null); }
  }

  async function handlePush() {
    setSyncBusy("push"); setSyncMsg("");
    try {
      const r = await pushToCloud();
      setLastPushAt(lastPush());
      setSyncMsg(`✓ Uploaded ${r.rows} rows`);
      toast("Pushed to cloud", `${r.rows} rows`);
    } catch (e) { setSyncMsg("✗ " + String(e)); toast("Push failed", String(e)); }
    finally { setSyncBusy(null); }
  }

  async function handlePull() {
    const ok = await confirm({
      title: "Pull from cloud?",
      message: "This replaces ALL data on this device with the cloud copy. Make sure you pushed your latest data from the other device first.",
      confirmLabel: "Replace local data",
      danger: true,
    });
    if (!ok) return;
    setSyncBusy("pull"); setSyncMsg("");
    try {
      const r = await pullFromCloud();
      setLastPullAt(lastPull());
      toast("Pulled from cloud", `${r.rows} rows — reloading…`);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) { setSyncMsg("✗ " + String(e)); toast("Pull failed", String(e)); setSyncBusy(null); }
  }

  function toggleAutoPush() {
    if (!isConfigured()) { toast("Connect to Turso first"); return; }
    const next = !autoPush;
    setAutoPushState(next);
    setAutoPush(next);
    toast(next ? "Auto-upload on" : "Auto-upload off");
  }

  async function pickBackupFolder() {
    try {
      const result = await open({ directory: true, multiple: false });
      if (typeof result === "string" && result) {
        setBackupFolder(result);
        localStorage.setItem("settings.autoBackup.folder", result);
        toast("Backup folder set", result);
      }
    } catch (e) { toast("Failed", String(e)); }
  }

  function toggleBackup() {
    const next = !backupEnabled;
    if (next && !backupFolder) {
      toast("Pick a backup folder first");
      return;
    }
    setBackupEnabled(next);
    localStorage.setItem("settings.autoBackup.enabled", next ? "1" : "0");
    toast(next ? "Auto-backup enabled" : "Auto-backup disabled");
  }

  function setDays(d: number) {
    setBackupDays(d);
    localStorage.setItem("settings.autoBackup.days", String(d));
  }

  async function loadCounts() {
    try {
      const db = await getDb();
      const [n,t,tx,l,h,p] = await Promise.all([
        db.select<{c:number}[]>("SELECT COUNT(*) as c FROM notes"),
        db.select<{c:number}[]>("SELECT COUNT(*) as c FROM todos"),
        db.select<{c:number}[]>("SELECT COUNT(*) as c FROM transactions"),
        db.select<{c:number}[]>("SELECT COUNT(*) as c FROM daily_logs"),
        db.select<{c:number}[]>("SELECT COUNT(*) as c FROM habits"),
        db.select<{c:number}[]>("SELECT COUNT(*) as c FROM projects"),
      ]);
      setCounts({
        notes: n[0]?.c ?? 0, todos: t[0]?.c ?? 0, transactions: tx[0]?.c ?? 0,
        logs: l[0]?.c ?? 0, habits: h[0]?.c ?? 0, projects: p[0]?.c ?? 0,
      });
    } catch (e) { toast("Failed to load stats", String(e)); }
  }

  function changeAccent(id: string) {
    setAccent(id);
    localStorage.setItem("settings.accent", id);
    const meta = ACCENTS.find(a => a.id === id);
    if (meta) {
      document.documentElement.style.setProperty("--accent", meta.hex);
      const lighter = meta.hex + "cc";
      document.documentElement.style.setProperty("--accent2", lighter);
      document.documentElement.style.setProperty("--accent-glow", meta.hex + "33");
    }
    toast("Accent color updated");
  }

  function changeCurrency(c: string) {
    setCurrency(c);
    toast("Currency updated", `Now using ${c} everywhere`);
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) sounds.success();
    toast(next ? "Sounds on 🔊" : "Sounds off 🔇");
  }

  async function migrateReminders() {
    try {
      const db = await getDb();
      const rows = await db.select<{id:number;title:string;reminder_at:string}[]>(
        "SELECT id, title, reminder_at FROM todos WHERE reminder_at IS NOT NULL AND done = 0"
      );
      if (rows.length === 0) { toast("Nothing to convert", "No tasks have a reminder set"); return; }
      const ok = await confirm({
        title: `Convert ${rows.length} reminder-task${rows.length === 1 ? "" : "s"}?`,
        message: "Tasks that have a reminder will become standalone Reminders and be removed from your To-Dos. Pure tasks (no reminder) are untouched.",
        confirmLabel: "Convert",
      });
      if (!ok) return;
      for (const r of rows) {
        await db.execute("INSERT INTO reminders (title, remind_at) VALUES (?,?)", [r.title, r.reminder_at]);
        await db.execute("DELETE FROM todos WHERE id=?", [r.id]);
      }
      toast(`Converted ${rows.length} into Reminders`);
      loadCounts();
    } catch (e) { toast("Failed", String(e)); }
  }

  async function exportData() {
    try {
      const db = await getDb();
      const [notes, todos, txs, logs, projects, habits, checks] = await Promise.all([
        db.select("SELECT * FROM notes"),
        db.select("SELECT * FROM todos"),
        db.select("SELECT * FROM transactions"),
        db.select("SELECT * FROM daily_logs"),
        db.select("SELECT * FROM projects"),
        db.select("SELECT * FROM habits"),
        db.select("SELECT * FROM habit_checks"),
      ]);
      const data = { exportedAt: new Date().toISOString(), notes, todos, transactions:txs, daily_logs:logs, projects, habits, habit_checks:checks };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `alex-tracker-backup-${todayStr()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Backup downloaded ✓");
    } catch (e) {
      toast("Export failed", String(e));
    }
  }

  function openReset() {
    setConfirmText("");
    setResetModal(true);
  }

  async function doReset() {
    if (confirmText !== "DELETE") return;
    try {
      const db = await getDb();
      for (const t of ["habit_checks","habits","transactions","projects","daily_logs","todos","notes"]) {
        await db.execute(`DELETE FROM ${t}`);
      }
      setResetModal(false);
      setConfirmText("");
      toast("All data erased");
      await loadCounts();
    } catch (e) {
      toast("Reset failed", String(e));
    }
  }

  return (
    <div className="page">
      <div className="page-header"><h1>Settings</h1></div>
      <div className="page-body" style={{ display:"flex", flexDirection:"column", gap:18, maxWidth:720 }}>

        {/* Appearance */}
        <Section icon={<Palette size={14} />} title="Appearance">
          <Row label="Accent color">
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {ACCENTS.map(a => (
                <div key={a.id} onClick={() => changeAccent(a.id)} title={a.label}
                  style={{
                    width:28, height:28, borderRadius:"50%", background:a.hex, cursor:"pointer",
                    border: accent===a.id ? "2.5px solid #fff" : "2.5px solid transparent",
                    boxShadow: accent===a.id ? `0 0 10px ${a.hex}aa` : "none",
                    transition: "transform 0.1s",
                  }} />
              ))}
            </div>
          </Row>
        </Section>

        {/* Region */}
        <Section icon={<Database size={14} />} title="Region">
          <Row label="Currency symbol" hint="Applies instantly across Dashboard, Finance, and Projects">
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {CURRENCIES.map(c => (
                <button key={c} className={`btn btn-sm ${currency===c ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => changeCurrency(c)} style={{ minWidth:42, justifyContent:"center", fontFamily:"monospace" }}>
                  {c}
                </button>
              ))}
            </div>
          </Row>
        </Section>

        {/* Sound */}
        <Section icon={<Volume2 size={14} />} title="Sound Effects">
          <Row label="Play sounds on actions" hint="Subtle chimes on task complete, add, etc.">
            <button className={`btn btn-sm ${soundOn ? "btn-primary" : "btn-ghost"}`} onClick={toggleSound}>
              {soundOn ? "🔊 Enabled" : "🔇 Disabled"}
            </button>
          </Row>
          <Row label="Try them">
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => sounds.hit()}>✓ Hit</button>
              <button className="btn btn-ghost btn-sm" onClick={() => sounds.success()}>🎉 Success</button>
              <button className="btn btn-ghost btn-sm" onClick={() => sounds.click()}>🖱 Click</button>
              <button className="btn btn-ghost btn-sm" onClick={() => sounds.pop()}>🗑 Pop</button>
              <button className="btn btn-ghost btn-sm" onClick={() => previewAlarm()}>⏰ Alarm</button>
            </div>
          </Row>
        </Section>

        {/* Shortcuts */}
        <Section icon={<Keyboard size={14} />} title="Keyboard Shortcuts">
          <Shortcut keys={["Ctrl","K"]} label="Open global search" />
          <Shortcut keys={["Ctrl","N"]} label="Open quick capture (in-app)" />
          <Shortcut keys={["Ctrl","Shift","Space"]} label="Quick capture (anywhere on system)" />
          <Shortcut keys={["Esc"]} label="Close any modal" />
          <Shortcut keys={["↑","↓"]} label="Navigate search results" />
          <Shortcut keys={["Enter"]} label="Open selected result" />
        </Section>

        {/* Auto-Backup */}
        <Section icon={<Save size={14} />} title="Auto-Backup">
          <Row label="Backup folder" hint="Where the JSON backup files will be written">
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <button className="btn btn-ghost btn-sm" onClick={pickBackupFolder}>
                <FolderOpen size={12} /> {backupFolder ? "Change folder" : "Pick folder"}
              </button>
              {backupFolder && (
                <span style={{ fontSize:11.5, color:"var(--text-muted)", fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>
                  {backupFolder}
                </span>
              )}
            </div>
          </Row>
          <Row label="Backup every" hint="How often to save a new backup file">
            <div style={{ display:"flex", gap:6 }}>
              {[1, 3, 7, 14, 30].map(d => (
                <button key={d} className={`btn btn-sm ${backupDays===d ? "btn-primary" : "btn-ghost"}`} onClick={() => setDays(d)}>
                  {d} {d === 1 ? "day" : "days"}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Status">
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <button className={`btn btn-sm ${backupEnabled ? "btn-primary" : "btn-ghost"}`} onClick={toggleBackup}>
                {backupEnabled ? "🟢 Enabled" : "⚪ Disabled"}
              </button>
              {backupLastAt > 0 && (
                <span style={{ fontSize:11, color:"var(--text-muted)" }}>
                  Last backup: {new Date(backupLastAt).toLocaleString()}
                </span>
              )}
            </div>
          </Row>
        </Section>

        {/* Cloud Sync */}
        <Section icon={<Cloud size={14} />} title="Cloud Sync (Turso)">
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
            Sync your data to your own Turso database. Your app stays local-first — this uploads a
            copy to the cloud so you can pull it on another device. Credentials are stored on this
            device only.
          </div>
          <Row label="Database URL">
            <input value={syncUrl} onChange={e => setSyncUrl(e.target.value)}
              placeholder="libsql://your-db.turso.io" spellCheck={false}
              style={{ fontFamily: "monospace", fontSize: 12 }} />
          </Row>
          <Row label="Auth token" hint="Pasted here only, saved locally — never shared">
            <input type="password" value={syncToken} onChange={e => setSyncToken(e.target.value)}
              placeholder="eyJ…" spellCheck={false}
              style={{ fontFamily: "monospace", fontSize: 12 }} />
          </Row>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn btn-ghost btn-sm" disabled={syncBusy !== null} onClick={handleSaveTest}>
              {syncBusy === "test" ? "Connecting…" : "Save & test"}
            </button>
            <button className="btn btn-primary btn-sm" disabled={syncBusy !== null || !isConfigured()} onClick={handlePush}>
              <CloudUpload size={13} /> {syncBusy === "push" ? "Uploading…" : "Push to cloud"}
            </button>
            <button className="btn btn-ghost btn-sm" disabled={syncBusy !== null || !isConfigured()} onClick={handlePull}>
              <CloudDownload size={13} /> {syncBusy === "pull" ? "Downloading…" : "Pull from cloud"}
            </button>
            {syncMsg && <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{syncMsg}</span>}
          </div>
          <Row label="Auto-upload" hint="Automatically push to the cloud every few minutes while the app is open">
            <button className={`btn btn-sm ${autoPush ? "btn-primary" : "btn-ghost"}`} onClick={toggleAutoPush}>
              {autoPush ? "🟢 On" : "⚪ Off"}
            </button>
          </Row>
          {(lastPushAt > 0 || lastPullAt > 0) && (
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
              {lastPushAt > 0 && <>Last push: {new Date(lastPushAt).toLocaleString()}</>}
              {lastPushAt > 0 && lastPullAt > 0 && " · "}
              {lastPullAt > 0 && <>Last pull: {new Date(lastPullAt).toLocaleString()}</>}
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--amber)" }}>
            ⚠️ "Pull" replaces this device's data with the cloud copy. Push from the device with your
            latest data first.
          </div>
        </Section>

        {/* Data */}
        <Section icon={<Database size={14} />} title="Your Data">
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:14 }}>
            {Object.entries(counts).map(([k, v]) => (
              <div key={k} style={{ padding:"10px 12px", background:"var(--surface2)", borderRadius:8 }}>
                <div style={{ fontSize:18, fontWeight:800 }}>{v}</div>
                <div style={{ fontSize:11, color:"var(--text-muted)", textTransform:"capitalize" }}>{k}</div>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <button className="btn btn-primary btn-sm" onClick={exportData}>
              <Download size={13} /> Export backup (JSON)
            </button>
            <button className="btn btn-ghost btn-sm" onClick={migrateReminders}>
              <Bell size={13} /> Convert reminder-tasks → Reminders
            </button>
            <button className="btn btn-danger btn-sm" onClick={openReset}>
              <Trash2 size={13} /> Erase all data
            </button>
          </div>
        </Section>

        {/* About */}
        <Section icon={<Info size={14} />} title="About">
          <div style={{ fontSize:12.5, color:"var(--text-muted)", lineHeight:1.7 }}>
            <div><strong style={{ color:"var(--text)" }}>Alex Tracker</strong> v0.1.0</div>
            <div>All data is stored locally on this device only.</div>
            <div style={{ marginTop:6, fontSize:11, color:"var(--text-dim)" }}>
              Built with Tauri + React + SQLite
            </div>
          </div>
        </Section>

      </div>

      {/* Erase-all confirmation */}
      {resetModal && (
        <div className="modal-backdrop" onClick={() => setResetModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{
                width:42, height:42, borderRadius:"50%",
                background:"#450a0a", color:"var(--red)",
                display:"flex", alignItems:"center", justifyContent:"center",
                flexShrink:0,
              }}>
                <AlertTriangle size={22} />
              </div>
              <div>
                <h2 style={{ fontSize:16, color:"var(--red)" }}>Erase all data?</h2>
                <div style={{ fontSize:12, color:"var(--text-muted)", marginTop:2 }}>
                  This action cannot be undone.
                </div>
              </div>
            </div>

            <div style={{ background:"#2d0a0a33", border:"1px solid #450a0a", borderRadius:8, padding:"12px 14px", fontSize:12.5, color:"var(--text-muted)", lineHeight:1.6 }}>
              This permanently deletes every <strong style={{ color:"var(--text)" }}>note</strong>, <strong style={{ color:"var(--text)" }}>task</strong>, <strong style={{ color:"var(--text)" }}>transaction</strong>, <strong style={{ color:"var(--text)" }}>habit</strong>, <strong style={{ color:"var(--text)" }}>project</strong>, and <strong style={{ color:"var(--text)" }}>log</strong> on this device.
              <div style={{ marginTop:8, color:"var(--amber)", fontSize:11.5 }}>
                💡 Tip: Export a backup first if you want a copy.
              </div>
            </div>

            <div className="form-row">
              <label style={{ color:"var(--text)" }}>Type <strong style={{ color:"var(--red)", fontFamily:"monospace" }}>DELETE</strong> to confirm</label>
              <input
                autoFocus
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="DELETE"
                onKeyDown={e => e.key === "Enter" && confirmText === "DELETE" && doReset()}
                style={{ fontFamily:"monospace", fontWeight:600 }}
              />
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setResetModal(false)}>Cancel</button>
              <button
                className="btn btn-danger"
                disabled={confirmText !== "DELETE"}
                onClick={doReset}
                style={{ opacity: confirmText === "DELETE" ? 1 : 0.4, cursor: confirmText === "DELETE" ? "pointer" : "not-allowed" }}
              >
                <Trash2 size={13} /> Erase everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, fontWeight:700, fontSize:13 }}>
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      <div>
        <div style={{ fontSize:12, fontWeight:600 }}>{label}</div>
        {hint && <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 0" }}>
      <span style={{ fontSize:12.5 }}>{label}</span>
      <div style={{ display:"flex", gap:4 }}>
        {keys.map(k => (
          <kbd key={k} style={{
            padding:"3px 8px", fontSize:10, fontWeight:700,
            background:"var(--surface2)", border:"1px solid var(--border2)",
            borderRadius:5, color:"var(--text-muted)", fontFamily:"inherit",
          }}>{k}</kbd>
        ))}
      </div>
    </div>
  );
}
