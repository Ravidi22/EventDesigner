// npm run check:save-queue — the self-check of ./save-queue.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { SaveQueue, whenSaved, type SaveState } from "./save-queue";

// ponytail: self-check. Run: npm run check:save-queue
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
