// THE AUTOSAVE QUEUE — how the studio's drawing reaches the server (F-3.5).
//
// Continuous autosave, debounced, no save button; the pill claims "saved" only when a write landed.
// WRITES ARE SEQUENCED, not just debounced: a save is a request, and requests overlap and land out
// of order — which against a single-row document means an older drawing overwriting a newer one,
// silently, with the screen showing "נשמר". So at most one is in the air at a time.
//
// WHAT TO WRITE IS DECIDED BY COMPARING, never by remembering. The queue knows two documents: the
// newest the screen drew (`latest`) and the last one the server is known to hold (`persisted`). When
// a write lands, the server holds it — and if the screen now shows anything else, that is written
// next. It used to remember a `pending` document instead, and an undo broke it (QA 2026-11-20,
// SK-1): Ctrl+Z puts back the very object the server holds, the screen's "nothing to save" check
// returned early without forgetting what WAS pending — so a save in the air landed and was called
// "saved" with the undo never sent, or the undone drag stayed pending and was written on the way out.
//
// IT OUTLIVES THE SCREEN. The meeting steps the studio in and out (hall → gallery → design), and the
// last edit's write has to land after the screen is gone — so `close` sends what is waiting, and
// `whenSaved` lets the NEXT screen wait for it before reading the drawing back (SK-7: Next sends
// server actions one at a time, so a read queued before the old screen's last write came back with
// the drawing as it was, and the next edit wrote that over the designer's last one).
//
// Plain module — no React, no storage. The studio hands it a `write` and tells it every document it
// draws (`edit`); `npm run check:save-queue`.

export type SaveState = "saving" | "saved" | "error";

export interface SaveQueueOptions<T> {
  /** Write one document: resolves once it landed — to `false` (or a rejection) when it did not. */
  write: (doc: T) => unknown;
  /** How long an edit waits for the next one before it is written. */
  delayMs: number;
  /** The timers it waits with — the self-check's own clock; the global ones otherwise. */
  timers?: { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };
}

const TIMERS = {
  set: (fn: () => void, ms: number): unknown => setTimeout(fn, ms),
  clear: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Every queue with a write in the air or one still to make — mounted or not. */
const busy = new Set<{ settled(): Promise<void> }>();

/** How many times a reader waits for queues that keep finding more to write (a screen still being
 *  drawn on) before it reads anyway. A screen that has gone has nothing more to find. */
const MAX_ROUNDS = 5;

/**
 * Resolves once no drawing is waiting to be written or on its way — what a screen awaits before it
 * READS the drawing (lib/events/use-workspace.tsx), so it is read after the last screen's last save
 * rather than queued in front of it. A write that failed is not waited for: nothing more will happen
 * to it on its own, and the screen that made it said so.
 */
export async function whenSaved(): Promise<void> {
  for (let round = 0; round < MAX_ROUNDS && busy.size; round++) await Promise.all([...busy].map((q) => q.settled()));
}

export class SaveQueue<T> {
  /** The newest document the screen drew; null until the first restore or edit. */
  private latest: T | null = null;
  /** The last document the server is known to hold (null: none, or not known yet). */
  private persisted: T | null = null;
  private sending = false;
  /** The last write failed and nothing has been tried since. */
  private failed = false;
  private timer: unknown = undefined;
  private current: SaveState = "saved";
  private listener?: (state: SaveState) => void;
  private waiters: (() => void)[] = [];
  private readonly timers: NonNullable<SaveQueueOptions<T>["timers"]>;

  constructor(private readonly opts: SaveQueueOptions<T>) {
    this.timers = opts.timers ?? TIMERS;
  }

  /** What the pill says. */
  get state(): SaveState {
    return this.current;
  }

  /** Told every time the state changes — one listener, the screen's; none once it has gone. */
  listen(fn?: (state: SaveState) => void): void {
    this.listener = fn;
  }

  /** The document as the server holds it, just read (null: it holds none) — nothing to write. */
  restore(doc: T | null): void {
    this.cancelTimer();
    this.persisted = doc;
    this.latest = doc;
    this.failed = false;
    this.update();
  }

  /** The screen drew `doc`. Written once the edits stop for `delayMs` — or not at all, when it is
   *  what the server already holds (an undo back to the last save) and nothing is on its way. */
  edit(doc: T): void {
    this.latest = doc;
    this.failed = false;
    if (doc === this.persisted && !this.sending) this.cancelTimer();
    // While a write is in the air its landing decides — and an undo back to what the server held
    // BEFORE it is exactly the document that landing will find different, and send.
    else this.schedule();
    this.update();
  }

  /** Write now whatever the server does not hold yet — the debounce's end, and a retry. */
  flush(): void {
    this.cancelTimer();
    const next = this.latest;
    if (!this.sending && next !== null && next !== this.persisted) void this.send(next);
    else this.update();
  }

  /** "נסה שוב" on a failed save. */
  retry(): void {
    this.flush();
  }

  /** The screen is going: what is waiting is sent now (a failed write is tried once more), and the
   *  chain runs on without anyone listening. */
  close(): void {
    this.listener = undefined;
    this.flush();
  }

  /** Resolves when nothing is waiting or on its way (see whenSaved). */
  settled(): Promise<void> {
    if (this.idle()) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private async send(doc: T): Promise<void> {
    this.sending = true;
    this.failed = false;
    this.update();
    let ok: boolean;
    try {
      ok = (await this.opts.write(doc)) !== false;
    } catch {
      ok = false;
    }
    this.sending = false;
    if (!ok) {
      // `latest` is kept: the retry and the next edit both send it.
      this.failed = true;
      this.update();
      return;
    }
    this.persisted = doc;
    // The server holds `doc` now. If the screen shows anything else — an edit made while it was in
    // the air, or an undo back past it — that is what the server must end up with.
    const next = this.latest;
    if (next !== null && next !== doc) {
      this.cancelTimer();
      void this.send(next);
      return;
    }
    this.update();
  }

  private schedule(): void {
    this.cancelTimer();
    this.timer = this.timers.set(() => {
      this.timer = undefined;
      this.flush();
    }, this.opts.delayMs);
  }

  private cancelTimer(): void {
    if (this.timer === undefined) return;
    this.timers.clear(this.timer);
    this.timer = undefined;
  }

  private idle(): boolean {
    return !this.sending && this.timer === undefined && (this.failed || this.latest === null || this.latest === this.persisted);
  }

  private update(): void {
    const state: SaveState = this.sending
      ? "saving"
      : this.failed
        ? "error"
        : this.latest !== null && this.latest !== this.persisted
          ? "saving"
          : "saved";
    if (state !== this.current) {
      this.current = state;
      this.listener?.(state);
    }
    if (!this.idle()) {
      busy.add(this);
      return;
    }
    busy.delete(this);
    const waiting = this.waiters;
    this.waiters = [];
    for (const resolve of waiting) resolve();
  }
}
