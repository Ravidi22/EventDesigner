import type { Metadata } from "next";
import { requireDesigner } from "@/lib/auth/guard";
import { fetchProducts } from "@/lib/catalog/actions";
import { EventSurface } from "@/components/event-surface";
import { SceneScreen } from "./scene-screen";

export const metadata: Metadata = { title: "תלת-ממד · Eve" };

// The catalog is read here on the server for the reason /outputs reads it: the scene is built from
// the document against the catalog while rendering, and the catalog does not depend on which event
// this device has open (lib/events/workspace.ts resolves that part, through EventSurface).
export default async function ScenePage() {
  await requireDesigner();
  return (
    <EventSurface active="scene">
      <SceneScreen initialProducts={await fetchProducts()} />
    </EventSurface>
  );
}
