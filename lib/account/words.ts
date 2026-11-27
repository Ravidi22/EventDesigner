// The account lifecycle's words, in one place (spec §5). Never a gendered verb on a person.

/** A member who is no longer there: deleted their account, removed by the owner, or erased with the
 *  business. Drawn wherever a set-null person column, or a forgotten audit name, used to be. */
export const FORMER_MEMBER = "חבר/ת צוות לשעבר";

/** A client who deleted their login. */
export const FORMER_CLIENT = "לקוח/ה לשעבר";

/** What every studio action answers once the business is closed (lib/db/org.ts). */
export const CLOSED_REFUSAL = "העסק נסגר";
