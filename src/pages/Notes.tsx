import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Search, LayoutGrid, List, Pin, Eye, Edit3, FileText, Copy, FolderOpen } from "lucide-react";
import { appDataDir, join } from "@tauri-apps/api/path";
import { writeFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getDb } from "../db";
import { useApp } from "../App";
import Markdown from "../components/Markdown";
import ComboBox from "../components/ComboBox";
import MarkdownToolbar from "../components/MarkdownToolbar";
import ContextMenu, { MenuItem as CtxMenuItem } from "../components/ContextMenu";

const TEMPLATES: Record<string, () => string> = {
  "Meeting Notes": () => {
    const d = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    return `# Meeting Notes — ${d}\n\n**Attendees:** \n**Topic:** \n\n## Agenda\n- \n\n## Discussion\n\n\n## Decisions\n- \n\n## Action Items\n- [ ] \n- [ ] \n\n## Next Steps\n`;
  },
  "Daily Journal": () => {
    const d = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    return `# ${d}\n\n## What I did today\n\n\n## Wins 🎉\n- \n\n## Challenges\n- \n\n## Tomorrow's focus\n- [ ] \n`;
  },
  "Weekly Review": () => {
    const d = new Date();
    const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return `# Week of ${monday.toLocaleDateString("en-US", { month: "long", day: "numeric" })}\n\n## Achievements\n- \n\n## Lessons learned\n- \n\n## Still stuck on\n- \n\n## Next week priorities\n- [ ] \n- [ ] \n- [ ] \n`;
  },
  "Project Brief": () =>
    `# Project: \n\n## Goal\n*What does success look like?*\n\n## Scope\n**In:** \n**Out:** \n\n## Stakeholders\n- \n\n## Timeline\n- **Start:** \n- **Milestone:** \n- **Deadline:** \n\n## Risks\n- \n`,
  "Idea Capture": () =>
    `# 💡 Idea: \n\n## The pitch (one line)\n\n\n## Why now?\n\n\n## Who is this for?\n\n\n## How would it work?\n\n\n## Next step\n- [ ] \n`,
};

interface Note {
  id: number;
  title: string;
  body: string;
  tags: string;
  color: string;
  pinned: number;
  project: string;
  updated_at: string;
}

const COLORS = [
  { id:"default", label:"Default" },
  { id:"yellow",  label:"Yellow"  },
  { id:"blue",    label:"Blue"    },
  { id:"green",   label:"Green"   },
  { id:"pink",    label:"Pink"    },
  { id:"purple",  label:"Purple"  },
  { id:"orange",  label:"Orange"  },
  { id:"teal",    label:"Teal"    },
];

const COLOR_HEX: Record<string,string> = {
  default:"var(--accent2)", yellow:"#fbbf24", blue:"#60a5fa",
  green:"#34d399", pink:"#f472b6", purple:"#a78bfa",
  orange:"#fb923c", teal:"#2dd4bf",
};

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "board">("board");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [color, setColor] = useState("default");
  const [project, setProject] = useState("");
  const [dirty, setDirty] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [projectNames, setProjectNames] = useState<string[]>([]);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number; note: Note } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast, confirm } = useApp();

  async function removeNote(n: Note) {
    const ok = await confirm({
      title: `Delete "${n.title || "Untitled"}"?`,
      message: "This note will be permanently removed.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      const db = await getDb();
      await db.execute("DELETE FROM notes WHERE id=?", [n.id]);
      if (selected?.id === n.id) newNote();
      toast("Note deleted");
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  async function duplicate(n: Note) {
    try {
      const db = await getDb();
      await db.execute(
        "INSERT INTO notes (title, body, tags, color, project) VALUES (?,?,?,?,?)",
        [`${n.title || "Untitled"} (copy)`, n.body, n.tags, n.color, n.project || ""]
      );
      toast("Note duplicated");
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  async function togglePinNote(n: Note) {
    try {
      const db = await getDb();
      await db.execute("UPDATE notes SET pinned=? WHERE id=?", [n.pinned ? 0 : 1, n.id]);
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  function noteContextItems(n: Note): CtxMenuItem[] {
    return [
      { label: "Open", icon: <FolderOpen size={13} />, onClick: () => pick(n) },
      { label: n.pinned ? "Unpin" : "Pin", icon: <Pin size={13} />, onClick: () => togglePinNote(n) },
      { label: "Duplicate", icon: <Copy size={13} />, onClick: () => duplicate(n) },
      { divider: true, label: "" },
      { label: "Delete", icon: <Trash2 size={13} />, danger: true, onClick: () => removeNote(n) },
    ];
  }

  async function applyTemplate(name: string) {
    const tpl = TEMPLATES[name]();
    if (selected && (title.trim() || body.trim())) {
      const ok = await confirm({
        title: "Replace note content?",
        message: `This replaces the current note with the "${name}" template.`,
        confirmLabel: "Replace",
        danger: true,
      });
      if (!ok) { setShowTemplateMenu(false); return; }
    }
    newNote().then(() => {
      setBody(tpl);
      setTitle(name);
      setDirty(true);
      setShowTemplateMenu(false);
      toast("Template applied", name);
    });
  }

  useEffect(() => { load(); }, []);

  // Auto-save every 2s when dirty
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(save, 2000);
    return () => clearTimeout(t);
  }, [title, body, tags, color, project, dirty]);

  async function load() {
    try {
      const db = await getDb();
      const rows = await db.select<Note[]>(
        "SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC"
      );
      setNotes(rows);
      // Project names for combobox
      const [projs, noteProjs] = await Promise.all([
        db.select<{name:string}[]>("SELECT name FROM projects ORDER BY name"),
        db.select<{project:string}[]>("SELECT DISTINCT project FROM notes WHERE project!='' ORDER BY project"),
      ]);
      const set = new Set<string>();
      projs.forEach(p => set.add(p.name));
      noteProjs.forEach(p => set.add(p.project));
      setProjectNames([...set]);
    } catch (e) { toast("Load failed", String(e)); }
  }

  async function save() {
    try {
      const db = await getDb();
      if (selected) {
        await db.execute(
          "UPDATE notes SET title=?,body=?,tags=?,color=?,project=?,updated_at=datetime('now') WHERE id=?",
          [title, body, tags, color, project, selected.id]
        );
      } else {
        if (!title.trim() && !body.trim()) {
          setDirty(false);
          return;
        }
        await db.execute(
          "INSERT INTO notes (title,body,tags,color,project) VALUES (?,?,?,?,?)",
          [title || "Untitled", body, tags, color, project]
        );
        const rows = await db.select<Note[]>(
          "SELECT * FROM notes ORDER BY id DESC LIMIT 1"
        );
        if (rows[0]) setSelected(rows[0]);
      }
      setDirty(false);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[Notes] save failed:", e);
      toast("Save failed", msg);
    }
  }

  async function newNote() {
    await saveIfDirty();
    setSelected(null);
    setTitle(""); setBody(""); setTags(""); setColor("default"); setProject(""); setDirty(false);
    setPreviewMode(false);
  }

  async function saveIfDirty() {
    if (dirty) await save();
  }

  function pick(note: Note) {
    saveIfDirty();
    setSelected(note);
    setTitle(note.title); setBody(note.body); setTags(note.tags); setColor(note.color);
    setProject(note.project || "");
    setDirty(false);
    // Open existing notes in preview if body contains a base64 data URL (legacy heavy notes).
    // For modern file-based images the URL is short, so edit mode is fine.
    setPreviewMode(note.body.includes("data:image"));
  }

  // Strip markdown + image data URLs for list/board snippets
  function bodyPreview(b: string): string {
    return b
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "📷 image")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[#*`>_~]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function togglePin(note: Note, e: React.MouseEvent) {
    e.stopPropagation();
    const db = await getDb();
    await db.execute("UPDATE notes SET pinned=? WHERE id=?", [note.pinned ? 0 : 1, note.id]);
    await load();
  }

  function change(field: "title"|"body"|"tags"|"color"|"project", val: string) {
    if (field === "title")   setTitle(val);
    if (field === "body")    setBody(val);
    if (field === "tags")    setTags(val);
    if (field === "color")   setColor(val);
    if (field === "project") setProject(val);
    setDirty(true);
  }

  // Image paste — saves pasted images to disk, inserts a short markdown ref
  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const target = e.target as HTMLTextAreaElement;
        const start = target.selectionStart ?? body.length;
        const end = target.selectionEnd ?? body.length;
        try {
          // Save image as a file under appData/images
          const dir = await appDataDir();
          const imagesDir = await join(dir, "images");
          if (!(await exists(imagesDir).catch(() => false))) {
            await mkdir(imagesDir, { recursive: true });
          }
          const ext = (item.type.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "");
          const filename = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const filepath = await join(imagesDir, filename);
          const buf = new Uint8Array(await file.arrayBuffer());
          await writeFile(filepath, buf);
          const url = convertFileSrc(filepath);
          const insertion = `\n![image](${url})\n`;
          const next = body.slice(0, start) + insertion + body.slice(end);
          setBody(next);
          setDirty(true);
          // Keep editor in edit mode so user can keep typing
          setTimeout(() => {
            target.focus();
            const cursor = start + insertion.length;
            target.setSelectionRange(cursor, cursor);
          }, 0);
          toast("Image pasted ✓", filename);
        } catch (err) {
          toast("Image paste failed", String(err));
        }
        return;
      }
    }
  }

  const filtered = notes.filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.body.toLowerCase().includes(search.toLowerCase()) ||
    n.tags.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page" style={{ flexDirection:"row" }}>
      {/* Sidebar list */}
      <div style={{ width:240, borderRight:"1px solid var(--border)", display:"flex", flexDirection:"column", flexShrink:0, background:"var(--surface)" }}>
        <div style={{ padding:"12px", borderBottom:"1px solid var(--border)", display:"flex", gap:8 }}>
          <div style={{ position:"relative", flex:1 }}>
            <Search size={13} style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", color:"var(--text-muted)" }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes…" style={{ width:"100%", paddingLeft:28, fontSize:12 }} />
          </div>
          <button className="btn btn-primary btn-icon" onClick={newNote} title="New note"><Plus size={14} /></button>
        </div>

        <div style={{ display:"flex", gap:4, padding:"8px 12px", borderBottom:"1px solid var(--border)" }}>
          <button className={`btn btn-sm ${view==="board" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("board")} style={{ flex:1, justifyContent:"center" }}>
            <LayoutGrid size={12} /> Board
          </button>
          <button className={`btn btn-sm ${view==="list" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("list")} style={{ flex:1, justifyContent:"center" }}>
            <List size={12} /> List
          </button>
        </div>

        <div style={{ flex:1, overflowY:"auto" }}>
          {filtered.length === 0 && (
            <div className="empty"><div className="empty-icon">📝</div><p>No notes yet.<br/>Click + to create one.</p></div>
          )}
          {view === "list" ? (
            filtered.map(n => (
              <div key={n.id} onClick={() => pick(n)}
                onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, note: n }); }}
                style={{
                padding:"11px 14px", cursor:"pointer",
                borderBottom:"1px solid var(--border)",
                background: selected?.id === n.id ? "var(--surface2)" : "transparent",
                borderLeft: selected?.id === n.id ? `3px solid ${COLOR_HEX[n.color]}` : "3px solid transparent",
                display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8,
              }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    {n.pinned === 1 && <Pin size={10} color="var(--amber)" />}
                    <span style={{ fontWeight:600, fontSize:12.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {n.title || "Untitled"}
                    </span>
                  </div>
                  {n.body && <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{bodyPreview(n.body)}</div>}
                  <div style={{ fontSize:10.5, color:"var(--text-dim)", marginTop:3 }}>{n.updated_at.slice(0,10)}</div>
                </div>
                <div style={{ display:"flex", gap:3 }}>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={e => togglePin(n, e)} style={{ padding:"3px 5px" }}>
                    <Pin size={11} color={n.pinned ? "var(--amber)" : undefined} />
                  </button>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={e => { e.stopPropagation(); removeNote(n); }} style={{ padding:"3px 5px" }}>
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding:10, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {filtered.map(n => (
                <div key={n.id}
                  onClick={() => pick(n)}
                  onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, note: n }); }}
                  className={`card sticky-card sticky-${n.color} note-card ${selected?.id === n.id ? "selected" : ""}`}
                  style={{ cursor:"pointer", padding:"10px 12px", minHeight:90,
                    boxShadow: selected?.id === n.id ? `0 0 0 2px ${COLOR_HEX[n.color]}40` : undefined }}
                >
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                    <div className="sticky-dot" />
                    <div style={{ display:"flex", gap:3 }}>
                      {n.pinned === 1 && <Pin size={10} color="var(--amber)" />}
                      <button className="btn btn-danger btn-icon btn-sm note-card-trash"
                        onClick={e => { e.stopPropagation(); removeNote(n); }}
                        title="Delete note"
                        style={{ padding:"3px 5px" }}>
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize:12, fontWeight:700, marginBottom:4, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>
                    {n.title || "Untitled"}
                  </div>
                  {n.body && (
                    <div style={{ fontSize:11, color:"var(--text-muted)", overflow:"hidden", display:"-webkit-box", WebkitLineClamp:3, WebkitBoxOrient:"vertical", lineHeight:1.5 }}>
                      {bodyPreview(n.body)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>
        {/* Toolbar */}
        <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--border)", display:"flex", gap:8, alignItems:"center", background:"var(--surface)", flexWrap:"wrap" }}>
          <input
            value={title}
            onChange={e => change("title", e.target.value)}
            placeholder="Note title…"
            style={{ flex:1, minWidth:160, fontSize:16, fontWeight:700, background:"transparent", border:"none", padding:"4px 0", boxShadow:"none" }}
          />
          <div style={{ display:"flex", gap:5, alignItems:"center" }}>
            {COLORS.map(c => (
              <div key={c.id} onClick={() => change("color", c.id)} title={c.label} style={{
                width:14, height:14, borderRadius:"50%",
                background: COLOR_HEX[c.id],
                cursor:"pointer",
                border: color === c.id ? "2px solid #fff" : "2px solid transparent",
                flexShrink:0,
              }} />
            ))}
          </div>
          <div style={{ position: "relative" }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowTemplateMenu(s => !s)}
              title="Insert template"
            >
              <FileText size={12} /> Templates
            </button>
            {showTemplateMenu && (
              <div className="combo-dropdown" style={{ right: 0, left: "auto", width: 200 }}>
                {Object.keys(TEMPLATES).map(name => (
                  <div key={name} className="combo-item" onClick={() => applyTemplate(name)}>
                    <FileText size={12} color="var(--accent2)" />
                    <span>{name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            className={`btn btn-sm ${previewMode ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setPreviewMode(p => !p)}
            title="Toggle markdown preview"
          >
            {previewMode ? <><Edit3 size={12} /> Edit</> : <><Eye size={12} /> Preview</>}
          </button>
          <button className="btn btn-primary btn-sm" onClick={save}>
            {dirty ? "Save*" : "Saved ✓"}
          </button>
        </div>

        {/* Secondary toolbar: tags + project */}
        <div style={{ padding:"8px 16px", borderBottom:"1px solid var(--border)", display:"flex", gap:10, alignItems:"center", background:"var(--surface)" }}>
          <input
            value={tags}
            onChange={e => change("tags", e.target.value)}
            placeholder="🏷 Tags (comma separated)"
            style={{ flex:1, fontSize:12 }}
          />
          <div style={{ width:200 }}>
            <ComboBox
              value={project}
              onChange={v => change("project", v)}
              options={projectNames}
              placeholder="📁 Link to project…"
            />
          </div>
        </div>

        {previewMode ? (
          <div style={{ flex:1, overflowY:"auto", padding:"24px 32px" }}>
            <Markdown source={body} />
          </div>
        ) : (
          <>
            <MarkdownToolbar textareaRef={textareaRef} value={body} onChange={v => { setBody(v); setDirty(true); }} />
            <textarea
              ref={textareaRef}
              value={body}
              onChange={e => change("body", e.target.value)}
              onPaste={handlePaste}
              placeholder="Start writing… (supports Markdown — # headers, **bold**, lists, `code`, links. Paste images directly.)"
              style={{
                flex:1, border:"none", background:"transparent",
                padding:"24px 28px", fontSize:14, lineHeight:1.8,
                resize:"none",
              }}
            />
          </>
        )}
      </div>

      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={noteContextItems(ctx.note)} onClose={() => setCtx(null)} />
      )}
    </div>
  );
}
