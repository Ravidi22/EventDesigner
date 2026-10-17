import { renderEmail, type RenderedEmail } from "./layout";

/** Confirms that the person who signed up owns the address. Until they click it the account cannot
 *  sign in — which is also what stops someone registering an address that is not theirs. */
export function verifyEmailEmail(input: { url: string; expiresInHours: number }): RenderedEmail {
  return renderEmail({
    subject: "אישור כתובת האימייל ל-Eve",
    preheader: "עוד לחיצה אחת והחשבון מוכן",
    heading: "אישור כתובת האימייל",
    paragraphs: ["תודה שנרשמתם ל-Eve. כדי להשלים את ההרשמה, אשרו שזו כתובת האימייל שלכם."],
    action: { label: "אישור הכתובת", url: input.url },
    footnote: `הקישור תקף ${input.expiresInHours} שעות. אם לא נרשמתם ל-Eve, אפשר להתעלם מהמייל: החשבון לא יופעל.`,
  });
}
