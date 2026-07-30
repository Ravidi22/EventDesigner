// Seed hall shells (F-3.1) — geometry only, no table layouts (those come per event from iPlan).
import type { HallTemplate } from "./types";

export const SEED_TEMPLATES: HallTemplate[] = [
  {
    id: "hall-main",
    name: "אולם ראשי — האולם הקבוע שלי",
    hall: {
      widthMm: 20000,
      heightMm: 13000,
      outline: [
        { x: 0, y: 0 },
        { x: 20000, y: 0 },
        { x: 20000, y: 13000 },
        { x: 0, y: 13000 },
      ],
      ceilingHeightMm: 4500,
      columns: [
        { x: 6500, y: 6500, rMm: 350 },
        { x: 13500, y: 6500, rMm: 350 },
      ],
      entrances: [
        {
          id: "ent-1",
          wallIndex: 2,
          distanceMm: 10000,
          widthMm: 1800,
          swingInward: true,
          doubleDoor: true,
        },
      ],
      stage: {
        id: "fx-stage",
        label: "במה",
        x: 10000,
        y: 1600,
        widthMm: 6000,
        depthMm: 2400,
        heightMm: 600,
        shape: "rect",
        rotationDeg: 0,
      },
      bars: [],
    },
    mmPerUnit: 1,
    createdAt: Date.parse("2026-05-02"),
  },
  {
    id: "hall-garden",
    name: "גן אירועים — מתחם חוץ",
    hall: {
      widthMm: 26000,
      heightMm: 16000,
      outline: [
        { x: 0, y: 0 },
        { x: 26000, y: 0 },
        { x: 26000, y: 16000 },
        { x: 0, y: 16000 },
      ],
      ceilingHeightMm: 0, // outdoor — no ceiling
      columns: [],
      entrances: [
        {
          id: "ent-1",
          wallIndex: 0,
          distanceMm: 4000,
          widthMm: 2400,
          swingInward: true,
          doubleDoor: true,
        },
      ],
      bars: [
        {
          id: "fx-bar",
          label: "בר",
          x: 22000,
          y: 3000,
          widthMm: 2200,
          depthMm: 2200,
          heightMm: 1100,
          shape: "circle",
          rotationDeg: 0,
        },
      ],
    },
    mmPerUnit: 1,
    createdAt: Date.parse("2026-06-18"),
  },
];
