// Send one message. The one door every email in the app goes out through.
//
// A PLAIN MODULE, NOT "use server" — like lib/google/sync.ts. "Mail this to that address" must not
// be a POST endpoint anybody can call; it is something server actions do after they have decided
// that a message should go.
//
// NEVER THROWS. By the time a caller sends, it has already committed its row: the reset token is
// minted, the invitation exists. A mail failure must not roll that back or turn a finished action
// into an error page; it comes back as `{ ok: false, error }` for the caller to show or ignore.
//
// RESEND'S REST API THROUGH fetch, NOT ITS SDK: one endpoint does not earn a dependency.
//
// ⚠ SERVER ONLY. It reads the API key through emailConfig().
import { isMain } from "@/lib/self-check";
import { emailConfig } from "./config";

export interface EmailAttachment {
  filename: string;
  /** The file's bytes. Sent base64-encoded. */
  content: Uint8Array;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Who the message says it is from — a studio's name, or "Eve" for account mail. The address is
   *  always the configured one: only the display name changes. */
  fromName?: string;
  /** Where a reply goes, e.g. the designer who sent an invitation. */
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

/**
 * `"Name" <address>`, with the name made safe to sit in a header.
 *
 * The name is the studio's own text (studio_settings.businessName), so it is untrusted: a newline
 * in it would let it write a header of its own, and a quote or angle bracket would let it rewrite
 * the address. Those are dropped rather than escaped — nothing a studio means by its name needs them.
 */
export function fromHeader(name: string | undefined, address: string): string {
  const clean = (name ?? "")
    .replace(/[\r\n"<>\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `"${clean || "Eve"}" <${address}>`;
}

export async function sendEmail(message: OutgoingEmail): Promise<SendResult> {
  const config = emailConfig();
  if (!config) {
    // Off: say so where a developer is looking, and nowhere else. A production deployment with no
    // provider is a supported state, and logging every unsent message there is noise.
    if (process.env.NODE_ENV === "development") {
      console.info(`[email off] to ${message.to}: ${message.subject}\n${message.text}`);
    }
    return { ok: false, error: "email off" };
  }

  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromHeader(message.fromName, config.fromAddress),
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.attachments?.length
          ? {
              attachments: message.attachments.map((a) => ({
                filename: a.filename,
                content: Buffer.from(a.content).toString("base64"),
              })),
            }
          : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!response.ok || !body?.id) {
      return { ok: false, error: body?.message ?? `Resend answered ${response.status}` };
    }
    return { ok: true, id: body.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

if (isMain(import.meta.url)) {
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
}
