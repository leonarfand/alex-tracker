import { Bold, Italic, Heading2, List, ListOrdered, Quote, Code, Link2, CheckSquare, Minus } from "lucide-react";

interface Props { textareaRef: React.RefObject<HTMLTextAreaElement | null>; value: string; onChange: (v: string) => void; }

export default function MarkdownToolbar({ textareaRef, value, onChange }: Props) {
  function apply(prefix: string, suffix: string = prefix, placeholder = "") {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || placeholder;
    const next = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const cursorStart = start + prefix.length;
      const cursorEnd = cursorStart + selected.length;
      ta.setSelectionRange(cursorStart, cursorEnd);
    });
  }

  function applyLineStart(prefix: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    // Find line start
    const before = value.slice(0, start);
    const lineStart = before.lastIndexOf("\n") + 1;
    // Apply prefix to each selected line
    const sectionStart = lineStart;
    const sectionEnd = end;
    const section = value.slice(sectionStart, sectionEnd);
    const transformed = section.split("\n").map(line => prefix + line).join("\n");
    const next = value.slice(0, sectionStart) + transformed + value.slice(sectionEnd);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(sectionStart, sectionStart + transformed.length);
    });
  }

  function insertLink() {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const label = value.slice(start, end) || "link text";
    const placeholder = "https://";
    const snippet = `[${label}](${placeholder})`;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    // Select the URL portion so the user can type/paste it immediately
    requestAnimationFrame(() => {
      ta.focus();
      const urlStart = start + label.length + 3; // "[" + label + "]("
      ta.setSelectionRange(urlStart, urlStart + placeholder.length);
    });
  }

  function insertHr() {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const next = value.slice(0, start) + "\n\n---\n\n" + value.slice(start);
    onChange(next);
  }

  const Btn = ({ icon: Icon, title, onClick }: { icon: any; title: string; onClick: () => void }) => (
    <button type="button" onClick={onClick} title={title}
      style={{
        background: "transparent", border: "none", color: "var(--text-muted)",
        cursor: "pointer", padding: "5px 7px", borderRadius: 5, display: "flex",
        transition: "background 0.12s, color 0.12s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--surface2)"; e.currentTarget.style.color = "var(--text)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}>
      <Icon size={14} />
    </button>
  );

  const Divider = () => <div style={{ width: 1, height: 18, background: "var(--border2)", margin: "0 2px" }} />;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 2, padding: "6px 12px",
      borderBottom: "1px solid var(--border)", background: "var(--surface)",
      flexWrap: "wrap",
    }}>
      <Btn icon={Heading2}     title="Heading"           onClick={() => applyLineStart("## ")} />
      <Btn icon={Bold}         title="Bold (**)"         onClick={() => apply("**", "**", "bold text")} />
      <Btn icon={Italic}       title="Italic (*)"        onClick={() => apply("*", "*", "italic text")} />
      <Divider />
      <Btn icon={List}         title="Bullet list"       onClick={() => applyLineStart("- ")} />
      <Btn icon={ListOrdered}  title="Numbered list"     onClick={() => applyLineStart("1. ")} />
      <Btn icon={CheckSquare}  title="Task list"         onClick={() => applyLineStart("- [ ] ")} />
      <Divider />
      <Btn icon={Quote}        title="Quote"             onClick={() => applyLineStart("> ")} />
      <Btn icon={Code}         title="Code (`)"          onClick={() => apply("`", "`", "code")} />
      <Btn icon={Link2}        title="Link"              onClick={insertLink} />
      <Btn icon={Minus}        title="Horizontal rule"   onClick={insertHr} />
    </div>
  );
}
