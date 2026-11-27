// npm run check:audit — the self-check of ./render.ts and ./types.ts (EVE-52): people are tokens filled
// at read time, and every action the log knows is written somewhere.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { AUDIT_ACTIONS, AUDIT_GROUP, AUDIT_GROUP_LABEL, type AuditPeople } from "./types";
import { actorLabel, personToken, renderLine } from "./render";

const failures: string[] = [];
const assert = (c: boolean, m: string) => {
  if (!c) failures.push(m);
};

// ── Tokens ───────────────────────────────────────────────────────────────────────────────────────
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const people: AuditPeople = { [a]: { name: "רונית", kind: "member" }, [b]: { name: null, kind: "client" } };
assert(personToken(a) === `{{p:${a}}}`, "a token names the id");
assert(renderLine(`תפקיד: ${personToken(a)} · מעצב/ת ← צוות`, people) === "תפקיד: רונית · מעצב/ת ← צוות", "a person by name");
assert(renderLine(`ביטול שיתוף: ${personToken(b)}`, people) === "ביטול שיתוף: לקוח/ה לשעבר", "a forgotten client");
assert(
  renderLine(`הסרה מהצוות: ${personToken("33333333-3333-4333-8333-333333333333")}`, people) === "הסרה מהצוות: חבר/ת צוות לשעבר",
  "an unknown id reads as a former member",
);
assert(renderLine("שינוי סיסמה", people) === "שינוי סיסמה", "a line without people is unchanged");
assert(renderLine(`${personToken(a)} ו${personToken(a)}`, people) === "רונית ורונית", "every token is filled");
assert(actorLabel(a, people) === "רונית", "the actor by name");
assert(actorLabel(b, people) === "לקוח/ה לשעבר", "a forgotten actor");
assert(actorLabel(null, people) === "המערכת", "no actor = a script");

// ── Vocabulary ───────────────────────────────────────────────────────────────────────────────────
for (const action of AUDIT_ACTIONS) {
  assert(action in AUDIT_GROUP, `${action} has a group`);
  assert(!!AUDIT_GROUP_LABEL[AUDIT_GROUP[action]], `${action}'s group has a label`);
}

// ── Coverage: every action the log knows has a writer. ──────────────────────────────────────────
// Each later task of the plan removes its own; PR A ends with none pending.
const PENDING: string[] = ["business.closed", "business.reopened", "export.downloaded"];

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.check\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}
const text = [...sources("lib"), ...sources("app")].map((p) => readFileSync(p, "utf8")).join("\n");
const writes = (action: string) => {
  for (let i = text.indexOf(`"${action}"`); i >= 0; i = text.indexOf(`"${action}"`, i + 1)) {
    if (text.slice(Math.max(0, i - 400), i).includes("recordAudit(")) return true;
  }
  return false;
};
for (const action of AUDIT_ACTIONS) {
  if (PENDING.includes(action)) continue;
  assert(writes(action), `${action} is never written (no recordAudit( … "${action}" in lib/ or app/)`);
}

if (failures.length) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exit(1);
}
console.log("check:audit — ok");
