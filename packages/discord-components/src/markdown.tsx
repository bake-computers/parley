import type { ReactNode } from "react";

/**
 * Minimal Discord-ish markdown for Text Display mockups.
 * SSR-safe (no hooks). Supports: **bold** *italic* __underline__ ~~strike~~
 * `code` ```blocks``` ||spoiler|| [links](url) #/##/### headings -# subtext > quotes - lists
 */
export function DiscordMarkdown({ content }: { content: string }) {
  const blocks = splitBlocks(content);
  return (
    <>
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </>
  );
}

type Block =
  | { kind: "code"; lang: string; body: string }
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "subtext"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "paragraph"; text: string };

function splitBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        body.push(lines[i] ?? "");
        i++;
      }
      i++; // close fence
      out.push({ kind: "code", lang, body: body.join("\n") });
      continue;
    }

    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      out.push({
        kind: "heading",
        level: h[1]!.length as 1 | 2 | 3,
        text: h[2]!,
      });
      i++;
      continue;
    }

    if (line.startsWith("-# ")) {
      out.push({ kind: "subtext", text: line.slice(3) });
      i++;
      continue;
    }

    if (line.startsWith("> ")) {
      const parts: string[] = [line.slice(2)];
      i++;
      while (i < lines.length && (lines[i] ?? "").startsWith("> ")) {
        parts.push((lines[i] ?? "").slice(2));
        i++;
      }
      out.push({ kind: "quote", text: parts.join("\n") });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^[-*]\s+/, ""));
        i++;
      }
      out.push({ kind: "ul", items });
      continue;
    }

    // gather consecutive plain lines into a paragraph
    if (line === "") {
      i++;
      continue;
    }
    const parts: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i] !== "" &&
      !lines[i]!.startsWith("```") &&
      !/^(#{1,3})\s+/.test(lines[i]!) &&
      !lines[i]!.startsWith("-# ") &&
      !lines[i]!.startsWith("> ") &&
      !/^[-*]\s+/.test(lines[i]!)
    ) {
      parts.push(lines[i]!);
      i++;
    }
    out.push({ kind: "paragraph", text: parts.join("\n") });
  }

  return out;
}

function Block({ block }: { block: Block }) {
  switch (block.kind) {
    case "code":
      return (
        <pre>
          <code>{block.body}</code>
        </pre>
      );
    case "heading": {
      const Tag = (`h${block.level}` as "h1" | "h2" | "h3");
      return (
        <Tag>
          <Inline text={block.text} />
        </Tag>
      );
    }
    case "subtext":
      return (
        <div className="djs-subtext">
          <Inline text={block.text} />
        </div>
      );
    case "quote":
      return (
        <blockquote>
          <Inline text={block.text} />
        </blockquote>
      );
    case "ul":
      return (
        <ul>
          {block.items.map((item, i) => (
            <li key={i}>
              <Inline text={item} />
            </li>
          ))}
        </ul>
      );
    case "paragraph":
      return (
        <span>
          <Inline text={block.text} />
          {"\n"}
        </span>
      );
  }
}

function Inline({ text }: { text: string }) {
  return <>{tokenizeInline(text)}</>;
}

function tokenizeInline(text: string): ReactNode[] {
  // Order matters: code > spoiler > link > bold > underline > strike > italic
  const re =
    /(`[^`]+`)|(\|\|[\s\S]+?\|\|)|(\[[^\]]+\]\([^)]+\))|(\*\*[\s\S]+?\*\*)|(__[\s\S]+?__)|(~~[\s\S]+?~~)|(\*[^*\n]+?\*)|(_[^_\n]+?_)/g;

  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(text.slice(last, m.index));
    }
    const tok = m[0];

    if (tok.startsWith("`")) {
      nodes.push(<code key={key++}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("||")) {
      nodes.push(
        <Spoiler key={key++}>{tokenizeInline(tok.slice(2, -2))}</Spoiler>,
      );
    } else if (tok.startsWith("[")) {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      if (lm) {
        nodes.push(
          <a key={key++} href={lm[2]} target="_blank" rel="noreferrer">
            {lm[1]}
          </a>,
        );
      } else {
        nodes.push(tok);
      }
    } else if (tok.startsWith("**")) {
      nodes.push(<strong key={key++}>{tokenizeInline(tok.slice(2, -2))}</strong>);
    } else if (tok.startsWith("__")) {
      nodes.push(<u key={key++}>{tokenizeInline(tok.slice(2, -2))}</u>);
    } else if (tok.startsWith("~~")) {
      nodes.push(<s key={key++}>{tokenizeInline(tok.slice(2, -2))}</s>);
    } else if (tok.startsWith("*") || tok.startsWith("_")) {
      nodes.push(<em key={key++}>{tokenizeInline(tok.slice(1, -1))}</em>);
    } else {
      nodes.push(tok);
    }

    last = m.index + tok.length;
  }

  if (last < text.length) {
    nodes.push(text.slice(last));
  }
  return nodes;
}

/** Checkbox-driven reveal — no React state, works under SSR. */
function Spoiler({ children }: { children: ReactNode }) {
  return (
    <label className="djs-spoiler">
      <input type="checkbox" className="djs-spoiler-check" />
      <span className="djs-spoiler-text">{children}</span>
    </label>
  );
}
