// npm run check:email — the self-check of ./config.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { emailConfig } from "./config";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const saved = { ...process.env };
const set = (vars: Record<string, string | undefined>) => {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
};

set({ RESEND_API_KEY: undefined, EMAIL_FROM: undefined, APP_URL: undefined });
assert(emailConfig() === null, "nothing set means off");

set({ RESEND_API_KEY: "re_x", EMAIL_FROM: "noreply@eve.studio" });
assert(emailConfig() === null, "two of three is still off: a link with no origin cannot be sent");

set({ APP_URL: "https://eve.studio/" });
const on = emailConfig();
assert(on !== null, "all three is on");
assert(on!.appUrl === "https://eve.studio", "the trailing slash is dropped");

set({ APP_URL: "https://eve.studio/app/" });
assert(emailConfig()!.appUrl === "https://eve.studio", "a path is dropped too: links are built from the origin");

set({ APP_URL: "eve.studio" });
assert(emailConfig() === null, "an origin with no scheme is refused, not guessed");

set({ APP_URL: "javascript:alert(1)" });
assert(emailConfig() === null, "only http(s)");

set({ APP_URL: "https://eve.studio", EMAIL_FROM: "Eve <noreply@eve.studio>" });
assert(emailConfig() === null, "EMAIL_FROM is a bare address; the display name is added per message");

set({ EMAIL_FROM: "  NoReply@Eve.Studio " });
assert(emailConfig()!.fromAddress === "noreply@eve.studio", "the sender is trimmed and lowercased");

process.env = saved;
console.log("email config self-check passed");
