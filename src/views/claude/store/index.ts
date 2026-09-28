import { atomWithStorage } from 'jotai/utils';

export const claudeHistoryAtom = atomWithStorage<{ ip: string; time: string }[]>(
  'egress-scope:claude-history',
  []
);
