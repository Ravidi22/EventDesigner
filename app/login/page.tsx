import type { Metadata } from "next";
import { LoginScreen } from "./login-screen";

export const metadata: Metadata = { title: "כניסה · Eve" };

export default function LoginPage() {
  return <LoginScreen />;
}
