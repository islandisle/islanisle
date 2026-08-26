// Tourist Pro tier (Batch 25, not in the original spec). There's no
// working payment path for tourist/local accounts yet — same situation as
// config/payments.js's ONLINE_PAYMENTS_ENABLED on the business side — so
// every account currently gets Pro's perks (right now: contact info on
// "More on this island" external places) regardless of users.pro's actual
// stored value. Flipping this to false is meant to be the only change
// needed to start enforcing the real per-account column once a tourist
// subscription flow exists — see isEffectivelyPro() below, the single
// place every caller should check instead of reading users.pro directly.
export const TOURIST_PRO_DEFAULT_UNLOCKED = true;

export function isEffectivelyPro(user) {
  return TOURIST_PRO_DEFAULT_UNLOCKED || Boolean(user?.pro);
}
