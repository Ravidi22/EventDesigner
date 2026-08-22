// Business settings (F-8.1): the letterhead for quotes and outputs, the VAT rate, the currency.
//
// Studio-level, not venue-level: a designer working three properties still has one VAT rate and one
// letterhead. What varies per property lives in the מתחמים ושיתוף section.
export interface BusinessSettings {
  businessName: string;
  ownerName: string;
  phone: string;
  address: string;
  logoUrl?: string;
  vatRate: number; // 0.18 = 18%
  currency: string; // display symbol; phase 1 is ₪
}

/**
 * What a studio starts with.
 *
 * The name and owner are EMPTY, deliberately. They used to be "Eve — עיצוב אירועים" and a person
 * who does not exist, which meant a real designer's first quote went out under an invented business
 * name if they never opened this screen — sample data in the one place it could reach a client. The
 * business name is asked for at sign-up now and written straight into this row, so the honest
 * default for anything not asked for is blank.
 *
 * The VAT rate and currency are NOT sample data: 18% is the Israeli rate and ₪ is the currency this
 * phase supports. A default that is simply correct is a different thing from a default that is
 * pretend.
 */
export const DEFAULT_SETTINGS: BusinessSettings = {
  businessName: "",
  ownerName: "",
  phone: "",
  address: "",
  vatRate: 0.18,
  currency: "₪",
};
