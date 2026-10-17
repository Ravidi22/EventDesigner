import { renderEmail, type RenderedEmail } from "./layout";

/** An invitation to join a studio's team — the same /join/<token> link the team screen shows,
 *  sent to the invitee's address. */
export function invitationEmail(input: {
  /** The studio's name as it presents itself (studio_settings.businessName, else the organisation). */
  studioName: string;
  /** Who sent it, when known. */
  inviterName?: string | null;
  url: string;
  expiresInDays: number;
}): RenderedEmail {
  const studio = input.studioName.trim() || "סטודיו ב-Eve";
  const who = input.inviterName?.trim();
  return renderEmail({
    subject: `הוזמנתם להצטרף ל${studio}`,
    preheader: `הזמנה להצטרף לצוות של ${studio} ב-Eve`,
    heading: `הוזמנתם להצטרף ל${studio}`,
    paragraphs: [
      // "קיבלתם הזמנה מ…" rather than "X מזמין/ה": the sentence never has to guess anyone's gender.
      who
        ? `קיבלתם הזמנה מ${who} להצטרף לצוות של ${studio} ב-Eve, המערכת שבה הסטודיו מעצב ומפיק את האירועים שלו.`
        : `הוזמנתם להצטרף לצוות של ${studio} ב-Eve, המערכת שבה הסטודיו מעצב ומפיק את האירועים שלו.`,
      "בלחיצה על הכפתור יוצרים סיסמה ונכנסים.",
    ],
    action: { label: "הצטרפות לצוות", url: input.url },
    footnote: `הקישור תקף ${input.expiresInDays} ימים ומיועד לכתובת הזו בלבד. אם לא ציפיתם להזמנה, אפשר להתעלם מהמייל.`,
  });
}
