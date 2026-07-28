// Business settings (F-8.1): logo + business details for quote/output headers, VAT rate,
// currency (₪). localStorage for now; the swap to a server action lives here and nowhere else.
import { storageKey } from "@/lib/storage-keys";

export interface BusinessSettings {
  businessName: string;
  ownerName: string;
  phone: string;
  address: string;
  logoUrl?: string;
  vatRate: number; // 0.18 = 18%
  currency: string; // display symbol; phase 1 is ₪
}

export const DEFAULT_SETTINGS: BusinessSettings = {
  businessName: "Eve — עיצוב אירועים",
  ownerName: "דניאל אמסלם",
  phone: "",
  address: "",
  vatRate: 0.18,
  currency: "₪",
};

const KEY = storageKey("settings");

export function loadSettings(): BusinessSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<BusinessSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: BusinessSettings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // non-fatal
  }
}
