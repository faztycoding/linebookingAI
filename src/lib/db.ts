import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const BOOKING_STATUSES = [
  "hold",
  "pending_payment",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type Service = {
  id: string;
  name: string;
  name_en: string | null;
  description: string | null;
  duration_min: number;
  price: number;
  active: boolean;
  sort_order: number;
};

export type Therapist = {
  id: string;
  name: string;
  nickname: string | null;
  specialty: string | null;
  active: boolean;
};

export type TherapistShift = {
  id: string;
  therapist_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
};

export type Booking = {
  id: string;
  booking_code: string;
  line_user_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  service_id: string | null;
  therapist_id: string;
  time_range: string;
  status: BookingStatus;
  source: "line" | "walkin";
  deposit_amount: number;
  total_amount: number;
  paid_amount: number;
  payment_method: string | null;
  hold_expires_at: string | null;
  note: string | null;
  created_at: string;
};

export type BookingView = Booking & {
  service: Service | null;
  therapist: Therapist | null;
};

export type Conversation = {
  line_user_id: string;
  state: Record<string, unknown>;
  history: unknown[];
  ai_paused_until: string | null;
  updated_at: string;
};

export class BookingConflictError extends Error {
  constructor() {
    super("Booking time overlaps an existing booking");
    this.name = "BookingConflictError";
  }
}

export class BookingExpiredError extends Error {
  constructor() {
    super("Booking hold has expired");
    this.name = "BookingExpiredError";
  }
}

export class BookingNotFoundError extends Error {
  constructor() {
    super("Booking was not found");
    this.name = "BookingNotFoundError";
  }
}

export class InvalidBookingTransitionError extends Error {
  constructor() {
    super("Booking status transition is not allowed");
    this.name = "InvalidBookingTransitionError";
  }
}

let adminClient: SupabaseClient | undefined;

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) {
    return adminClient;
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server environment is not configured");
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return adminClient;
}

function normalizeService(row: Record<string, unknown>): Service {
  return {
    id: String(row.id),
    name: String(row.name),
    name_en: row.name_en ? String(row.name_en) : null,
    description: row.description ? String(row.description) : null,
    duration_min: Number(row.duration_min),
    price: Number(row.price),
    active: Boolean(row.active),
    sort_order: Number(row.sort_order),
  };
}

function normalizeTherapist(row: Record<string, unknown>): Therapist {
  return {
    id: String(row.id),
    name: String(row.name),
    nickname: row.nickname ? String(row.nickname) : null,
    specialty: row.specialty ? String(row.specialty) : null,
    active: Boolean(row.active),
  };
}

function normalizeBooking(row: Record<string, unknown>): Booking {
  return {
    id: String(row.id),
    booking_code: String(row.booking_code),
    line_user_id: row.line_user_id ? String(row.line_user_id) : null,
    customer_name: row.customer_name ? String(row.customer_name) : null,
    customer_phone: row.customer_phone ? String(row.customer_phone) : null,
    service_id: row.service_id ? String(row.service_id) : null,
    therapist_id: String(row.therapist_id),
    time_range: String(row.time_range),
    status: row.status as BookingStatus,
    source: row.source as "line" | "walkin",
    deposit_amount: Number(row.deposit_amount),
    total_amount: Number(row.total_amount),
    paid_amount: Number(row.paid_amount),
    payment_method: row.payment_method ? String(row.payment_method) : null,
    hold_expires_at: row.hold_expires_at
      ? String(row.hold_expires_at)
      : null,
    note: row.note ? String(row.note) : null,
    created_at: String(row.created_at),
  };
}

export async function getServices(): Promise<Service[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("services")
    .select("*")
    .eq("active", true)
    .order("sort_order")
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => normalizeService(row));
}

export async function getServiceById(id: string): Promise<Service | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("services")
    .select("*")
    .eq("id", id)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? normalizeService(data) : null;
}

export async function getTherapists(): Promise<Therapist[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("therapists")
    .select("*")
    .eq("active", true)
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => normalizeTherapist(row));
}

export async function getTherapistById(
  id: string,
): Promise<Therapist | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("therapists")
    .select("*")
    .eq("id", id)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? normalizeTherapist(data) : null;
}

export async function getShopInfo(
  key?: string,
): Promise<Record<string, string>> {
  let query = getSupabaseAdmin().from("shop_info").select("key,value");

  if (key) {
    query = query.eq("key", key);
  }

  const { data, error } = await query.order("key");

  if (error) {
    throw new Error(error.message);
  }

  return Object.fromEntries(
    (data ?? []).map((row) => [String(row.key), String(row.value)]),
  );
}

export async function getTherapistShifts(
  therapistId: string,
  date: string,
): Promise<TherapistShift[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("therapist_shifts")
    .select("*")
    .eq("therapist_id", therapistId)
    .eq("work_date", date)
    .order("start_time");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    therapist_id: String(row.therapist_id),
    work_date: String(row.work_date),
    start_time: String(row.start_time),
    end_time: String(row.end_time),
  }));
}

export async function releaseExpiredHolds(): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from("bookings")
    .update({ status: "cancelled", note: "Hold expired automatically" })
    .eq("status", "hold")
    .lt("hold_expires_at", new Date().toISOString())
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  return data?.length ?? 0;
}

export async function getBookingsOverlapping(
  therapistId: string,
  start: Date,
  end: Date,
): Promise<Array<{ time_range: string }>> {
  const range = `[${start.toISOString()},${end.toISOString()})`;
  const { data, error } = await getSupabaseAdmin()
    .from("bookings")
    .select("time_range")
    .eq("therapist_id", therapistId)
    .in("status", ["hold", "pending_payment", "confirmed", "completed"])
    .overlaps("time_range", range);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({ time_range: String(row.time_range) }));
}

export async function createHoldBooking(input: {
  lineUserId?: string;
  customerName?: string;
  service: Service;
  therapistId: string;
  startAt: string;
}): Promise<Booking> {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(input.startAt)) {
    throw new Error("start_at must include a timezone offset");
  }

  const start = new Date(input.startAt);
  if (Number.isNaN(start.getTime())) {
    throw new Error("start_at is invalid");
  }

  const end = new Date(
    start.getTime() + (input.service.duration_min + 15) * 60_000,
  );
  const holdExpiresAt = new Date(Date.now() + 10 * 60_000);
  const range = `[${start.toISOString()},${end.toISOString()})`;

  const { data, error } = await getSupabaseAdmin()
    .from("bookings")
    .insert({
      line_user_id: input.lineUserId ?? null,
      customer_name: input.customerName ?? null,
      service_id: input.service.id,
      therapist_id: input.therapistId,
      time_range: range,
      status: "hold",
      source: "line",
      deposit_amount: Math.round(input.service.price * 0.3 * 100) / 100,
      total_amount: input.service.price,
      hold_expires_at: holdExpiresAt.toISOString(),
    })
    .select("*")
    .single();

  if (error?.code === "23P01") {
    throw new BookingConflictError();
  }

  if (error) {
    throw new Error(error.message);
  }

  return normalizeBooking(data);
}

export async function getBookingById(id: string): Promise<Booking | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? normalizeBooking(data) : null;
}

export function getBangkokDate(value = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function rangeStart(value: string): number {
  const match = value.match(/^[[(]"?([^",]+)"?,/);
  const timestamp = match ? new Date(match[1]).getTime() : Number.NaN;
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

export async function getBookingsForDate(
  date = getBangkokDate(),
): Promise<BookingView[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Booking date must use YYYY-MM-DD");
  }

  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const [{ data, error }, services, therapists] = await Promise.all([
    getSupabaseAdmin()
      .from("bookings")
      .select("*")
      .overlaps(
        "time_range",
        `[${start.toISOString()},${end.toISOString()})`,
      ),
    getServices(),
    getTherapists(),
  ]);

  if (error) {
    throw new Error(error.message);
  }

  const serviceById = new Map(services.map((service) => [service.id, service]));
  const therapistById = new Map(
    therapists.map((therapist) => [therapist.id, therapist]),
  );

  return (data ?? [])
    .map((row) => normalizeBooking(row))
    .map((booking) => ({
      ...booking,
      service: booking.service_id
        ? (serviceById.get(booking.service_id) ?? null)
        : null,
      therapist: therapistById.get(booking.therapist_id) ?? null,
    }))
    .sort((left, right) => rangeStart(left.time_range) - rangeStart(right.time_range));
}

export async function updateBookingStatus(
  bookingId: string,
  status: "confirmed" | "cancelled" | "no_show",
): Promise<Booking> {
  const booking = await getBookingById(bookingId);
  if (!booking) {
    throw new BookingNotFoundError();
  }
  if (booking.status === status) {
    return booking;
  }

  const allowed: Partial<Record<BookingStatus, BookingStatus[]>> = {
    hold: ["confirmed", "cancelled"],
    pending_payment: ["confirmed", "cancelled"],
    confirmed: ["cancelled", "no_show"],
  };
  if (!allowed[booking.status]?.includes(status)) {
    throw new InvalidBookingTransitionError();
  }

  const { data, error } = await getSupabaseAdmin()
    .from("bookings")
    .update({ status })
    .eq("id", bookingId)
    .eq("status", booking.status)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new InvalidBookingTransitionError();
  }

  return normalizeBooking(data);
}

export async function pauseAiForBooking(bookingId: string): Promise<void> {
  const booking = await getBookingById(bookingId);
  if (!booking?.line_user_id) {
    throw new BookingNotFoundError();
  }

  await markConversationEscalated(
    booking.line_user_id,
    "Admin took over the conversation",
  );
}

export async function createWalkInBooking(input: {
  customerName: string;
  serviceId: string;
  therapistId: string;
  startAt: string;
}): Promise<Booking> {
  const [service, therapist] = await Promise.all([
    getServiceById(input.serviceId),
    getTherapistById(input.therapistId),
  ]);
  if (!service || !therapist) {
    throw new BookingNotFoundError();
  }
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(input.startAt)) {
    throw new Error("Walk-in start time must include a timezone offset");
  }

  const start = new Date(input.startAt);
  if (Number.isNaN(start.getTime())) {
    throw new Error("Walk-in start time is invalid");
  }
  const end = new Date(
    start.getTime() + (service.duration_min + 15) * 60_000,
  );

  const { data, error } = await getSupabaseAdmin()
    .from("bookings")
    .insert({
      customer_name: input.customerName.trim() || "ลูกค้า Walk-in",
      service_id: service.id,
      therapist_id: therapist.id,
      time_range: `[${start.toISOString()},${end.toISOString()})`,
      status: "confirmed",
      source: "walkin",
      deposit_amount: 0,
      total_amount: service.price,
      paid_amount: 0,
    })
    .select("*")
    .single();

  if (error?.code === "23P01") {
    throw new BookingConflictError();
  }
  if (error) {
    throw new Error(error.message);
  }

  return normalizeBooking(data);
}

export async function completeBooking(input: {
  bookingId: string;
  paymentMethod: "cash" | "transfer";
}): Promise<Booking> {
  const booking = await getBookingById(input.bookingId);
  if (!booking) {
    throw new BookingNotFoundError();
  }
  if (booking.status === "completed") {
    return booking;
  }
  if (booking.status !== "confirmed") {
    throw new InvalidBookingTransitionError();
  }

  const { data, error } = await getSupabaseAdmin()
    .from("bookings")
    .update({
      status: "completed",
      paid_amount: booking.total_amount,
      payment_method: input.paymentMethod,
    })
    .eq("id", booking.id)
    .eq("status", "confirmed")
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new InvalidBookingTransitionError();
  }

  return normalizeBooking(data);
}

export async function confirmBookingPayment(input: {
  bookingId: string;
  lineUserId: string;
}): Promise<Booking> {
  const booking = await getBookingById(input.bookingId);
  if (!booking || booking.line_user_id !== input.lineUserId) {
    throw new BookingNotFoundError();
  }

  if (booking.status === "confirmed") {
    return booking;
  }

  const now = new Date();
  if (
    !booking.hold_expires_at ||
    new Date(booking.hold_expires_at).getTime() <= now.getTime()
  ) {
    await getSupabaseAdmin()
      .from("bookings")
      .update({ status: "cancelled", note: "Hold expired before confirmation" })
      .eq("id", booking.id)
      .in("status", ["hold", "pending_payment"]);
    throw new BookingExpiredError();
  }

  const { data, error } = await getSupabaseAdmin()
    .from("bookings")
    .update({
      status: "confirmed",
      paid_amount: booking.deposit_amount,
      payment_method: "promptpay_demo",
      hold_expires_at: null,
      note: "Demo payment confirmed manually",
    })
    .eq("id", booking.id)
    .eq("line_user_id", input.lineUserId)
    .in("status", ["hold", "pending_payment"])
    .gt("hold_expires_at", now.toISOString())
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    const latest = await getBookingById(booking.id);
    if (latest?.status === "confirmed") {
      return latest;
    }
    throw new BookingExpiredError();
  }

  return normalizeBooking(data);
}

export async function deleteOldWebhookEvents(hours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("webhook_events")
    .delete()
    .lt("received_at", cutoff)
    .select("event_id");

  if (error) {
    throw new Error(error.message);
  }

  return data?.length ?? 0;
}

export async function markConversationEscalated(
  lineUserId: string,
  reason: string,
): Promise<void> {
  const client = getSupabaseAdmin();
  const { data, error: readError } = await client
    .from("conversations")
    .select("state")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (readError) {
    throw new Error(readError.message);
  }

  const state =
    data?.state && typeof data.state === "object" ? data.state : {};
  const { error } = await client.from("conversations").upsert({
    line_user_id: lineUserId,
    state: { ...state, escalated: true, escalation_reason: reason },
    ai_paused_until: new Date(Date.now() + 30 * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function getConversation(
  lineUserId: string,
): Promise<Conversation> {
  const { data, error } = await getSupabaseAdmin()
    .from("conversations")
    .select("*")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return {
      line_user_id: lineUserId,
      state: {},
      history: [],
      ai_paused_until: null,
      updated_at: new Date(0).toISOString(),
    };
  }

  return {
    line_user_id: String(data.line_user_id),
    state:
      data.state && typeof data.state === "object"
        ? (data.state as Record<string, unknown>)
        : {},
    history: Array.isArray(data.history) ? data.history : [],
    ai_paused_until: data.ai_paused_until
      ? String(data.ai_paused_until)
      : null,
    updated_at: String(data.updated_at),
  };
}

export async function saveConversation(input: {
  lineUserId: string;
  state: Record<string, unknown>;
  history: unknown[];
  aiPausedUntil?: string | null;
}): Promise<void> {
  const { error } = await getSupabaseAdmin().from("conversations").upsert({
    line_user_id: input.lineUserId,
    state: input.state,
    history: input.history.slice(-8),
    ai_paused_until: input.aiPausedUntil ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function saveConversationHistory(
  lineUserId: string,
  history: unknown[],
): Promise<void> {
  const { error } = await getSupabaseAdmin().from("conversations").upsert(
    {
      line_user_id: lineUserId,
      history: history.slice(-8),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "line_user_id" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function mergeConversationState(
  lineUserId: string,
  patch: Record<string, unknown>,
): Promise<Conversation> {
  const conversation = await getConversation(lineUserId);
  const next = {
    ...conversation,
    state: { ...conversation.state, ...patch },
    updated_at: new Date().toISOString(),
  };

  await saveConversation({
    lineUserId,
    state: next.state,
    history: next.history,
    aiPausedUntil: next.ai_paused_until,
  });

  return next;
}

export async function claimWebhookEvent(eventId: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("webhook_events")
    .insert({ event_id: eventId });

  if (error?.code === "23505") {
    return false;
  }
  if (error) {
    throw new Error(error.message);
  }

  return true;
}

export async function releaseWebhookEvent(eventId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("webhook_events")
    .delete()
    .eq("event_id", eventId);

  if (error) {
    throw new Error(error.message);
  }
}
