"use client";
// One way in for the suppliers screen — the same shape as useCatalog and useEvents.
//
// Suppliers and expenses load together because the two tabs are one screen and every expense row
// renders its supplier's name: fetching them separately would give the ledger a render where every
// row says "—" for a supplier that is already on its way.
import { useCallback, useEffect, useState } from "react";
import type { Expense, Supplier, SupplierSummary } from "./types";
import {
  fetchExpenses,
  fetchSuppliers,
  removeExpense,
  removeSupplier,
  saveExpense,
  saveSupplier,
} from "./actions";

export interface SuppliersHandle {
  suppliers: SupplierSummary[];
  expenses: Expense[];
  /** False until the first fetch resolves — the difference between "none yet" and "not yet". */
  ready: boolean;
  error: string | null;
  /** Takes a `Supplier`, not a `SupplierSummary`: the two counts on a summary are the server's to
   *  compute, and a screen that could send them would be a screen that could send wrong ones. */
  saveSupplier: (s: Supplier) => Promise<void>;
  removeSupplier: (id: string) => Promise<{ archived: boolean }>;
  saveExpense: (e: Expense) => Promise<void>;
  removeExpense: (id: string) => Promise<void>;
  reload: () => Promise<void>;
}

/** Just the list, for a screen that only needs to NAME suppliers — the catalog drawer's supplier
 *  picker. `enabled` keeps the query off the catalog's first paint: it fires when the drawer opens,
 *  once, and the list stays for the rest of the session. */
export function useSupplierList(enabled: boolean): SupplierSummary[] {
  const [list, setList] = useState<SupplierSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || loaded) return;
    let live = true;
    fetchSuppliers()
      .then((s) => {
        if (!live) return;
        setList(s);
        setLoaded(true);
      })
      // A picker that cannot load its options renders as "no supplier", which is the same as the
      // default. Nothing to say to the designer, and nothing worth blocking a product edit over.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [enabled, loaded]);

  return list;
}

export function useSuppliers(): SuppliersHandle {
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, e] = await Promise.all([fetchSuppliers(), fetchExpenses()]);
    setSuppliers(s);
    setExpenses(e);
    setError(null);
  }, []);

  const reload = useCallback(async () => {
    try {
      await load();
    } catch {
      setError("לא ניתן לטעון את הספקים");
    } finally {
      setReady(true);
    }
  }, [load]);

  useEffect(() => {
    let live = true;
    Promise.all([fetchSuppliers(), fetchExpenses()])
      .then(([s, e]) => {
        // A screen unmounted mid-flight must not set state afterwards.
        if (!live) return;
        setSuppliers(s);
        setExpenses(e);
      })
      .catch(() => {
        if (live) setError("לא ניתן לטעון את הספקים");
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);

  // Every write refetches BOTH lists rather than only its own: archiving a supplier changes what
  // the ledger's supplier column says, and an expense changes the supplier card's outstanding
  // total. Two small queries beat two views that disagree.
  const doSaveSupplier = useCallback(async (s: Supplier) => {
    try {
      setSuppliers(await saveSupplier(s));
    } catch {
      setError("שמירת הספק נכשלה");
    }
  }, []);

  const doRemoveSupplier = useCallback(async (id: string) => {
    try {
      const { suppliers: next, archived } = await removeSupplier(id);
      setSuppliers(next);
      return { archived };
    } catch {
      setError("מחיקת הספק נכשלה");
      return { archived: false };
    }
  }, []);

  const doSaveExpense = useCallback(async (e: Expense) => {
    try {
      setExpenses(await saveExpense(e));
      setSuppliers(await fetchSuppliers());
    } catch {
      setError("שמירת ההוצאה נכשלה");
    }
  }, []);

  const doRemoveExpense = useCallback(async (id: string) => {
    try {
      setExpenses(await removeExpense(id));
      setSuppliers(await fetchSuppliers());
    } catch {
      setError("מחיקת ההוצאה נכשלה");
    }
  }, []);

  return {
    suppliers,
    expenses,
    ready,
    error,
    saveSupplier: doSaveSupplier,
    removeSupplier: doRemoveSupplier,
    saveExpense: doSaveExpense,
    removeExpense: doRemoveExpense,
    reload,
  };
}
