// Tagalog. Steve, 23 Oct: "Please add both, Filipino (fil) and Tagalog (tl)".
//
// fil and tl are the same language; the two codes exist because people look for different
// names. This re-exports the Filipino dictionary instead of copying it, so the two can never
// drift apart. They had on Android, where values-tl sat 209 keys behind values-fil and anyone
// who picked "Tagalog" got a visibly more English app than anyone who picked "Filipino".
import { fil } from "./fil";

export const tl = fil;
