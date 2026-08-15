"use client";
// The studio's diary, for the dashboard.
//
// No client-side cache, same as events and venues and for the same reason: the one screen that reads
// this loads it before anything renders. Every mutation returns the whole list from the server
// rather than patching local state, so a meeting moved on the laptop is the same meeting on the
// tablet the next time either one writes.
import { useCallback, useEffect, useState } from "react";
import type { Appointment } from "./types";
import {
  deleteAppointment,
  fetchAppointments,
  saveAppointment,
  setAppointmentDone,
} from "./actions";

export interface AppointmentsHandle {
  appointments: Appointment[];
  /** False until the first fetch resolves. "No meetings yet" and "not loaded yet" are identical in
   *  the data and mean opposite things to a screen deciding whether to show an empty state. */
  ready: boolean;
  error: string | null;
  /** These three throw on failure rather than swallowing it — the dialog that calls them shows the
   *  message inline, and a save that silently did nothing is how a designer loses a meeting. */
  save: (appointment: Appointment) => Promise<void>;
  setDone: (id: string, done: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reload: () => Promise<void>;
}

export function useAppointments(): AppointmentsHandle {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setAppointments(await fetchAppointments());
  }, []);

  useEffect(() => {
    let live = true;
    load()
      .catch(() => {
        if (live) setError("לא ניתן לטעון את הפגישות");
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [load]);

  const save = useCallback(async (appointment: Appointment) => {
    setAppointments(await saveAppointment(appointment));
  }, []);

  const setDone = useCallback(async (id: string, done: boolean) => {
    setAppointments(await setAppointmentDone(id, done));
  }, []);

  const remove = useCallback(async (id: string) => {
    setAppointments(await deleteAppointment(id));
  }, []);

  return { appointments, ready, error, save, setDone, remove, reload: load };
}
