import { currentAuthHeaders, post } from "./api";
import { API_BASE, uploadErrorMessage } from "./upload";
import type { ShopProduct, ShopOrder, ShopSampleRequest } from "./shop";

// The two business-side roles in the Bingg Bongg Shop, mirroring ShopController.php.
//
//  - A SELLER (supplier) lists their own products, sets their own prices, and ships. They are
//    paid directly by Stripe at checkout, less the platform's cut.
//  - An AGENT (Steve, 2026-10-16) signs suppliers up. They never hold stock and never ship,
//    and they earn a share of every sale of the products they brought in.
//
// Both live on the web rather than in the phone apps because both are desk work: uploading a
// catalogue, printing labels, chasing orders.

// ---------------------------------------------------------------------------------------
// Seller

export interface SellerStatus {
  id: number;
  name: string;
  status: "pending_review" | "approved" | "rejected" | "suspended" | string;
  stripe_connected: boolean;
}

export async function fetchMySellerStatus(myUserId: number): Promise<{ seller: SellerStatus | null; sellersEnabled: boolean }> {
  const r = await post<SellerStatus | null>("fetchMySellerStatus", { my_user_id: myUserId });
  return { seller: (r.data as SellerStatus | null) ?? null, sellersEnabled: Boolean((r as { sellers_enabled?: boolean }).sellers_enabled) };
}

export async function applyShopSeller(myUserId: number, f: { name: string; contact_email: string; country_code: string }) {
  const r = await post("applyShopSeller", { my_user_id: myUserId, ...f });
  if (!r.status) throw new Error(r.message ?? "Couldn't send that application.");
  return r.message ?? "Application received.";
}

export async function mySellerProducts(myUserId: number): Promise<ShopProduct[]> {
  const r = await post<ShopProduct[]>("mySellerProducts", { my_user_id: myUserId });
  return r.data ?? [];
}

export interface NewProductForm {
  title: string;
  description: string;
  price_cents: number;
  shipping_cents: number;
  /** Blank means stock is not tracked here, which the server stores as NULL. */
  stock: string;
  samples_enabled: boolean;
}

/** The server takes up to this many photos, named image_1 … image_N. */
export const MAX_PRODUCT_IMAGES = 6;

export function createSellerProduct(myUserId: number, f: NewProductForm, images: File[], video: File | null, onProgress?: (fraction: number) => void): Promise<ShopProduct> {
  const form = new FormData();
  form.append("my_user_id", String(myUserId));
  form.append("title", f.title);
  form.append("description", f.description);
  form.append("price_cents", String(f.price_cents));
  form.append("shipping_cents", String(f.shipping_cents));
  // Only send stock when it was actually filled in. An empty string would be read as 0, which
  // means "sold out" rather than "not tracked".
  //
  // What a streamer earns is deliberately NOT here: Bingg Bongg pays the streamer out of its
  // own share, and a seller never sets or sees that number (Steve, 2026-10-16).
  if (f.stock.trim() !== "") form.append("stock", String(parseInt(f.stock, 10)));
  form.append("samples_enabled", f.samples_enabled ? "1" : "0");
  images.slice(0, MAX_PRODUCT_IMAGES).forEach((file, i) => form.append(`image_${i + 1}`, file));
  if (video) form.append("video", video);
  return multipart<ShopProduct>("createSellerProduct", form, onProgress);
}

export async function fetchSellerOrders(myUserId: number): Promise<ShopOrder[]> {
  const r = await post<ShopOrder[]>("fetchSellerOrders", { my_user_id: myUserId });
  return r.data ?? [];
}

export async function shipSellerOrder(myUserId: number, orderNumber: string, f: { tracking_number: string; carrier: string; tracking_url: string }) {
  const r = await post("shipSellerOrder", { my_user_id: myUserId, order_number: orderNumber, ...f });
  if (!r.status) throw new Error(r.message ?? "Couldn't mark that as shipped.");
  return r.message ?? "Marked as shipped.";
}

export async function fetchSellerSampleRequests(myUserId: number): Promise<ShopSampleRequest[]> {
  const r = await post<ShopSampleRequest[]>("fetchSellerSampleRequests", { my_user_id: myUserId });
  return r.data ?? [];
}

export async function respondSellerSampleRequest(myUserId: number, id: number, action: "approve" | "decline", reason = "") {
  const r = await post("respondSellerSampleRequest", { my_user_id: myUserId, id, action, reason });
  if (!r.status) throw new Error(r.message ?? "Couldn't send that.");
  return r.message ?? "Sent.";
}

// ---------------------------------------------------------------------------------------
// Agent

export interface AgentStatus {
  id: number;
  name: string;
  status: "pending_review" | "approved" | "rejected" | "suspended" | string;
  contact_email: string | null;
  phone: string | null;
  country_code: string | null;
  /** NULL means no rate has been agreed yet. The screen must say "not set", never "0%". */
  default_commission_rate: number | null;
  stripe_connected: boolean;
  can_be_paid: boolean;
}

export interface AgentProduct {
  id: number;
  title: string;
  status: string;
  price_cents: number;
  sold_count: number;
  seller_name: string | null;
  agent_rate: number;
  rate_source: "product" | "agent_default";
}

export interface AgentCommission {
  order_number: string;
  amount_cents: number;
  rate: number;
  status: string;
  payable_at: string | null;
  created_at: string | null;
}

export interface AgentPayout {
  id: number;
  amount_cents: number;
  status: string;
  sent_at: string | null;
  created_at: string | null;
}

export interface AgentEarnings {
  pending_cents: number;
  payable_cents: number;
  paid_cents: number;
  reversed_cents: number;
  stripe_connected: boolean;
  payout_ready: boolean;
  commissions: AgentCommission[];
  payouts: AgentPayout[];
}

export async function fetchMyAgentStatus(myUserId: number): Promise<AgentStatus | null> {
  const r = await post<AgentStatus | null>("fetchMyAgentStatus", { my_user_id: myUserId });
  return (r.data as AgentStatus | null) ?? null;
}

export async function applyShopAgent(myUserId: number, f: { name: string; contact_email: string; phone: string; country_code: string }) {
  const r = await post<AgentStatus>("applyShopAgent", { my_user_id: myUserId, ...f });
  if (!r.status) throw new Error(r.message ?? "Couldn't send that application.");
  return { message: r.message ?? "Application received.", agent: (r.data as AgentStatus | null) ?? null };
}

export async function fetchMyAgentProducts(myUserId: number): Promise<{ suppliers: number; products: AgentProduct[] }> {
  const r = await post<{ suppliers_count: number; products_count: number; products: AgentProduct[] }>("fetchMyAgentProducts", { my_user_id: myUserId });
  if (!r.status) throw new Error(r.message ?? "Couldn't load your products.");
  return { suppliers: r.data?.suppliers_count ?? 0, products: r.data?.products ?? [] };
}

export async function fetchMyAgentEarnings(myUserId: number): Promise<AgentEarnings> {
  const r = await post<AgentEarnings>("fetchMyAgentEarnings", { my_user_id: myUserId });
  if (!r.status) throw new Error(r.message ?? "Couldn't load your earnings.");
  return r.data as AgentEarnings;
}

export async function requestAgentEarningsPayout(myUserId: number) {
  const r = await post("requestAgentEarningsPayout", { my_user_id: myUserId });
  if (!r.status) throw new Error(r.message ?? "Couldn't request that payout.");
  return r.message ?? "Payout requested.";
}

// ---------------------------------------------------------------------------------------

/** Multipart POST — createSellerProduct takes real photo and video files, like uploadPhoto. */
function multipart<T>(endpoint: string, form: FormData, onProgress?: (f: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", API_BASE + endpoint, true);
    for (const [k, v] of Object.entries(currentAuthHeaders())) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let body: { status?: boolean; message?: string; data?: T } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* status check below */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.status) resolve(body.data as T);
      // The server rejects a listing its content check flagged, with status false and the
      // reason in the message. That is a real answer, not a transport failure, so it has to
      // reach the seller word for word.
      else reject(new Error(body.message ?? uploadErrorMessage(xhr.status, body.message)));
    };
    xhr.onerror = () => reject(new Error(uploadErrorMessage(0)));
    xhr.send(form);
  });
}
