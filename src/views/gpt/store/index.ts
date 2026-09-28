import { atomWithStorage } from 'jotai/utils';

export const gptHistoryAtom = atomWithStorage<{ ip: string; time: string }[]>(
  'egress-scope:gpt-history',
  []
);
