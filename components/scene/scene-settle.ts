"use client";
// "The camera settled": one callback, SETTLE_MS after the camera last moved — never per frame.
// Two things listen for it (the real point lights re-pick their emitters, the level-of-detail
// evaluation flips what is drawn), and both would be wrong per frame on a demand-rendered canvas:
// the work is a pass over every body, and the result is a visibility change that itself needs a
// frame.
//
// Two sources arm the same debounce: the controls' `change`/`end` events when drei's controls are
// the default (the author camera), and any RENDERED frame on which the camera's pose differs from
// the last settled one — so a phase-C fly-in or a bounds jump with no controls settles too. The
// pose is compared, not the event count, so a frame drawn for a mood change on a still camera arms
// nothing. The timer runs outside the frame loop and the callback invalidates for itself.
import { useEffect, useRef } from "react";
import { type Camera, type EventDispatcher, Quaternion, Vector3 } from "three";
import { useFrame, useThree } from "@react-three/fiber";

export const SETTLE_MS = 200;

interface ControlsEvents {
  change: object;
  end: object;
}

export function useCameraSettle(onSettle: (camera: Camera) => void, delayMs = SETTLE_MS): void {
  const get = useThree((s) => s.get);
  const controls = useThree((s) => s.controls);
  const cb = useRef(onSettle);
  cb.current = onSettle;
  const settled = useRef({ p: new Vector3(), q: new Quaternion(), valid: false });
  const timer = useRef(0);

  const fire = () => {
    timer.current = 0;
    const camera = get().camera;
    const s = settled.current;
    s.p.copy(camera.position);
    s.q.copy(camera.quaternion);
    s.valid = true;
    cb.current(camera);
  };
  const arm = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fire, delayMs);
  };
  const armRef = useRef(arm);
  armRef.current = arm;

  useFrame(({ camera }) => {
    const s = settled.current;
    if (s.valid && s.p.equals(camera.position) && s.q.equals(camera.quaternion)) return;
    armRef.current();
  });

  useEffect(() => {
    if (!controls) return;
    // fiber types the default controls as a bare dispatcher; drei's OrbitControls fire these two.
    const c = controls as unknown as EventDispatcher<ControlsEvents>;
    const h = () => armRef.current();
    c.addEventListener("change", h);
    c.addEventListener("end", h);
    return () => {
      c.removeEventListener("change", h);
      c.removeEventListener("end", h);
    };
  }, [controls]);

  useEffect(() => {
    armRef.current();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = 0;
    };
  }, []);
}
