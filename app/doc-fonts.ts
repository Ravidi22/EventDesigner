import { Bellefair, David_Libre, Karantina, Heebo, IBM_Plex_Sans_Hebrew, IBM_Plex_Mono, Frank_Ruhl_Libre, Suez_One, Rubik, Noto_Serif_Hebrew } from "next/font/google";

// The faces a studio's documents may be set in (lib/documents/style.ts DOC_FONTS) — loaded here,
// once, as CSS variables on <html> (app/layout.tsx). `preload: false`: a browser fetches a face only
// when something on screen is set in it, so the app's own screens pay nothing for them. Assistant
// is the app's own face and is loaded in app/layout.tsx. The variable names are read by
// lib/documents/theme.ts FONT_VARS — keep the two in step.
const bellefair = Bellefair({ variable: "--doc-bellefair", subsets: ["hebrew", "latin"], weight: "400", preload: false });
const davidLibre = David_Libre({ variable: "--doc-david", subsets: ["hebrew", "latin"], weight: ["400", "500", "700"], preload: false });
const karantina = Karantina({ variable: "--doc-karantina", subsets: ["hebrew", "latin"], weight: ["300", "400", "700"], preload: false });
const heebo = Heebo({ variable: "--doc-heebo", subsets: ["hebrew", "latin"], preload: false });
const plexHebrew = IBM_Plex_Sans_Hebrew({ variable: "--doc-plex", subsets: ["hebrew", "latin"], weight: ["200", "300", "400", "500", "600"], preload: false });
const plexMono = IBM_Plex_Mono({ variable: "--doc-plex-mono", subsets: ["latin"], weight: ["400", "500"], preload: false });
const frankRuhl = Frank_Ruhl_Libre({ variable: "--doc-frank", subsets: ["hebrew", "latin"], preload: false });
const suezOne = Suez_One({ variable: "--doc-suez", subsets: ["hebrew", "latin"], weight: "400", preload: false });
const rubik = Rubik({ variable: "--doc-rubik", subsets: ["hebrew", "latin"], preload: false });
const notoSerif = Noto_Serif_Hebrew({ variable: "--doc-noto-serif", subsets: ["hebrew", "latin"], preload: false });

export const docFontVariables = [bellefair, davidLibre, karantina, heebo, plexHebrew, plexMono, frankRuhl, suezOne, rubik, notoSerif]
  .map((f) => f.variable)
  .join(" ");
