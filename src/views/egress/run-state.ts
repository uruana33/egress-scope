import { atom, useAtom } from 'jotai';

// A measurement round belongs to the session, not a mounted tab panel.
export const egressRunAtoms = {
  split: atom(0),
  dns: atom(0),
  cdn: atom(0),
};

export function useEgressRun(scope: keyof typeof egressRunAtoms) {
  return useAtom(egressRunAtoms[scope]);
}
