// npm run check:email — the self-check of ./send.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { fromHeader, sendEmail } from "./send";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};

assert(fromHeader("סטודיו לילך", "noreply@eve.studio") === `"סטודיו לילך" <noreply@eve.studio>`, "a plain name");
assert(fromHeader(undefined, "a@b.co") === `"Eve" <a@b.co>`, "no name means Eve");
assert(fromHeader("   ", "a@b.co") === `"Eve" <a@b.co>`, "a blank name means Eve");
const injected = fromHeader('Evil"\r\nBcc: victim@x.co <spoof@x.co>', "a@b.co");
assert(!/[\r\n]/.test(injected), "a newline cannot start a header of its own");
assert(injected.endsWith("<a@b.co>") && injected.split("<").length === 2, "the name cannot add an address");
assert(fromHeader("x".repeat(200), "a@b.co").length < 100, "a name is capped");

// Off, it answers instead of throwing — and does not reach the network.
const saved = process.env.RESEND_API_KEY;
delete process.env.RESEND_API_KEY;
void sendEmail({ to: "a@b.co", subject: "s", html: "<p>h</p>", text: "t" }).then((r) => {
  assert(!r.ok && r.error === "email off", "with no config, sendEmail returns 'email off'");
  if (saved !== undefined) process.env.RESEND_API_KEY = saved;
  console.log("email send self-check passed");
});
