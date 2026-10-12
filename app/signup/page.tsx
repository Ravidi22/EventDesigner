import type { Metadata } from "next";
import { Suspense } from "react";
import { SignupScreen } from "./signup-screen";

export const metadata: Metadata = { title: "יצירת חשבון · Eve" };

export default function SignupPage() {
  return (
    <Suspense>
      <SignupScreen />
    </Suspense>
  );
}
