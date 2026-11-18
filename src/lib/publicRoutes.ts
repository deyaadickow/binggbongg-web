// The sign-up wall (Steve, 2026-11-17: "If they install and don't signup they are not allowed to go
// in the app."). Everything on the website is behind it EXCEPT the pages below, which must open for
// anyone: Google and Bing index them, Meta's ad review crawls what an ad lands on, and the App Store
// and Google Play need the Terms, Privacy, Contact and Delete-account addresses to work signed out.
//
// Add a page here only if strangers have to see it without an account. The feed, live rooms,
// games, battles, profiles and everything a member does stay behind the wall.

const EXACT = new Set<string>([
  // The ads' landing page (LandingSwitch in App.tsx). Meta reviews it.
  "/ph",
  // What Bingg Bongg is: the feature directory the build-time SEO page is made from, the
  // 60-second feature videos, and the explainer. All three are in sitemap.xml.
  "/features",
  "/feature-videos",
  "/settings/app-features",
  // Gold Digger's board (2026-11-17): the leaders and Hall of Fame are for everyone to see; finding
  // gold needs an account, and the page says so.
  "/gold-digger",
  "/settings/about",
  "/settings/faq",
  // Legal and store-required pages.
  "/settings/terms",
  "/settings/privacy",
  "/settings/contact",
  "/settings/safety",
  "/safety",
  "/settings/delete-account",
]);

const PREFIXES = [
  // A member's invite link: who invited you, their video, their code (prefilled on the wall).
  "/invite/",
  // The public share pages of a member's Bingg Bongg Song and Bingg Bongg Video Ad.
  "/song/",
  "/ad/",
];

function clean(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

/** True for a page anyone may open without an account. */
export function isPublicPath(pathname: string): boolean {
  const p = clean(pathname);
  return EXACT.has(p) || PREFIXES.some((x) => p.startsWith(x));
}

/** A signed-in member who still has to verify their email sees "Check your email" everywhere
 *  except these: the rules they agreed to, how to reach us, and how to delete the account. */
const VERIFY_EXEMPT = new Set<string>([
  "/settings/terms",
  "/settings/privacy",
  "/settings/contact",
  "/settings/safety",
  "/safety",
  "/settings/delete-account",
]);

export function isVerifyExempt(pathname: string): boolean {
  return VERIFY_EXEMPT.has(clean(pathname));
}
