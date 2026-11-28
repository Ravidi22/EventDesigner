import { renderEmail, type RenderedEmail } from "./layout";

/** To the owner who closed the business (EVE-22): when it will be erased, and that it can be reopened
 *  or downloaded until then. */
export function businessClosedEmail(input: { name: string; eraseOn: string; url: string }): RenderedEmail {
  return renderEmail({
    subject: `${input.name} נסגר ב-Eve`,
    preheader: `אפשר לפתוח מחדש עד ${input.eraseOn}`,
    heading: "העסק נסגר",
    paragraphs: [
      `העסק ${input.name} נסגר, והצוות כבר לא יכול להיכנס אליו.`,
      `עד ${input.eraseOn} אפשר לפתוח אותו מחדש או להוריד את כל הנתונים. אחרי התאריך הזה הם יימחקו, חוץ ממסמכי החיוב שהחוק מחייב לשמור.`,
    ],
    action: { label: "פתיחה מחדש או הורדת הנתונים", url: input.url },
    footnote: "אם לא אתם סגרתם את העסק, היכנסו לחשבון ופתחו אותו מחדש.",
  });
}
