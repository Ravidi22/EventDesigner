"use client";

import type { Product } from "@/lib/catalog/types";
import {
  AISLE_PITCH_MAX_MM,
  AISLE_PITCH_MIN_MM,
  AISLE_PITCH_MM,
  AISLE_RUNNER_COLOUR,
  AISLE_RUNNER_MIN_MM,
  aisleWords,
  canBeAislePiece,
  type AisleLayout,
  type AisleSpec,
} from "@/lib/catalog/aisle";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { NumberField } from "@/components/number-field";
import { Segmented } from "@/components/segmented";
import { SwitchRow } from "@/components/toggle";
import { SwatchField } from "@/components/swatch-field";
import { fieldLabelClassName } from "@/components/control";
import { VesselPicker, type VesselChoice } from "./vessel-picker";

// What an AISLE is made of (lib/catalog/aisle.ts), asked the same way in two places: the catalog
// drawer, for the row (what every aisle of this kind starts as), and the sketch's panel, for the one
// aisle on this plan. Both hand in the answers IN FORCE and take a patch back; where it is stored is
// the caller's.

/** Every row that may line an aisle, as a choice — one per live shade, "name · shade", its category
 *  as the hint the search also matches. */
export function aislePieceChoices(products: readonly Product[]): VesselChoice[] {
  return products
    .filter((x) => canBeAislePiece(x))
    .flatMap((x) => {
      const live = x.variants.filter((v) => !v.archived);
      const cat = CATEGORY_BY_ID[x.category]?.label;
      return live.length
        ? live.map((v) => ({ value: v.id, label: live.length > 1 ? `${x.name} · ${v.name}` : x.name, hint: cat, product: x, swatch: v.swatch }))
        : [{ value: x.id, label: x.name, hint: cat, product: x }];
    });
}

/** The piece picker alone — typed to narrow, listed in the panel (the vessel picker's reason). */
export function AislePiecePicker({ value, onChange, choices, lead, autoFocus, listClassName }: { value: string; onChange: (variantId: string) => void; choices: VesselChoice[]; lead?: VesselChoice[]; autoFocus?: boolean; listClassName?: string }) {
  return (
    <VesselPicker
      value={value}
      onChange={onChange}
      choices={choices}
      lead={lead}
      autoFocus={autoFocus}
      listClassName={listClassName}
      searchLabel="חיפוש פריט"
      placeholder={choices.length ? "חיפוש פריט — קופסת פרחים, עמוד, פנס…" : "אין בקטלוג פריט מתאים"}
      emptyText="אין פריט בשם הזה"
      listLabel="פריטים"
    />
  );
}

/** The lining's own questions: how far apart, one side or both, staggered, and the runner. */
export function AisleFields({
  spec,
  layout,
  onChange,
  idPrefix,
}: {
  /** The answers in force (a placement's own over its row's). */
  spec: AisleSpec;
  /** As it is laid now — read back under the fields. */
  layout?: AisleLayout;
  onChange: (patch: Partial<AisleSpec>) => void;
  idPrefix: string;
}) {
  const runner = spec.runner === false ? null : (spec.runner ?? {});
  const cm = (mm: number) => Math.round(mm / 10);
  return (
    <div className="space-y-3">
      <div className="space-y-3">
        <NumberField
          id={`${idPrefix}-pitch`}
          label="פריט כל (ס״מ)"
          min={AISLE_PITCH_MIN_MM / 10}
          max={AISLE_PITCH_MAX_MM / 10}
          commitOnBlur
          value={cm(spec.pitchMm ?? AISLE_PITCH_MM)}
          onChange={(v) => onChange({ pitchMm: Math.round(v * 10) })}
        />
        <Segmented
          label="צדדים"
          value={spec.sides === "one" ? "one" : "both"}
          options={[
            ["both", "שני הצדדים"],
            ["one", "צד אחד"],
          ] as const}
          onChange={(v) => onChange({ sides: v })}
        />
      </div>
      {layout && <p className="text-xs leading-relaxed text-muted">{aisleWords(layout)} — פריט בכל קצה, והשאר מתחלקים שווה. מרווח קטן מרוחב הפריט נותן גדר רצופה.</p>}
      {spec.sides !== "one" && (
        <SwitchRow checked={!!spec.stagger} onChange={(v) => onChange({ stagger: v })} label="לסירוגין" hint="הצד השני עומד חצי צעד קדימה, כך שהפריטים מתחלפים משני צדי המעבר." />
      )}
      <SwitchRow checked={!!runner} onChange={(v) => onChange({ runner: v ? {} : false })} label="שביל באמצע" hint="רצועת בד או שטיח לאורך המעבר." />
      {runner && (
        <div className="flex items-end gap-3">
          <NumberField
            id={`${idPrefix}-runner`}
            label="רוחב השביל (ס״מ)"
            min={AISLE_RUNNER_MIN_MM / 10}
            max={2000}
            hideZero
            commitOnBlur
            placeholder={layout?.runner ? String(cm(layout.runner.widthMm)) : "לפי המעבר"}
            value={cm(runner.widthMm ?? 0)}
            onChange={(v) => onChange({ runner: { ...runner, widthMm: v > 0 ? Math.round(v * 10) : undefined } })}
            wrapperClassName="flex-1"
          />
          <div>
            <span className={fieldLabelClassName}>צבע</span>
            <SwatchField value={runner.colour ?? AISLE_RUNNER_COLOUR} onChange={(c) => onChange({ runner: { ...runner, colour: c && c.toLowerCase() !== AISLE_RUNNER_COLOUR ? c : undefined } })} label="צבע השביל" />
          </div>
        </div>
      )}
    </div>
  );
}
