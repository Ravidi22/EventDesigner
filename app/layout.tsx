import type { Metadata } from "next";
import { Assistant, Urbanist, Space_Grotesk } from "next/font/google";
import "./globals.css";

// Assistant carries every Hebrew surface — body, UI and display weights alike.
const assistant = Assistant({
  variable: "--font-assistant",
  subsets: ["hebrew", "latin"],
});

// Urbanist is reserved for the Eve wordmark and Latin brand moments.
const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin"],
});

// Space Grotesk sets overlines and kickers only — never running text.
const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "פלטפורמת עיצוב אירועים",
  description: "מסקיצת אולם למפה חיה: הדמיה, מפת הצבה ורשימת ציוד ממקור אמת אחד",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning on these two only: browser extensions stamp their own attributes on
    // <html>/<body> before React hydrates (ColorZilla's cz-shortcut-listen, Grammarly's data-gr-*,
    // Dark Reader's data-darkreader-*). It silences attribute mismatches on THIS element, not its
    // children — a real mismatch anywhere in the app is still reported.
    <html
      lang="he"
      dir="rtl"
      className={`${assistant.variable} ${urbanist.variable} ${grotesk.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
