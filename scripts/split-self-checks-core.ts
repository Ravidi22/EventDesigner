// The codemod behind scripts/split-self-checks.ts (EVE-54): a module's inline
// `if (isMain(import.meta.url)) { … }` self-check is moved into a sibling `<module>.check.ts`.
//
// Why: the guard is a runtime call, so a bundler cannot drop the block, and every module the browser
// loads shipped its assertions to it (82 of 131 client chunks on 2026-11-27). A sibling that nothing
// in the app imports never reaches a bundle.
//
// How: the TypeScript checker says what each identifier in the block is bound to.
//   · an import of the module      → the sibling imports it the same way (type-only stays type-only)
//   · a top-level declaration       → the sibling imports it from the module; exported if it wasn't
//   · anything declared in the block, or global → left alone
// The block (and the comment above it) leaves the module, and so does every import only it used.
// Refused, untouched: a block that assigns a module variable (an import cannot be written to), and
// a "use server" module that would have to export something not async (Next refuses that file).
import ts from "typescript";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

export interface SplitResult {
  /** The module, absolute. */
  file: string;
  /** Its sibling `<module>.check.ts`, absolute. */
  checkFile: string;
  /** The module without its block; undefined when refused. */
  moduleText?: string;
  /** The sibling; undefined when refused. */
  checkText?: string;
  /** Top-level names the module had to start exporting for the sibling. */
  exported: string[];
  /** Why the file was refused. Empty when converted. */
  problems: string[];
  /** Worth a look, not a refusal. */
  notes: string[];
}

/** A top-level guard starts its line; one quoted in a doc comment (" *   if (isMain…") does not. */
const GUARD_LINE = /^if \(isMain\(import\.meta\.url\)\)/m;

export function findBlockModules(files: string[]): string[] {
  return files.filter((f) => !/\.(check\.tsx?|d\.ts)$/.test(f) && GUARD_LINE.test(readFileSync(f, "utf8")));
}

/** `a.ts` → `a.check.ts`, `a.tsx` → `a.check.tsx` (a .tsx module's block may hold JSX). */
export const checkPathOf = (path: string) => path.replace(/\.(tsx?)$/, ".check.$1");

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** `path` as a whole word of a script command: after a space or the opening quote, before a space,
 *  a separator or the closing quote — so `tsx --flag lib/a.ts` matches and `lib/a.tsx` does not. */
const inCommand = (path: string) => new RegExp(`(?<=^|[\\s"])${escapeRe(path)}(?=$|["\\s&;|])`, "g");
const CHECK_SCRIPT_LINE = /^\s*"check:[^"]+"\s*:/;

/** In package.json's text, point every `check:*` script that runs a moved module at its sibling —
 *  wherever in the command the path stands. Other scripts are never touched. */
export function retargetScripts(packageJson: string, moved: string[]): string {
  return packageJson
    .split("\n")
    .map((line) => (CHECK_SCRIPT_LINE.test(line) ? moved.reduce((l, p) => l.replace(inCommand(p), checkPathOf(p)), line) : line))
    .join("\n");
}

const norm = (p: string) => p.replace(/\\/g, "/");

function isGuard(s: ts.Statement): s is ts.IfStatement {
  if (!ts.isIfStatement(s)) return false;
  const e = s.expression;
  return (
    ts.isCallExpression(e) &&
    ts.isIdentifier(e.expression) &&
    e.expression.text === "isMain" &&
    e.arguments.length === 1 &&
    e.arguments[0].getText() === "import.meta.url"
  );
}

function directive(sf: ts.SourceFile): string | undefined {
  for (const s of sf.statements) {
    if (ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression)) {
      if (s.expression.text === "use server" || s.expression.text === "use client") return s.expression.text;
      continue;
    }
    break;
  }
  return undefined;
}

/** The top-level statement that declares `decl`, if it is one (not a member, not nested). */
function topStatementOf(decl: ts.Node, sf: ts.SourceFile): ts.Statement | undefined {
  let n: ts.Node = decl;
  while (ts.isBindingElement(n) || ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n)) n = n.parent;
  if (ts.isVariableDeclaration(n)) {
    const stmt = n.parent?.parent;
    return stmt && ts.isVariableStatement(stmt) && stmt.parent === sf ? stmt : undefined;
  }
  const declares =
    ts.isFunctionDeclaration(n) ||
    ts.isClassDeclaration(n) ||
    ts.isInterfaceDeclaration(n) ||
    ts.isTypeAliasDeclaration(n) ||
    ts.isEnumDeclaration(n);
  return declares && n.parent === sf ? (n as ts.Statement) : undefined;
}

/** The import declaration that binds `decl`, with the binding's local name. */
function importOf(decl: ts.Node): { imp: ts.ImportDeclaration; local: string } | undefined {
  // A clause's parent can also be a JSDoc `@import` tag; only real import statements count.
  const statement = (clause: ts.ImportClause) => (ts.isImportDeclaration(clause.parent) ? clause.parent : undefined);
  let clause: ts.ImportClause | undefined;
  let local: string | undefined;
  if (ts.isImportSpecifier(decl)) [clause, local] = [decl.parent.parent, decl.name.text];
  else if (ts.isNamespaceImport(decl)) [clause, local] = [decl.parent, decl.name.text];
  else if (ts.isImportClause(decl) && decl.name) [clause, local] = [decl, decl.name.text];
  const imp = clause && statement(clause);
  return imp && local ? { imp, local } : undefined;
}

const hasExport = (s: ts.Statement) =>
  !!(ts.canHaveModifiers(s) && ts.getModifiers(s)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
const hasDefault = (s: ts.Statement) =>
  !!(ts.canHaveModifiers(s) && ts.getModifiers(s)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword));

/** local name → the name it is exported under (`export { a as b }`, `export default function f`). */
function exportedNames(sf: ts.SourceFile): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of sf.statements) {
    if (ts.isExportDeclaration(s) && !s.moduleSpecifier && s.exportClause && ts.isNamedExports(s.exportClause)) {
      for (const e of s.exportClause.elements) out.set((e.propertyName ?? e.name).getText(), e.name.text);
    }
  }
  return out;
}

function isWrite(id: ts.Identifier): boolean {
  const p = id.parent;
  if (ts.isBinaryExpression(p) && p.left === id) {
    return p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && p.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
  }
  if ((ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) && p.operand === id) {
    return p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken;
  }
  return false;
}

/** The block's inside, dedented to the top level — except lines that start inside a template literal. */
function dedentBody(sf: ts.SourceFile, block: ts.Block): string {
  const text = sf.text;
  const from = block.getStart(sf) + 1;
  const to = block.end - 1;
  const templates: Array<[number, number]> = [];
  const collect = (n: ts.Node) => {
    if (ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) templates.push([n.getStart(sf), n.end]);
    ts.forEachChild(n, collect);
  };
  collect(block);
  const inTemplate = (offset: number) => templates.some(([a, b]) => offset > a && offset < b);

  const lines: Array<{ text: string; frozen: boolean }> = [];
  let offset = from;
  for (const line of text.slice(from, to).split("\n")) {
    lines.push({ text: line, frozen: inTemplate(offset) });
    offset += line.length + 1;
  }
  const indents = lines.filter((l) => !l.frozen && l.text.trim() !== "").map((l) => /^[ \t]*/.exec(l.text)![0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  const out = lines.map((l) => (l.frozen ? l.text : l.text.slice(Math.min(cut, /^[ \t]*/.exec(l.text)![0].length))));
  while (out.length && out[0].trim() === "") out.shift();
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  return out.join("\n");
}

function importLine(imp: ts.ImportDeclaration, keep: (local: string) => boolean): string | undefined {
  const clause = imp.importClause;
  if (!clause) return undefined;
  const parts: string[] = [];
  if (clause.name && keep(clause.name.text)) parts.push(clause.name.text);
  const nb = clause.namedBindings;
  if (nb && ts.isNamespaceImport(nb) && keep(nb.name.text)) parts.push(`* as ${nb.name.text}`);
  if (nb && ts.isNamedImports(nb)) {
    const named = nb.elements.filter((e) => keep(e.name.text)).map((e) => e.getText());
    if (named.length) parts.push(`{ ${named.join(", ")} }`);
  }
  if (!parts.length) return undefined;
  const attrs = imp.attributes ? ` ${imp.attributes.getText()}` : "";
  return `import ${clause.isTypeOnly ? "type " : ""}${parts.join(", ")} from ${imp.moduleSpecifier.getText()}${attrs};`;
}

interface Edit {
  start: number;
  end: number;
  text: string;
}
const applyEdits = (text: string, edits: Edit[]) =>
  [...edits].sort((a, b) => b.start - a.start).reduce((t, e) => t.slice(0, e.start) + e.text + t.slice(e.end), text);

/** Drop the bindings in `candidates` that `text` no longer uses outside its imports. */
function pruneImports(file: string, text: string, candidates: Set<string>): string {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const used = new Set<string>();
  // Names that look like a binding but are not a use of it: `export { x } from "…"` re-exports
  // another module's x, and `o.x`, `{ x: 1 }`, `interface { x }` are property names.
  const notAUse = (id: ts.Identifier) => {
    const p = id.parent;
    return (
      ((ts.isPropertyAccessExpression(p) || ts.isQualifiedName(p)) && (ts.isPropertyAccessExpression(p) ? p.name : p.right) === id) ||
      ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p)) && p.name === id)
    );
  };
  const walk = (n: ts.Node) => {
    if (ts.isImportDeclaration(n)) return;
    if (ts.isExportDeclaration(n) && n.moduleSpecifier) return;
    if (ts.isIdentifier(n) && !notAUse(n)) used.add(n.text);
    ts.forEachChild(n, walk);
  };
  walk(sf);
  const keep = (local: string) => !candidates.has(local) || used.has(local);
  const edits: Edit[] = [];
  for (const imp of sf.statements.filter(ts.isImportDeclaration)) {
    if (!imp.importClause) continue;
    const before = importLine(imp, () => true);
    const after = importLine(imp, keep);
    if (after === before) continue;
    if (after === undefined) {
      let end = imp.end;
      if (text[end] === "\r") end++;
      if (text[end] === "\n") end++;
      edits.push({ start: imp.getStart(sf), end, text: "" });
    } else {
      edits.push({ start: imp.getStart(sf), end: imp.end, text: after });
    }
  }
  return applyEdits(text, edits);
}

function splitOne(
  program: ts.Program,
  checker: ts.TypeChecker,
  file: string,
  scripts: Record<string, string>,
  rel: (abs: string) => string,
): SplitResult {
  const checkFile = checkPathOf(file);
  const result: SplitResult = { file, checkFile, exported: [], problems: [], notes: [] };
  const sf = program.getSourceFile(norm(file));
  if (!sf) return { ...result, problems: ["not in the program"] };
  const text = sf.text;

  const guards = sf.statements.filter(isGuard);
  if (guards.length !== 1) return { ...result, problems: [`${guards.length} top-level isMain blocks — expected one`] };
  const guard = guards[0];
  if (guard.elseStatement || !ts.isBlock(guard.thenStatement)) return { ...result, problems: ["the isMain guard is not a plain if-block"] };
  if (existsSync(checkFile)) return { ...result, problems: [`${basename(checkFile)} already exists`] };
  const block = guard.thenStatement;
  const inBlock = (n: ts.Node) => n.pos >= block.pos && n.end <= block.end;

  // ── what the block refers to ──
  const imported = new Map<ts.ImportDeclaration, Set<string>>();
  const locals = new Map<string, ts.Statement[]>();
  const written = new Set<string>();
  const visit = (n: ts.Node) => {
    if (ts.isIdentifier(n)) {
      const sym =
        ts.isShorthandPropertyAssignment(n.parent) && n.parent.name === n
          ? checker.getShorthandAssignmentValueSymbol(n.parent)
          : checker.getSymbolAtLocation(n);
      for (const d of sym?.declarations ?? []) {
        if (d.getSourceFile() !== sf || inBlock(d)) continue;
        const imp = importOf(d);
        if (imp) {
          if (!imported.has(imp.imp)) imported.set(imp.imp, new Set());
          imported.get(imp.imp)!.add(imp.local);
          continue;
        }
        const stmt = topStatementOf(d, sf);
        if (!stmt || stmt === guard) continue;
        // The name as the block writes it: a default export's symbol is called "default".
        const list = locals.get(n.text) ?? [];
        if (!list.includes(stmt)) list.push(stmt);
        locals.set(n.text, list);
        if (isWrite(n)) written.add(n.text);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(block);

  if (written.size) {
    return { ...result, problems: [`the block assigns module variable(s) ${[...written].join(", ")} — a sibling cannot write an import; move it by hand`] };
  }

  // ── what the module must export ──
  const aliases = exportedNames(sf);
  const toExport: ts.Statement[] = [];
  const selfNames: Array<{ local: string; exported: string; type: boolean }> = [];
  for (const [name, stmts] of locals) {
    const type = stmts.every((s) => ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s));
    if (stmts.some(hasDefault)) {
      selfNames.push({ local: name, exported: "default", type });
    } else if (stmts.some(hasExport)) {
      selfNames.push({ local: name, exported: name, type });
    } else if (aliases.has(name)) {
      selfNames.push({ local: name, exported: aliases.get(name)!, type });
    } else {
      selfNames.push({ local: name, exported: name, type });
      for (const s of stmts) if (!toExport.includes(s)) toExport.push(s); // `const A = 1, B = 2` once
      result.exported.push(name);
    }
  }
  if (directive(sf) === "use server") {
    const bad = toExport.filter(
      (s) => !(ts.isFunctionDeclaration(s) && ts.getModifiers(s)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)),
    );
    if (bad.length) return { ...result, exported: [], problems: ['a "use server" module would have to export something not async — move it by hand'] };
  }

  const blockText = text.slice(block.pos, block.end);
  if (blockText.includes("import.meta")) result.notes.push("uses import.meta — now read from the sibling (same folder)");
  if (/\b__(filename|dirname)\b/.test(blockText)) result.notes.push("uses __filename/__dirname");

  // ── the module ──
  const leading = ts.getLeadingCommentRanges(text, guard.pos) ?? [];
  const firstNewline = text.slice(guard.pos, guard.getStart(sf)).indexOf("\n");
  const cutFrom = firstNewline >= 0 ? guard.pos + firstNewline : guard.pos;
  const edits: Edit[] = [{ start: cutFrom, end: guard.end, text: "" }];
  for (const s of toExport) edits.push({ start: s.getStart(sf), end: s.getStart(sf), text: "export " });
  const candidates = new Set<string>(["isMain"]);
  for (const names of imported.values()) for (const n of names) candidates.add(n);
  let moduleText = pruneImports(file, applyEdits(text, edits), candidates);
  if (!moduleText.endsWith("\n")) moduleText += "\n";

  // ── the sibling ──
  const base = basename(file).replace(/\.tsx?$/, "");
  const path = rel(file);
  const runners = Object.entries(scripts)
    .filter(([name, cmd]) => name.startsWith("check:") && inCommand(path).test(cmd))
    .map(([name]) => name);
  if (!runners.length) result.notes.push("no package.json script runs it");
  const head = runners.length
    ? `// npm run ${runners.join(" / ")} — the self-check of ./${basename(file)}, kept beside it so it never ships in the browser bundle (EVE-54).`
    : `// The self-check of ./${basename(file)}, kept beside it so it never ships in the browser bundle (EVE-54).`;

  const lines: string[] = [head];
  for (const imp of sf.statements.filter(ts.isImportDeclaration)) {
    const names = imported.get(imp);
    if (!names) continue;
    const line = importLine(imp, (local) => names.has(local));
    if (line) lines.push(line);
  }
  if (selfNames.length) {
    const def = selfNames.find((n) => n.exported === "default");
    const named = selfNames
      .filter((n) => n.exported !== "default")
      .sort((a, b) => Number(a.type) - Number(b.type) || a.local.localeCompare(b.local))
      .map((n) => `${n.type ? "type " : ""}${n.exported === n.local ? n.local : `${n.exported} as ${n.local}`}`);
    const parts = [def?.local, named.length ? `{ ${named.join(", ")} }` : undefined].filter(Boolean);
    lines.push(`import ${parts.join(", ")} from "./${base}";`);
  } else {
    // It names nothing of the module, but the module's top level must still run under the check.
    lines.push(`import "./${base}";`);
  }
  lines.push("");
  const comments = leading.map((c) => text.slice(c.pos, c.end)).join("\n");
  if (comments) lines.push(comments);
  lines.push(dedentBody(sf, block), "");

  return { ...result, moduleText, checkText: lines.join("\n") };
}

/** Split every module in `files`. Reads, never writes. `rel` turns an absolute path into the one package.json uses. */
export function splitAll(files: string[], scripts: Record<string, string>, rel: (abs: string) => string): SplitResult[] {
  const options: ts.CompilerOptions = {
    noEmit: true,
    noResolve: true,
    allowJs: false,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
  };
  // Every position below is worked out on LF text; a CRLF file (a Windows checkout with
  // core.autocrlf) is read as LF and written back as CRLF, so no cut leaves a lone CR behind.
  const crlf = new Set<string>();
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, language, onError, shouldCreate) => {
    const raw = ts.sys.readFile(fileName);
    if (raw === undefined) return read(fileName, language, onError, shouldCreate);
    if (raw.includes("\r\n")) crlf.add(norm(fileName));
    return ts.createSourceFile(fileName, raw.replace(/\r\n/g, "\n"), language, true);
  };
  const program = ts.createProgram(files.map(norm), options, host);
  const checker = program.getTypeChecker();
  const toCrlf = (s: string | undefined) => s?.replace(/\n/g, "\r\n");
  return files.map((f) => {
    const r = splitOne(program, checker, f, scripts, rel);
    return crlf.has(norm(f)) ? { ...r, moduleText: toCrlf(r.moduleText), checkText: toCrlf(r.checkText) } : r;
  });
}
