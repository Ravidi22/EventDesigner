// People and accounts: auth, the team, notifications, Google, settings, files.
import { existsSync } from "node:fs";
import { currentUser } from "@/lib/auth/actions";
import { emailInvite, fetchCurrentMember, fetchMembers, inviteMember, regenerateInvite, removeMember, setMemberRole, updateMyName } from "@/lib/team/actions";
import { fetchNotifications, markNotificationsRead } from "@/lib/notifications/actions";
import { disconnectGoogle, fetchGoogleBusy, fetchGoogleStatus, setGoogleDirections, startGoogleConnect, syncGoogleNow } from "@/lib/google/actions";
import {
  deleteStageTemplate,
  fetchCheckpointOffsets,
  fetchMeetingFlow,
  fetchSettings,
  fetchStageRules,
  fetchStageTemplates,
  resetCheckpointOffsets,
  resetMeetingFlow,
  saveCheckpointOffsets,
  saveDocStyle,
  saveMeetingFlow,
  saveSettings,
  saveStageRules,
  saveStageTemplate,
} from "@/lib/settings/actions";
import { deleteFile, fileStorageBackend, requestUpload } from "@/lib/files/actions";
import type { Cases } from "./types";

const stray = (who: string) => `isolation-stray-${who}-${Date.now()}@example.test`;
/** A's settings carry A's business name; an outsider must not read it. */
const notAs = (r: unknown) => !JSON.stringify(r ?? null).includes("סטודיו א");
const CREDENTIALS = "a credential flow — takes an email, a password or a token, never an organisation's id; it acts on whoever holds them";

export const PEOPLE_CASES: Cases = {
  // ── auth: credential flows act on the caller or on a token, never on another tenant's id ──
  "lib/auth/actions.ts#signUp": { reason: `${CREDENTIALS}; opens a NEW person and organisation` },
  "lib/auth/actions.ts#completeOnboarding": { reason: "names the caller's own new organisation; takes no id" },
  "lib/auth/actions.ts#signIn": { reason: CREDENTIALS },
  "lib/auth/actions.ts#signInFromForm": { reason: `${CREDENTIALS}; a form post that redirects` },
  "lib/auth/actions.ts#startGoogleSignIn": { reason: "redirects to Google; takes no id" },
  "lib/auth/actions.ts#inviteInfo": { reason: "reads one invitation by its TOKEN — holding the token is the authorisation (/join is public by design)" },
  "lib/auth/actions.ts#acceptInvite": { reason: "accepts the invitation its TOKEN names — holding the token is the authorisation" },
  "lib/auth/actions.ts#signOut": { reason: "ends the caller's own session" },
  "lib/auth/actions.ts#changePassword": { reason: `${CREDENTIALS}; the caller's own, checked against the current password` },
  "lib/auth/actions.ts#requestPasswordReset": { reason: `${CREDENTIALS}; answers the same whether or not the address exists` },
  "lib/auth/actions.ts#resetPassword": { reason: `${CREDENTIALS}; the reset token names the person` },
  "lib/auth/actions.ts#currentUser": { call: () => currentUser() },

  // ── the team ──
  "lib/team/actions.ts#fetchMembers": { call: () => fetchMembers() },
  "lib/team/actions.ts#fetchCurrentMember": { call: () => fetchCurrentMember() },
  "lib/team/actions.ts#inviteMember": { call: () => inviteMember("B", stray("member"), "designer" as never) },
  "lib/team/actions.ts#regenerateInvite": { call: (a) => regenerateInvite(a.pendingMemberA) },
  "lib/team/actions.ts#emailInvite": { call: (a) => emailInvite(a.pendingMemberA, "x") },
  "lib/team/actions.ts#setMemberRole": { call: (a) => setMemberRole(a.memberA, "owner" as never) },
  "lib/team/actions.ts#removeMember": { call: (a) => removeMember(a.memberA) },
  "lib/team/actions.ts#updateMyName": { call: () => updateMyName("B") },

  // ── notifications ──
  "lib/notifications/actions.ts#fetchNotifications": { call: () => fetchNotifications() },
  "lib/notifications/actions.ts#markNotificationsRead": { call: (a) => markNotificationsRead(a.notificationIds) },

  // ── Google: every call is about the caller's own connection (and Google is off in this run) ──
  "lib/google/actions.ts#fetchGoogleStatus": { call: () => fetchGoogleStatus() },
  "lib/google/actions.ts#startGoogleConnect": { call: () => startGoogleConnect() },
  "lib/google/actions.ts#disconnectGoogle": { call: () => disconnectGoogle() },
  "lib/google/actions.ts#setGoogleDirections": { call: () => setGoogleDirections(true, true) },
  "lib/google/actions.ts#syncGoogleNow": { call: () => syncGoogleNow() },
  "lib/google/actions.ts#fetchGoogleBusy": { call: () => fetchGoogleBusy("2027-01-01T00:00:00Z", "2027-02-01T00:00:00Z") },

  // ── settings: the caller's own row; reads must not be A's ──
  "lib/settings/actions.ts#fetchSettings": { call: () => fetchSettings(), expect: notAs },
  "lib/settings/actions.ts#saveSettings": { call: async () => saveSettings(await fetchSettings()), expect: notAs },
  "lib/settings/actions.ts#saveDocStyle": { call: () => saveDocStyle({}) },
  "lib/settings/actions.ts#fetchMeetingFlow": { call: () => fetchMeetingFlow() },
  "lib/settings/actions.ts#saveMeetingFlow": { call: async () => saveMeetingFlow(await fetchMeetingFlow()) },
  "lib/settings/actions.ts#resetMeetingFlow": { call: () => resetMeetingFlow() },
  "lib/settings/actions.ts#fetchCheckpointOffsets": { call: () => fetchCheckpointOffsets() },
  "lib/settings/actions.ts#saveCheckpointOffsets": { call: () => saveCheckpointOffsets({}) },
  "lib/settings/actions.ts#resetCheckpointOffsets": { call: () => resetCheckpointOffsets() },
  "lib/settings/actions.ts#fetchStageRules": { call: () => fetchStageRules() },
  "lib/settings/actions.ts#saveStageRules": { call: () => saveStageRules({}) },
  "lib/settings/actions.ts#fetchStageTemplates": { call: () => fetchStageTemplates() },
  "lib/settings/actions.ts#saveStageTemplate": { call: () => saveStageTemplate({ name: "B" }) },
  "lib/settings/actions.ts#deleteStageTemplate": { call: () => deleteStageTemplate("00000000-0000-4000-8000-000000000000") },

  // ── files: a key's first segment is its organisation; A's file must survive B's delete ──
  "lib/files/actions.ts#requestUpload": { call: () => requestUpload({ kind: "gallery", contentType: "image/jpeg", size: 10 }) },
  "lib/files/actions.ts#deleteFile": { call: (a) => deleteFile(a.fileKey), verify: async (a) => existsSync(a.filePath) },
  "lib/files/actions.ts#fileStorageBackend": { call: () => fileStorageBackend() },
};
