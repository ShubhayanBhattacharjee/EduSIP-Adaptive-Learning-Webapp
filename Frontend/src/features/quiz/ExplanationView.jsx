import React, { useMemo } from "react";
import { CheckCircle2, XCircle, Lightbulb, BookOpen, Sparkles, Target, ChevronRight } from "lucide-react";

/* **bold** and `code` inside a line */
const inline = (text) => {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith("**") ? <strong key={i++}>{t.slice(2, -2)}</strong> : <code key={i++}>{t.slice(1, -1)}</code>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
};

const BULLET = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/;
const HEADING_BOLD = /^\s*(?:[-*•]\s+)?\*\*(.+?)\*\*:?\s*$/; // a line that is only bold = section title
const HEADING_MD = /^\s*#{1,4}\s+(.+?)\s*$/;                 // ## Title
const VERDICT = /❌|✅|⚠️|^[\s\W]*(incorrect|correct|right|wrong)/i;

const parse = (raw) => {
  const lines = String(raw || "").replace(/\r/g, "").split("\n");
  let verdict = null;
  const sections = [];
  let cur = null;
  const ensure = () => {
    if (!cur) { cur = { title: "", items: [] }; sections.push(cur); }
    return cur;
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)[0].length;
    const h = line.match(HEADING_BOLD) || line.match(HEADING_MD);
    if (h && indent < 2) {
      cur = { title: h[1].replace(/\*\*/g, "").trim(), items: [] };
      sections.push(cur);
      continue;
    }
    if (!cur && !verdict && line.length < 60 && VERDICT.test(line)) { verdict = line.trim(); continue; }
    const b = line.match(BULLET);
    if (b) ensure().items.push({ type: "li", text: b[3], level: b[1].length >= 4 ? 1 : 0 });
    else ensure().items.push({ type: "p", text: line.trim() });
  }
  return { verdict, sections };
};

const kindOf = (t = "") => {
  if (/wrong|mistake|why not/i.test(t)) return "wrong";
  if (/example|real/i.test(t)) return "example";
  if (/tip|trick|remember|mnemonic/i.test(t)) return "tip";
  if (/takeaway|summary|key point/i.test(t)) return "takeaway";
  if (/correct|concept|right|why/i.test(t)) return "concept";
  return "default";
};

const ICONS = { wrong: XCircle, concept: Lightbulb, example: BookOpen, tip: Sparkles, takeaway: Target, default: ChevronRight };

const renderItems = (items) => {
  const out = [];
  let list = null;
  items.forEach((it, i) => {
    if (it.type === "li") {
      if (!list) { list = []; out.push({ ul: list, key: i }); }
      list.push(it);
    } else {
      list = null;
      out.push({ p: it.text, key: i });
    }
  });
  return out.map((o) =>
    o.ul
      ? <ul key={o.key}>{o.ul.map((li, j) => <li key={j} className={li.level ? "sub" : ""}>{inline(li.text)}</li>)}</ul>
      : <p key={o.key}>{inline(o.p)}</p>
  );
};

const ExplanationView = ({ text }) => {
  const { verdict, sections } = useMemo(() => parse(text), [text]);
  const bad = verdict ? /❌|incorrect|wrong/i.test(verdict) : false;
  const cleanVerdict = verdict ? verdict.replace(/^[^\p{L}\p{N}]+/u, "") : "";

  return (
    <div className="qx">
      {verdict && (
        <div className={`qx-verdict ${bad ? "bad" : "good"}`}>
          {bad ? <XCircle size={16} /> : <CheckCircle2 size={16} />} {cleanVerdict}
        </div>
      )}
      {sections.map((s, i) => {
        const kind = kindOf(s.title);
        const Icon = ICONS[kind];
        return (
          <section className={`qx-sec qx-${kind}`} key={i}>
            {s.title && (
              <h5 className="qx-title">
                <span className="qx-ico"><Icon size={15} /></span>
                {inline(s.title)}
              </h5>
            )}
            <div className="qx-body">{renderItems(s.items)}</div>
          </section>
        );
      })}
    </div>
  );
};

export default ExplanationView;