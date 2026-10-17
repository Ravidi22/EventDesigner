import { renderEmail, type RenderedEmail } from "./layout";

/** A password-reset link. Sent only to an address that has an account; the screen that asked for
 *  it says the same thing either way, so this message is the only place the difference shows. */
export function resetPasswordEmail(input: { url: string; expiresInMinutes: number }): RenderedEmail {
  return renderEmail({
    subject: "איפוס הסיסמה ל-Eve",
    preheader: "קישור לבחירת סיסמה חדשה",
    heading: "בחירת סיסמה חדשה",
    paragraphs: [
      "קיבלנו בקשה לאפס את הסיסמה לחשבון שלכם ב-Eve.",
      "בלחיצה על הכפתור בוחרים סיסמה חדשה. כל המכשירים שמחוברים לחשבון יתנתקו.",
    ],
    action: { label: "בחירת סיסמה חדשה", url: input.url },
    footnote: `הקישור תקף ${input.expiresInMinutes} דקות ולשימוש אחד. אם לא ביקשתם לאפס סיסמה, אפשר להתעלם מהמייל: הסיסמה לא תשתנה.`,
  });
}
