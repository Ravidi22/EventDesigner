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

export function useCatalog(): CatalogHandle {
  const [products, setProducts] = useState<Product[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every path that receives a list lands here, so priming can never be forgotten at a call site.
  const adopt = useCallback((list: Product[]) => {
    primeCatalog(list);
    setProducts(list);
    setError(null);
  }, []);

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
