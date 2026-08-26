import Link from "next/link";

import { AdminDashboard } from "@/app/admin/admin-dashboard";
import {
  getBangkokDate,
  getBookingsForDate,
  getEscalatedConversations,
  releaseExpiredHolds,
  type BookingView,
  type EscalationView,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let initialError: string | null = null;
  let bookings: BookingView[] = [];
  let escalations: EscalationView[] = [];
  const initialDate = getBangkokDate();

  try {
    await releaseExpiredHolds();
    [bookings, escalations] = await Promise.all([
      getBookingsForDate(initialDate),
      getEscalatedConversations(),
    ]);
  } catch (error) {
    console.error("Admin initial data failed", error);
    initialError = "ยังไม่ได้เชื่อม Supabase จึงแสดงหน้าตา Demo โดยไม่มีข้อมูลคิว";
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-7 lg:px-10">
      <header className="mx-auto flex max-w-[1500px] items-center justify-between rounded-3xl border border-[var(--spa-line)] bg-white/70 px-5 py-4 backdrop-blur-xl sm:px-7">
        <div>
          <Link href="/" className="text-lg font-bold tracking-tight">
            Baan Sabai Spa
          </Link>
          <p className="text-xs text-[var(--spa-leaf)]">Admin Dashboard · Demo</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/"
            className="rounded-full border border-[var(--spa-line)] px-4 py-2 text-sm font-semibold"
          >
            หน้าทดลอง
          </Link>
          <Link
            href="/pos"
            className="rounded-full bg-[var(--spa-green)] px-4 py-2 text-sm font-semibold text-white"
          >
            ไปที่ POS
          </Link>
        </div>
      </header>
      <AdminDashboard
        initialBookings={bookings}
        initialEscalations={escalations}
        initialDate={initialDate}
        initialError={initialError}
      />
    </main>
  );
}
