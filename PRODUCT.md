# Product

## Register

product

## Platform

web

## Users

The primary user is the event designer — in phase 1, a single professional (the product owner) who receives a hall sketch as a PDF, dresses it with their own decor catalog, sells the result to a client, and hands off to a setup crew. They work mostly from a desktop, occasionally from a tablet, in sessions that can run for hours. Their job to be done: go from a "dead" hall drawing to a fully planned event, and produce the paperwork that makes the event happen without hand-counting.

Two secondary audiences consume outputs but do not edit in phase 1. The setup crew receives a printed or on-phone placement map; their only requirement is that it be unambiguous in field conditions. The client (the event's owner) is a passive viewer of the visualization — a screenshot or 2D export now, a shared preview link in phase 2. The data model is multi-tenant from day one so other designers can become users in the SaaS phase, but they are not a phase-1 audience.

## Product Purpose

The platform turns a hall sketch into a live map where the designer places their decor catalog, and produces value in three directions from one source of truth: a client-facing visualization (sales), a placement map for the crew (execution), and a packing list for the warehouse (logistics) — plus a price quote. It exists because the process today is manual: the designer marks up a PDF, counts items by hand, and discovers counting or placement mistakes at the hall on event day, when they are most expensive to fix. Success in phase 1 is one real event planned and executed end-to-end through the system, with a packing list that shipped without hand-correction, in less prep time than the manual process took.

## Positioning

One edit, three deliverables: the designer's catalog worn over a real hall map, generating the sales visualization, the execution map, and the logistics list from a single design document — so the numbers on the packing list can never drift from what was drawn.

## Brand Personality

A quiet studio with refined details. The interface is a neutral workspace whose only real color is the designer's own work — the hall plan and the product photography. The chrome recedes so that a long working session stays calm rather than loud. Restraint is not the same as being unfinished: the typography, spacing, and small interaction details are considered enough that the tool reads as trustworthy and professional. Voice is plain, competent, and Hebrew-native — it states, it doesn't sell.

## Anti-references

Not a generic SaaS dashboard: no purple gradients, hero-metric cards, chart-everything layouts, or endless icon-heading-text card grids. Not a trendy dark-mode developer terminal — wrong world for event and interior design. Not consumer-flashy or playful: no bright bounce, gamification, or illustration filler; this is professional operational software. Not a cluttered enterprise CRM: no dense gray-on-gray toolbars or deep nav trees that bury the canvas.

## Design Principles

One document, many renderers. The design document is the subject and the single source of truth (ADR-4); the 2D studio, the operational PDFs, the quote, and the phase-2 3D scene are all views of it. No surface owns its own truth, and the packing list can never disagree with the plan.

Suggest, don't impose. The system proposes and the user confirms — import detection is a layer of suggestions to accept or reject, and geometry checks warn rather than block. The designer stays in control of every decision.

The tool recedes; the work is the color. Neutral canvas, one accent, restraint in the chrome — so attention and visual weight belong to the plan and the product imagery, not to the interface around them.

Usable before it's automated. Value comes before cleverness (ADR-3): the manual path ships first and stays a first-class route, so the system is useful long before the detection pipeline is built.

Legible in the field. Outputs are used on a warehouse floor and a hall under setup, not just on screen — they must survive black-and-white printing and a phone or tablet, staying readable without relying on color.

## Accessibility & Inclusion

Target WCAG AA contrast and semantics throughout. Hebrew and RTL are the primary direction, designed first, not retrofitted. Operational outputs (placement map, packing list) must stay fully legible printed in black-and-white — hierarchy and distinctions carried by weight, shape, and labeling, never by color alone. Every animation ships a `prefers-reduced-motion` alternative. Viewing and outputs are usable from a tablet on-site (full editing remains a desktop task in phase 1).
