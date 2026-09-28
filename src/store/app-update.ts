import { atom } from 'jotai';

/** New build detected while the app is open. */
export const updateAvailableAtom = atom(false);

/** A reload is queued because an update is being applied. */
export const updatePendingAtom = atom(false);
