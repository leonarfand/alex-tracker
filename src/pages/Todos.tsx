import { useEffect, useState } from "react";
import { Plus, Trash2, Check, Flag, CheckCircle2, XCircle, ListChecks, Calendar, Bell, Pencil } from "lucide-react";
import { getDb } from "../db";
import { useApp } from "../App";
import { sounds } from "../sounds";
import ComboBox from "../components/ComboBox";
import Select from "../components/Select";
import TimePicker from "../components/TimePicker";
import DatePicker from "../components/DatePicker";
import { todayStr, nowStamp } from "../time";

interface Todo {
  id: number;
  title: string;
  done: number;
  priority: string;
  due_date: string | null;
  reminder_at: string | null;
  project: string;
  created_at: string;
}

const PRIORITIES = ["high","medium","low"] as const;
const PRIO_COLOR: Record<string,string> = { high:"var(--red)", medium:"var(--amber)", low:"var(--green)" };

const emptyForm = { id: 0, title:"", priority:"medium" as string, due_date:"", reminder_at:"", project:"" };

export default function Todos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [projectNames, setProjectNames] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState<"pending"|"done"|"all">("pending");
  const [filterPrio, setFilterPrio] = useState<string>("all");
  const [form, setForm] = useState({ ...emptyForm });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { toast, refresh, confirm } = useApp();
  const today = todayStr();

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function clearSelection() { setSelected(new Set()); }

  async function bulkSetDone(done: 0 | 1) {
    if (selected.size === 0) return;
    try {
      const db = await getDb();
      const ids = [...selected];
      const placeholders = ids.map(() => "?").join(",");
      await db.execute(`UPDATE todos SET done=?, completed_at=? WHERE id IN (${placeholders})`, [done, done ? nowStamp() : null, ...ids]);
      sounds.success();
      toast(done ? `Marked ${ids.length} done ✓` : `Marked ${ids.length} pending`);
      clearSelection();
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    const ok = await confirm({
      title: `Delete ${selected.size} task${selected.size === 1 ? "" : "s"}?`,
      message: "This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      const db = await getDb();
      const ids = [...selected];
      const placeholders = ids.map(() => "?").join(",");
      await db.execute(`DELETE FROM todos WHERE id IN (${placeholders})`, ids);
      sounds.pop();
      toast(`Deleted ${ids.length} task${ids.length === 1 ? "" : "s"}`);
      clearSelection();
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  async function bulkMoveToProject(projectName: string) {
    if (selected.size === 0) return;
    try {
      const db = await getDb();
      const ids = [...selected];
      const placeholders = ids.map(() => "?").join(",");
      await db.execute(`UPDATE todos SET project=? WHERE id IN (${placeholders})`, [projectName, ...ids]);
      toast(`Moved ${ids.length} task${ids.length === 1 ? "" : "s"}`, projectName || "(no project)");
      clearSelection();
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const db = await getDb();
      const rows = await db.select<Todo[]>(
        `SELECT * FROM todos ORDER BY done ASC,
         CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
         due_date ASC NULLS LAST, created_at DESC`
      );
      setTodos(rows);
      // Project names from both projects table and existing todo.project strings
      const [projs, todoProjs] = await Promise.all([
        db.select<{name:string}[]>("SELECT name FROM projects ORDER BY name"),
        db.select<{project:string}[]>("SELECT DISTINCT project FROM todos WHERE project!='' ORDER BY project"),
      ]);
      const set = new Set<string>();
      projs.forEach(p => set.add(p.name));
      todoProjs.forEach(p => set.add(p.project));
      setProjectNames([...set]);
      refresh();
    } catch (e) { toast("Load failed", String(e)); }
  }

  function openAdd() {
    setForm({ ...emptyForm });
    setShowModal(true);
  }

  function openEdit(t: Todo) {
    setForm({
      id: t.id,
      title: t.title,
      priority: t.priority,
      due_date: t.due_date ?? "",
      reminder_at: t.reminder_at ?? "",
      project: t.project ?? "",
    });
    setShowModal(true);
  }

  async function save() {
    if (!form.title.trim()) return;
    try {
      const db = await getDb();
      if (form.id) {
        // Editing: reset reminder_fired so a changed reminder will alarm again
        await db.execute(
          "UPDATE todos SET title=?,priority=?,due_date=?,reminder_at=?,project=?,reminder_fired=0 WHERE id=?",
          [form.title, form.priority, form.due_date||null, form.reminder_at||null, form.project, form.id]
        );
      } else {
        await db.execute(
          "INSERT INTO todos (title,priority,due_date,reminder_at,project) VALUES (?,?,?,?,?)",
          [form.title, form.priority, form.due_date||null, form.reminder_at||null, form.project]
        );
      }
      // Auto-create project record if it's a new one
      if (form.project.trim() && !projectNames.includes(form.project)) {
        await db.execute("INSERT OR IGNORE INTO projects (name, color) VALUES (?, ?)", [form.project, "#7c5af6"]);
      }
      sounds.success();
      setForm({ ...emptyForm });
      setShowModal(false);
      toast(form.id ? "Task updated ✓" : "Task added ✓", form.title);
      await load();
    } catch (e) { toast("Save failed", String(e)); }
  }

  async function toggle(todo: Todo) {
    try {
      const db = await getDb();
      await db.execute("UPDATE todos SET done=?, completed_at=? WHERE id=?", [todo.done ? 0 : 1, todo.done ? null : nowStamp(), todo.id]);
      if (todo.done) sounds.unhit(); else sounds.hit();
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  async function del(id: number) {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM todos WHERE id=?", [id]);
      sounds.pop();
      toast("Task deleted");
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  // Reminder date/time split out of the combined reminder_at value
  const remDate = form.reminder_at.split("T")[0] || "";
  const remTime = form.reminder_at.split("T")[1]?.slice(0, 5) || "09:00";

  let filtered = todos.filter(t => {
    if (filter === "pending") return !t.done;
    if (filter === "done")    return !!t.done;
    return true;
  });

  if (filterPrio !== "all") filtered = filtered.filter(t => t.priority === filterPrio);

  const groups: { label: string; items: Todo[]; }[] = filter === "pending" ? [
    { label: "Overdue",  items: filtered.filter(t => t.due_date && t.due_date < today) },
    { label: "Due Today",items: filtered.filter(t => t.due_date === today) },
    { label: "Upcoming", items: filtered.filter(t => t.due_date && t.due_date > today) },
    { label: "No Date",  items: filtered.filter(t => !t.due_date) },
  ] : [{ label:"", items: filtered }];

  return (
    <div className="page">
      <div className="page-header">
        <h1>To-Dos</h1>
        {/* Status filter */}
        <div style={{ display:"flex", gap:4 }}>
          {(["pending","done","all"] as const).map(f => (
            <button key={f} className={`btn btn-sm ${filter===f ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setFilter(f)} style={{ textTransform:"capitalize" }}>
              {f}
            </button>
          ))}
        </div>
        {/* Priority filter */}
        <div style={{ display:"flex", gap:4 }}>
          {["all","high","medium","low"].map(p => (
            <button key={p} className={`btn btn-sm ${filterPrio===p ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setFilterPrio(p)} style={{ textTransform:"capitalize", gap:5 }}>
              {p !== "all" && <span className={`prio-dot prio-${p}`} />}
              {p === "all" ? "All" : p}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>
          <Plus size={13} /> Add Task
        </button>
      </div>

      <div className="page-body" style={{ display:"flex", flexDirection:"column", gap:20 }}>
        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
            background: "var(--accent-glow)", border: "1px solid var(--accent)",
            borderRadius: 10, position: "sticky", top: 0, zIndex: 5,
          }}>
            <ListChecks size={14} color="var(--accent2)" />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{selected.size} selected</span>
            <div style={{ flex: 1 }} />
            <button className="btn btn-ghost btn-sm" onClick={() => bulkSetDone(1)}>
              <CheckCircle2 size={12} /> Mark done
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => bulkSetDone(0)}>
              <XCircle size={12} /> Mark pending
            </button>
            <div style={{ width: 180 }}>
              <Select
                value=""
                placeholder="Move to project…"
                onChange={v => bulkMoveToProject(v === "__none__" ? "" : v)}
                options={[
                  { value: "__none__", label: "(no project)" },
                  ...[...new Set(todos.map(t => t.project).filter(Boolean))].map(p => ({ value: p, label: p })),
                ]}
              />
            </div>
            <button className="btn btn-danger btn-sm" onClick={bulkDelete}>
              <Trash2 size={12} /> Delete
            </button>
            <button className="btn btn-ghost btn-sm" onClick={clearSelection}>Clear</button>
          </div>
        )}

        {groups.every(g => g.items.length === 0) && (
          <div className="empty">
            <div className="empty-icon">✅</div>
            <p>{filter === "pending" ? "All caught up! Add a new task." : "Nothing here."}</p>
          </div>
        )}

        {groups.map(group => group.items.length === 0 ? null : (
          <div key={group.label}>
            {group.label && (
              <div style={{ fontSize:11, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8, display:"flex", alignItems:"center", gap:8 }}>
                {group.label === "Overdue" && <span style={{ color:"var(--red)" }}>●</span>}
                {group.label === "Due Today" && <span style={{ color:"var(--amber)" }}>●</span>}
                {group.label === "Upcoming" && <span style={{ color:"var(--green)" }}>●</span>}
                {group.label}
                <span style={{ fontWeight:400, color:"var(--text-dim)" }}>({group.items.length})</span>
              </div>
            )}
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {group.items.map(t => {
                const overdue = !t.done && t.due_date && t.due_date < today;
                const isSelected = selected.has(t.id);
                return (
                  <div key={t.id} className="card" style={{
                    display:"flex", alignItems:"center", gap:12, padding:"12px 16px",
                    opacity: t.done ? 0.55 : 1,
                    borderLeft: `3px solid ${PRIO_COLOR[t.priority]}`,
                    background: isSelected ? "var(--accent-glow)" : undefined,
                    cursor: "pointer",
                  }}
                  onClick={(e) => {
                    if (e.shiftKey || e.ctrlKey || e.metaKey || selected.size > 0) {
                      toggleSelect(t.id);
                    }
                  }}
                  >
                    <button onClick={(e) => { e.stopPropagation(); toggleSelect(t.id); }}
                      title="Select"
                      style={{
                        width: 14, height: 14, borderRadius: "50%",
                        border: `1.5px solid ${isSelected ? "var(--accent)" : "var(--border2)"}`,
                        background: isSelected ? "var(--accent)" : "transparent",
                        cursor: "pointer", padding: 0, flexShrink: 0,
                      }}
                    />
                    <button className={`check-btn ${t.done ? "checked" : ""}`} onClick={(e) => { e.stopPropagation(); toggle(t); }}>
                      {t.done && <Check size={11} color="#fff" strokeWidth={3} />}
                    </button>
                    <div style={{ flex:1, minWidth:0, cursor: selected.size > 0 ? "default" : "pointer" }}
                      onClick={(e) => { if (selected.size === 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.stopPropagation(); openEdit(t); } }}>
                      <div style={{
                        fontWeight:500, fontSize:13.5,
                        textDecoration: t.done ? "line-through" : "none",
                        color: t.done ? "var(--text-muted)" : "var(--text)",
                      }}>
                        {t.title}
                      </div>
                      <div style={{ display:"flex", gap:8, marginTop:4, flexWrap:"wrap", alignItems:"center" }}>
                        {t.project && (
                          <span className="tag">{t.project}</span>
                        )}
                        {t.due_date && (
                          <span style={{ fontSize:11, color: overdue ? "var(--red)" : "var(--text-muted)", display:"inline-flex", alignItems:"center", gap:4 }}>
                            <Calendar size={11} /> {t.due_date}{overdue ? " · overdue" : ""}
                          </span>
                        )}
                        {t.reminder_at && (
                          <span style={{ fontSize:11, color:"var(--text-muted)", display:"inline-flex", alignItems:"center", gap:4 }}>
                            <Bell size={11} /> {t.reminder_at.replace("T", " ")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span className={`badge badge-${t.priority}`}>
                        <Flag size={9} /> {t.priority}
                      </span>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={(e) => { e.stopPropagation(); openEdit(t); }} title="Edit task">
                        <Pencil size={12} />
                      </button>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={(e) => { e.stopPropagation(); del(t.id); }} title="Delete task">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Add Task Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{form.id ? "Edit Task" : "New Task"}</h2>
            <div className="form-row">
              <label>Task title</label>
              <input autoFocus value={form.title} onChange={e => setForm({...form,title:e.target.value})}
                placeholder="What needs to be done?" onKeyDown={e => e.key==="Enter" && save()} />
            </div>
            <div className="form-grid">
              <div className="form-row">
                <label>Priority</label>
                <div style={{ display:"flex", gap:6 }}>
                  {PRIORITIES.map(p => (
                    <button key={p} className={`btn btn-sm ${form.priority===p ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setForm({...form,priority:p})}
                      style={{ flex:1, justifyContent:"center", gap:5 }}>
                      <span className={`prio-dot prio-${p}`} />
                      {p.charAt(0).toUpperCase()+p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-row">
                <label>Project</label>
                <ComboBox
                  value={form.project}
                  onChange={v => setForm({...form, project: v})}
                  options={projectNames}
                  placeholder={projectNames.length ? "Pick existing or type new…" : "e.g. Client A"}
                />
              </div>
              <div className="form-row">
                <label>Due Date</label>
                <DatePicker value={form.due_date} onChange={v => setForm({...form, due_date: v})} placeholder="No due date" />
              </div>
              <div className="form-row">
                <label>Reminder date</label>
                <DatePicker value={remDate} placeholder="No reminder"
                  onChange={d => setForm({ ...form, reminder_at: d ? `${d}T${remTime}` : "" })} />
              </div>
            </div>
            {remDate && (
              <div className="form-row">
                <label>Remind me at</label>
                <TimePicker value={remTime} onChange={t => setForm({ ...form, reminder_at: `${remDate}T${t}` })} />
              </div>
            )}
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>{form.id ? "Save" : "Add Task"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
