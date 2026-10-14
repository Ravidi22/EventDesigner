"use client";

// What ONE shape of a catalog item is surfaced in — none (its flat fill), one of the materials
// (lib/catalog/textures.ts), or a picture of the designer's own: a fabric swatch, a printed dance
// floor, a logo. The appearance editor shows one for the main shape and one in each added shape's
// bar, which is what makes the shapes LAYERS: each carries its own, none inherits another's.
//
// The picture is uploaded the moment it is chosen (lib/files — the same order ImageField keeps: the
// row is never saved pointing at a file that failed to upload).
import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { TEXTURES, TEXTURE_LABEL, TEXTURE_TILE_MM, TEXTURE_TILE_RANGE, type Surface, type Texture } from "@/lib/catalog/textures";
import { TextureFill } from "@/components/surface-fill";
import { fileProblem, uploadFile } from "@/lib/files/upload";
import { NumberField } from "@/components/number-field";
import { Segmented } from "@/components/segmented";
import { fieldLabelClassName } from "@/components/control";

const FIT_OPTIONS = [
  ["tile", "חוזרת"],
  ["stretch", "פרושה על כל הצורה"],
] as const;

/** The chip text for a surface — what a bar shows as the value of its "טקסטורה" chip. */
export function surfaceLabel(s: Surface | undefined): string {
  if (s?.textureImage?.url) return "תמונה";
  if (s?.texture) return TEXTURE_LABEL[s.texture];
  return "ללא";
}

const tileCls = (on: boolean) =>
  "flex flex-col items-center gap-0.5 rounded-sm border p-1 transition-colors " +
  (on ? "border-accent bg-accent-tint" : "border-border-soft hover:border-accent-line");

export function SurfacePicker({
  label = "טקסטורה",
  value,
  onChange,
  color,
  idPrefix,
}: {
  label?: string;
  value: Surface;
  onChange: (s: Surface) => void;
  /** The item's fill, so the material tiles preview in its colour. */
  color?: string;
  idPrefix: string;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const image = value.textureImage?.url ? value.textureImage : undefined;

  const choose = async (file: File | undefined) => {
    if (!file) return;
    const problem = fileProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const { url } = await uploadFile(file, "product");
      // Keep the fit and size of the picture it replaces — swapping a swatch is not re-laying it.
      onChange({ texture: value.texture, textureImage: { fit: image?.fit ?? "tile", tileMm: image?.tileMm, url } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "ההעלאה נכשלה");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div>
        <span className={fieldLabelClassName}>{label}</span>
        <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label={label}>
          {([undefined, ...TEXTURES] as (Texture | undefined)[]).map((tx) => {
            const on = !image && value.texture === tx;
            return (
              <button
                key={tx ?? "none"}
                type="button"
                role="radio"
                aria-checked={on}
                title={tx ? TEXTURE_LABEL[tx] : "ללא — צבע אחיד"}
                onClick={() => onChange({ texture: tx })}
                className={tileCls(on)}
              >
                <svg viewBox="-700 -460 1400 920" className="h-7 w-full rounded-[3px]" aria-hidden>
                  {tx ? (
                    <TextureFill texture={tx} footprint={{ kind: "rect", widthMm: 1400, depthMm: 920 }} color={color} seed={`pick-${tx}`} />
                  ) : (
                    <rect x={-700} y={-460} width={1400} height={920} fill={color ?? "#ffffff"} stroke="var(--color-border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  )}
                </svg>
                <span className="w-full truncate text-center text-[10px] leading-tight text-ink-soft">{tx ? TEXTURE_LABEL[tx] : "ללא"}</span>
              </button>
            );
          })}
          {/* The designer's own picture. Selected, it shows itself; otherwise a + to upload one. */}
          <button
            type="button"
            role="radio"
            aria-checked={!!image}
            title={image ? "החלפת התמונה" : "העלאת תמונה כטקסטורה"}
            disabled={uploading}
            onClick={() => picker.current?.click()}
            className={tileCls(!!image)}
          >
            <span className="flex h-7 w-full items-center justify-center overflow-hidden rounded-[3px] bg-inset">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin text-accent" strokeWidth={1.75} />
              ) : image ? (
                // eslint-disable-next-line @next/next/no-img-element -- an uploaded file, same as ImageField
                <img src={image.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus className="h-4 w-4 text-accent" strokeWidth={1.75} />
              )}
            </span>
            <span className="w-full truncate text-center text-[10px] leading-tight text-ink-soft">{image ? "תמונה" : "תמונה משלך"}</span>
          </button>
        </div>
        <input
          ref={picker}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="hidden"
          onChange={(e) => {
            void choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {error && <p className="mt-1 text-xs text-alert">{error}</p>}
      </div>

      {image && (
        <div className="space-y-2 rounded-md border border-border-soft p-2">
          <Segmented
            label="פריסת התמונה"
            value={image.fit}
            options={FIT_OPTIONS}
            onChange={(fit) => onChange({ ...value, textureImage: { ...image, fit } })}
          />
          {image.fit === "tile" && (
            <NumberField
              id={`${idPrefix}-tile`}
              label="רוחב חזרה אחת (ס״מ)"
              decimals={0}
              min={TEXTURE_TILE_RANGE.min / 10}
              max={TEXTURE_TILE_RANGE.max / 10}
              commitOnBlur
              value={Math.round((image.tileMm ?? TEXTURE_TILE_MM) / 10)}
              onChange={(cm) => onChange({ ...value, textureImage: { ...image, tileMm: Math.round(cm * 10) } })}
            />
          )}
          <p className="text-xs text-muted">
            {image.fit === "tile"
              ? "התמונה חוזרת על פני הצורה בגודל אמיתי — כמו דוגמה של בד או אריח."
              : "עותק אחד של התמונה מכסה את כל הצורה — רחבת ריקודים מודפסת, לוגו."}
          </p>
          <button type="button" onClick={() => onChange({ texture: value.texture })} className="text-xs font-medium text-alert hover:underline">
            הסרת התמונה
          </button>
        </div>
      )}
    </div>
  );
}
