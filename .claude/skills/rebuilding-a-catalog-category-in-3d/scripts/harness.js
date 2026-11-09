// Headless check of a catalog category through the app (copy this file into a SCRATCHPAD folder,
// never run it from the repo):
//   cd <scratchpad>/ui && npm i playwright@1.49.1      # the driver only; it drives the system Chrome
//   node my-run.js                                       # a script that requires ./harness
// The dev server must answer on http://localhost:3000 (npm run dev). Logs in as the dev SUPPLIER
// (buki@bukiflowers.dev), opens a NEW unsaved row in `category`, opens its shape editor. NEVER press
// save here — rows are written by add-rows.template.mts as the studio.
//
// Example run (see the pendants one in SKILL.md's round, step 2):
//   const { launch, login, openDraft, openEditor } = require("./harness");
//   const { browser, page, logs } = await launch();
//   await login(page); await openDraft(page, "סידורי פרחים");
//   await page.fill("#p-name", "בדיקה");
//   const t = await openEditor(page);
//   await t.size(60, 45);                               // ⌀ / width in cm, height in cm
//   await t.deselect(); await t.chip(/^ציור(?! חופשי)/).click();   // the item's ציור panel
//   await t.modal.locator('[role="radiogroup"][aria-label="<tiles title>"] button[title="<tile>"]').first().click();
//   await t.esc(); await t.shotPlan("shots/x-plan.png");
//   await t.open3d(); await t.shot3d("shots/x-3d.png", 7000);
//   console.log(logs); await browser.close();
// Selectors that bite: a Popover chip has no aria-label (match by text); a Select is its
// button[aria-label=…] then [role="option"]; the plan canvas is the LARGEST svg in the dialog; the
// 3D toggle's label flips once pressed, so key the modal on `dialog[open]`, never on it.
const { chromium } = require("playwright");

async function launch() {
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const logs = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type()) && !/THREE\./.test(m.text())) logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e).slice(0, 300)}`));
  return { browser, page, logs };
}

async function login(page) {
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "buki@bukiflowers.dev");
  await page.fill('input[type="password"]', "buki-flowers-2026");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
}

async function openDraft(page, category = "שנדליירים") {
  await page.goto("http://localhost:3000/catalog", { waitUntil: "networkidle" });
  await page.click('button[aria-label="הוספת מוצר חדש"]');
  await page.waitForTimeout(800);
  await page.click("#p-cat");
  await page.waitForTimeout(300);
  await page.locator('[role="option"]', { hasText: category }).first().click();
  await page.waitForTimeout(400);
}

async function openEditor(page) {
  await page.click('button[aria-label="עריכת המראה על התוכנית"]');
  await page.waitForTimeout(1500);
  const modal = page.locator("dialog[open]").last();
  const tools = {
    modal,
    chip: (re) => modal.locator("button", { hasText: re }).first(),
    esc: async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(250); },
    svgBox: async () => modal.locator("svg").evaluateAll((els) => { let best = null; for (const el of els) { const r = el.getBoundingClientRect(); if (!best || r.width * r.height > best.width * best.height) best = { x: r.x, y: r.y, width: r.width, height: r.height }; } return best; }),
  };
  tools.at = async (fx, fy) => { const b = await tools.svgBox(); return [b.x + b.width * fx, b.y + b.height * fy]; };
  tools.selectBase = async () => {
    await page.mouse.click(...(await tools.at(0.5, 0.5)));
    await page.keyboard.press("Control+a");
    await page.waitForTimeout(400);
  };
  tools.deselect = async () => { await page.mouse.click(...(await tools.at(0.06, 0.94))); await page.waitForTimeout(400); };
  tools.size = async (diameterCm, heightCm) => {
    await tools.selectBase();
    await tools.chip(/^מידות/).click(); await page.waitForTimeout(300);
    const d = modal.locator('input[id$="-d"]').first();
    await d.fill(String(diameterCm)); await d.press("Tab"); await page.waitForTimeout(400);
    await tools.esc();
    await tools.chip(/^גובה/).click(); await page.waitForTimeout(300);
    const h = modal.locator('input[id$="-height"]').first();
    await h.fill(String(heightCm)); await h.press("Tab"); await page.waitForTimeout(400);
    await tools.esc();
  };
  tools.open3d = async () => {
    await page.click('button[aria-label="תלת-ממד — הפריט בחדר"]');
    await page.waitForSelector("[data-scene-pane] canvas", { timeout: 30000 });
    await page.waitForTimeout(3000);
  };
  tools.shot3d = async (path, wait = 5000) => { await page.waitForTimeout(wait); await page.locator("[data-scene-pane]").screenshot({ path }); };
  tools.shotPlan = async (path) => { const b = await tools.svgBox(); await page.screenshot({ path, clip: b }); };
  return tools;
}

module.exports = { launch, login, openDraft, openEditor };
