// Seed gallery (F-2.1–F-2.2): photos linked to real catalog products, curated into named
// presentations. Built by product-name lookup so productId (the studio bridge) is always
// valid; a misspelled name fails loudly at import, not as a dead tile.
// Relative import (not "@/lib/...") so the storage self-check stays runnable under plain node.
import { SAMPLE_PRODUCTS } from "../catalog/sample-data";
import type { GalleryImage, Presentation } from "./types";

const byName = new Map(SAMPLE_PRODUCTS.map((p) => [p.name, p]));

let n = 0;
function shot(productName: string, name: string, description: string, tone: string): GalleryImage {
  const product = byName.get(productName);
  if (!product) throw new Error(`gallery seed references unknown product: ${productName}`);
  return { id: `work-${++n}`, name, description, productId: product.id, productName: product.name, tone };
}

export const SAMPLE_IMAGES: GalleryImage[] = [
  // חופות
  shot("שנדליר קריסטל", "שנדליר מעל החופה", "חתונת נועה ואיתי — תלייה מרכזית מעל החופה", "oklch(0.86 0.045 20)"),
  shot("כיסא חתן וכלה", "מושבי חתן וכלה בחופה", "קדמת חופה קלאסית בשמנת", "oklch(0.85 0.045 340)"),
  shot("מרכז שולחן — סידור פרחים", "סידור פרחים לחופה", "עמדת חופה — סידור גבוה לבן", "oklch(0.86 0.045 20)"),
  // שדרות חופה
  shot("כיסא נפוליאון", "שדרת כיסאות זהב", "שדרת כניסה לחופה, נופך קלאסי", "oklch(0.88 0.03 90)"),
  shot("שטיח פרחוני", "שטיח שדרה פרחוני", "שדרת חופה בגן — מור ואלון", "oklch(0.83 0.05 170)"),
  shot("פמוט זכוכית", "פמוטים לאורך השדרה", "ערב לבן בגן — נרות חיים לאורך הדרך", "oklch(0.88 0.025 250)"),
  // שולחנות
  shot("מפת שולחן קטיפה", "מפת קטיפה בורדו", "שירה ורועי — סט חורף עמוק", "oklch(0.82 0.05 25)"),
  shot("ראנר טרופי", "ראנר מונסטרה", "מור ואלון — קו טרופי", "oklch(0.84 0.05 145)"),
  shot("מרכז שולחן — סידור פרחים", "מרכז שולחן ורוד", "נועה ואיתי — סידור רומנטי", "oklch(0.86 0.045 20)"),
  // תאורה ואווירה
  shot("שנדליר קריסטל", "שנדליר באולם חשוך", "מבט מהרחבה — כנס סתיו", "oklch(0.85 0.035 280)"),
  shot("בר עגול מואר", "בר מואר במרכז הרחבה", "ערב חורף — נקודת משיכה זוהרת", "oklch(0.82 0.045 285)"),
  shot("כיסא שקוף", "כיסאות שקופים בתאורה", "כנס סתיו — קו מודרני נקי", "oklch(0.88 0.02 250)"),
];

const img = (i: number) => SAMPLE_IMAGES[i].id;

export const SAMPLE_PRESENTATIONS: Presentation[] = [
  { id: "pres-hupa-classic", name: "חופה קלאסית", imageIds: [img(0), img(1), img(2)], createdAt: Date.parse("2026-05-10") },
  { id: "pres-aisle-gold", name: "שדרת זהב", imageIds: [img(3), img(4), img(5)], createdAt: Date.parse("2026-05-12") },
  { id: "pres-tables-winter", name: "שולחנות חורף עמוק", imageIds: [img(6), img(8)], createdAt: Date.parse("2026-06-01") },
  { id: "pres-tables-tropic", name: "שולחנות טרופיים", imageIds: [img(7), img(8)], createdAt: Date.parse("2026-06-03") },
  { id: "pres-light", name: "תאורה ואווירה", imageIds: [img(9), img(10), img(11)], createdAt: Date.parse("2026-06-15") },
];
