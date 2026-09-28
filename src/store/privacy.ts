import { atomWithStorage } from 'jotai/utils';

/** When on, IP addresses are masked before rendering. */
export const hideIpAtom = atomWithStorage('egress-scope:hide-ip', false);
