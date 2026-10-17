import { renderEmail, type RenderedEmail } from "./layout";

/** An invitation for an event's owners to see their event — the /join/<token> link a designer sends
 *  from the event card. What they will see is the design, never prices or the studio's internals. */
export function clientInvitationEmail(input: { studioName: string; url: string; expiresInDays: number }): RenderedEmail {
  const studio = input.studioName.trim() || "הסטודיו";
  return renderEmail({
    subject: `האירוע שלכם ב${studio}`,
    preheader: `העיצוב של האירוע שלכם, מ${studio}`,
    heading: "האירוע שלכם מחכה לכם",
    paragraphs: [
      `האירוע שלכם מעוצב ב-Eve על ידי ${studio}, ונפתחה לכם גישה לראות את הסקיצה והתוכנית.`,
      "בלחיצה על הכפתור בוחרים סיסמה ונכנסים.",
    ],
    action: { label: "כניסה לאירוע שלי", url: input.url },
    footnote: `הקישור תקף ${input.expiresInDays} ימים ומיועד לכתובת הזו בלבד. אם לא ציפיתם להזמנה, אפשר להתעלם מהמייל.`,
  });
}
