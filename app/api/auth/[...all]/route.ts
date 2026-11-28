// Better Auth's own endpoints: email verification links, the password-reset handshake, Google's
// sign-in callback (reached through app/api/google/callback), and the sign-in/sign-up calls the
// account actions make through lib/auth/auth-call.ts. Everything is lib/auth/auth.ts's to answer —
// except the endpoints the app only calls in-process (lib/auth/public-routes.ts): from outside they
// would skip the server action's own rules, so they are not found here (PR #4 review).
import { auth } from "@/lib/auth/auth";
import { refusedPublicly } from "@/lib/auth/public-routes";

const handle = (request: Request) =>
  refusedPublicly(request.url) ? new Response(null, { status: 404 }) : auth().handler(request);

export const GET = handle;
export const POST = handle;
