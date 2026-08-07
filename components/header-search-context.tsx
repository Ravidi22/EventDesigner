"use client";

import { createContext, useContext } from "react";

// The top bar's search box (AppShell) is shared chrome above every page, but what it should
// search is page-specific (clients/events on most pages, products on /catalog). Rather than
// prop-drilling its value down through the layout, AppShell provides it here and any page that
// wants to react to it (currently only the catalog) reads it directly.
interface HeaderSearchValue {
  value: string;
  setValue: (v: string) => void;
}

const HeaderSearchContext = createContext<HeaderSearchValue>({ value: "", setValue: () => {} });

export const HeaderSearchProvider = HeaderSearchContext.Provider;

export function useHeaderSearch(): HeaderSearchValue {
  return useContext(HeaderSearchContext);
}
