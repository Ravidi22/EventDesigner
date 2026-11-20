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
import { isMain } from "../self-check";

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

// ponytail: self-check. Run: npm run check:save-queue
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  // A clock of its own, so a debounce is a step and not a wait.
  let now = 0;
  let seq = 0;
  const due: { at: number; id: number; fn: () => void }[] = [];
  const timers = {
    set: (fn: () => void, ms: number) => {
      due.push({ at: now + ms, id: ++seq, fn });
      return seq;
    },
    clear: (id: unknown) => {
      const i = due.findIndex((d) => d.id === id);
      if (i >= 0) due.splice(i, 1);
    },
  };
  const advance = (ms: number) => {
    now += ms;
    for (;;) {
      due.sort((a, b) => a.at - b.at);
      const d = due[0];
      if (!d || d.at > now) return;
      due.shift();
      d.fn();
    }
  };
  /** Every promise callback queued so far has run. */
  const settle = () => new Promise<void>((r) => setTimeout(r, 0));

  type Doc = { name: string };
  /** A queue over a fake server: every write waits to be answered, and an answered one is what the
   *  server holds. */
  const harness = (onServer: Doc) => {
    let server = onServer.name;
    const writes: { doc: string; answer: (ok: boolean) => Promise<void> }[] = [];
    const states: SaveState[] = [];
    const q = new SaveQueue<Doc>({
      delayMs: 500,
      timers,
      write: (doc) =>
        new Promise<boolean>((resolve) =>
          writes.push({
            doc: doc.name,
            answer: async (ok) => {
              if (ok) server = doc.name;
              resolve(ok);
              await settle();
            },
          }),
        ),
    });
    q.restore(onServer);
    q.listen((s) => states.push(s));
    return { q, writes, states, server: () => server };
  };

  void (async () => {
    const D0 = { name: "D0" };
    const D1 = { name: "D1" };
    const D2 = { name: "D2" };

    {
      // SK-1, repro A: a drag, and Ctrl+Z while its save is in the air.
      const h = harness(D0);
      h.q.edit(D1);
      advance(500);
      assert(h.writes.length === 1 && h.writes[0].doc === "D1", "the drag is written once the debounce ends");
      h.q.edit(D0); // the undo puts back the very object the server held
      assert(h.q.state === "saving", "…the undo waits for the drag's save to land");
      await h.writes[0].answer(true);
      assert(h.writes.length === 2 && h.writes[1].doc === "D0", "the undo is written once the drag's save lands");
      assert(h.q.state === "saving", "…and the pill does not say saved before it has been");
      await h.writes[1].answer(true);
      assert(h.server() === "D0" && h.q.state === "saved", "…so the server holds what the screen shows, and the pill says so");
      advance(1000);
      assert(h.writes.length === 2, "…and nothing more is written");
    }

    {
      // SK-1, repro B: a drag, Ctrl+Z inside the debounce, then the stage is left.
      const h = harness(D0);
      h.q.edit(D1);
      h.q.edit(D0);
      assert(h.q.state === "saved", "an undo back to the saved drawing is saved — the pill does not stick on saving");
      advance(1000);
      h.q.close();
      await settle();
      assert(h.writes.length === 0 && h.server() === "D0", "…and leaving writes nothing — never the undone drag");
    }

    {
      // A save that lands after newer edits: the newest is written next, at once.
      const h = harness(D0);
      h.q.edit(D1);
      advance(500);
      h.q.edit(D2);
      await h.writes[0].answer(true);
      assert(h.writes.length === 2 && h.writes[1].doc === "D2", "an edit made while a save was in the air is written when it lands");
      await h.writes[1].answer(true);
      assert(h.server() === "D2" && h.q.state === "saved", "…and then the pill says saved");
      assert(h.states.join() === "saving,saved", "the pill went saving → saved once, never saved in between");
    }

    {
      // An undo back to the very document in the air: nothing more to write once it lands.
      const h = harness(D0);
      h.q.edit(D1);
      advance(500);
      h.q.edit(D2);
      h.q.edit(D1);
      await h.writes[0].answer(true);
      advance(1000);
      await settle();
      assert(h.writes.length === 1 && h.server() === "D1" && h.q.state === "saved", "an undo to the document being written writes nothing more");
    }

    {
      // A failed save: the error is shown and kept until the next edit or a retry sends it again.
      const h = harness(D0);
      h.q.edit(D1);
      advance(500);
      await h.writes[0].answer(false);
      assert(h.q.state === "error" && h.server() === "D0", "a failed save says so");
      h.q.retry();
      assert(h.writes.length === 2 && h.writes[1].doc === "D1" && h.q.state === "saving", "a retry sends the same drawing again");
      await h.writes[1].answer(false);
      h.q.edit(D2);
      assert(h.q.state === "saving", "the next edit is a new attempt");
      advance(500);
      await h.writes[2].answer(true);
      assert(h.server() === "D2" && h.q.state === "saved", "…and once it lands, saved");
    }

    {
      // A failed save, then an undo to what the server still holds: nothing to send, nothing wrong.
      const h = harness(D0);
      h.q.edit(D1);
      advance(500);
      await h.writes[0].answer(false);
      h.q.edit(D0);
      advance(1000);
      assert(h.writes.length === 1 && h.q.state === "saved", "an undo past a failed save is saved, and sends nothing");
    }

    {
      // Leaving inside the debounce sends the edit at once; leaving after a failure tries once more.
      const h = harness(D0);
      h.q.edit(D1);
      h.q.close();
      assert(h.writes.length === 1 && h.writes[0].doc === "D1", "leaving sends what is waiting, without waiting for the debounce");
      await h.writes[0].answer(false);
      const g = harness(D0);
      g.q.edit(D1);
      advance(500);
      await g.writes[0].answer(false);
      g.q.close();
      assert(g.writes.length === 2 && g.writes[1].doc === "D1", "leaving after a failed save tries it once more");
      await g.writes[1].answer(true);
      assert(g.server() === "D1", "…and lands it");
    }

    {
      // SK-7: the next screen's read waits for the last screen's last save — the whole chain.
      assert((await Promise.race([whenSaved().then(() => "free"), settle().then(() => "waiting")])) === "free", "nothing to wait for: the read goes at once");
      const h = harness(D0);
      h.q.edit(D1);
      advance(500);
      h.q.edit(D2); // made while D1 is in the air
      h.q.close(); // the stage is left
      let read: string | null = null;
      void whenSaved().then(() => {
        read = h.server(); // the next screen's read, when it is allowed to go
      });
      await h.writes[0].answer(true);
      assert(read === null && h.writes.length === 2, "the read does not go while the last edit is still to be written");
      await h.writes[1].answer(true);
      await settle();
      assert(read === "D2", "it goes once the last edit has landed — and reads it");
    }

    {
      // …and a write that failed on the way out does not hold the next screen forever.
      const h = harness(D0);
      h.q.edit(D1);
      h.q.close();
      let went = false;
      void whenSaved().then(() => {
        went = true;
      });
      await h.writes[0].answer(false);
      await settle();
      assert(went, "a failed write is not waited on");
    }

    console.log("save queue: ok");
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
