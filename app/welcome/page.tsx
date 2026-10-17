import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/guard";
import { WelcomeScreen } from "./welcome-screen";

export const metadata: Metadata = { title: "ברוכים הבאים · Eve" };

// The step between a new studio account and its dashboard: name the business, and the studio
// comes into being (completeOnboarding, lib/auth/actions.ts). The (app) layout sends a studio
// account with no organisation here; anyone else who lands here is sent where they belong.
export default async function WelcomePage() {
  const session = await requireSession();
  if (session.kind !== "studio") redirect("/client");
  if (session.organizationId) redirect("/dashboard");
  return <WelcomeScreen name={session.name ?? ""} />;
}
