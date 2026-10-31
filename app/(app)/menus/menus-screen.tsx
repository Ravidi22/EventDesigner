"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { archiveDish, archiveMenuPackage, saveDish, saveMenuPackage } from "@/lib/menus/actions";
import {
  COURSES,
  COURSE_LABEL,
  DISH_TAGS,
  DISH_TAG_LABEL,
  EXTRA_PER_LABEL,
  chooseLabel,
  courseDishes,
  type Course,
  type Dish,
  type MenuPackage,
  type PackageCourse,
} from "@/lib/menus/types";
import { formatPrice } from "@/lib/catalog/format";
import { Button } from "@/components/button";
import { fieldLabelClassName } from "@/components/control";
import { Drawer } from "@/components/drawer";
import { EmptyState } from "@/components/empty-state";
import { ImageField } from "@/components/image-field";
import { Menu, type MenuItem } from "@/components/menu";
import { NumberField } from "@/components/number-field";
import { PAGE_GUTTER } from "@/components/page-gutter";
import { PageTabs } from "@/components/page-tabs";
import { Select } from "@/components/select";
import { TagToggle } from "@/components/tag-toggle";
import { TextField } from "@/components/text-field";
import { DrawerSection } from "../dashboard/drawer-section";

type Tab = "dishes" | "packages";

/**
 * A venue's menu (lib/menus): the dishes its kitchen makes, by course, and the packages a booking
 * is sold from. Drawn in the catalog's language (app/(app)/catalog/) — a toolbar of page tabs, cards
 * with the photograph on top and the "…" beside the title, the whole card opening the item in the
 * side drawer — because a dish is to a hall what a product is to a designer. Nothing is deleted: a
 * dish or package a past booking used is archived.
 */
export function MenusScreen({ initialDishes, initialPackages }: { initialDishes: Dish[]; initialPackages: MenuPackage[] }) {
  const [tab, setTab] = useState<Tab>("dishes");
  const [dishes, setDishes] = useState(initialDishes);
  const [packages, setPackages] = useState(initialPackages);
  const [showArchived, setShowArchived] = useState(false);
  const [dish, setDish] = useState<Dish | null>(null);
  const [pkg, setPkg] = useState<MenuPackage | null>(null);
  // A card whose menu is open is lifted over the next one (CLAUDE.md: card actions).
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const liveDishes = dishes.filter((d) => showArchived || !d.archived);
  const livePackages = packages.filter((p) => showArchived || !p.archived);
  const archivedCount = tab === "dishes" ? dishes.filter((d) => d.archived).length : packages.filter((p) => p.archived).length;

  const newDish = (course: Course = "first"): Dish => ({
    id: crypto.randomUUID(),
    name: "",
    course,
    description: "",
    tags: [],
    position: dishes.filter((d) => d.course === course).length,
  });
  const newPackage = (): MenuPackage => ({
    id: crypto.randomUUID(),
    name: "",
    description: "",
    priceAdult: 0,
    priceChild: 0,
    priceVendor: 0,
    minGuests: 0,
    courses: [],
    extras: [],
  });

  const dishMenu = (d: Dish): MenuItem[] => [
    { label: "עריכה", icon: Pencil, onSelect: () => setDish(d) },
    d.archived
      ? { label: "החזרה מהארכיון", icon: ArchiveRestore, onSelect: () => void archiveDish(d.id, false).then(setDishes) }
      : { label: "העברה לארכיון", icon: Archive, onSelect: () => void archiveDish(d.id).then(setDishes) },
  ];
  const packageMenu = (p: MenuPackage): MenuItem[] => [
    { label: "עריכה", icon: Pencil, onSelect: () => setPkg(p) },
    p.archived
      ? { label: "החזרה מהארכיון", icon: ArchiveRestore, onSelect: () => void archiveMenuPackage(p.id, false).then(setPackages) }
      : { label: "העברה לארכיון", icon: Archive, onSelect: () => void archiveMenuPackage(p.id).then(setPackages) },
  ];

  return (
    <div className={PAGE_GUTTER}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <PageTabs
          label="תפריטים"
          value={tab}
          options={[
            { id: "dishes", label: "מנות", count: dishes.filter((d) => !d.archived).length },
            { id: "packages", label: "חבילות", count: packages.filter((p) => !p.archived).length },
          ]}
          onChange={setTab}
        />
        {archivedCount > 0 && (
          <button type="button" onClick={() => setShowArchived((v) => !v)} className="text-sm font-medium text-accent transition-colors hover:text-accent-hover">
            {showArchived ? "הסתר ארכיון" : `הצג ארכיון (${archivedCount})`}
          </button>
        )}
        <Button size="sm" className="ms-auto" onClick={() => (tab === "dishes" ? setDish(newDish()) : setPkg(newPackage()))}>
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          {tab === "dishes" ? "מנה חדשה" : "חבילה חדשה"}
        </Button>
      </div>

      {tab === "dishes" ? (
        liveDishes.length === 0 ? (
          <EmptyState
            icon={UtensilsCrossed}
            title="עוד אין מנות"
            body="המנות שהמטבח מכין, לפי שלבי הארוחה — עם תיוג (טבעוני, ללא גלוטן) ותמונה. מהן בונים את החבילות, ובמצב פגישה הלקוחות בוחרים מהתמונות."
            action={
              <Button onClick={() => setDish(newDish())}>
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                מנה ראשונה
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-6">
            {COURSES.map((course) => {
              const list = liveDishes.filter((d) => d.course === course);
              if (!list.length) return null;
              return (
                <section key={course} aria-label={COURSE_LABEL[course]}>
                  <div className="mb-2 flex items-baseline gap-2">
                    <h2 className="text-caption font-bold text-muted">{COURSE_LABEL[course]}</h2>
                    <span className="nums text-caption font-semibold text-quiet">{list.length}</span>
                    <button type="button" onClick={() => setDish(newDish(course))} className="ms-auto text-xs font-semibold text-accent hover:text-accent-hover">
                      + מנה
                    </button>
                  </div>
                  <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                    {list.map((d) => (
                      <DishCard key={d.id} dish={d} menu={dishMenu(d)} lifted={menuOpen === d.id} onMenu={(o) => setMenuOpen(o ? d.id : null)} onOpen={() => setDish(d)} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )
      ) : livePackages.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="עוד אין חבילות"
          body="חבילה היא מה שהאירוע קונה: מחיר למבוגר, לילד ולמנת ספק, מינימום מנות, והמנות בכל שלב — כמה לבחור מתוך כמה."
          action={
            <Button onClick={() => setPkg(newPackage())}>
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              חבילה ראשונה
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {livePackages.map((p) => (
            <article
              key={p.id}
              className={
                "relative flex flex-col rounded-lg border border-border bg-surface p-4 transition duration-150 ease-fluid hover:-translate-y-0.5 hover:shadow-floating " +
                (p.archived ? "opacity-60 " : "") +
                (menuOpen === p.id ? "z-30" : "")
              }
            >
              <button type="button" onClick={() => setPkg(p)} aria-label={`עריכת ${p.name}`} className="absolute inset-0 z-0 rounded-lg" />
              <div className="pointer-events-none relative flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display text-base leading-tight text-ink">{p.name}</h3>
                    {p.description && <p className="mt-0.5 text-sm text-muted">{p.description}</p>}
                  </div>
                  <span className="pointer-events-auto">
                    <Menu label={`אפשרויות ל${p.name}`} items={packageMenu(p)} onOpenChange={(o) => setMenuOpen(o ? p.id : null)} className="-me-1 shrink-0" />
                  </span>
                </div>
                <div className="mt-3 flex flex-col gap-1.5">
                  {p.courses.map((c) => (
                    <p key={c.id} className="text-[13px] text-ink-soft">
                      <span className="font-semibold text-ink">{COURSE_LABEL[c.course]}</span> · {chooseLabel(c, dishes)}
                    </p>
                  ))}
                  {p.extras.length > 0 && <p className="text-[13px] text-muted">תוספות: {p.extras.map((x) => x.name).join(" · ")}</p>}
                </div>
                <div className="-mx-4 mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border px-4 pt-3">
                  <span className="nums text-lg font-bold text-ink">{formatPrice(p.priceAdult)}</span>
                  <span className="text-xs text-muted">למבוגר</span>
                  {p.priceChild > 0 && <span className="nums text-sm text-ink-soft">{formatPrice(p.priceChild)} לילד</span>}
                  {p.priceVendor > 0 && <span className="nums text-sm text-ink-soft">{formatPrice(p.priceVendor)} למנת ספק</span>}
                  {p.minGuests > 0 && <span className="nums ms-auto text-xs text-muted">מינימום {p.minGuests} מנות</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {dish && (
        <DishDrawer
          dish={dish}
          isNew={!dishes.some((d) => d.id === dish.id)}
          onClose={() => setDish(null)}
          onSave={async (d) => {
            setDishes(await saveDish(d));
            setDish(null);
          }}
        />
      )}
      {pkg && (
        <PackageDrawer
          pkg={pkg}
          isNew={!packages.some((p) => p.id === pkg.id)}
          dishes={dishes}
          onClose={() => setPkg(null)}
          onSave={async (p) => {
            setPackages(await saveMenuPackage(p));
            setPkg(null);
          }}
        />
      )}
    </div>
  );
}

/** A dish as the catalog draws a product: the photograph on top, the name with its "…", the tags. */
function DishCard({ dish: d, menu, lifted, onMenu, onOpen }: { dish: Dish; menu: MenuItem[]; lifted: boolean; onMenu: (open: boolean) => void; onOpen: () => void }) {
  return (
    <div
      className={
        "relative flex flex-col rounded-lg border border-border bg-surface p-2 transition duration-150 ease-fluid hover:-translate-y-0.5 hover:shadow-floating " +
        (d.archived ? "opacity-60 " : "") +
        (lifted ? "z-30" : "")
      }
    >
      <button type="button" onClick={onOpen} aria-label={`עריכת ${d.name}`} className="absolute inset-0 z-0 rounded-lg" />
      <div className="pointer-events-none relative flex flex-col">
        <div className="relative mb-2 aspect-[4/3] overflow-hidden rounded-md border border-border bg-inset">
          {d.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- see components/photo.tsx
            <img src={d.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-faint">
              <UtensilsCrossed className="h-7 w-7" strokeWidth={1.3} />
            </span>
          )}
        </div>
        <div className="flex items-start justify-between gap-1 px-1">
          <h3 className="font-display text-base leading-tight text-ink">{d.name}</h3>
          <span className="pointer-events-auto">
            <Menu label={`אפשרויות ל${d.name}`} items={menu} onOpenChange={onMenu} className="-me-1 shrink-0" />
          </span>
        </div>
        {d.description && <p className="mt-1 line-clamp-2 px-1 text-sm text-muted">{d.description}</p>}
        {d.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1 px-1 pb-1">
            {d.tags.map((t) => (
              <span key={t} className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-ink-soft">
                {DISH_TAG_LABEL[t]}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The drawer's form frame: the sections scroll, the footer stays — the product drawer's. */
function DrawerForm({ onSubmit, onClose, saving, disabled, children }: { onSubmit: () => void; onClose: () => void; saving: boolean; disabled: boolean; children: ReactNode }) {
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (!disabled) onSubmit();
      }}
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">{children}</div>
      <footer className="flex items-center gap-2 border-t border-border bg-surface px-5 py-3.5">
        <Button type="submit" disabled={saving || disabled}>
          {saving ? "שומר…" : "שמירה"}
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          ביטול
        </Button>
      </footer>
    </form>
  );
}

function DishDrawer({ dish, isNew, onClose, onSave }: { dish: Dish; isNew: boolean; onClose: () => void; onSave: (d: Dish) => Promise<void> }) {
  const [d, setD] = useState(dish);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Dish>) => setD((x) => ({ ...x, ...patch }));
  return (
    <Drawer title={isNew ? "מנה חדשה" : d.name || "עריכת מנה"} onClose={onClose}>
      <DrawerForm
        onClose={onClose}
        saving={saving}
        disabled={!d.name.trim()}
        onSubmit={() => {
          setSaving(true);
          void onSave(d).finally(() => setSaving(false));
        }}
      >
        <DrawerSection title="המנה">
          <div className="flex flex-col gap-4">
            <TextField label="שם המנה" value={d.name} onChange={(name) => set({ name })} required autoFocus={isNew} placeholder="פילה בקר בחמאת עשבים" />
            <div>
              <span className={fieldLabelClassName}>שלב בארוחה</span>
              <Select value={d.course} onChange={(v) => set({ course: v as Course })} aria-label="שלב בארוחה" className="w-full" options={COURSES.map((c) => ({ value: c, label: COURSE_LABEL[c] }))} />
            </div>
            <TextField label="תיאור" value={d.description} onChange={(description) => set({ description })} multiline rows={3} />
          </div>
        </DrawerSection>
        <DrawerSection title="תיוג">
          <div className="flex flex-wrap gap-1.5">
            {DISH_TAGS.map((t) => (
              <TagToggle key={t} active={d.tags.includes(t)} onClick={() => set({ tags: d.tags.includes(t) ? d.tags.filter((x) => x !== t) : [...d.tags, t] })}>
                {DISH_TAG_LABEL[t]}
              </TagToggle>
            ))}
          </div>
        </DrawerSection>
        <DrawerSection title="תמונה">
          <ImageField label="תמונת המנה" value={d.imageUrl} onChange={(imageUrl) => set({ imageUrl })} kind="dish" />
        </DrawerSection>
      </DrawerForm>
    </Drawer>
  );
}

function PackageDrawer({ pkg, isNew, dishes, onClose, onSave }: { pkg: MenuPackage; isNew: boolean; dishes: Dish[]; onClose: () => void; onSave: (p: MenuPackage) => Promise<void> }) {
  const [p, setP] = useState(pkg);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<MenuPackage>) => setP((x) => ({ ...x, ...patch }));
  const editCourse = (id: string, patch: Partial<PackageCourse>) => set({ courses: p.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const usedCourses = new Set(p.courses.map((c) => c.course));
  const nextCourse = COURSES.find((c) => !usedCourses.has(c)) ?? "main";

  return (
    <Drawer title={isNew ? "חבילה חדשה" : p.name || "עריכת חבילה"} onClose={onClose}>
      <DrawerForm
        onClose={onClose}
        saving={saving}
        disabled={!p.name.trim()}
        onSubmit={() => {
          setSaving(true);
          void onSave(p).finally(() => setSaving(false));
        }}
      >
        <DrawerSection title="החבילה">
          <div className="flex flex-col gap-4">
            <TextField label="שם החבילה" value={p.name} onChange={(name) => set({ name })} required autoFocus={isNew} placeholder="חבילת זהב" />
            <TextField label="תיאור קצר" value={p.description} onChange={(description) => set({ description })} />
          </div>
        </DrawerSection>

        <DrawerSection title="מחירים">
          <div className="grid grid-cols-2 gap-4">
            <NumberField label="מחיר למבוגר" value={p.priceAdult} onChange={(priceAdult) => set({ priceAdult })} min={0} decimals={2} />
            <NumberField label="מחיר לילד" value={p.priceChild} onChange={(priceChild) => set({ priceChild })} min={0} decimals={2} hideZero />
            <NumberField label="מנת ספק" value={p.priceVendor} onChange={(priceVendor) => set({ priceVendor })} min={0} decimals={2} hideZero />
            <NumberField label="מינימום מנות" value={p.minGuests} onChange={(minGuests) => set({ minGuests })} min={0} hideZero />
          </div>
          <p className="mt-3 text-xs text-muted">מחירים כולל מע״מ — מה שהלקוח משלם.</p>
        </DrawerSection>

        <DrawerSection title="שלבי הארוחה">
          <div className="flex flex-col gap-3">
            {p.courses.map((c) => {
              const offered = dishes.filter((d) => d.course === c.course && !d.archived);
              const inCourse = courseDishes(c, dishes);
              return (
                <div key={c.id} className="flex flex-col gap-2.5 rounded-md border border-border bg-inset p-3">
                  <div className="flex items-end gap-2">
                    <Select
                      value={c.course}
                      onChange={(v) => editCourse(c.id, { course: v as Course, dishIds: [] })}
                      aria-label="שלב"
                      options={COURSES.map((x) => ({ value: x, label: COURSE_LABEL[x] }))}
                      className="min-w-0 flex-1"
                    />
                    <NumberField label="לבחור" value={c.choose} onChange={(choose) => editCourse(c.id, { choose })} min={0} className="w-20" />
                    <RemoveRow label="הסרת השלב" onClick={() => set({ courses: p.courses.filter((x) => x.id !== c.id) })} />
                  </div>
                  <p className="text-xs text-muted">{chooseLabel(c, dishes)} · 0 = כל המנות שסומנו</p>
                  {offered.length === 0 ? (
                    <p className="text-xs text-muted">אין עדיין מנות בשלב הזה — מוסיפים אותן בלשונית המנות.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {offered.map((d) => {
                        const on = inCourse.some((x) => x.id === d.id);
                        return (
                          <TagToggle key={d.id} active={on} onClick={() => editCourse(c.id, { dishIds: on ? c.dishIds.filter((x) => x !== d.id) : [...c.dishIds, d.id] })}>
                            {d.name}
                          </TagToggle>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            <AddRow onClick={() => set({ courses: [...p.courses, { id: crypto.randomUUID(), course: nextCourse, choose: 0, dishIds: [] }] })}>הוספת שלב</AddRow>
          </div>
        </DrawerSection>

        <DrawerSection title="תוספות בתשלום">
          <div className="flex flex-col gap-3">
            {p.extras.map((x) => (
              <div key={x.id} className="flex items-end gap-2">
                <TextField
                  value={x.name}
                  onChange={(name) => set({ extras: p.extras.map((y) => (y.id === x.id ? { ...y, name } : y)) })}
                  placeholder="עמדת סושי"
                  aria-label="שם התוספת"
                  wrapperClassName="min-w-0 flex-1"
                />
                <NumberField value={x.price} onChange={(price) => set({ extras: p.extras.map((y) => (y.id === x.id ? { ...y, price } : y)) })} min={0} decimals={2} className="w-24" />
                <Select
                  value={x.per}
                  onChange={(v) => set({ extras: p.extras.map((y) => (y.id === x.id ? { ...y, per: v === "event" ? "event" : "guest" } : y)) })}
                  aria-label="לפי"
                  options={[
                    { value: "guest", label: EXTRA_PER_LABEL.guest },
                    { value: "event", label: EXTRA_PER_LABEL.event },
                  ]}
                  className="w-28"
                />
                <RemoveRow label="הסרת התוספת" onClick={() => set({ extras: p.extras.filter((y) => y.id !== x.id) })} />
              </div>
            ))}
            <AddRow onClick={() => set({ extras: [...p.extras, { id: crypto.randomUUID(), name: "", price: 0, per: "guest" }] })}>הוספת תוספת</AddRow>
          </div>
        </DrawerSection>
      </DrawerForm>
    </Drawer>
  );
}

function AddRow({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-accent transition-colors hover:text-accent-hover">
      <Plus className="h-4 w-4" strokeWidth={2} />
      {children}
    </button>
  );
}

function RemoveRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="mb-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-muted transition-colors hover:bg-alert-tint hover:text-alert"
    >
      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );
}
