"use client";

import { createClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { BookingStatus, BookingView } from "@/lib/db";

const statusText: Record<BookingStatus, string> = {
  hold: "รอมัดจำ",
  pending_payment: "รอชำระ",
  confirmed: "ยืนยันแล้ว",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
  no_show: "ไม่มา",
};

const statusStyle: Record<BookingStatus, string> = {
  hold: "bg-amber-100 text-amber-800",
  pending_payment: "bg-orange-100 text-orange-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  completed: "bg-slate-200 text-slate-700",
  cancelled: "bg-rose-100 text-rose-700",
  no_show: "bg-zinc-200 text-zinc-700",
};

function bookingStart(range: string): Date | null {
  const match = range.match(/^[[(]"?([^",]+)"?,/);
  if (!match) {
    return null;
  }
  const value = new Date(match[1]);
  return Number.isNaN(value.getTime()) ? null : value;
}

function timeLabel(range: string): string {
  const value = bookingStart(range);
  return value
    ? new Intl.DateTimeFormat("th-TH", {
        timeZone: "Asia/Bangkok",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(value)
    : "--:--";
}

function money(value: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(value);
}

export function AdminDashboard({
  initialBookings,
  initialError,
}: {
  initialBookings: BookingView[];
  initialError: string | null;
}) {
  const [bookings, setBookings] = useState(initialBookings);
  const [error, setError] = useState(initialError);
  const [connection, setConnection] = useState<"connecting" | "live" | "offline">(
    "connecting",
  );
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/bookings", { cache: "no-store" });
      const body: unknown = await response.json();
      if (
        !response.ok ||
        !body ||
        typeof body !== "object" ||
        !("bookings" in body) ||
        !Array.isArray(body.bookings)
      ) {
        throw new Error("โหลดคิวไม่สำเร็จ");
      }
      setBookings(body.bookings as BookingView[]);
      setError(null);
    } catch {
      setError("โหลดคิวไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ");
    }
  }, []);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      setConnection("offline");
      return;
    }

    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const channel = client
      .channel("admin-bookings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => void refresh(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnection("live");
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnection("offline");
        }
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, [refresh]);

  const stats = useMemo(() => {
    const active = bookings.filter((booking) =>
      ["hold", "pending_payment", "confirmed"].includes(booking.status),
    );
    return {
      total: bookings.length,
      confirmed: bookings.filter((booking) => booking.status === "confirmed").length,
      waiting: active.filter((booking) => booking.status !== "confirmed").length,
      deposits: bookings.reduce(
        (sum, booking) => sum + Number(booking.paid_amount || 0),
        0,
      ),
    };
  }, [bookings]);

  async function runAction(bookingId: string, action: string) {
    const busyKey = `${bookingId}:${action}`;
    setBusy(busyKey);
    setError(null);
    try {
      const response = await fetch("/api/admin/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, action }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          body && typeof body === "object" && "message" in body
            ? String(body.message)
            : "อัปเดตไม่สำเร็จ";
        throw new Error(message);
      }
      await refresh();
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "อัปเดตไม่สำเร็จ",
      );
    } finally {
      setBusy(null);
    }
  }

  const connectionLabel =
    connection === "live"
      ? "Realtime พร้อมใช้งาน"
      : connection === "connecting"
        ? "กำลังเชื่อมต่อ"
        : "โหมดออฟไลน์";

  return (
    <section className="mx-auto max-w-[1500px] py-8">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--spa-gold)]">
            TODAY&apos;S OPERATIONS
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
            ตารางคิววันนี้
          </h1>
          <p className="mt-2 text-[var(--spa-leaf)]">
            คิวจาก LINE จะปรากฏบนหน้านี้โดยอัตโนมัติ
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-full border border-[var(--spa-line)] bg-white/70 px-4 py-2 text-sm font-semibold">
          <span
            className={`size-2.5 rounded-full ${connection === "live" ? "bg-emerald-500 shadow-[0_0_0_5px_rgba(16,185,129,.12)]" : "bg-amber-400"}`}
          />
          {connectionLabel}
        </div>
      </div>

      <div className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["คิวทั้งหมด", stats.total],
          ["ยืนยันแล้ว", stats.confirmed],
          ["รอดำเนินการ", stats.waiting],
          ["มัดจำรับแล้ว", money(stats.deposits)],
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

      <div className="spa-card overflow-hidden rounded-[2rem]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-left">
            <thead className="border-b border-[var(--spa-line)] bg-white/60 text-xs uppercase tracking-wider text-[var(--spa-leaf)]">
              <tr>
                <th className="px-6 py-4">เวลา</th>
                <th className="px-4 py-4">ลูกค้า</th>
                <th className="px-4 py-4">บริการ</th>
                <th className="px-4 py-4">พนักงาน</th>
                <th className="px-4 py-4">ยอด / มัดจำ</th>
                <th className="px-4 py-4">สถานะ</th>
                <th className="px-6 py-4 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--spa-line)]">
              {bookings.map((booking) => (
                <tr key={booking.id} className="bg-white/35 transition hover:bg-white/70">
                  <td className="px-6 py-5 text-2xl font-semibold">
                    {timeLabel(booking.time_range)}
                  </td>
                  <td className="px-4 py-5">
                    <p className="font-bold">{booking.customer_name || "ลูกค้า Walk-in"}</p>
                    <p className="mt-1 text-xs text-[var(--spa-leaf)]">
                      {booking.booking_code} · {booking.source === "line" ? "LINE" : "Walk-in"}
                    </p>
                  </td>
                  <td className="px-4 py-5 font-semibold">
                    {booking.service?.name ?? "ไม่ระบุบริการ"}
                  </td>
                  <td className="px-4 py-5">
                    {booking.therapist?.nickname ?? booking.therapist?.name ?? "-"}
                  </td>
                  <td className="px-4 py-5">
                    <p>{money(booking.total_amount)}</p>
                    <p className="mt-1 text-xs text-[var(--spa-leaf)]">
                      รับแล้ว {money(booking.paid_amount)}
                    </p>
                  </td>
                  <td className="px-4 py-5">
                    <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${statusStyle[booking.status]}`}>
                      {statusText[booking.status]}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex justify-end gap-2">
                      {booking.status === "hold" || booking.status === "pending_payment" ? (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void runAction(booking.id, "confirmed")}
                          className="rounded-full bg-[var(--spa-green)] px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                        >
                          ยืนยัน
                        </button>
                      ) : null}
                      {booking.status === "confirmed" ? (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void runAction(booking.id, "no_show")}
                          className="rounded-full border border-[var(--spa-line)] bg-white px-3 py-2 text-xs font-bold disabled:opacity-40"
                        >
                          ไม่มา
                        </button>
                      ) : null}
                      {!["completed", "cancelled", "no_show"].includes(booking.status) ? (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void runAction(booking.id, "cancelled")}
                          className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-40"
                        >
                          ยกเลิก
                        </button>
                      ) : null}
                      {booking.line_user_id ? (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void runAction(booking.id, "pause_ai")}
                          className="rounded-full border border-[var(--spa-line)] bg-white px-3 py-2 text-xs font-bold disabled:opacity-40"
                        >
                          คุยเอง 30 นาที
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!bookings.length ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center text-[var(--spa-leaf)]">
                    ยังไม่มีคิววันนี้ เมื่อจองผ่าน LINE คิวจะเด้งขึ้นที่นี่
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-[var(--spa-leaf)]">
        หน้านี้ใช้ข้อมูล Demo และยังไม่มีระบบ Login กรุณาอย่าใส่ข้อมูลลูกค้าจริง
      </p>
    </section>
  );
}
