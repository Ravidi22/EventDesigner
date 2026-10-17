// Better Auth's own endpoints: email verification links, the password-reset handshake, Google's
// sign-in callback (reached through app/api/google/callback), and the sign-in/sign-up calls the
// account actions make through lib/auth/auth-call.ts. Everything is lib/auth/auth.ts's to answer.
import { auth } from "@/lib/auth/auth";

const handle = (request: Request) => auth().handler(request);

export const GET = handle;
export const POST = handle;
