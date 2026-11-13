"use client";
// The venue's own LED strip on /halls' selection bar (spec 2026-11-07 §7.3, lib/venues/led.ts): its
// colour, where it runs — the stretch of its wall or side, typed in metres, the whole of it again, the
// other face — and its height (on a wall above the floor, 0 = the floor line; a free run, its own).
// Every edit re-lays the strip's box from its rail through ledPatch, as the curtain's "קטע" does.
import { Zap } from "lucide-react";
import type { StructureFeature, VenueStructure } from "@/lib/venues/structure";
import { updateFeature } from "@/lib/venues/structure";
import { LED_COLOUR, ledColour, ledColourPatch, ledLengthMm, ledLines, ledPatch, ledRail } from "@/lib/venues/led";
import { Popover } from "@/components/popover";
import { Note, PanelRow, ltr } from "@/components/inspector-bar";
import { NumberField } from "@/components/number-field";
import { Button } from "@/components/button";
import { Swatch } from "@/components/swatch-field";

/** The colours a strip is mostly bought in — warm white first; the field after them takes any. */
const LED_COLOURS: { colour: string; name: string }[] = [
  { colour: LED_COLOUR, name: "לבן חם" },
  { colour: "#f4f8ff", name: "לבן קר" },
  { colour: "#ffb347", name: "ענבר" },
  { colour: "#ff6fae", name: "ורוד" },
  { colour: "#9a7bff", name: "סגול" },
  { colour: "#5ab8ff", name: "כחול" },
  { colour: "#5fe0a0", name: "ירוק" },
  { colour: "#ff5a5a", name: "אדום" },
];

export function VenueLedPopover({ feature, structure, apply }: { feature: StructureFeature; structure: VenueStructure; apply: (fn: (s: VenueStructure) => VenueStructure) => void }) {
  const rail = ledRail(feature);
  const line = ledLines(structure, feature)[0];
  const colour = ledColour(feature);
  // Every write reads the strip as it stands in the structure being edited, never the render's copy.
  const re = (fn: (s: VenueStructure, f: StructureFeature) => Partial<Omit<StructureFeature, "id">>) =>
    apply((s) => {
      const f = s.features.find((x) => x.id === feature.id);
      return f ? updateFeature(s, f.id, fn(s, f)) : s;
    });
  const where = rail?.type === "wall" ? "על הקיר" : rail?.type === "side" ? "על הצד" : "באוויר";
  // The stretch in metres along what it runs on — the wall's arc on a bowed one, the side's length.
  const L = line?.wall ? line.wall.track.lengthMm : line?.side ? line.side.side.L : 0;
  const along = (t: number) => (line?.wall ? line.wall.track.mmAt(t) : t * L) / 1000;
  const fraction = (m: number) => (line?.wall ? line.wall.track.tAt(m * 1000) : L > 0 ? (m * 1000) / L : 0);
  return (
    <Popover label={`פס לד ${where}`} icon={Zap} leading={<Swatch color={colour} size={14} />} value={ltr(`${(ledLengthMm(structure, feature) / 1000).toFixed(2)} מ׳`)} panelClassName="w-80">
      <PanelRow label="צבע" stack>
        <div role="radiogroup" aria-label="צבע הפס" className="flex flex-wrap items-center gap-1.5">
          {LED_COLOURS.map((o) => (
            <button
              key={o.colour}
              type="button"
              role="radio"
              aria-checked={o.colour === colour}
              aria-label={o.name}
              title={o.name}
              onClick={() => re((_s, f) => ledColourPatch(f, o.colour))}
              className={"rounded-md border p-1 transition-colors " + (o.colour === colour ? "border-accent ring-2 ring-accent-tint" : "border-border hover:border-accent-line")}
            >
              <Swatch color={o.colour} size={18} />
            </button>
          ))}
          <label className="relative cursor-pointer rounded-md border border-border p-1 hover:border-accent-line" title="צבע אחר">
            <Swatch color={LED_COLOURS.some((o) => o.colour === colour) ? undefined : colour} size={18} />
            <input type="color" value={colour} onChange={(e) => re((_s, f) => ledColourPatch(f, e.target.value))} aria-label="צבע אחר" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          </label>
        </div>
      </PanelRow>
      {rail && (rail.type === "wall" || rail.type === "side") && line && L > 0 && (
        <>
          <PanelRow label={rail.type === "wall" ? "מתחילת הקיר (מ׳)" : "מתחילת הצד (מ׳)"} htmlFor="led-from">
            <NumberField id="led-from" decimals={2} min={0} max={L / 1000} step={0.1} commitOnBlur value={along(Math.min(rail.from, rail.to))} onChange={(m) => re((s, f) => ledPatch(s, f, { from: fraction(m) }))} className="w-24" />
          </PanelRow>
          <PanelRow label="עד (מ׳)" htmlFor="led-to">
            <NumberField id="led-to" decimals={2} min={0} max={L / 1000} step={0.1} commitOnBlur value={along(Math.max(rail.from, rail.to))} onChange={(m) => re((s, f) => ledPatch(s, f, { to: fraction(m) }))} className="w-24" />
          </PanelRow>
          <div className="flex gap-2 py-1">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => re((s, f) => ledPatch(s, f, { from: 0, to: 1 }))}>
              {rail.type === "wall" ? "כל הקיר" : "כל הצד"}
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => re((s, f) => ledPatch(s, f, { side: rail.type === "wall" ? (rail.side === -1 ? 1 : -1) : rail.out === 1 ? -1 : 1 }))}>
              {rail.type === "wall" ? "לצד השני של הקיר" : rail.out === 1 ? "לצד הפנימי" : "לצד החיצוני"}
            </Button>
          </div>
        </>
      )}
      {rail?.type === "wall" && (
        <PanelRow label="גובה מהרצפה (ס״מ)" htmlFor="led-h">
          <NumberField id="led-h" decimals={0} min={0} max={1500} step={5} commitOnBlur value={Math.round((rail.heightMm ?? 0) / 10)} onChange={(cm) => re((s, f) => ledPatch(s, f, { heightMm: cm * 10 }))} className="w-20" />
        </PanelRow>
      )}
      {rail?.type === "run" && (
        <PanelRow label="גובה (ס״מ)" htmlFor="led-run-h">
          <NumberField id="led-run-h" decimals={0} min={0} max={1500} step={10} commitOnBlur value={Math.round(rail.heightMm / 10)} onChange={(cm) => re((s, f) => ledPatch(s, f, { heightMm: cm * 10 }))} className="w-20" />
        </PanelRow>
      )}
      <Note>
        {!line
          ? "הקיר או האלמנט שהפס רץ לאורכו נמחק. מחקו את הפס והניחו חדש."
          : rail?.type === "side"
            ? `רץ לאורך שפת האלמנט, בגובה שלו (${((line.topMm ?? 0) / 10).toFixed(0)} ס״מ), וזז איתו. בסקיצה אפשר להסיר אותו לאירוע אחד.`
            : rail?.type === "wall"
              ? "0 — קו הרצפה. הפס זז עם הקיר; את הקצוות אפשר לגרור בתוכנית. בסקיצה אפשר להסיר אותו לאירוע אחד."
              : "פס בין שתי נקודות. גוררים את הקצוות בתוכנית כדי להזיז אותם."}
      </Note>
    </Popover>
  );
}
