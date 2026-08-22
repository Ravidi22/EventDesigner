"use client";

import { ErrorPanel } from "@/components/error-panel";

// The boundary around every studio screen. It wraps the pages BELOW (app)/layout.tsx but not the
// layout itself, so when a screen throws, the sidebar, the venue switcher and the top bar all
// survive and only the content area is replaced — the designer keeps their bearings and can walk
// to another screen instead of meeting a dead page.
//
// A failure in the layout itself (the session read, the meeting-flow read) bubbles past this to
// app/error.tsx, which is correct: if there is no session there is no shell to render around it.
//
// Redirects are not errors — notFound() and redirect() throw control-flow signals that Next
// filters out before this boundary sees them, so requireStudio()'s redirect to /login still works
// from inside here.
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorPanel
      error={error}
      retry={unstable_retry}
      body="המסך הזה נכשל בטעינה. שאר הסטודיו עובד — אפשר לנסות שוב, או לעבור למסך אחר מהתפריט. שום דבר שנשמר לא אבד."
    />
  );
}
