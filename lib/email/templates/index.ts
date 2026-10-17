// Every message the app sends, in one place — and `npm run check:email`, which renders each of them.
export { invitationEmail } from "./invitation";
export { clientInvitationEmail } from "./client-invitation";
export { resetPasswordEmail } from "./reset-password";
export { verifyEmailEmail } from "./verify-email";
export type { RenderedEmail } from "./layout";

import { isMain } from "@/lib/self-check";
import { invitationEmail } from "./invitation";
import { clientInvitationEmail } from "./client-invitation";
import { resetPasswordEmail } from "./reset-password";
import { verifyEmailEmail } from "./verify-email";
import type { RenderedEmail } from "./layout";

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const URL_ = "https://eve.studio/join/abc_DEF-123";

  const rendered: [string, RenderedEmail][] = [
    ["invitation", invitationEmail({ studioName: "סטודיו לילך", inviterName: "לילך", url: URL_, expiresInDays: 14 })],
    ["invitation, no inviter", invitationEmail({ studioName: "", inviterName: null, url: URL_, expiresInDays: 14 })],
    ["client invitation", clientInvitationEmail({ studioName: "סטודיו לילך", url: URL_, expiresInDays: 14 })],
    ["reset", resetPasswordEmail({ url: URL_, expiresInMinutes: 60 })],
    ["verify", verifyEmailEmail({ url: URL_, expiresInHours: 24 })],
  ];

  for (const [name, m] of rendered) {
    assert(m.subject.trim().length > 0, `${name}: has a subject`);
    assert(m.html.trim().length > 0 && m.text.trim().length > 0, `${name}: has both an html and a text body`);
    for (const [part, body] of [["subject", m.subject], ["html", m.html], ["text", m.text]] as const) {
      assert(!/undefined|null|NaN|\[object Object\]/.test(body), `${name}: no undefined/null in the ${part}`);
    }
    assert(m.html.includes('dir="rtl"') && m.html.includes('lang="he"'), `${name}: the html is Hebrew, right to left`);
    assert(m.html.includes(URL_) && m.text.includes(URL_), `${name}: the link is in both bodies`);
    assert(!/<style/i.test(m.html), `${name}: inline styles only`);
    assert(!/[—–]/.test(m.subject + m.text), `${name}: no long dashes in the copy`);
  }

  // A studio's name is user input: it must arrive as text, never as markup.
  const hostile = invitationEmail({
    studioName: `<script>alert(1)</script>"><img src=x onerror=alert(1)>`,
    inviterName: "<b>x</b>",
    url: URL_,
    expiresInDays: 14,
  });
  assert(!hostile.html.includes("<script>") && !hostile.html.includes("<img src=x"), "names are escaped in the html");
  assert(hostile.html.includes("&lt;script&gt;"), "…as visible text");

  // So is a link: a quote in it must not be able to close the href.
  const quoted = resetPasswordEmail({ url: `https://eve.studio/reset/a"onmouseover="x`, expiresInMinutes: 60 });
  assert(!quoted.html.includes(`a"onmouseover`), "a quote in the url cannot break out of the attribute");

  console.log(`email templates self-check passed (${rendered.length} messages)`);
}
