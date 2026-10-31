"use client";

import { createContext, useContext } from "react";
import type { OrgKind } from "@/lib/auth/kinds";

// What the signed-in organisation IS — a designer's studio, a supplier or a venue (lib/auth/kinds.ts).
// Resolved once by the (app) layout from the session and handed down here, so a screen the two
// kinds share (the catalog, its drawer, settings) can word itself for the one it is showing
// without a second fetch. It decides wording and which controls exist, never what data a query
// returns — that line is drawn server-side, in the actions.
const OrgKindContext = createContext<OrgKind>("studio");

export const OrgKindProvider = OrgKindContext.Provider;

export function useOrgKind(): OrgKind {
  return useContext(OrgKindContext);
}

export function useIsSupplier(): boolean {
  return useContext(OrgKindContext) === "supplier";
}

export function useIsVenue(): boolean {
  return useContext(OrgKindContext) === "venue";
}
