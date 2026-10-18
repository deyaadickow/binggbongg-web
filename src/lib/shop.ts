// Bingg Bongg Shop — the marketplace (Steve, 2026-10-15). Mirrors ShopController.php. On the
// web a purchase goes through Stripe Checkout (Stripe's hosted page): createShopOrder with
// payment_mode=checkout hands back checkout_url, the browser goes there, and Stripe sends the
// buyer back to /shop/orders. post() resolves to the server JSON itself — `data` IS the list.
import { post } from "./api";
import { tt } from "./i18n";

export interface ShopSettings { shop_enabled?: boolean; samples_enabled?: boolean; sellers_enabled?: boolean; streamer_commission_rate?: number }
export interface ShopProduct {
  id: number; seller_id?: number; seller_name?: string; title?: string; description?: string;
  price_cents: number; compare_at_cents?: number | null; shipping_cents?: number; in_stock?: boolean;
  ships_in_days_min?: number | null; ships_in_days_max?: number | null; commission_rate?: number; samples_enabled?: boolean;
  image_url?: string; images?: string[]; video_url?: string; sold_count?: number; status?: string; pinned_live?: boolean;
  /** Why the admin turned this listing down, in their own words. Only ever sent to the seller
   *  who owns it (mySellerProducts), never on a shopper-facing list. */
  rejection_reason?: string | null;
}
export interface ShopAddress { id: number; is_default?: boolean; full_name?: string; phone?: string; line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country_code?: string }
export interface ShopOrderItem { shop_product_id: number; title?: string; image_url?: string; unit_cents: number; quantity: number; line_cents: number }
export interface ShopOrder {
  id: number; order_number: string; status: string; subtotal_cents: number; shipping_cents: number; total_cents: number;
  ship_to?: Record<string, string | null>; tracking_number?: string | null; tracking_url?: string | null; carrier?: string | null;
  paid_at?: string | null; created_at?: string | null; refunded_cents?: number; items: ShopOrderItem[];
}
export interface ShopEarnings {
  pending_cents: number; payable_cents: number; paid_cents: number; payout_ready: boolean; stripe_connected: boolean; tax_form_status: string;
  commissions: { order_number: string; amount_cents: number; rate: number; status: string; payable_at?: string | null; created_at?: string | null }[];
  payouts: { id: number; amount_cents: number; status: string; sent_at?: string | null; created_at?: string | null }[];
}
export interface ShopSampleRequest { id: number; status: string; product?: ShopProduct | null; tracking_number?: string | null; go_live_deadline_at?: string | null; decline_reason?: string | null }

export const money = (cents?: number | null) => "$" + ((cents ?? 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const addressLine = (a: Partial<ShopAddress> | Record<string, string | null | undefined>) =>
  [a.full_name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(" "), a.country_code].filter((s) => s && String(s).trim()).join(", ");

export async function fetchShopSettings(): Promise<ShopSettings> {
  const r = await post<ShopSettings>("fetchShopSettings", {});
  return r.data ?? {};
}
export async function fetchShopCatalog(myUserId: number, q = ""): Promise<ShopProduct[]> {
  const r = await post<ShopProduct[]>("fetchShopCatalog", { my_user_id: myUserId, page: 1, q });
  return r.data ?? [];
}
export async function fetchShopProduct(id: number): Promise<ShopProduct | null> {
  const r = await post<ShopProduct>(`fetchShopProduct/${id}`, {}).catch(() => null);
  return r?.data ?? null;
}
export async function fetchShowcase(userId: number): Promise<ShopProduct[]> {
  const r = await post<ShopProduct[]>("fetchShowcase", { user_id: userId });
  return r.data ?? [];
}
export async function fetchLiveShowcase(roomName: string): Promise<{ items: ShopProduct[]; streamerUserId: number | null }> {
  const r = await post<ShopProduct[]>("fetchLiveShowcase", { room_name: roomName });
  return { items: r.data ?? [], streamerUserId: (r.streamer_user_id as number | null) ?? null };
}
export const addToShowcase = (myUserId: number, productId: number) => post("addToShowcase", { my_user_id: myUserId, shop_product_id: productId });
export const removeFromShowcase = (myUserId: number, productId: number) => post("removeFromShowcase", { my_user_id: myUserId, shop_product_id: productId });
export const pinShowcaseItem = (myUserId: number, productId: number, pinned: boolean) => post("pinShowcaseItem", { my_user_id: myUserId, shop_product_id: productId, pinned: pinned ? 1 : 0 });
export async function fetchShopAddresses(myUserId: number): Promise<ShopAddress[]> {
  const r = await post<ShopAddress[]>("fetchShopAddresses", { my_user_id: myUserId });
  return r.data ?? [];
}
export const saveShopAddress = (myUserId: number, a: Record<string, string>) => post<ShopAddress>("saveShopAddress", { my_user_id: myUserId, is_default: 1, ...a });
export async function createShopOrder(myUserId: number, productId: number, quantity: number, addressId: number, streamerUserId: number | null, roomName: string | null) {
  return post<ShopOrder>("createShopOrder", {
    my_user_id: myUserId, address_id: addressId, payment_mode: "checkout", items: JSON.stringify([{ shop_product_id: productId, quantity }]),
    ...(streamerUserId ? { streamer_user_id: streamerUserId } : {}), ...(roomName ? { room_name: roomName } : {}),
    return_url: `${window.location.origin}/shop/orders`,
  });
}
/** A return the buyer has going (Steve, 2026-10-16/17). label_url is what they print. */
export interface ShopReturn {
  id: number;
  order_number: string;
  status: string;
  reason?: string | null;
  decline_reason?: string | null;
  label_url?: string | null;
  carrier?: string | null;
  tracking_number?: string | null;
  created_at?: string | null;
}

export async function requestShopReturn(myUserId: number, orderNumber: string, reason: string) {
  const r = await post("requestShopReturn", { my_user_id: myUserId, order_number: orderNumber, reason });
  if (!r.status) throw new Error(r.message ?? tt("couldn_t_request_that_return"));
  return r.message ?? "Return requested.";
}

export async function fetchMyShopReturns(myUserId: number): Promise<ShopReturn[]> {
  const r = await post<ShopReturn[]>("fetchMyShopReturns", { my_user_id: myUserId });
  return r.data ?? [];
}

export async function fetchMyShopOrders(myUserId: number): Promise<ShopOrder[]> {
  const r = await post<ShopOrder[]>("fetchMyShopOrders", { my_user_id: myUserId });
  return r.data ?? [];
}
export const fetchShopOrder = (myUserId: number, orderNumber: string) => post<ShopOrder>("fetchShopOrder", { my_user_id: myUserId, order_number: orderNumber });
export const cancelShopOrder = (myUserId: number, orderNumber: string) => post("cancelShopOrder", { my_user_id: myUserId, order_number: orderNumber });
export async function fetchMyShopEarnings(myUserId: number): Promise<ShopEarnings | null> {
  const r = await post<ShopEarnings>("fetchMyShopEarnings", { my_user_id: myUserId });
  return r.data ?? null;
}
export const requestShopEarningsPayout = (myUserId: number) => post("requestShopEarningsPayout", { my_user_id: myUserId });
export const startStripeConnect = (myUserId: number) => post("startStripeConnect", { my_user_id: myUserId });
export const requestShopSample = (myUserId: number, productId: number, addressId: number, message: string) => post("requestShopSample", { my_user_id: myUserId, shop_product_id: productId, address_id: addressId, message });
export async function fetchMySampleRequests(myUserId: number): Promise<ShopSampleRequest[]> {
  const r = await post<ShopSampleRequest[]>("fetchMySampleRequests", { my_user_id: myUserId });
  return r.data ?? [];
}
