// Every message the app sends, in one place — and `npm run check:email`, which renders each of them.
export { invitationEmail } from "./invitation";
export { clientInvitationEmail } from "./client-invitation";
export { resetPasswordEmail } from "./reset-password";
export { verifyEmailEmail } from "./verify-email";
export type { RenderedEmail } from "./layout";

