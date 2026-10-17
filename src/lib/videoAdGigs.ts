// Video Ad Gig (Steve, 2026-10-17) — mirrors VideoAdGigController.php.
//
//   "Influencers ready to work... Making a 15, 30, 45 and 60 seconds videos ads for any
//    member's business, service or personal. 15 seconds $89 / 30 $129 / 45 $169 / 60 $199.
//    The buyer will need to add money to their spending cash account. Influencers will earn
//    50% of the gig."
//
// The buyer pays out of their Spending Cash Account when they order; the influencer's half is
// only paid once the finished video is accepted. Nothing here hardcodes a price — the four
// lengths and every window come down with the listing, so admin is the only place they live.
import { post } from "./api";
import { createUploadUrls, uploadErrorMessage } from "./upload";

export type GigStatus = "pending_review" | "approved" | "rejected" | "suspended";
export type GigOrderStatus =
  | "pending" | "accepted" | "delivered" | "completed" | "declined" | "cancelled" | "refunded";

export interface GigPrice { seconds: number; price: number }

export interface GigOffer {
  prices: GigPrice[];
  influencer_share_percent: number;
  response_days: number;
  delivery_days: number;
  accept_days: number;
}

export interface GigCard {
  id: number;
  user_id: number;
  headline?: string | null;
  about?: string | null;
  video?: string | null;
  thumbnail?: string | null;
  completed_count: number;
  influencer_name?: string | null;
  influencer_username?: string | null;
  influencer_image?: string | null;
  is_verified?: boolean;
  /** Only ever sent to the influencer about their own listing. */
  status?: GigStatus;
  rejected_reason?: string | null;
}

export interface GigOrder {
  id: number;
  order_number: string;
  gig_id: number;
  role: "buyer" | "influencer";
  seconds: number;
  price: number;
  influencer_amount: number;
  influencer_share_percent: number;
  status: GigOrderStatus;
  status_label: string;
  is_late: boolean;
  business_name?: string | null;
  brief?: string | null;
  video?: string | null;
  thumbnail?: string | null;
  other_name?: string | null;
  other_username?: string | null;
  other_image?: string | null;
  other_user_id?: number | null;
  due_at?: string;
  delivered_at?: string;
  auto_accept_at?: string;
  completed_at?: string;
  refund_amount: number;
  cancel_reason?: string | null;
  created_at?: string;
}

const offerOf = (body: Record<string, unknown>): GigOffer | null =>
  (body.offer as GigOffer | undefined) ?? null;

/** The feed tab. `q` searches the pitch AND the influencer, server-side. */
export async function fetchVideoAdGigs(q = ""): Promise<{ rows: GigCard[]; offer: GigOffer | null; enabled: boolean }> {
  const r = await post<GigCard[]>("fetchVideoAdGigs", { q });
  const body = r as unknown as Record<string, unknown>;
  return { rows: r.data ?? [], offer: offerOf(body), enabled: Boolean(body.enabled) };
}

export async function fetchMyVideoAdGig(myUserId: number): Promise<{
  gig: GigCard | null; orders: GigOrder[]; offer: GigOffer | null; enabled: boolean; wallet: number;
}> {
  const r = await post<GigCard | null>("fetchMyVideoAdGig", { user_id: myUserId });
  const body = r as unknown as Record<string, unknown>;
  return {
    gig: (r.data as GigCard | null) ?? null,
    orders: (body.orders as GigOrder[] | undefined) ?? [],
    offer: offerOf(body),
    enabled: Boolean(body.enabled),
    wallet: Number(body.wallet ?? 0),
  };
}

export async function fetchMyVideoAdGigOrders(myUserId: number): Promise<{
  orders: GigOrder[]; cashAccount: number; offer: GigOffer | null;
}> {
  const r = await post<GigOrder[]>("fetchMyVideoAdGigOrders", { user_id: myUserId });
  const body = r as unknown as Record<string, unknown>;
  return { orders: r.data ?? [], cashAccount: Number(body.cash_account ?? 0), offer: offerOf(body) };
}

export async function orderVideoAdGig(myUserId: number, f: {
  gig_id: number; seconds: number; business_name: string; brief: string;
}): Promise<{ message: string; order: GigOrder | null; cashAccount: number }> {
  const r = await post<GigOrder>("orderVideoAdGig", { user_id: myUserId, ...f });
  const body = r as unknown as Record<string, unknown>;
  // The server's refusal carries the real figures — "you have $40 and this gig is $89" — so it
  // has to reach the buyer word for word rather than becoming a generic failure.
  if (!r.status) throw new Error(r.message ?? "Couldn't place that order.");
  return {
    message: r.message ?? "Ordered.",
    order: (r.data as GigOrder | null) ?? null,
    cashAccount: Number(body.cash_account ?? 0),
  };
}

export async function acceptVideoAdGigOrder(myUserId: number, orderId: number) {
  const r = await post("acceptVideoAdGigOrder", { user_id: myUserId, order_id: orderId });
  if (!r.status) throw new Error(r.message ?? "Couldn't accept that.");
  return r.message ?? "Accepted.";
}

export async function cancelVideoAdGigOrder(myUserId: number, orderId: number) {
  const r = await post("cancelVideoAdGigOrder", { user_id: myUserId, order_id: orderId });
  if (!r.status) throw new Error(r.message ?? "Couldn't cancel that.");
  return r.message ?? "Cancelled.";
}

export async function respondVideoAdGigOrder(myUserId: number, orderId: number, action: "accept" | "decline", reason = "") {
  const r = await post("respondVideoAdGigOrder", { user_id: myUserId, order_id: orderId, action, reason });
  if (!r.status) throw new Error(r.message ?? "Couldn't send that.");
  return r.message ?? "Sent.";
}

/**
 * Uploading from the browser, both times it happens here: the influencer's pitch video and the
 * finished ad.
 *
 * The browser holds no AWS credentials (they were pulled out of every client in September), so
 * this takes the three-step route the rest of the site uses — ask for a signed slot, PUT the
 * bytes straight to S3, then hand the backend only the key. The backend accepts that key as an
 * alternative to a multipart file, which is also what keeps a 200MB cut of video from going
 * through PHP.
 */
async function putToS3(myUserId: number, file: File, onProgress?: (f: number) => void): Promise<string> {
  const [slot] = await createUploadUrls(myUserId, [{
    file_name: `${Date.now()}_${file.name.replace(/[^\w.\-]+/g, "_")}`,
    content_type: file.type || "video/mp4",
  }]);
  if (!slot) throw new Error("Couldn't prepare the upload.");

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", slot.upload_url, true);
    for (const [k, v] of Object.entries(slot.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(uploadErrorMessage(xhr.status))));
    xhr.onerror = () => reject(new Error(uploadErrorMessage(0)));
    xhr.send(file);
  });

  return slot.key;
}

/** Apply to be listed, or replace the pitch video later (which sends it back for review). */
export async function applyForVideoAdGig(myUserId: number, f: {
  headline: string; about: string; video: File | null;
}, onProgress?: (fraction: number) => void): Promise<{ message: string; gig: GigCard | null }> {
  const params: Record<string, unknown> = { user_id: myUserId, headline: f.headline, about: f.about };
  if (f.video) params.video_key = await putToS3(myUserId, f.video, onProgress);

  const r = await post<GigCard>("applyForVideoAdGig", params);
  // A pitch the moderation check flagged comes back as status false with the reason in the
  // message — a real answer, not a transport failure, so show it as it is.
  if (!r.status) throw new Error(r.message ?? "Couldn't send that.");
  return { message: r.message ?? "Sent for review.", gig: (r.data as GigCard | null) ?? null };
}

/** The influencer hands over the finished ad. */
export async function deliverVideoAdGigOrder(myUserId: number, orderId: number, video: File, onProgress?: (fraction: number) => void) {
  const key = await putToS3(myUserId, video, onProgress);
  const r = await post("deliverVideoAdGigOrder", { user_id: myUserId, order_id: orderId, video_key: key });
  if (!r.status) throw new Error(r.message ?? "Couldn't deliver that.");
  return r.message ?? "Delivered.";
}
