"use client";
// One way in for every screen that needs the catalog.
//
// It fetches from the server on mount, primes the synchronous cache (lib/catalog/storage.ts) so the
// studio's render-time resolver can see it, and returns the list as React state so the component
// re-renders when it arrives. Screens do not call the actions directly for reads — if they did,
// each would decide separately whether to prime, and a screen that forgot would leave the canvas
// resolving placements against an empty catalog.
//
// The mutating helpers hand back the fresh list the action returned, so one write updates the
// database, the cache and this component's state together.
import { useCallback, useEffect, useState } from "react";
import type { Product } from "./types";
import { primeCatalog } from "./storage";
import { fetchProducts, saveProduct, removeProduct, importProducts, installStageBasics, installStageParts } from "./actions";

export interface CatalogHandle {
  products: Product[];
  /** False until the first fetch resolves — the difference between "no products" and "not yet". */
  ready: boolean;
  error: string | null;
  /** True once the server has it. False means `error` says why. */
  save: (product: Product) => Promise<boolean>;
  /** The same save, answering WHY it did not take: true, or the reason — the server's own for a row it
   *  refuses (a stock count that is not whole, a size that is no size), else that the save failed. The
   *  product drawer stays open on its draft and shows it (QA 2026-11-20, PR-2). */
  saveExplained: (product: Product) => Promise<true | string>;
  remove: (id: string) => Promise<{ archived: boolean }>;
  importMany: (list: Product[]) => Promise<void>;
  reload: () => Promise<void>;
  /** Give the studio the stage tool's decks, stairs and skirt, if it has none (installStageBasics). */
  installStageBasics: () => Promise<Product[] | null>;
  /** …and only the stairs, skirt, banquette and barrier rows (installStageParts). */
  installStageParts: () => Promise<Product[] | null>;
}

export function useCatalog(initial?: Product[]): CatalogHandle {
  // ⚠ PRIMED IN THE STATE INITIALISER, not in an effect — and that ordering is the whole point.
  // The studio's canvas resolves a placement's product WHILE RENDERING (lib/catalog/storage.ts), so
  // the synchronous cache has to be warm before any child of this hook's component draws. An effect
  // runs after that first paint, which would give the canvas one frame of an empty catalog and a
  // plan full of unresolved placements. The initialiser runs once, before the first render commits.
  const [products, setProducts] = useState<Product[]>(() => {
    if (initial) primeCatalog(initial);
    return initial ?? [];
  });
  const [ready, setReady] = useState(initial !== undefined);
  const [error, setError] = useState<string | null>(null);

  // Every path that receives a list lands here, so priming can never be forgotten at a call site.
  const adopt = useCallback((list: Product[]) => {
    primeCatalog(list);
    setProducts(list);
    setError(null);
  }, []);

  // A newer list from the server on a later navigation replaces the seeded one — and RE-PRIMES, or
  // the canvas would keep resolving against the catalog as it was when this component mounted.
  //
  // During render, not in an effect: the resolver is synchronous and reads the cache while drawing,
  // so priming has to happen before this render's children do — see the note on the initialiser.
  const [seed, setSeed] = useState(initial);
  if (initial !== seed) {
    setSeed(initial);
    if (initial) adopt(initial);
  }

  const reload = useCallback(async () => {
    try {
      adopt(await fetchProducts());
    } catch {
      setError("לא ניתן לטעון את הקטלוג");
    } finally {
      setReady(true);
    }
  }, [adopt]);

  useEffect(() => {
    // The server already answered; nothing to ask for. The gallery's on-demand image form is the
    // remaining caller that legitimately has no seed — it opens long after its screen mounted.
    if (initial !== undefined) return;
    let live = true;
    fetchProducts()
      .then((list) => {
        if (live) adopt(list);
      })
      .catch(() => {
        if (live) setError("לא ניתן לטעון את הקטלוג");
      })
      .finally(() => {
        if (live) setReady(true);
      });
    // A screen unmounted mid-flight must not prime the cache or set state afterwards.
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adopt]);

  const saveExplained = useCallback(
    async (product: Product): Promise<true | string> => {
      try {
        const answer = await saveProduct(product);
        if ("error" in answer) {
          setError(answer.error);
          return answer.error;
        }
        adopt(answer.products);
        return true;
      } catch {
        setError(SAVE_FAILED);
        return SAVE_FAILED;
      }
    },
    [adopt],
  );
  const save = useCallback(async (product: Product) => (await saveExplained(product)) === true, [saveExplained]);

  const remove = useCallback(
    async (id: string) => {
      try {
        const { products: next, archived, error: refused } = await removeProduct(id);
        adopt(next);
        // A built-in is refused by the server, with the reason (lib/catalog/built-in.ts).
        if (refused) setError(refused);
        return { archived };
      } catch {
        setError("המחיקה נכשלה");
        return { archived: false };
      }
    },
    [adopt],
  );

  const importMany = useCallback(
    async (list: Product[]) => {
      try {
        adopt(await importProducts(list));
      } catch {
        setError("הייבוא נכשל");
      }
    },
    [adopt],
  );

  const installBasics = useCallback(async () => {
    try {
      const list = await installStageBasics();
      adopt(list);
      return list;
    } catch {
      setError("לא ניתן להוסיף את פלטות הבסיס");
      return null;
    }
  }, [adopt]);

  const installParts = useCallback(async () => {
    try {
      const list = await installStageParts();
      adopt(list);
      return list;
    } catch {
      return null;
    }
  }, [adopt]);

  return { products, ready, error, save, saveExplained, remove, importMany, reload, installStageBasics: installBasics, installStageParts: installParts };
}

/** What a save that threw is reported as — the network, the database: nothing the form can fix. */
const SAVE_FAILED = "השמירה נכשלה — השינויים לא נשמרו. נסו שוב.";
