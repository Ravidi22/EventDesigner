// npm run check:body-profiles — the self-check of ./body-profiles.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { BODY_UNREAD, CROWN_THIN, LAMP_PROFILES, LAMP_SHADE_KEYS, LAMP_SHADE_LABEL, LAMP_SHADES, lampParts, lampShadeOf, TREE_CROWN_KEYS, TREE_CROWN_LABEL, TREE_CROWNS, type Pts } from "./body-profiles";

const assert = (ok: boolean, what: string) => {
  if (!ok) throw new Error("FAIL: " + what);
  console.log(`  ok   ${what}`);
};
const sound = (p: Pts) => p.length >= 2 && p.every((q, i) => q.r >= 0 && q.r <= 1 && q.z >= 0 && q.z <= 1 && (i === 0 || q.z >= p[i - 1].z));
for (const k of LAMP_SHADE_KEYS) assert(sound(LAMP_SHADES[k]) && Math.max(...LAMP_SHADES[k].map((q) => q.r)) === 1 && !!LAMP_SHADE_LABEL[k], `lamp shade ${k}: a sound profile reaching the plan's rim, with a name`);
for (const k of TREE_CROWN_KEYS) assert(sound(TREE_CROWNS[k]) && Math.max(...TREE_CROWNS[k].map((q) => q.r)) === 1 && TREE_CROWNS[k][0].r < CROWN_THIN && !!TREE_CROWN_LABEL[k], `tree crown ${k}: a sound profile on a trunk, with a name`);
assert(JSON.stringify(lampShadeOf(undefined)) === JSON.stringify([{ r: 1, z: 0.55 }, { r: 0.64, z: 1 }]), "a lamp with no style is the shade it always was: 0.64 of its rim over the top 45%");
assert(lampShadeOf("drum") === LAMP_SHADES.drum && lampShadeOf("mushroom") === LAMP_SHADES.dome && lampShadeOf("globe") === LAMP_SHADES.globe && lampShadeOf("empire") === LAMP_SHADES.empire, "each of the plan's four lamp styles has its shade in the room");
assert(LAMP_SHADES.globe[0].z > 0.25 && LAMP_SHADES.globe[LAMP_SHADES.globe.length - 1].z === 1, "a globe sits on a stem and reaches the lamp's top");
for (const k of LAMP_SHADE_KEYS) assert(sound(LAMP_PROFILES[k]) && LAMP_PROFILES[k][0].z === 0 && LAMP_PROFILES[k][LAMP_PROFILES[k].length - 1].z === 1, `lamp tile ${k}: the whole lamp, floor to top`);
const empire = lampParts(LAMP_PROFILES.empire);
assert(empire.base.length === 5 && empire.base[4].z === 0.55 && JSON.stringify(empire.shade) === JSON.stringify(LAMP_SHADES.empire), "a lamp's profile splits at its neck: the foot and stem below, exactly its shade above");
assert(lampParts(LAMP_PROFILES.lantern).base.length === 0 && lampParts([{ r: 1, z: 0 }, { r: 0.1, z: 1 }]).base.length === 0, "a lantern and a cone have no neck — all shade");
const flared = lampParts([{ r: 0.5, z: 0 }, { r: 0.1, z: 0.5 }, { r: 1, z: 1 }]);
assert(flared.base.length === 2 && flared.shade.length === 2 && flared.shade[0].r === 0.1, "a shade flaring out of the neck starts at the neck");
assert(!BODY_UNREAD.has("lamp") && !BODY_UNREAD.has("tree") && BODY_UNREAD.has("bar"), "a lamp's and a tree's body is read; a bar's is not offered");
console.log("body-profiles self-check passed");
