// Seat avatars — the three personas as portraits, the three institutions as marks.
// Served from public/avatars (160px, retina-comfortable for the 32–40px slots).
import type { Role } from '../state/WalletSession';

export const AVATAR: Record<Role, string> = {
  gp: '/avatars/gp.png',
  buyer: '/avatars/buyer.png',
  lpExiting: '/avatars/lpExiting.png',
  lpRolling: '/avatars/lpRolling.png',
  lpac: '/avatars/lpac.png',
  valuer: '/avatars/valuer.png',
};
