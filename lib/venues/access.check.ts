// npm run check:access — the self-check of ./access.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { atLeast, canEditPlan, canManageVenue, canSeeGrants, grantScope, isGrantKind, isVenueRole, resolveVenueRole } from "./access";

// ponytail: self-check. Run: npm run check:access
//
// The policy is the product rule — who reaches what — and it is now enforced on every venue read
// and write in lib/venues/actions.ts. That file cannot be exercised without a session and a
// database; this can, and it is where the rule actually lives.
const assert = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};

// The ladder. Every gate in the actions file is one atLeast() call, so if this order is wrong,
// so is every permission in the app.
assert(atLeast("manager", "viewer") && atLeast("manager", "editor"), "a manager clears every bar");
assert(atLeast("editor", "viewer") && !atLeast("editor", "manager"), "an editor is above viewer and below manager");
assert(!atLeast("viewer", "editor"), "a viewer cannot edit");
assert(atLeast("viewer", "viewer"), "the bar is at-least, not above");

assert(canEditPlan("editor") && !canEditPlan("viewer"), "canEditPlan follows the ladder");
assert(canManageVenue("manager") && !canManageVenue("editor"), "only a manager manages the venue");

// THE LINE THAT MUST NOT MOVE (see the head of this file): a grant conveys the property, never
// the business. If this ever passes for a guest, a competitor is reading the client list.
const guest = grantScope("guest");
assert(guest.plan && guest.availability, "a guest gets the plan and anonymous availability");
assert(!guest.events && !guest.money, "a guest gets NEITHER the events NOR the prices");
const member = grantScope("member");
assert(member.events && member.money, "a member's grant adds the property to what their studio role already allows");

// A guest's role can be `manager` — managing the PROPERTY — without that touching the business.
// Worth an assertion because "manager" reads like seniority and is not.
const seniorGuest = grantScope("guest");
assert(!seniorGuest.money, "even a manager-level guest sees no money");

// Everybody sees the same venue; the grants decide who edits it.
const none = { ownsVenue: false, reachesAll: false, memberGrant: null, orgGrant: null };
assert(resolveVenueRole(none) === "viewer", "a business with no grant still sees another's venue");
assert(resolveVenueRole({ ...none, orgGrant: "editor" }) === "editor", "a guest grant to the organisation lets it edit");
assert(resolveVenueRole({ ...none, ownsVenue: true, reachesAll: true }) === "manager", "the owner manages what the studio owns");
assert(resolveVenueRole({ ...none, ownsVenue: true }) === "viewer", "a member with no grant sees the studio's venue, never edits it");
assert(resolveVenueRole({ ...none, ownsVenue: true, memberGrant: "editor" }) === "editor", "a member grant inside the studio lets them edit");
assert(resolveVenueRole({ ...none, ownsVenue: true, orgGrant: "manager" }) === "viewer", "a guest grant means nothing inside the owning studio");
assert(!canEditPlan(resolveVenueRole(none)), "seeing is not editing");

// Who a property is shared with — names and email addresses of other businesses' people — is the
// owning studio's to read, and a manager's (who may share it anyway). Every other business can open
// the PLAN since 2026-10-30, and following a venue gives anyone a viewer grant; neither may read the
// share list (found by db:verify:isolation, EVE-23).
assert(canSeeGrants(true, "viewer"), "the owning studio's people read the share list");
assert(canSeeGrants(false, "manager"), "a manager-level guest reads it (they can share anyway)");
assert(!canSeeGrants(false, resolveVenueRole(none)), "a business that merely opens the plan does NOT");
assert(!canSeeGrants(false, resolveVenueRole({ ...none, orgGrant: "viewer" })), "nor one that followed the venue");
assert(!canSeeGrants(false, resolveVenueRole({ ...none, orgGrant: "editor" })), "nor a guest editor");

assert(isVenueRole("editor") && !isVenueRole("admin"), "isVenueRole rejects a role that does not exist");
assert(isGrantKind("member") && !isGrantKind("owner"), "isGrantKind rejects a studio role");

console.log("venue access policy self-check passed");
