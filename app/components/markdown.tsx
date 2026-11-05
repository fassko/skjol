import type { ReactNode } from "react";

// Small renderer for assistant replies: bold, italics, code, links, headings, lists, rules.
// Text is escaped by React; only these markers become elements.
const INLINE = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = new RegExp(INLINE.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyPrefix}-${i++}`;
    if (m[2] != null) out.push(<strong key={k}>{m[2]}</strong>);
    else if (m[3] != null) out.push(<em key={k}>{m[3]}</em>);
    else if (m[4] != null) out.push(<code key={k}>{m[4]}</code>);
    else if (m[5] != null && m[6] != null)
      out.push(
        <a key={k} href={m[6]} target="_blank" rel="noreferrer">
          {m[5]}
        </a>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : [text];
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let n = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line)) {
      blocks.push(<hr key={n++} />);
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const Tag = `h${heading[1].length}` as "h1" | "h2" | "h3";
      blocks.push(<Tag key={n++}>{inline(heading[2], `h${n}`)}</Tag>);
      i++;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      const listKey = n++;
      blocks.push(
        <ul key={listKey}>
          {items.map((item, j) => (
            <li key={j}>{inline(item, `li${listKey}-${j}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: { text: string; nested: string[] }[] = [];
      while (i < lines.length) {
        const head = lines[i].trim();
        if (!/^\d+\.\s+/.test(head)) break;
        const text = head.replace(/^\d+\.\s+/, "");
        i++;
        const nested: string[] = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
          nested.push(lines[i].trim().replace(/^[-*]\s+/, ""));
          i++;
        }
        items.push({ text, nested });
        let j = i;
        while (j < lines.length && !lines[j].trim()) j++;
        if (j < lines.length && /^\d+\.\s+/.test(lines[j].trim())) i = j;
        else break;
      }
      const listKey = n++;
      blocks.push(
        <ol key={listKey}>
          {items.map((item, j) => (
            <li key={j}>
              {inline(item.text, `oli${listKey}-${j}`)}
              {item.nested.length > 0 && (
                <ul>
                  {item.nested.map((sub, k) => (
                    <li key={k}>{inline(sub, `oli${listKey}-${j}-${k}`)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>,
      );
      continue;
    }
    blocks.push(<p key={n++}>{inline(line, `p${n}`)}</p>);
    i++;
  }

  if (!blocks.length) return null;
  return <div className="md">{blocks}</div>;
}
