import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginScreen } from "./login-screen";

export const metadata: Metadata = { title: "כניסה · Eve" };

// Suspense because the screen reads ?next= with useSearchParams, which opts the route into client
// rendering — without a boundary that would fail the build rather than degrade.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
