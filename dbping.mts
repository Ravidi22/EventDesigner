import { db } from "./lib/db/index.js";
import { sessions, users } from "./lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const OUT = "C:/Users/USER/AppData/Local/Temp/claude/d--Ravid-main--Projects-temp-EventDesigner/4e9b3c20-6903-45ca-b434-8b15f7fcfda1/scratchpad";

async function main() {
  const [user] = await db()
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.kind, "studio"), eq(users.state, "active")))
    .limit(1);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await db().insert(sessions).values({ userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 3600_000) });
  try {
    for (const path of ["/dashboard", "/gantt", "/settings"]) {
      const t0 = Date.now();
      const r = spawnSync("curl", ["-s", "--max-time", "60", "-o", `${OUT}/page.html`,
        "-b", `eve_session=${token}`, "-w", "%{http_code} %{size_download}", `http://localhost:3000${path}`],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      console.log(path, "-> exit", r.status, "|", r.stdout, "| elapsed", Date.now() - t0, "ms", r.stderr || "");
      if (path === "/dashboard" && r.status === 0) {
        const { readFileSync } = await import("node:fs");
        writeFileSync(`${OUT}/dash.html`, readFileSync(`${OUT}/page.html`));
      }
    }
  } finally {
    await db().delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    console.log("probe session deleted");
  }
}
main().then(() => process.exit(0), (e) => { console.log("FAILED:", e.message); process.exit(1); });
