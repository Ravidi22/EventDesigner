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
import { fetchProducts, saveProduct, removeProduct, importProducts } from "./actions";

export interface CatalogHandle {
  products: Product[];
  /** False until the first fetch resolves — the difference between "no products" and "not yet". */
  ready: boolean;
  error: string | null;
  save: (product: Product) => Promise<void>;
  remove: (id: string) => Promise<{ archived: boolean }>;
  importMany: (list: Product[]) => Promise<void>;
  reload: () => Promise<void>;
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

  const save = useCallback(
    async (product: Product) => {
      try {
        adopt(await saveProduct(product));
      } catch {
        setError("השמירה נכשלה");
      }
    },
    [adopt],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        const { products: next, archived } = await removeProduct(id);
        adopt(next);
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

  return { products, ready, error, save, remove, importMany, reload };
}
