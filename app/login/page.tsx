import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { checkRedirectUri, googleConfig } from "@/lib/google/config";
import { redirectUriBlocks } from "@/lib/google/types";
import { LoginScreen } from "./login-screen";

export const metadata: Metadata = { title: "כניסה · Eve" };

// Suspense because the screen reads ?next= with useSearchParams, which opts the route into client
// rendering — without a boundary that would fail the build rather than degrade.
export default async function LoginPage() {
  // Offered only where it can finish: the button is absent, not dead, on a deployment with no
  // Google project or one whose callback cannot be reached (lib/google/config.ts). Asked per
  // request, so it is the RUNNING deployment's variables that answer and not the build's.
  await connection();
  const config = googleConfig();
  const google = config !== null && !redirectUriBlocks(checkRedirectUri(config));
  return (
    <Suspense>
      <LoginScreen google={google} />
    </Suspense>
  );
}
