import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { Lexer, lexer, type Token, type Tokens } from "marked";

// Enforces specs/spec-policy.md's procedural reference-integrity rules. Once
// that policy declares the proof system, the same checks cover the specs/proofs
// union and the mirror invariant becomes mandatory.

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const SPECS_ROOT = path.join(REPO_ROOT, "specs");
const PROOFS_ROOT = path.join(REPO_ROOT, "proofs");
const PROOFS_ENABLED = readFileSync(path.join(SPECS_ROOT, "spec-policy.md"), "utf8")
  .includes("\n## Proofs\n");
const ASSERTION_HEADING = /^#{1,6}\s+(?:Test assertions?(?::.*)?|Acceptance (?:test )?criteria(?::.*)?|Architecture test assertions?(?::.*)?)\s*$/im;
const ANCHOR_DEFINITION = /(?<![#\w-])\^([A-Za-z0-9-]+)(?![\w-])[ \t]*$/gm;
const CODE_EXTENSIONS = new Set([".cjs", ".js", ".mjs", ".ts", ".tsx"]);

function walk(dir: string, predicate: (file: string) => boolean = () => true): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") return [];
      return walk(absolute, predicate);
    }
    return entry.isFile() && predicate(absolute) ? [absolute] : [];
  });
}

const specMarkdown = walk(SPECS_ROOT, (file) => file.endsWith(".md"));
const proofMarkdown = walk(PROOFS_ROOT, (file) => file.endsWith(".md"));
const authorityMarkdown = [...specMarkdown, ...proofMarkdown];
// Guides are not authority; only their links are checked, so a moved guide fails loudly.
const guideMarkdown = [
  path.join(REPO_ROOT, "docs", "README.md"),
  ...walk(path.join(REPO_ROOT, "docs", "guides"), (file) => file.endsWith(".md")),
].filter(existsSync);

// Code is excluded within the parser's blocks, so unmatched backticks cannot
// reach into a later paragraph, heading or fence. Link labels remain intact.
function inlineProse(tokens: readonly Token[]): string {
  return tokens.map((token) => {
    if (token.type === "codespan") return "\0";
    if (token.type === "em" || token.type === "strong" || token.type === "del") {
      const span = token as Tokens.Em | Tokens.Strong | Tokens.Del;
      const width = span.type === "strong" || (span.type === "del" && span.raw.startsWith("~~")) ? 2 : 1;
      return span.raw.slice(0, width) + inlineProse(span.tokens) + span.raw.slice(-width);
    }
    return token.raw;
  }).join("");
}

function proseSegments(source: string): string[] {
  const segments: string[] = [];
  function append(prose: string, prefix: string): void {
    // Keep code-separated fragments separate for references(). Container prefixes
    // prevent nested headings from satisfying the top-level assertion check.
    // Parser blocks end at a real line boundary or EOF, even when a list
    // text token omits its trailing newline. Restore that boundary before splitting.
    const block = prose.endsWith("\n") ? prose : prose + "\n";
    for (const segment of block.split("\0")) {
      segments.push(prefix ? segment.replace(/^/gm, prefix) : segment);
    }
  }
  function visit(tokens: readonly Token[], prefix = ""): void {
    for (const token of tokens) {
      if (token.type === "code") continue;
      if (token.type === "blockquote") {
        visit((token as Tokens.Blockquote).tokens, prefix + "> ");
      } else if (token.type === "list") {
        for (const item of (token as Tokens.List).items) visit(item.tokens, prefix + "  ");
      } else if (token.type === "table") {
        const table = token as Tokens.Table;
        for (const cell of [...table.header, ...table.rows.flat()]) {
          // Cell boundaries also block headings and end-of-line anchors; the
          // original Markdown table has delimiters surrounding these contents.
          append("|" + inlineProse(cell.tokens) + "|", prefix);
        }
      } else {
        // These raw blocks retain their Markdown syntax. Unlike container child
        // offsets, they can be lexed independently without locating them in source.
        append(inlineProse(Lexer.lexInline(token.raw)), prefix);
      }
    }
  }
  visit(lexer(source));
  return segments;
}

function references(file: string): string[] {
  const out: string[] = [];
  for (const segment of proseSegments(readFileSync(file, "utf8"))) {
    for (const match of segment.matchAll(/\[[^\]]*\]\(([^)\s#]+(?:#[^)]*)?)\)/g)) {
      out.push(match[1]!.replace(/\\$/, ""));
    }
  }
  return out;
}

function proofBearingSpecs(): string[] {
  return ["product", "arch", "ui"]
    .flatMap((area) => walk(path.join(SPECS_ROOT, area), (file) => file.endsWith(".md")))
    .filter((file) => {
      const basename = path.basename(file);
      return !basename.startsWith("runbook-") && !basename.startsWith("explainer-");
    })
    .filter((file) => {
      const relative = path.relative(SPECS_ROOT, file).split(path.sep);
      return relative[0] !== "ui" || path.basename(file) === "index.md";
    });
}

function proofBearingProofs(): string[] {
  return ["product", "arch", "ui"]
    .flatMap((area) => walk(path.join(PROOFS_ROOT, area), (file) => file.endsWith(".md")));
}

function relativeMirror(file: string, fromRoot: string, toRoot: string): string {
  return path.join(toRoot, path.relative(fromRoot, file));
}

function blockAnchorExists(file: string, anchor: string): boolean {
  if (!existsSync(file) || !statSync(file).isFile()) return false;
  const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![#\\w-])\\^${escaped}(?![\\w-])[ \\t]*$`, "m");
  // Keep removed code from creating a line ending or joining neighboring prose.
  return pattern.test(proseSegments(readFileSync(file, "utf8")).join("\0"));
}

describe("prose reference extraction", () => {
  test.each([
    ["single-line inline example", "`[example](missing-file.md)`\n", []],
    ["multiline inline example with LF", "`Example syntax:\n[example](missing-file.md)\nend`\n", []],
    ["multiline inline example with CRLF", "`Example syntax:\r\n[example](missing-file.md)\r\nend`\r\n", []],
    ["real link after a multiline inline example", "`Example syntax:\n[example](missing-file.md)\nend`\n\n[real](real-file.md)\n", ["real-file.md"]],
    ["link label containing inline code", "[the `code` label](real-file.md)\n", ["real-file.md"]],
    ["multiline code inside a real link label", "[the `code\nlabel`](real-file.md)\n", ["real-file.md"]],
    ["unclosed span cannot cross a blank paragraph", "`Unclosed example\n\n[real](real-file.md)\n\n`later code`\n", ["real-file.md"]],
    ["unclosed span before a fenced example", "`Unclosed example:\n[real](real-file.md)\n\n```text\n[example](missing-file.md)\n```\n", ["real-file.md"]],
    ["unclosed span cannot cross whitespace-only paragraphs", "`Unclosed example\n  \n[real](real-file.md)\n \t\n`later code`\n", ["real-file.md"]],
    ["unclosed span before an interrupting fenced example", "`Unclosed example:\n[real](real-file.md)\n```text\n[example](missing-file.md)\n```\n", ["real-file.md"]],
    ["unclosed span before an interrupting heading", "`Unclosed example:\n[real](real-file.md)\n# `Heading`\n", ["real-file.md"]],
    ["fenced example nested in a blockquote", "> ```text\n> line\n> line\n> line\n> line\n> line\n> line\n> line\n> line\n> line\n> line\n> line\n> line\n> line\n> line\n> line\n> line\n> line\n> line\n> line\n> line\n> [example](missing-file.md)\n> ```\n", []],
    ["nested code cannot consume a later repeated link label", "> `wrapped\n> code`\n\n[the `wrapped\ncode` label](real-file.md)\n", ["real-file.md"]],
    ["tab-indented list code preserves its following real link", "- lead\n\t`x`[real](real-file.md)\n", ["real-file.md"]],
    ["emphasized code excludes examples but retains prose links", "**`[example](missing-file.md)`** [real](real-file.md)\n", ["real-file.md"]],
    ["table code with an escaped pipe excludes example links", "| Example |\n| --- |\n| `a\\|[example](missing-file.md)` |\n", []],
    ["unclosed backtick is literal text", "`Unclosed example:\n[real](real-file.md)\n", ["real-file.md"]],
  ] as const)("extracts only prose references: %s", (_label, source, expected) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "tv-prose-references-"));
    try {
      const file = path.join(directory, "fixture.md");
      writeFileSync(file, source);
      expect(references(file)).toEqual(expected);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("prose assertion heading boundaries", () => {
  test.each([
    ["top-level heading", "## Test assertions\n", true],
    ["quoted heading", "> ## Test assertions\n", false],
    ["list heading", "- ## Test assertions\n", false],
    ["heading text inside code", "`## Test assertions`\n", false],
  ] as const)("retains heading context: %s", (_label, source, expected) => {
    expect(proseSegments(source).some((segment) => ASSERTION_HEADING.test(segment))).toBe(expected);
  });
});

describe("block reference target resolution", () => {
  test.each([
    ["real prose", "A statement. ^fixture-anchor\n", true],
    ["backtick fenced example", "```text\nExample syntax. ^fixture-anchor\n```\n", false],
    ["tilde fenced example", "~~~text\nExample syntax. ^fixture-anchor\n~~~\n", false],
    ["inline example", "`Example syntax. ^fixture-anchor`\n", false],
    ["real prose after a fenced example", "```text\nExample syntax. ^fixture-anchor\n```\n\nA real statement. ^fixture-anchor\n", true],
    ["anchor before inline code on the same line", "A statement. ^fixture-anchor`inline code` continuation.\n", false],
    ["anchor at a list-item boundary", "- A statement. ^fixture-anchor\n- Another statement.\n", true],
    ["missing anchor", "A statement with no block reference.\n", false],
  ] as const)("resolves only prose anchors: %s", (_label, source, expected) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "tv-block-reference-"));
    try {
      const file = path.join(directory, "fixture.md");
      writeFileSync(file, source);
      expect(blockAnchorExists(file, "fixture-anchor")).toBe(expected);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("spec and proof reference integrity", () => {
  test("authority documents carry no wikilink syntax", () => {
    const offenders = authorityMarkdown.flatMap((file) =>
      proseSegments(readFileSync(file, "utf8")).some((segment) => segment.includes("[["))
        ? [path.relative(REPO_ROOT, file)]
        : []
    );
    expect(offenders).toEqual([]);
  });

  test("every relative link resolves to an existing file", () => {
    const broken: string[] = [];
    for (const file of [...authorityMarkdown, ...guideMarkdown]) {
      for (const href of references(file)) {
        if (/^[a-z][a-z+.-]*:/i.test(href)) continue;
        const [target] = href.split("#");
        if (target === "") continue;
        if (path.isAbsolute(target!)) {
          broken.push(`${path.relative(REPO_ROOT, file)} -> ${href}`);
          continue;
        }
        const resolved = path.resolve(path.dirname(file), target!);
        if (!existsSync(resolved) || !statSync(resolved).isFile()) {
          broken.push(`${path.relative(REPO_ROOT, file)} -> ${href}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  test("every cited block ref exists in its target", () => {
    const dangling: string[] = [];
    for (const file of authorityMarkdown) {
      for (const href of references(file)) {
        if (/^[a-z][a-z+.-]*:/i.test(href)) continue;
        const hash = href.indexOf("#");
        if (hash === -1) continue;
        const anchor = href.slice(hash + 1);
        if (!anchor.startsWith("^")) continue;
        const target = href.slice(0, hash);
        if (path.isAbsolute(target)) continue;
        const resolved = target === "" ? file : path.resolve(path.dirname(file), target);
        if (!blockAnchorExists(resolved, anchor.slice(1))) {
          dangling.push(`${path.relative(REPO_ROOT, file)} -> ${href}`);
        }
      }
    }
    expect(dangling).toEqual([]);
  });

  test("block refs are unique across specs and proofs", () => {
    const owners = new Map<string, string[]>();
    for (const file of authorityMarkdown) {
      for (const segment of proseSegments(readFileSync(file, "utf8"))) {
        for (const match of segment.matchAll(ANCHOR_DEFINITION)) {
          const owner = `${path.relative(REPO_ROOT, file)}:${segment.slice(0, match.index).split("\n").length}`;
          owners.set(match[1]!, [...(owners.get(match[1]!) ?? []), owner]);
        }
      }
    }
    const duplicates = [...owners.entries()]
      .filter(([, locations]) => locations.length > 1)
      .map(([anchor, locations]) => `^${anchor}: ${locations.join(", ")}`)
      .sort();
    expect(duplicates).toEqual([]);
  });

  test("the proof tree mirrors every proof-bearing spec and has no orphan", () => {
    if (!PROOFS_ENABLED) return;
    const missing = proofBearingSpecs()
      .map((file) => relativeMirror(file, SPECS_ROOT, PROOFS_ROOT))
      .filter((file) => !existsSync(file))
      .map((file) => path.relative(REPO_ROOT, file));
    const orphaned = proofBearingProofs()
      .map((file) => relativeMirror(file, PROOFS_ROOT, SPECS_ROOT))
      .filter((file) => !existsSync(file))
      .map((file) => path.relative(REPO_ROOT, file));
    expect({ missing, orphaned }).toEqual({ missing: [], orphaned: [] });
  });

  test("every proof declares its exact mirrored spec", () => {
    if (!PROOFS_ENABLED) return;
    const broken: string[] = [];
    for (const proof of proofBearingProofs()) {
      const source = readFileSync(proof, "utf8");
      const match = source.match(/^Proves \[[^\]]+\]\(([^)\s]+)\)\.\s*$/m);
      const expected = relativeMirror(proof, PROOFS_ROOT, SPECS_ROOT);
      const resolved = match ? path.resolve(path.dirname(proof), match[1]!.split("#")[0]!) : null;
      if (resolved !== expected) broken.push(path.relative(REPO_ROOT, proof));
    }
    expect(broken).toEqual([]);
  });

  test("specs carry no assertion headings", () => {
    if (!PROOFS_ENABLED) return;
    const offenders = specMarkdown.flatMap((file) =>
      proseSegments(readFileSync(file, "utf8")).some((segment) => ASSERTION_HEADING.test(segment))
        ? [path.relative(REPO_ROOT, file)]
        : []
    );
    expect(offenders).toEqual([]);
  });

  test("test-code citations resolve to spec or proof anchors", () => {
    if (!PROOFS_ENABLED) return;
    const dangling: string[] = [];
    const code = [path.join(REPO_ROOT, "packages"), path.join(REPO_ROOT, "test")]
      .flatMap((root) => walk(root, (file) => CODE_EXTENSIONS.has(path.extname(file))));
    for (const file of code) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\b(specs|proofs)\/((?:product|arch|ui)\/[^#\s"'`()\]}>]+\.md)#\^([A-Za-z0-9-]+)/g)) {
        const target = path.join(REPO_ROOT, match[1]!, match[2]!);
        if (!blockAnchorExists(target, match[3]!)) {
          dangling.push(`${path.relative(REPO_ROOT, file)} -> ${match[0]}`);
        }
      }
    }
    expect(dangling).toEqual([]);
  });
});
