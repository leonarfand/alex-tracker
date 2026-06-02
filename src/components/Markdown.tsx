import { useMemo } from "react";
import { marked } from "marked";

interface Props { source: string; }

// Configure marked: GitHub-flavored, line breaks honored
marked.setOptions({ gfm: true, breaks: true });

export default function Markdown({ source }: Props) {
  const html = useMemo(() => {
    try {
      return marked.parse(source || "") as string;
    } catch {
      return "";
    }
  }, [source]);

  if (!source.trim()) {
    return (
      <div style={{ color: "var(--text-dim)", fontStyle: "italic", padding: "20px 0" }}>
        Nothing to preview. Switch back to Edit and write something.
      </div>
    );
  }

  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
