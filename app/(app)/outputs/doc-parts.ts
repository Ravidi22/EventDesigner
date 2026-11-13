import type { ReactNode } from "react";
import type { PanelGroup } from "@/components/end-panel";
import type { FootAction } from "@/components/doc-shell";

/** What one document of /outputs hands the screen's shell (outputs-screen.tsx): its pages for the
 *  light table, its groups for the end panel, and its foot. The quote builds its own (quote.tsx owns
 *  its state); the crew documents are built by the screen. */
export interface DocParts {
  pages: ReactNode;
  groups: PanelGroup[];
  /** Under the panel's heading, before the groups (the quote's "not sent yet"). */
  lead?: ReactNode;
  /** After the groups (a quiet note on where the rest of the controls are). */
  after?: ReactNode;
  foot: { info: ReactNode; warn?: boolean; side?: ReactNode; action?: FootAction; extras?: FootAction[] };
  /** Which groups open the first time this document is opened on a device. */
  defaultOpen?: readonly string[];
}
