"use client";

import "./globals.css";
import { ErrorPanel } from "@/components/error-panel";

// The last boundary. This one fires when the ROOT layout itself throws — the one place
// app/error.tsx cannot cover, because it renders inside that layout. It therefore replaces the
// layout outright and has to supply its own <html>, <body> and stylesheet.
//
// No next/font here on purpose: the fonts are loaded by the layout that just failed, and pulling
// two Google font families into the one screen whose whole job is to render when things are broken
// buys nothing. globals.css falls back to system-ui when the font variables are missing, so this
// page is unstyled-of-font but fully styled otherwise.
//
// `metadata` cannot be exported from a Client Component, so the tab title is a React <title>.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="he" dir="rtl" className="h-full antialiased">
      <body className="flex min-h-full flex-col items-center justify-center bg-bg px-6 py-16">
        <title>שגיאה — Eve</title>
        <div className="w-full max-w-md rounded-lg bg-surface px-6 shadow-floating">
          <ErrorPanel
            error={error}
            retry={unstable_retry}
            title="האפליקציה לא הצליחה לעלות"
            body="התקלה קרתה עוד לפני שהמסך נבנה, ולכן אין כאן תפריט לחזור אליו. נסו לטעון מחדש; אם זה חוזר, שלחו לנו את הקוד שלמטה."
          />
        </div>
      </body>
    </html>
  );
}
