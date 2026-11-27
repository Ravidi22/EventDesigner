// The studio's own work: events, drawings, quotes, outputs, the 3D scene, production, proposals,
// gallery and diary. Every call is B's studio owner with A's ids.
import { fetchActiveEvent, fetchEvent, fetchEventFootprint, fetchEvents, confirmEvent, deleteEvent, markEventLost, patchEvent, reachStep, reopenEvent, saveEvent } from "@/lib/events/actions";
import { canEmailClients, emailClientInvite, fetchEventClients, regenerateClientInvite, setEventClientRole, shareEventWithClient, unshareEventClient } from "@/lib/events/client-actions";
import { fetchEventWorkspace } from "@/lib/events/workspace";
import { fetchDocument, saveDocument, sealDocument } from "@/lib/studio/actions";
import { deleteSketchTemplate, fetchSketchTemplateContent, fetchSketchTemplates, saveSketchTemplate, seedEventDocument, setSketchPhoto } from "@/lib/studio/sketch-actions";
import { fetchIssuedQuote, fetchQuoteDraft, issueQuote, saveQuoteDraft } from "@/lib/quotes/actions";
import { DEFAULT_LAYOUT } from "@/lib/quotes/layout";
import { fetchExports, fetchNextExportNumber, fetchSpares, recordExport, saveSpare } from "@/lib/outputs/actions";
import { fetchSceneLinks, fetchSceneSettings, mintSceneLink, revokeSceneLink, saveSceneSettings } from "@/lib/scene/actions";
import { fetchEventProduction, fetchLoadIn, fetchRunway, setEventCrew } from "@/lib/production/actions";
import { fetchPendingProposals, fetchSubmittedProposal, resolveProposal } from "@/lib/proposals/actions";
import { deletePresentation, fetchFolder, fetchImages, fetchPresentations, saveImage, saveImagesBatch, savePresentation, toggleLike } from "@/lib/gallery/actions";
import { deleteAppointment, fetchAppointments, saveAppointment, setAppointmentDone } from "@/lib/appointments/actions";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import type { Cases } from "./types";

const EMPTY = { calibration: { mmPerUnit: 1 }, tables: [], placements: [] } as unknown as DesignDocumentContent;
const stray = (who: string) => `isolation-stray-${who}-${Date.now()}@example.test`;
const isError = (r: unknown) => r instanceof Error || (!!r && typeof r === "object" && typeof (r as { error?: unknown }).error === "string");
/** A count an outsider may get: nothing, an error, or zero of everything. */
const noCounts = (r: unknown) => isError(r) || r === null || r === undefined || !/[1-9]/.test(JSON.stringify(r));

export const STUDIO_CASES: Cases = {
  // ── events ──
  "lib/events/actions.ts#fetchEvents": { call: () => fetchEvents() },
  "lib/events/actions.ts#fetchEvent": { call: (a) => fetchEvent(a.eventId) },
  "lib/events/actions.ts#fetchActiveEvent": { call: (a) => fetchActiveEvent(a.eventId) },
  "lib/events/actions.ts#saveEvent": { call: (a) => saveEvent({ ...a.event, clientName: "B was here" }) },
  "lib/events/actions.ts#patchEvent": { call: (a) => patchEvent(a.eventId, { clientName: "B was here" } as never) },
  "lib/events/actions.ts#deleteEvent": { call: (a) => deleteEvent(a.eventId) },
  "lib/events/actions.ts#fetchEventFootprint": { call: (a) => fetchEventFootprint(a.eventId), expect: noCounts },
  "lib/events/actions.ts#reachStep": { call: (a) => reachStep(a.eventId, 4) },
  "lib/events/actions.ts#confirmEvent": { call: (a) => confirmEvent(a.eventId) },
  "lib/events/actions.ts#markEventLost": { call: (a) => markEventLost(a.eventId) },
  "lib/events/actions.ts#reopenEvent": { call: (a) => reopenEvent(a.eventId) },
  "lib/events/workspace.ts#fetchEventWorkspace": { call: (a) => fetchEventWorkspace(a.eventId) },

  // ── an event's clients ──
  "lib/events/client-actions.ts#fetchEventClients": { call: (a) => fetchEventClients(a.eventId) },
  "lib/events/client-actions.ts#canEmailClients": { call: () => canEmailClients() },
  "lib/events/client-actions.ts#shareEventWithClient": { call: (a) => shareEventWithClient(a.eventId, { name: "B", email: stray("share") }) },
  "lib/events/client-actions.ts#regenerateClientInvite": { call: (a) => regenerateClientInvite(a.eventId, a.clientC) },
  "lib/events/client-actions.ts#emailClientInvite": { call: (a) => emailClientInvite(a.eventId, a.clientC, "x") },
  "lib/events/client-actions.ts#setEventClientRole": { call: (a) => setEventClientRole(a.eventId, a.clientC, "viewer" as never) },
  "lib/events/client-actions.ts#unshareEventClient": { call: (a) => unshareEventClient(a.eventId, a.clientC) },

  // ── the drawing and saved sketches ──
  "lib/studio/actions.ts#fetchDocument": { call: (a) => fetchDocument(a.eventId) },
  "lib/studio/actions.ts#saveDocument": { call: (a) => saveDocument(a.eventId, EMPTY) },
  "lib/studio/actions.ts#sealDocument": { call: (a) => sealDocument(a.eventId) },
  "lib/studio/sketch-actions.ts#fetchSketchTemplates": { call: () => fetchSketchTemplates() },
  "lib/studio/sketch-actions.ts#saveSketchTemplate": {
    call: (a) => saveSketchTemplate({ name: "B", venueId: a.venueId, content: EMPTY }),
    allow: (a) => [a.venueId],
    reason: "B may pin its OWN sketch to A's venue — every business opens every venue's plan",
  },
  "lib/studio/sketch-actions.ts#deleteSketchTemplate": { call: (a) => deleteSketchTemplate(a.sketchTemplateId) },
  "lib/studio/sketch-actions.ts#setSketchPhoto": { call: (a) => setSketchPhoto(a.sketchTemplateId, "https://example.test/x.jpg") },
  "lib/studio/sketch-actions.ts#fetchSketchTemplateContent": { call: (a) => fetchSketchTemplateContent(a.sketchTemplateId) },
  "lib/studio/sketch-actions.ts#seedEventDocument": { call: (a) => seedEventDocument(a.eventId, a.sketchTemplateId, 1) },

  // ── quotes ──
  "lib/quotes/actions.ts#fetchIssuedQuote": { call: (a) => fetchIssuedQuote(a.eventId) },
  "lib/quotes/actions.ts#fetchQuoteDraft": { call: (a) => fetchQuoteDraft(a.eventId) },
  "lib/quotes/actions.ts#saveQuoteDraft": { call: (a) => saveQuoteDraft(a.eventId, { ...DEFAULT_LAYOUT, paletteNote: "B" }) },
  "lib/quotes/actions.ts#issueQuote": { call: (a) => issueQuote(a.eventId, { layout: DEFAULT_LAYOUT, total: 1, discount: 0 } as never) },

  // ── outputs ──
  "lib/outputs/actions.ts#fetchSpares": { call: (a) => fetchSpares(a.eventId) },
  "lib/outputs/actions.ts#saveSpare": { call: (a) => saveSpare(a.eventId, a.variantId, 9) },
  // A has one export, so its next number is 2: an outsider must not learn it.
  "lib/outputs/actions.ts#fetchNextExportNumber": { call: (a) => fetchNextExportNumber(a.eventId), expect: (r) => isError(r) || r !== 2 },
  "lib/outputs/actions.ts#recordExport": { call: (a) => recordExport(a.eventId, "quote" as never) },
  "lib/outputs/actions.ts#fetchExports": { call: (a) => fetchExports(a.eventId), expect: (r) => isError(r) || (Array.isArray(r) && r.length === 0) },

  // ── the 3D scene ──
  // A's settings turn the place settings off; an outsider must not read that.
  "lib/scene/actions.ts#fetchSceneSettings": { call: (a) => fetchSceneSettings(a.eventId), expect: (r) => isError(r) || (r as { tableware?: unknown })?.tableware !== false },
  "lib/scene/actions.ts#saveSceneSettings": { call: (a) => saveSceneSettings(a.eventId, { tableware: true }) },
  "lib/scene/actions.ts#fetchSceneLinks": { call: (a) => fetchSceneLinks(a.eventId) },
  "lib/scene/actions.ts#mintSceneLink": { call: (a) => mintSceneLink(a.eventId) },
  "lib/scene/actions.ts#revokeSceneLink": { call: (a) => revokeSceneLink(a.eventId, a.sceneLinkId) },

  // ── production ──
  "lib/production/actions.ts#fetchRunway": { call: () => fetchRunway() },
  "lib/production/actions.ts#setEventCrew": { call: (a) => setEventCrew(a.eventId, [a.memberA]) },
  "lib/production/actions.ts#fetchEventProduction": { call: (a) => fetchEventProduction(a.eventId) },
  "lib/production/actions.ts#fetchLoadIn": { call: (a) => fetchLoadIn(a.eventId) },

  // ── a client's proposals ──
  "lib/proposals/actions.ts#fetchSubmittedProposal": { call: (a) => fetchSubmittedProposal(a.eventId) },
  "lib/proposals/actions.ts#fetchPendingProposals": { call: () => fetchPendingProposals() },
  "lib/proposals/actions.ts#resolveProposal": { call: (a) => resolveProposal(a.proposalId, { accept: [], force: [] } as never) },

  // ── gallery ──
  "lib/gallery/actions.ts#fetchImages": { call: () => fetchImages() },
  "lib/gallery/actions.ts#saveImage": { call: (a) => saveImage({ ...a.image, name: "B was here" }) },
  "lib/gallery/actions.ts#saveImagesBatch": { call: (a) => saveImagesBatch([{ ...a.image, name: "B was here" }]) },
  "lib/gallery/actions.ts#fetchPresentations": { call: () => fetchPresentations() },
  "lib/gallery/actions.ts#savePresentation": { call: (a) => savePresentation({ ...a.presentation, name: "B was here" }) },
  "lib/gallery/actions.ts#deletePresentation": { call: (a) => deletePresentation(a.presentation.id) },
  "lib/gallery/actions.ts#fetchFolder": { call: (a) => fetchFolder(a.eventId) },
  "lib/gallery/actions.ts#toggleLike": { call: (a) => toggleLike(a.eventId, a.image.id) },

  // ── the diary ──
  "lib/appointments/actions.ts#fetchAppointments": { call: () => fetchAppointments() },
  "lib/appointments/actions.ts#saveAppointment": { call: (a) => saveAppointment({ ...a.appointment, clientName: "B was here" }) },
  "lib/appointments/actions.ts#setAppointmentDone": { call: (a) => setAppointmentDone(a.appointment.id, true) },
  "lib/appointments/actions.ts#deleteAppointment": { call: (a) => deleteAppointment(a.appointment.id) },
};
