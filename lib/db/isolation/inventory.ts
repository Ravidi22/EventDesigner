// Every server action in the app, read off the source (EVE-23). The isolation test checks this list
// against its cases, so an action added without a case fails the test instead of slipping past it.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".claude", ".superpowers"]);

function walk(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), out);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(join(dir, entry.name));
    }
  }
}

/** True when the file's first statement is the "use server" directive (comments may precede it). */
function isServerModule(source: string): boolean {
  const code = source.replace(/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
  return /^["']use server["'];?/.test(code);
}

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind) =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);

function bindingNames(name: ts.BindingName, out: string[]): void {
  if (ts.isIdentifier(name)) out.push(name.text);
  else for (const element of name.elements) if (!ts.isOmittedExpression(element)) bindingNames(element.name, out);
}

/** Every name a module exports at runtime, read off its syntax tree — `export function`, `export
 *  const/let/var`, `export { a, b as c }`, `export default`; a regex missed all but the first two
 *  (PR #2 review). Type-only exports are not runtime exports. `export * from` cannot be listed from one
 *  file, so it comes back as "*", which no case is named after: the run fails and says where. */
export function exportedNames(source: string, fileName: string): string[] {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, kind);
  const names: string[] = [];
  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
      names.push(hasModifier(statement, ts.SyntaxKind.DefaultKeyword) ? "default" : (statement.name?.text ?? "default"));
    } else if (ts.isVariableStatement(statement)) {
      if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
      for (const declaration of statement.declarationList.declarations) bindingNames(declaration.name, names);
    } else if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      const clause = statement.exportClause;
      if (!clause) names.push("*");
      else if (ts.isNamedExports(clause)) {
        for (const element of clause.elements) if (!element.isTypeOnly) names.push(element.name.text);
      } else names.push(clause.name.text);
    } else if (ts.isExportAssignment(statement)) {
      names.push("default");
    }
  }
  return names;
}

/** `"<path>#<name>"` for every runtime export of every "use server" module under lib/ and app/. */
export function serverActions(root: string): string[] {
  const files: string[] = [];
  for (const top of ["lib", "app"]) walk(join(root, top), files);
  const keys: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    if (!isServerModule(source)) continue;
    const path = relative(root, file).split("\\").join("/");
    for (const name of exportedNames(source, file)) keys.push(`${path}#${name}`);
  }
  return keys.sort();
}

/** The actions that have no case, in order. */
export function missingCases(actions: readonly string[], cases: Readonly<Record<string, unknown>>): string[] {
  return actions.filter((key) => !(key in cases));
}
