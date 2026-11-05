"use client";
import { useState, type ReactNode } from "react";

const TOKEN = /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*")|\b(import|from|const|await|return|new)\b|\.([A-Za-z_$][\w$]*)(?=\()|\b(true|false|null)\b/g;

function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of code.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > last) out.push(code.slice(last, i));
    const [whole, comment, string, keyword, method, literal] = m;
    if (comment) out.push(<span key={i} className="text-[#8a9aa6] italic">{comment}</span>);
    else if (string) out.push(<span key={i} className="text-[#9fd8cf]">{string}</span>);
    else if (keyword) out.push(<span key={i} className="text-[#f2915f]">{keyword}</span>);
    else if (method) out.push(<span key={i}>.<span className="text-[#f1d58a]">{method}</span></span>);
    else if (literal) out.push(<span key={i} className="text-[#f2915f]">{literal}</span>);
    else out.push(whole);
    last = i + whole.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export function CodeBlock({ code, label = "TypeScript" }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl overflow-hidden border border-ink/80 bg-ink text-paper shadow-[0_8px_24px_-16px_rgba(15,35,51,0.6)]">
      <div className="flex items-center justify-between gap-3 px-3.5 py-2 border-b border-white/10 bg-white/[0.03]">
        <div className="flex items-center gap-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/55">{label}</span>
        </div>
        <button
          type="button"
          className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          onClick={() => navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre className="mono text-[12.5px] leading-relaxed p-4 overflow-x-auto"><code>{highlight(code)}</code></pre>
    </div>
  );
}
