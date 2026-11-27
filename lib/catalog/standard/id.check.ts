// npm run check:standard — the self-check of ./id.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { standardProductId, uuidV5 } from "./id";

// ponytail: self-check. Run: npm run check:standard
const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (ok) {
    console.log(`  ok   ${what}`);
  } else {
    console.error(`FAIL: ${what}`);
    failures.push(what);
  }
};

// RFC 4122 §A.1 — if this vector passes, the implementation is the standard one and not merely a
// consistent hash of its own.
const DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
check(
  uuidV5("www.example.com", DNS_NAMESPACE) === "2ed6657d-e927-568b-95e1-2665a8aea6a2",
  "matches the RFC 4122 test vector",
);

const orgA = "00000000-0000-0000-0000-000000000001";
const orgB = "00000000-0000-0000-0000-000000000002";
check(
  standardProductId(orgA, "table-round-180") === standardProductId(orgA, "table-round-180"),
  "stable — this is what makes the install idempotent",
);
check(
  standardProductId(orgA, "table-round-180") !== standardProductId(orgB, "table-round-180"),
  "one item is a different row in every studio",
);
check(
  standardProductId(orgA, "table-round-180") !== standardProductId(orgA, "table-round-244"),
  "two items are two rows",
);

// The shape every server action in lib/catalog/actions.ts demands of an id it is handed.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
check(UUID.test(standardProductId(orgA, "table-round-180")), "passes the actions' uuid guard");

let rejected = false;
try {
  uuidV5("x", "not-a-uuid");
} catch {
  rejected = true;
}
check(rejected, "refuses a namespace that is not a uuid");

if (failures.length) {
  console.error(`${failures.length} failed`);
  process.exit(1);
}
console.log("standard ids ok");
