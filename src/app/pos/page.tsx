import Link from "next/link";

import { PosTerminal } from "@/app/pos/pos-terminal";
import {
  getBookingsForDate,
  getServices,
  getTherapists,
  releaseExpiredHolds,
  type BookingView,
  type Service,
  type Therapist,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  let bookings: BookingView[] = [];
  let services: Service[] = [];
  let therapists: Therapist[] = [];
  let initialError: string | null = null;

  try {
    await releaseExpiredHolds();
    [bookings, services, therapists] = await Promise.all([
      getBookingsForDate(),
      getServices(),
      getTherapists(),
    ]);
  } catch (error) {
    console.error("POS initial data failed", error);
    initialError = "ยังไม่ได้เชื่อม Supabase จึงแสดงหน้าตา POS โดยไม่มีข้อมูล";
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-7 lg:px-10">
      <header className="mx-auto flex max-w-[1500px] items-center justify-between rounded-3xl border border-[var(--spa-line)] bg-white/70 px-5 py-4 backdrop-blur-xl sm:px-7">
        <div>
          <Link href="/" className="text-lg font-bold tracking-tight">
            Baan Sabai Spa
          </Link>
          <p className="text-xs text-[var(--spa-leaf)]">POS-lite · Demo</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin"
            className="rounded-full border border-[var(--spa-line)] px-4 py-2 text-sm font-semibold"
          >
            Admin
          </Link>
          <Link
            href="/"
            className="rounded-full bg-[var(--spa-green)] px-4 py-2 text-sm font-semibold text-white"
          >
            หน้าทดลอง
          </Link>
        </div>
      </header>
      <PosTerminal
        initialBookings={bookings}
        initialServices={services}
        initialTherapists={therapists}
        initialError={initialError}
      />
    </main>
  );
}
