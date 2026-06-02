import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, TrendingUp, TrendingDown, CheckSquare, Calendar, Edit2, ArrowRight, DollarSign, Pin, GripVertical } from "lucide-react";
import { getDb } from "../db";
import { useApp } from "../App";
import ProjectDetail from "./ProjectDetail";
import Select from "../components/Select";
import DatePicker from "../components/DatePicker";

type Page = "dashboard"|"notes"|"todos"|"calendar"|"habits"|"daily"|"finance"|"projects"|"settings";
interface Props { onNavigate: (p: Page) => void; }

interface Project {
  id: number;
  name: string;
  color: string;
  description: string;
  status: string;
  deadline: string | null;
  tracks_finance: number;
  pinned: number;
  sort_order: number;
}

interface Stat { projectName: string; income: number; expense: number; todoTotal: number; todoDone: number; }

const COLORS = ["#7c5af6","#06b6d4","#22d3a4","#fbbf24","#f43f5e","#ec4899","#a78bfa","#fb923c"];
const STATUSES = [
  { id:"active",  label:"Active",   color:"var(--green)" },
  { id:"paused",  label:"On Hold",  color:"var(--amber)" },
  { id:"done",    label:"Done",     color:"var(--text-muted)" },
];

const emptyForm = { id: 0, name:"", color:COLORS[0], description:"", status:"active", deadline:"", tracks_finance: 1 };

export default function Projects(_props: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<Record<number, Stat>>({});
  const [statusFilter, setStatusFilter] = useState<"all"|"active"|"paused"|"done">("all");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [focusProject, setFocusProject] = useState<Project | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const { toast, money, confirm } = useApp();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const db = await getDb();
      const ps = await db.select<Project[]>(
        "SELECT * FROM projects ORDER BY pinned DESC, sort_order ASC, created_at DESC"
      );
      setProjects(ps);

      const out: Record<number, Stat> = {};
      for (const p of ps) {
        const [tx, td] = await Promise.all([
          db.select<{type:string;total:number}[]>(
            "SELECT type, SUM(amount) as total FROM transactions WHERE project_id=? GROUP BY type",
            [p.id]
          ),
          db.select<{done:number;c:number}[]>(
            "SELECT done, COUNT(*) as c FROM todos WHERE project=? GROUP BY done", [p.name]
          ),
        ]);
        const income  = tx.find(r => r.type === "income")?.total  ?? 0;
        const expense = tx.find(r => r.type === "expense")?.total ?? 0;
        const todoDone  = td.find(r => r.done === 1)?.c ?? 0;
        const todoTotal = td.reduce((s, r) => s + r.c, 0);
        out[p.id] = { projectName:p.name, income, expense, todoTotal, todoDone };
      }
      setStats(out);
    } catch (e) {
      toast("Load failed", String(e));
    }
  }

  function openNew() {
    setForm({ ...emptyForm });
    setShowModal(true);
  }

  function openEdit(p: Project) {
    setForm({
      id:p.id, name:p.name, color:p.color, description:p.description,
      status:p.status, deadline:p.deadline ?? "",
      tracks_finance: p.tracks_finance ?? 1,
    });
    setShowModal(true);
  }

  async function save() {
    if (!form.name.trim()) return;
    try {
      const db = await getDb();
      if (form.id) {
        await db.execute(
          "UPDATE projects SET name=?,color=?,description=?,status=?,deadline=?,tracks_finance=? WHERE id=?",
          [form.name, form.color, form.description, form.status, form.deadline || null, form.tracks_finance, form.id]
        );
        toast("Project updated");
      } else {
        await db.execute(
          "INSERT OR IGNORE INTO projects (name,color,description,status,deadline,tracks_finance) VALUES (?,?,?,?,?,?)",
          [form.name, form.color, form.description, form.status, form.deadline || null, form.tracks_finance]
        );
        toast("Project created", form.name);
      }
      setShowModal(false);
      await load();
    } catch (e) {
      toast("Save failed", String(e));
    }
  }

  async function del(p: Project) {
    const ok = await confirm({
      title: `Delete "${p.name}"?`,
      message: "This permanently deletes the project and all its finance entries. Tasks and notes linked to it stay.",
      confirmLabel: "Delete project",
      danger: true,
    });
    if (!ok) return;
    try {
      const db = await getDb();
      await db.execute("DELETE FROM transactions WHERE project_id=?", [p.id]);
      await db.execute("DELETE FROM projects WHERE id=?", [p.id]);
      toast("Project deleted");
      await load();
    } catch (e) {
      toast("Delete failed", String(e));
    }
  }

  async function togglePin(p: Project) {
    try {
      const db = await getDb();
      await db.execute("UPDATE projects SET pinned=? WHERE id=?", [p.pinned ? 0 : 1, p.id]);
      toast(p.pinned ? "Unpinned" : "Pinned");
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  // Reorder by drag-and-drop
  async function onDrop(targetId: number, fromId: number) {
    if (!fromId || fromId === targetId) {
      setDragId(null); setDragOverId(null);
      return;
    }
    try {
      const reordered = [...projects];
      const fromIdx = reordered.findIndex(p => p.id === fromId);
      const toIdx   = reordered.findIndex(p => p.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return;
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      // Re-number sort_order
      const db = await getDb();
      for (let i = 0; i < reordered.length; i++) {
        await db.execute("UPDATE projects SET sort_order=? WHERE id=?", [i, reordered[i].id]);
      }
      setDragId(null); setDragOverId(null);
      await load();
    } catch (e) { toast("Reorder failed", String(e)); }
  }

  const filtered = useMemo(() =>
    statusFilter === "all" ? projects : projects.filter(p => p.status === statusFilter),
    [projects, statusFilter]
  );

  function daysUntil(date: string | null) {
    if (!date) return null;
    const diff = Math.ceil((new Date(date+"T00:00:00").getTime() - new Date().getTime()) / 86400000);
    return diff;
  }

  // Focus mode: show project detail view (after all hooks are registered)
  if (focusProject) {
    return <ProjectDetail project={focusProject} onBack={() => { setFocusProject(null); load(); }} />;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Projects</h1>
        <div style={{ display:"flex", gap:4 }}>
          {(["all","active","paused","done"] as const).map(s => (
            <button key={s} className={`btn btn-sm ${statusFilter===s ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setStatusFilter(s)} style={{ textTransform:"capitalize" }}>
              {s === "paused" ? "On Hold" : s}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={openNew}>
          <Plus size={13} /> New Project
        </button>
      </div>

      <div className="page-body">
        {filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📁</div>
            <p>No projects yet.<br />Track work separately to see P&L and progress per project.</p>
            <button className="btn btn-primary btn-sm" onClick={openNew} style={{ marginTop:10 }}>
              <Plus size={13} /> Create your first project
            </button>
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))", gap:14 }}>
            {filtered.map(p => {
              const s = stats[p.id] || { income:0, expense:0, todoTotal:0, todoDone:0 };
              const net = s.income - s.expense;
              const pct = s.todoTotal === 0 ? 0 : Math.round((s.todoDone / s.todoTotal) * 100);
              const days = daysUntil(p.deadline);
              const statusMeta = STATUSES.find(x => x.id === p.status);
              const isDragging = dragId === p.id;
              const isDropTarget = dragOverId === p.id && dragId !== null && dragId !== p.id;
              return (
                <div key={p.id} className="card project-card"
                  draggable
                  onDragStart={e => {
                    // setData is REQUIRED for the drag to actually start in several engines
                    e.dataTransfer.setData("text/plain", String(p.id));
                    e.dataTransfer.effectAllowed = "move";
                    setDragId(p.id);
                  }}
                  onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                  onDragEnter={e => { e.preventDefault(); setDragOverId(p.id); }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragOverId !== p.id) setDragOverId(p.id); }}
                  onDragLeave={() => setDragOverId(o => o === p.id ? null : o)}
                  onDrop={e => {
                    e.preventDefault();
                    const fromId = dragId ?? parseInt(e.dataTransfer.getData("text/plain") || "0", 10);
                    onDrop(p.id, fromId);
                  }}
                  style={{
                    display:"flex", flexDirection:"column", gap:12,
                    borderTop:`3px solid ${p.color}`, position:"relative",
                    opacity: isDragging ? 0.4 : 1,
                    transform: isDropTarget ? "scale(1.02)" : undefined,
                    transition: "transform 0.12s, opacity 0.12s",
                    boxShadow: isDropTarget ? `0 0 0 2px var(--accent)` : undefined,
                  }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                        <GripVertical size={12} className="drag-handle" color="var(--text-dim)" />
                        {p.pinned === 1 && <Pin size={11} color="var(--amber)" fill="var(--amber)" />}
                        <div style={{ fontWeight:700, fontSize:14 }}>{p.name}</div>
                        <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:99, background:`${statusMeta?.color}22`, color: statusMeta?.color }}>
                          {statusMeta?.label}
                        </span>
                      </div>
                      {p.description && (
                        <div style={{ fontSize:11.5, color:"var(--text-muted)", marginTop:4, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>
                          {p.description}
                        </div>
                      )}
                    </div>
                    <div style={{ display:"flex", gap:2 }}>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => togglePin(p)}
                        title={p.pinned ? "Unpin" : "Pin to top"} style={{ padding:"4px 5px" }}>
                        <Pin size={11} color={p.pinned ? "var(--amber)" : undefined} fill={p.pinned ? "var(--amber)" : "transparent"} />
                      </button>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(p)} style={{ padding:"4px 5px" }}><Edit2 size={11} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => del(p)} style={{ padding:"4px 5px" }}><Trash2 size={11} /></button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:10.5, color:"var(--text-muted)", marginBottom:4 }}>
                      <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}><CheckSquare size={10} /> Tasks</span>
                      <span style={{ fontWeight:600 }}>{s.todoDone}/{s.todoTotal} · {pct}%</span>
                    </div>
                    <div style={{ height:5, background:"var(--surface3)", borderRadius:99, overflow:"hidden" }}>
                      <div style={{ width:`${pct}%`, height:"100%", background:p.color, transition:"width 0.4s" }} />
                    </div>
                  </div>

                  {/* P&L mini */}
                  <div style={{ display:"flex", gap:6, justifyContent:"space-between" }}>
                    <div style={{ flex:1, padding:"6px 8px", background:"var(--surface2)", borderRadius:6 }}>
                      <div style={{ fontSize:9.5, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.06em", display:"flex", alignItems:"center", gap:3 }}>
                        <TrendingUp size={9} color="var(--green)" /> Income
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, color:"var(--green)" }}>{money(s.income, 0)}</div>
                    </div>
                    <div style={{ flex:1, padding:"6px 8px", background:"var(--surface2)", borderRadius:6 }}>
                      <div style={{ fontSize:9.5, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.06em", display:"flex", alignItems:"center", gap:3 }}>
                        <TrendingDown size={9} color="var(--red)" /> Expense
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, color:"var(--red)" }}>{money(s.expense, 0)}</div>
                    </div>
                    <div style={{ flex:1, padding:"6px 8px", background:"var(--surface2)", borderRadius:6 }}>
                      <div style={{ fontSize:9.5, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Net</div>
                      <div style={{ fontSize:13, fontWeight:700, color: net >= 0 ? "var(--green)" : "var(--red)" }}>
                        {net < 0 ? "-" : ""}{money(Math.abs(net), 0)}
                      </div>
                    </div>
                  </div>

                  {/* Deadline */}
                  {p.deadline && (
                    <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11.5, color: days !== null && days < 7 ? "var(--red)" : "var(--text-muted)" }}>
                      <Calendar size={11} />
                      <span>Due {p.deadline}</span>
                      {days !== null && (
                        <span style={{ fontWeight:600 }}>
                          · {days < 0 ? `${Math.abs(days)} day${Math.abs(days)===1?"":"s"} overdue` : days === 0 ? "Today" : `${days} day${days===1?"":"s"} left`}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Footer actions */}
                  <button className="btn btn-primary btn-sm" onClick={() => setFocusProject(p)}
                    style={{ marginTop: 4, width: "100%", justifyContent: "center", gap: 6 }}>
                    Open Project <ArrowRight size={12} />
                  </button>
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
            <h2>{form.id ? "Edit Project" : "New Project"}</h2>
            <div className="form-row">
              <label>Name</label>
              <input autoFocus value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="Project name" />
            </div>
            <div className="form-row">
              <label>Description</label>
              <textarea value={form.description} onChange={e => setForm({...form,description:e.target.value})}
                placeholder="What's this project about?" rows={3} />
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
                <label>Deadline</label>
                <DatePicker value={form.deadline} onChange={v => setForm({...form, deadline: v})} placeholder="No deadline" />
              </div>
            </div>
            <div className="form-row">
              <label>Color</label>
              <div style={{ display:"flex", gap:8 }}>
                {COLORS.map(c => (
                  <div key={c} onClick={() => setForm({...form,color:c})} style={{
                    width:28, height:28, borderRadius:"50%", background:c, cursor:"pointer",
                    border: form.color===c ? "2.5px solid #fff" : "2.5px solid transparent",
                    boxShadow: form.color===c ? `0 0 10px ${c}aa` : "none",
                  }} />
                ))}
              </div>
            </div>

            {/* Track finances toggle */}
            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", background:"var(--surface2)", borderRadius:8 }}>
              <DollarSign size={18} color={form.tracks_finance ? "var(--green)" : "var(--text-dim)"} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>Track money for this project</div>
                <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>
                  When off, the project is hidden from the Finance page (notes & tasks still work).
                </div>
              </div>
              <button
                type="button"
                onClick={() => setForm({...form, tracks_finance: form.tracks_finance ? 0 : 1})}
                style={{
                  width:42, height:24, borderRadius:99, border:"none", cursor:"pointer",
                  background: form.tracks_finance ? "var(--green)" : "var(--surface3)",
                  position:"relative", transition:"background 0.15s", flexShrink:0,
                }}
                title={form.tracks_finance ? "Tracking enabled" : "Tracking disabled"}
              >
                <div style={{
                  position:"absolute", top:2, left: form.tracks_finance ? 20 : 2,
                  width:20, height:20, borderRadius:"50%", background:"#fff",
                  transition:"left 0.18s",
                }} />
              </button>
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
