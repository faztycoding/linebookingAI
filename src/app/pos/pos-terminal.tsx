"use client";

import { createClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { BookingView, Service, Therapist } from "@/lib/db";

function money(value: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(value);
}

function bookingTime(range: string): string {
  const match = range.match(/^[[(]"?([^",]+)"?,/);
  const value = match ? new Date(match[1]) : null;
  return value && !Number.isNaN(value.getTime())
    ? new Intl.DateTimeFormat("th-TH", {
        timeZone: "Asia/Bangkok",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(value)
    : "--:--";
}

function defaultWalkInTime(): string {
  const value = new Date(Date.now() + 30 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function PosTerminal({
  initialBookings,
  initialServices,
  initialTherapists,
  initialError,
}: {
  initialBookings: BookingView[];
  initialServices: Service[];
  initialTherapists: Therapist[];
  initialError: string | null;
}) {
  const [bookings, setBookings] = useState(initialBookings);
  const [services, setServices] = useState(initialServices);
  const [therapists, setTherapists] = useState(initialTherapists);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">("cash");
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [walkIn, setWalkIn] = useState({
    customerName: "ลูกค้า Walk-in",
    serviceId: initialServices[0]?.id ?? "",
    therapistId: initialTherapists[0]?.id ?? "",
    startAt: defaultWalkInTime(),
  });

  const refresh = useCallback(async () => {
    const response = await fetch("/api/pos", { cache: "no-store" });
    const body: unknown = await response.json();
    if (
      !response.ok ||
      !body ||
      typeof body !== "object" ||
      !("bookings" in body) ||
      !Array.isArray(body.bookings) ||
      !("services" in body) ||
      !Array.isArray(body.services) ||
      !("therapists" in body) ||
      !Array.isArray(body.therapists)
    ) {
      throw new Error("โหลดข้อมูล POS ไม่สำเร็จ");
    }
    setBookings(body.bookings as BookingView[]);
    setServices(body.services as Service[]);
    setTherapists(body.therapists as Therapist[]);
    setError(null);
  }, []);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return;
    }

    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const channel = client
      .channel("pos-bookings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => void refresh().catch(() => setError("อัปเดตคิว POS ไม่สำเร็จ")),
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [refresh]);

  const openBookings = bookings.filter((booking) => booking.status === "confirmed");
  const selected = bookings.find((booking) => booking.id === selectedId) ?? null;
  const remaining = selected
    ? Math.max(0, selected.total_amount - selected.paid_amount)
    : 0;
  const metrics = useMemo(
    () => ({
      sales: bookings
        .filter((booking) => booking.status === "completed")
        .reduce((sum, booking) => sum + booking.paid_amount, 0),
      queues: bookings.filter(
        (booking) => !["cancelled", "no_show"].includes(booking.status),
      ).length,
      pendingDeposits: bookings
        .filter((booking) => ["hold", "pending_payment"].includes(booking.status))
        .reduce(
          (sum, booking) =>
            sum + Math.max(0, booking.deposit_amount - booking.paid_amount),
          0,
        ),
    }),
    [bookings],
  );

  async function post(body: Record<string, unknown>): Promise<unknown> {
    const response = await fetch("/api/pos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result: unknown = await response.json();
    if (!response.ok) {
      const message =
        result && typeof result === "object" && "message" in result
          ? String(result.message)
          : "บันทึกไม่สำเร็จ";
      throw new Error(message);
    }
    return result;
  }

  async function closeBill() {
    if (!selected) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await post({
        action: "complete",
        bookingId: selected.id,
        paymentMethod,
      });
      setSelectedId(null);
      await refresh();
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "ปิดบิลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function createWalkIn() {
    if (!walkIn.serviceId || !walkIn.therapistId || !walkIn.startAt) {
      setError("กรุณากรอกข้อมูล Walk-in ให้ครบ");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await post({
        action: "walkin",
        customerName: walkIn.customerName,
        serviceId: walkIn.serviceId,
        therapistId: walkIn.therapistId,
        startAt: `${walkIn.startAt}:00+07:00`,
      });
      const bookingId =
        result &&
        typeof result === "object" &&
        "booking" in result &&
        result.booking &&
        typeof result.booking === "object" &&
        "id" in result.booking &&
        typeof result.booking.id === "string"
          ? result.booking.id
          : null;
      await refresh();
      setSelectedId(bookingId);
      setShowWalkIn(false);
    } catch (walkInError) {
      setError(
        walkInError instanceof Error ? walkInError.message : "สร้าง Walk-in ไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-[1500px] py-8">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--spa-gold)]">
            FRONT DESK
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
            ปิดบิลวันนี้
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setShowWalkIn((value) => !value)}
          className="rounded-full bg-[var(--spa-green)] px-6 py-3 font-bold text-white"
        >
          {showWalkIn ? "ปิดฟอร์ม Walk-in" : "+ เปิดคิว Walk-in"}
        </button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          ["ยอดขายวันนี้", money(metrics.sales)],
          ["จำนวนคิว", metrics.queues],
          ["มัดจำค้างรับ", money(metrics.pendingDeposits)],
        ].map(([label, value]) => (
          <div key={label} className="spa-card rounded-3xl p-6">
            <p className="text-sm text-[var(--spa-leaf)]">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {error ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          {error}
        </div>
      ) : null}

      {showWalkIn ? (
        <div className="spa-card mb-6 rounded-[2rem] p-6">
          <h2 className="text-xl font-bold">เปิดคิว Walk-in</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm font-semibold">
              ชื่อลูกค้า
              <input
                value={walkIn.customerName}
                onChange={(event) =>
                  setWalkIn((value) => ({ ...value, customerName: event.target.value }))
                }
                className="mt-2 w-full rounded-2xl border border-[var(--spa-line)] bg-white px-4 py-3 outline-none focus:border-[var(--spa-green)]"
              />
            </label>
            <label className="text-sm font-semibold">
              บริการ
              <select
                value={walkIn.serviceId}
                onChange={(event) =>
                  setWalkIn((value) => ({ ...value, serviceId: event.target.value }))
                }
                className="mt-2 w-full rounded-2xl border border-[var(--spa-line)] bg-white px-4 py-3"
              >
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} · {money(service.price)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              พนักงานนวด
              <select
                value={walkIn.therapistId}
                onChange={(event) =>
                  setWalkIn((value) => ({ ...value, therapistId: event.target.value }))
                }
                className="mt-2 w-full rounded-2xl border border-[var(--spa-line)] bg-white px-4 py-3"
              >
                {therapists.map((therapist) => (
                  <option key={therapist.id} value={therapist.id}>
                    {therapist.nickname ?? therapist.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              วันและเวลา
              <input
                type="datetime-local"
                value={walkIn.startAt}
                onChange={(event) =>
                  setWalkIn((value) => ({ ...value, startAt: event.target.value }))
                }
                className="mt-2 w-full rounded-2xl border border-[var(--spa-line)] bg-white px-4 py-3"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void createWalkIn()}
            className="mt-5 rounded-full bg-[var(--spa-green)] px-6 py-3 font-bold text-white disabled:opacity-40"
          >
            สร้างคิวและเปิดบิล
          </button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
        <div className="spa-card rounded-[2rem] p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">คิวที่รอปิดบิล</h2>
            <span className="rounded-full bg-[var(--spa-green)] px-3 py-1 text-xs font-bold text-white">
              {openBookings.length} คิว
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {openBookings.map((booking) => (
              <button
                type="button"
                key={booking.id}
                onClick={() => setSelectedId(booking.id)}
                className={`w-full rounded-3xl border p-5 text-left transition ${selectedId === booking.id ? "border-[var(--spa-green)] bg-[#EEF4EC]" : "border-[var(--spa-line)] bg-white/70 hover:bg-white"}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold">
                      {booking.customer_name || "ลูกค้า Walk-in"}
                    </p>
                    <p className="mt-1 text-sm text-[var(--spa-leaf)]">
                      {booking.service?.name ?? "ไม่ระบุบริการ"}
                    </p>
                  </div>
                  <p className="text-2xl font-semibold">{bookingTime(booking.time_range)}</p>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-[var(--spa-leaf)]">
                  <span>{booking.booking_code}</span>
                  <span>{booking.source === "line" ? "จองผ่าน LINE" : "Walk-in"}</span>
                </div>
              </button>
            ))}
            {!openBookings.length ? (
              <div className="rounded-3xl border border-dashed border-[var(--spa-line)] px-5 py-16 text-center text-[var(--spa-leaf)]">
                ไม่มีคิวรอปิดบิล
              </div>
            ) : null}
          </div>
        </div>

        <div className="spa-card rounded-[2rem] p-6 sm:p-8">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-4 border-b border-[var(--spa-line)] pb-6">
                <div>
                  <p className="text-sm font-bold text-[var(--spa-gold)]">CURRENT BILL</p>
                  <h2 className="mt-2 text-3xl font-semibold">
                    {selected.customer_name || "ลูกค้า Walk-in"}
                  </h2>
                  <p className="mt-2 text-sm text-[var(--spa-leaf)]">
                    {selected.booking_code} · {bookingTime(selected.time_range)} น.
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800">
                  พร้อมปิดบิล
                </span>
              </div>

              <div className="space-y-4 py-7">
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="font-bold">{selected.service?.name ?? "บริการสปา"}</p>
                    <p className="mt-1 text-sm text-[var(--spa-leaf)]">
                      {selected.therapist?.nickname ?? selected.therapist?.name ?? "-"}
                    </p>
                  </div>
                  <p className="font-bold">{money(selected.total_amount)}</p>
                </div>
                <div className="flex justify-between border-t border-dashed border-[var(--spa-line)] pt-4 text-[var(--spa-leaf)]">
                  <span>มัดจำที่รับแล้ว</span>
                  <span>- {money(selected.paid_amount)}</span>
                </div>
                <div className="flex justify-between text-2xl font-semibold text-[var(--spa-green)]">
                  <span>ยอดคงเหลือ</span>
                  <span>{money(remaining)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(["cash", "transfer"] as const).map((method) => (
                  <button
                    type="button"
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={`rounded-2xl border px-4 py-4 font-bold ${paymentMethod === method ? "border-[var(--spa-green)] bg-[#EEF4EC] text-[var(--spa-green)]" : "border-[var(--spa-line)] bg-white"}`}
                  >
                    {method === "cash" ? "เงินสด" : "โอนเงิน"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void closeBill()}
                className="mt-4 w-full rounded-2xl bg-[var(--spa-green)] px-6 py-4 text-lg font-bold text-white shadow-lg shadow-green-950/10 disabled:opacity-40"
              >
                ปิดบิล {money(remaining)}
              </button>
            </>
          ) : (
            <div className="flex min-h-[430px] flex-col items-center justify-center text-center">
              <div className="flex size-20 items-center justify-center rounded-full bg-[#EEF4EC] text-3xl text-[var(--spa-green)]">
                ฿
              </div>
              <h2 className="mt-6 text-2xl font-bold">เลือกคิวเพื่อเปิดบิล</h2>
              <p className="mt-2 max-w-sm leading-7 text-[var(--spa-leaf)]">
                บริการ ราคา และมัดจำจะถูกดึงจาก Booking โดยอัตโนมัติ
              </p>
            </div>
          )}
        </div>
      </div>
      <p className="mt-5 text-center text-xs text-[var(--spa-leaf)]">
        POS-lite นี้ใช้ข้อมูล Demo ไม่มี Stock ใบกำกับภาษี หรือระบบบัญชี
      </p>
    </section>
  );
}
