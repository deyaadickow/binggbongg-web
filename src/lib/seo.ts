// Per-page title, description and canonical for search engines (Steve, 2026-10-30: "Can you
// create seo for Bingg Bongg?"). index.html carries the home page's; this keeps them right on
// every public page as the app moves between routes (Google runs the app and reads the result).
// Pages not listed get the home page's description with their own canonical address.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SITE = "https://www.binggbongg.com";
const HOME_TITLE = "Bingg Bongg – The New Social Media App: Live Video, Chat & Friends";
const HOME_DESC = "Make friends all over the world: go live, chat in 53 languages, share short videos and photos, and join friendly live battles. Free on Android & iPhone.";

const PAGES: Record<string, [string, string]> = {
  // The ads' landing page (Steve, 2026-10-31). No money wording: Meta reviews this page too.
  "/ph": ["Bingg Bongg – The New Social Media App", "Go live, chat and share videos with friends all over the world. Free on Google Play and the App Store."],
  "/features": ["Bingg Bongg Features – Every Way to Go Live, Battle and Make Friends", "Every Bingg Bongg feature in one place: going live, 20 battle modes, videos, Green Screen, face filters, translation and more."],
  "/feature-videos": ["Bingg Bongg Feature Videos – See Every Feature in 60 Seconds", "Watch a 60-second video of every Bingg Bongg feature: live streaming, battles, videos, Green Screen and more."],
  "/contests": ["Contests – Bingg Bongg", "Bingg Bongg talent contests, where members vote for their favourites."],
  "/exciting-news": ["Exciting News – What's New on Bingg Bongg", "Everything new on Bingg Bongg: countries, features and launches."],
  "/live": ["Live Now – Watch Live Streams on Bingg Bongg", "Watch live streams and battles from all over the world on Bingg Bongg, in 53 languages."],
  "/pre-launch": ["Pre-Launch Special | Bingg Bongg", "Go live, battle and make friends on Bingg Bongg before launch day."],
  "/referral-program": ["Referral Program – Earn 5% for Every Member You Bring | Bingg Bongg", "Share your Bingg Bongg referral code and earn 5% of what every new member earns."],
  "/vip-referral": ["VIP Referral Member – Earn Up to $100 per Member | Bingg Bongg", "Apply to be a Bingg Bongg VIP Referral Member and earn 5% of what every new member earns, up to $100 each."],
  "/help": ["Help – Members Helping Members on Bingg Bongg", "Help campaigns on Bingg Bongg: members supporting members who are going through a hard time."],
  "/shows": ["Your Own Live Show – Bingg Bongg Shows", "Run your own live show on Bingg Bongg, with your own advertisers."],
  "/cvc": ["Country VS Country Challenges – Bingg Bongg", "Help your country win live Country VS Country battles on Bingg Bongg."],
  "/gigs": ["Video Ad Gig – Get a Video Ad Made by an Influencer | Bingg Bongg", "Get a video ad made for your business by a Bingg Bongg influencer, or earn by making ads."],
  "/business": ["Bingg Bongg Business – Business Pages", "Find businesses on Bingg Bongg, or give your business its own page."],
  "/go-live/computer": ["Go Live From Your Computer – Bingg Bongg with OBS", "Stream to Bingg Bongg from your computer with OBS or any RTMP app."],
  "/settings/about": ["About Bingg Bongg", "About Bingg Bongg Inc. and the Bingg Bongg live streaming app."],
  "/settings/faq": ["FAQ – Bingg Bongg", "Answers to common questions about Bingg Bongg."],
  "/settings/contact": ["Contact Bingg Bongg", "How to contact the Bingg Bongg team."],
  "/settings/terms": ["Terms of Use – Bingg Bongg", "The Bingg Bongg Terms of Use."],
  "/settings/privacy": ["Privacy Policy – Bingg Bongg", "The Bingg Bongg Privacy Policy."],
  "/settings/app-features": ["How Bingg Bongg Works – App Features Explainer", "A walk through how every part of the Bingg Bongg app works."],
};

function setMeta(selector: string, attr: string, value: string) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

/** Mount once inside the router. */
export function RouteMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const path = pathname.replace(/\/+$/, "") || "/";
    const [title, desc] = PAGES[path] ?? (path === "/" ? [HOME_TITLE, HOME_DESC] : ["Bingg Bongg", HOME_DESC]);
    document.title = title;
    setMeta('meta[name="description"]', "content", desc);
    setMeta('link[rel="canonical"]', "href", SITE + (path === "/" ? "/" : path));
    setMeta('meta[property="og:url"]', "content", SITE + (path === "/" ? "/" : path));
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", desc);
  }, [pathname]);
  return null;
}
