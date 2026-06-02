import { useEffect, useState } from "react";
import { Plus, Trash2, Edit2, Target, Calendar } from "lucide-react";
import { getDb } from "../db";
import { useApp } from "../App";
import { sounds } from "../sounds";
import Select from "../components/Select";
import DatePicker from "../components/DatePicker";

interface Goal {
  id: number;
  title: string;
  description: string;
  target_date: string | null;
  progress: number;
  status: string;
  color: string;
}

const COLORS = ["#7c5af6","#22d3a4","#06b6d4","#fbbf24","#f43f5e","#ec4899","#a78bfa","#fb923c"];
const STATUSES = [
  { id:"active",   label:"Active",   color:"var(--green)" },
  { id:"paused",   label:"Paused",   color:"var(--amber)" },
  { id:"done",     label:"Achieved", color:"var(--accent2)" },
];

const emptyForm = { id: 0, title:"", description:"", target_date:"", progress: 0, status:"active", color: COLORS[0] };

function daysUntil(date: string | null) {
  if (!date) return null;
  return Math.ceil((new Date(date+"T00:00:00").getTime() - new Date().getTime()) / 86400000);
}

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [filter, setFilter] = useState<"all"|"active"|"paused"|"done">("active");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const { toast } = useApp();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const db = await getDb();
      const rows = await db.select<Goal[]>("SELECT * FROM goals ORDER BY status='done', target_date ASC NULLS LAST, created_at DESC");
      setGoals(rows);
    } catch (e) { toast("Load failed", String(e)); }
  }

  function openNew() {
    setForm({ ...emptyForm });
    setShowModal(true);
  }

  function openEdit(g: Goal) {
    setForm({
      id: g.id, title: g.title, description: g.description,
      target_date: g.target_date ?? "", progress: g.progress,
      status: g.status, color: g.color,
    });
    setShowModal(true);
  }

  async function save() {
    if (!form.title.trim()) return;
    try {
      const db = await getDb();
      if (form.id) {
        await db.execute(
          "UPDATE goals SET title=?,description=?,target_date=?,progress=?,status=?,color=? WHERE id=?",
          [form.title, form.description, form.target_date || null, form.progress, form.status, form.color, form.id]
        );
        toast("Goal updated");
      } else {
        await db.execute(
          "INSERT INTO goals (title,description,target_date,progress,status,color) VALUES (?,?,?,?,?,?)",
          [form.title, form.description, form.target_date || null, form.progress, form.status, form.color]
        );
        sounds.success();
        toast("Goal created", form.title);
      }
      setShowModal(false);
      await load();
    } catch (e) { toast("Save failed", String(e)); }
  }

  async function del(id: number) {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM goals WHERE id=?", [id]);
      sounds.pop();
      toast("Goal deleted");
      await load();
    } catch (e) { toast("Delete failed", String(e)); }
  }

  async function updateProgress(g: Goal, delta: number) {
    try {
      const next = Math.max(0, Math.min(100, g.progress + delta));
      const db = await getDb();
      const newStatus = next === 100 ? "done" : g.status === "done" ? "active" : g.status;
      await db.execute("UPDATE goals SET progress=?, status=? WHERE id=?", [next, newStatus, g.id]);
      if (next === 100) sounds.success();
      else if (delta > 0) sounds.hit();
      else sounds.unhit();
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  const filtered = filter === "all" ? goals : goals.filter(g => g.status === filter);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Goals</h1>
        <div style={{ display: "flex", gap: 4 }}>
          {(["active","paused","done","all"] as const).map(f => (
            <button key={f} className={`btn btn-sm ${filter===f ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setFilter(f)} style={{ textTransform: "capitalize" }}>
              {f === "paused" ? "Paused" : f === "done" ? "Achieved" : f}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={openNew}>
          <Plus size={13} /> New Goal
        </button>
      </div>

      <div className="page-body">
        {filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🎯</div>
            <p>No goals yet.<br />Set quarterly or yearly objectives to focus your work.</p>
            <button className="btn btn-primary btn-sm" onClick={openNew} style={{ marginTop: 10 }}>
              <Plus size={13} /> Create your first goal
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
            {filtered.map(g => {
              const days = daysUntil(g.target_date);
              const statusMeta = STATUSES.find(s => s.id === g.status);
              const isDone = g.status === "done";
              return (
                <div key={g.id} className="card" style={{
                  display: "flex", flexDirection: "column", gap: 12,
                  borderTop: `3px solid ${g.color}`,
                  opacity: isDone ? 0.7 : 1,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Target size={14} color={g.color} />
                        <div style={{ fontWeight: 700, fontSize: 14, textDecoration: isDone ? "line-through" : "none" }}>
                          {g.title}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
                          background: `${statusMeta?.color}22`, color: statusMeta?.color }}>
                          {statusMeta?.label}
                        </span>
                      </div>
                      {g.description && (
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>{g.description}</div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 2 }}>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(g)}><Edit2 size={11} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => del(g.id)}><Trash2 size={11} /></button>
                    </div>
                  </div>

                  {/* Progress */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                      <span>Progress</span>
                      <span style={{ fontWeight: 700, color: g.color }}>{g.progress}%</span>
                    </div>
                    <div style={{ height: 8, background: "var(--surface3)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ width: `${g.progress}%`, height: "100%", background: g.color, transition: "width 0.4s" }} />
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => updateProgress(g, -10)} style={{ flex: 1, justifyContent: "center" }}>−10%</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => updateProgress(g, +10)} style={{ flex: 1, justifyContent: "center" }}>+10%</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => updateProgress(g, 100 - g.progress)} style={{ flex: 1, justifyContent: "center" }}>✓ Done</button>
                    </div>
                  </div>

                  {g.target_date && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5,
                      color: days !== null && days < 14 && !isDone ? "var(--amber)" : "var(--text-muted)" }}>
                      <Calendar size={11} />
                      <span>By {g.target_date}</span>
                      {days !== null && !isDone && (
                        <span style={{ fontWeight: 600 }}>
                          · {days < 0 ? `${Math.abs(days)} days late` : days === 0 ? "Today" : `${days} days left`}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{form.id ? "Edit Goal" : "New Goal"}</h2>
            <div className="form-row">
              <label>Title</label>
              <input autoFocus value={form.title} onChange={e => setForm({...form,title:e.target.value})} placeholder="e.g. Launch v2 by end of Q2" />
            </div>
            <div className="form-row">
              <label>Description</label>
              <textarea value={form.description} onChange={e => setForm({...form,description:e.target.value})}
                placeholder="What does success look like?" rows={3} />
            </div>
            <div className="form-grid">
              <div className="form-row">
                <label>Status</label>
                <Select
                  value={form.status}
                  onChange={v => setForm({...form, status: v})}
                  options={STATUSES.map(s => ({ value: s.id, label: s.label, color: s.color }))}
                />
              </div>
              <div className="form-row">
                <label>Target Date</label>
                <DatePicker value={form.target_date} onChange={v => setForm({...form, target_date: v})} placeholder="No target date" />
              </div>
            </div>
            <div className="form-row">
              <label>Progress: {form.progress}%</label>
              <input type="range" min={0} max={100} step={5} value={form.progress}
                onChange={e => setForm({...form,progress: parseInt(e.target.value)})} />
            </div>
            <div className="form-row">
              <label>Color</label>
              <div style={{ display:"flex", gap:8 }}>
                {COLORS.map(c => (
                  <div key={c} onClick={() => setForm({...form,color:c})} style={{
                    width:26, height:26, borderRadius:"50%", background:c, cursor:"pointer",
                    border: form.color===c ? "2.5px solid #fff" : "2.5px solid transparent",
                    boxShadow: form.color===c ? `0 0 10px ${c}aa` : "none",
                  }} />
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>{form.id ? "Save" : "Create"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
