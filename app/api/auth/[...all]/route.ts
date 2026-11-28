// Better Auth's endpoints, as a BROWSER may reach them: the links Better Auth mails or redirects to —
// the email confirmation, the reset link, its error page — and nothing else (lib/auth/public-routes.ts,
// an allow-list). Everything the app itself asks of Better Auth (sign-in and sign-up, the reset form,
// delete-account, Google's sign-in callback) goes in-process, through lib/auth/auth-call.ts or
// app/api/google/callback, past the server action's own rules; from outside it is not found here
// (PR #4 review, PR #5's re-review).
import { auth } from "@/lib/auth/auth";
import { refusedPublicly } from "@/lib/auth/public-routes";

const handle = (request: Request) =>
  refusedPublicly(request.url, request.method) ? new Response(null, { status: 404 }) : auth().handler(request);

export const GET = handle;
export const POST = handle;
