// The one frame every message is drawn in: Hebrew, right to left, inline styles only.
//
// Email clients are not browsers. Gmail strips <style> blocks in some views, Outlook renders with
// Word, and nobody loads web fonts reliably — so the layout is a table, every style is inline, the
// font stack falls back to Arial (which has Hebrew everywhere), and the button is a padded link
// rather than a <button>. Kept to the brand's ink, white and one accent; no gradient, which most
// clients would drop anyway.
//
// EVERY PIECE OF TEXT IS ESCAPED HERE. A studio name or a person's name is user input, and an
// unescaped one is HTML injected into a message that arrives from our domain.

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface EmailBody {
  subject: string;
  /** The line a mail client shows beside the subject in the inbox. */
  preheader: string;
  heading: string;
  paragraphs: string[];
  action: { label: string; url: string };
  /** Small print under the button: how long the link lasts, what to do if it was not you. */
  footnote: string;
}

const INK = "#1b1725";
const INK_SOFT = "#4a4658";
const MUTED = "#6f6b7d";
const ACCENT = "#6d55bd";
const PLANE = "#eeedf3";
const FONT = "Assistant, Arial, 'Helvetica Neue', sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderEmail(body: EmailBody): RenderedEmail {
  const e = escapeHtml;
  const paragraphs = body.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${INK_SOFT};">${e(p)}</p>`)
    .join("");

  const html = `<!doctype html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(body.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PLANE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(body.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PLANE};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:22px;">
<tr><td dir="rtl" style="padding:36px 32px 32px;text-align:right;font-family:${FONT};">
<div dir="ltr" style="text-align:right;font-family:Urbanist, Arial, sans-serif;font-size:26px;font-weight:900;letter-spacing:-1px;color:${ACCENT};margin:0 0 24px;">Eve<span style="color:#8f78d8;">.</span></div>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:${INK};">${e(body.heading)}</h1>
${paragraphs}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 22px;"><tr><td style="border-radius:999px;background:${ACCENT};">
<a href="${e(body.action.url)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${e(body.action.label)}</a>
</td></tr></table>
<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:${MUTED};">אם הכפתור לא נפתח, אפשר להעתיק את הקישור לדפדפן:</p>
<p dir="ltr" style="margin:0 0 20px;font-size:13px;line-height:1.5;color:${ACCENT};text-align:left;word-break:break-all;">${e(body.action.url)}</p>
<p style="margin:0;font-size:13px;line-height:1.5;color:${MUTED};">${e(body.footnote)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    body.heading,
    "",
    ...body.paragraphs.flatMap((p) => [p, ""]),
    `${body.action.label}: ${body.action.url}`,
    "",
    body.footnote,
    "",
    "Eve",
  ].join("\n");

  return { subject: body.subject, html, text };
}
