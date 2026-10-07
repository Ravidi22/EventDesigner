"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarSearch, Camera, Check, ChevronDown, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Venue } from "@/lib/venues/storage";
import type { VenueDeleteRefusal } from "@/lib/venues/use-venues";
import { uploadFile } from "@/lib/files/upload";
import { ConfirmDialog } from "./confirm-dialog";

// Circular venue mark: the designer's uploaded logo when set, else the venue name's initial —
// same fallback pattern as ProductImage (app/(app)/catalog/product-image.tsx). The tone
// only colours the initial: an uploaded logo always sits on white, so a transparent PNG
// shows exactly as the designer uploaded it instead of picking up the accent behind it.
// A logo also wears a hairline ring, so a white-backed mark still reads as a bounded circle on
// the white trigger. `lg` is the trigger's size: the logo is the venue's identity there.
function VenueAvatar({
  venue,
  tone = "tint",
  size = "md",
}: {
  venue: Venue;
  tone?: "tint" | "solid";
  size?: "md" | "lg";
}) {
  return (
    <span
      className={
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold " +
        (size === "lg" ? "h-10 w-10 text-sm " : "h-8 w-8 text-xs ") +
        (venue.logoUrl
          ? "border border-border bg-canvas"
          : tone === "solid"
            ? "bg-accent text-canvas"
            : "bg-accent-tint text-accent")
      }
    >
      {venue.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-supplied URLs; next/image needs remote config we don't have yet
        <img src={venue.logoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        venue.name.trim().charAt(0) || "?"
      )}
    </span>
  );
}

// The venue switcher — sits under the wordmark, scopes the whole shell to one business
// location. `collapsed` swaps the labeled trigger for an icon-only puck (icon rail mode).
export function VenueSwitcher({
  venues,
  activeId,
  collapsed = false,
  onSelect,
  onAdd,
  onRename,
  onSetLogo,
  onDelete,
}: {
  venues: Venue[];
  /** Null on a studio with no venues yet — the switcher shows its own empty state. */
  activeId: string | null;
  collapsed?: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => Promise<void>;
  /** An uploaded picture's URL, or null to go back to the initial. */
  onSetLogo: (id: string, logoUrl: string | null) => Promise<void>;
  /** Resolves to the refusal (e.g. "still has events on it", and how many) if the delete was refused. */
  onDelete: (id: string) => Promise<VenueDeleteRefusal | null>;
}) {
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const draftRef = useRef<{ id: string; name: string; original: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoBusyId, setLogoBusyId] = useState<string | null>(null);
  const [editError, setEditError] = useState<{ venueId: string; message: string } | null>(null);
  // The venue the trash icon asked about. Losing a venue also loses its whole wall graph and zone
  // list, so the delete goes through the shared ConfirmDialog — the same question every delete in
  // the app asks, with ביטול as the prominent answer.
  const [pendingDelete, setPendingDelete] = useState<Venue | null>(null);
  // Which venue the refusal is about, so its link can point at that venue's events.
  const [deleteError, setDeleteError] = useState<(VenueDeleteRefusal & { venueId: string }) | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = venues.find((v) => v.id === activeId) ?? venues[0];

  const startRename = (v: Venue) => {
    draftRef.current = { id: v.id, name: v.name, original: v.name };
    setRenamingId(v.id);
    setRenameValue(v.name);
    setEditError(null);
  };
  const editName = (name: string) => {
    if (draftRef.current) draftRef.current.name = name;
    setRenameValue(name);
  };
  const cancelRename = () => {
    draftRef.current = null;
    setRenamingId(null);
    setEditError(null);
  };
  // Saves only a real change — an empty name is refused by the server (and would throw), and an
  // unchanged one is a round trip for nothing.
  const commitRename = () => {
    const draft = draftRef.current;
    draftRef.current = null;
    setRenamingId(null);
    if (!draft) return;
    const name = draft.name.trim();
    if (!name || name === draft.original) return;
    onRename(draft.id, name).catch(() => setEditError({ venueId: draft.id, message: "לא ניתן לשמור את השם" }));
  };

  // Closing the dropdown always drops any error from a previous attempt. Done at every
  // call site that closes the menu, not in an effect keyed on `open`: an effect that turns around
  // and calls setState the moment it sees the closed value is just this same reset one render late.
  const closeMenu = () => {
    // A name still being typed is SAVED by closing, not thrown away. This used to be left to the
    // input's blur, but an outside click closes the menu on pointerdown — before the browser moves
    // focus — so the input was already gone when blur would have fired, and the new name with it.
    // Read through a ref because the document listener below holds the closeMenu of the render
    // that opened the menu, whose `renameValue` is whatever it was then.
    commitRename();
    setOpen(false);
    setDeleteError(null);
    setEditError(null);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeMenu();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Clicking the avatar while editing picks the venue's picture. Uploaded straight to storage
  // (lib/files), and only the returned URL goes to the server.
  const pickLogo = async (venueId: string, file: File | undefined) => {
    if (!file) return;
    setEditError(null);
    setLogoBusyId(venueId);
    try {
      const { url } = await uploadFile(file, "logo");
      await onSetLogo(venueId, url);
    } catch (e) {
      setEditError({ venueId, message: e instanceof Error ? e.message : "העלאת התמונה נכשלה" });
    } finally {
      setLogoBusyId(null);
    }
  };
  const clearLogo = (venueId: string) => {
    setEditError(null);
    onSetLogo(venueId, null).catch(() => setEditError({ venueId, message: "לא ניתן להסיר את התמונה" }));
  };

  const confirmDelete = () => {
    const v = pendingDelete;
    setPendingDelete(null);
    if (!v) return;
    void onDelete(v.id).then((error) => {
      if (error) setDeleteError({ ...error, venueId: v.id });
    });
  };

  return (
    <div ref={rootRef} className={"relative mb-6 " + (collapsed ? "px-0" : "px-2")}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={collapsed ? `אולם נבחר: ${active?.name ?? ""}` : undefined}
        title={collapsed ? active?.name : undefined}
        onClick={() => (open ? closeMenu() : setOpen(true))}
        className={
          "flex w-full items-center gap-2.5 rounded-md border border-border bg-canvas text-start transition-colors hover:border-accent-line " +
          (collapsed ? "justify-center px-0 py-1.5" : "px-2.5 py-1.5")
        }
      >
        {active ? (
          <VenueAvatar venue={active} tone="solid" size="lg" />
        ) : (
          <span className="h-10 w-10 shrink-0 rounded-full bg-accent-tint" />
        )}
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-sm font-medium text-ink">{active?.name}</span>
            <ChevronDown
              className={"h-4 w-4 shrink-0 text-muted transition-transform duration-150 " + (open ? "rotate-180" : "")}
              strokeWidth={2}
            />
          </>
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="בחירת אולם"
          className={
            // z-40: above the sidebar's own floating collapse toggle (app-shell.tsx, z-30) — an open
            // menu is focused, active UI and must never render underneath a piece of persistent chrome.
            "absolute top-[calc(100%+6px)] z-40 w-max min-w-[14rem] overflow-hidden rounded-md border border-border bg-surface p-1 shadow-lifted " +
            (collapsed ? "start-0" : "start-0 w-full")
          }
        >
          {venues.map((v) => {
            const selected = v.id === activeId;
            const renaming = renamingId === v.id;
            if (renaming) {
              return (
                <div key={v.id} className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm">
                  {/* No commit on blur any more: picking a picture moves focus off the input, and
                      saving-and-closing the row there would unmount the very button being clicked.
                      Enter, the check, or closing the menu saves; Escape cancels. */}
                  <button
                    type="button"
                    aria-label={v.logoUrl ? `החלפת התמונה של ${v.name}` : `הוספת תמונה ל${v.name}`}
                    title={v.logoUrl ? "החלפת תמונה" : "הוספת תמונה"}
                    disabled={logoBusyId === v.id}
                    onClick={() => fileRef.current?.click()}
                    className="group/logo relative shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <VenueAvatar venue={v} />
                    <span
                      className={
                        "absolute inset-0 flex items-center justify-center rounded-full bg-ink/45 text-canvas transition-opacity " +
                        (logoBusyId === v.id || !v.logoUrl ? "opacity-100" : "opacity-0 group-hover/logo:opacity-100")
                      }
                    >
                      {logoBusyId === v.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                      ) : (
                        <Camera className="h-3.5 w-3.5" strokeWidth={2} />
                      )}
                    </span>
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    className="hidden"
                    onChange={(e) => {
                      void pickLogo(v.id, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <input
                    autoFocus
                    value={renameValue}
                    aria-label="שם המתחם"
                    onChange={(e) => editName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      else if (e.key === "Escape") {
                        // Cancels the edit only — the menu stays open.
                        e.stopPropagation();
                        cancelRename();
                      }
                    }}
                    className="min-w-0 flex-1 rounded-sm border border-accent-line bg-canvas px-2 py-1 text-ink outline-none"
                  />
                  {v.logoUrl && (
                    <button
                      type="button"
                      aria-label={`הסרת התמונה של ${v.name}`}
                      title="הסרת תמונה"
                      onClick={() => clearLogo(v.id)}
                      className="shrink-0 rounded-sm p-1 text-ink-soft hover:bg-canvas hover:text-alert"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="שמירה"
                    onClick={commitRename}
                    className="shrink-0 rounded-sm p-1 text-accent hover:bg-accent-tint"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                </div>
              );
            }
            return (
              <div
                key={v.id}
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onSelect(v.id);
                  closeMenu();
                }}
                className={
                  "group flex cursor-pointer items-center gap-2.5 rounded-sm px-3 py-2 text-sm transition-colors " +
                  (selected
                    ? "bg-accent-wash font-semibold text-accent-hover"
                    : "text-ink-soft hover:bg-accent-tint hover:text-accent-hover")
                }
              >
                <VenueAvatar venue={v} />
                <span className="flex-1 truncate">{v.name}</span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />}
                <button
                  type="button"
                  aria-label={`שינוי שם ${v.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    startRename(v);
                  }}
                  className="shrink-0 rounded-sm p-1 opacity-0 transition-opacity hover:bg-canvas group-hover:opacity-100"
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  aria-label={`מחיקת ${v.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteError(null);
                    setPendingDelete(v);
                  }}
                  className="shrink-0 rounded-sm p-1 text-ink-soft opacity-0 transition-colors hover:bg-canvas hover:text-alert group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </div>
            );
          })}

          {deleteError && (
            <div className="w-full rounded-sm bg-alert-tint px-4 py-3 text-xs leading-relaxed">
              <p className="break-words text-alert">{deleteError.error}</p>
              {/* The way out of the refusal. /production scoped to this venue lists every event on
                  it — undated and archived ones included — with open and delete on each row. */}
              {deleteError.eventCount > 0 && (
                <Link
                  href={`/production?venue=${encodeURIComponent(deleteError.venueId)}`}
                  onClick={closeMenu}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-sm font-semibold text-accent hover:text-accent-hover"
                >
                  <CalendarSearch className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                  {deleteError.eventCount === 1 ? "צפייה באירוע" : `צפייה ב־${deleteError.eventCount} האירועים`}
                </Link>
              )}
            </div>
          )}

          {editError && (
            <p className="w-full break-words rounded-sm bg-alert-tint px-4 py-3 text-xs leading-relaxed text-alert">
              {editError.message}
            </p>
          )}

          <div className="my-1 border-t border-border-soft" />

          <button
            type="button"
            onClick={() => {
              onAdd();
              closeMenu();
            }}
            className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm text-accent transition-colors hover:bg-accent-tint"
          >
            <Plus className="h-4 w-4 shrink-0" strokeWidth={2} />
            הוספת אולם
          </button>
        </div>
      )}

      {/* Inside rootRef on purpose: a click in the dialog is then not an "outside" click, so the
          menu stays open behind it and a refusal has somewhere to appear. */}
      <ConfirmDialog
        open={!!pendingDelete}
        title={`למחוק את המתחם "${pendingDelete?.name ?? ""}"?`}
        body="כל המידע המקושר למתחם זה יימחק — השרטוט, האזורים וההרשאות שניתנו עליו. האם למחוק בכל זאת?"
        confirmLabel="מחיקה"
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
