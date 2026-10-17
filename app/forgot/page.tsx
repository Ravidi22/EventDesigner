import type { Metadata } from "next";
import { ForgotScreen } from "./forgot-screen";

export const metadata: Metadata = { title: "שכחתי סיסמה · Eve" };

export default function ForgotPage() {
  return <ForgotScreen />;
}
