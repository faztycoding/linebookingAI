import {
  BookingNotFoundError,
  InvalidBookingTransitionError,
  getBookingsForDate,
  pauseAiForBooking,
  releaseExpiredHolds,
  updateBookingStatus,
} from "@/lib/db";

export const runtime = "nodejs";

function hasValidOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function GET(request: Request): Promise<Response> {
  const date = new URL(request.url).searchParams.get("date") ?? undefined;

  try {
    await releaseExpiredHolds();
    const bookings = await getBookingsForDate(date);
    return Response.json({ ok: true, bookings });
  } catch (error) {
    console.error("Admin bookings query failed", error);
    return Response.json(
      { message: "โหลดคิวไม่สำเร็จ กรุณาตรวจสอบ Supabase" },
      { status: 503 },
    );
  }
}

export async function PATCH(request: Request): Promise<Response> {
  if (!hasValidOrigin(request)) {
    return Response.json({ message: "คำขอไม่ถูกต้อง" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const bookingId =
    "bookingId" in body && typeof body.bookingId === "string"
      ? body.bookingId
      : null;
  const action =
    "action" in body && typeof body.action === "string" ? body.action : null;

  if (!bookingId || !action) {
    return Response.json({ message: "ข้อมูลไม่ครบ" }, { status: 400 });
  }

  try {
    if (action === "pause_ai") {
      await pauseAiForBooking(bookingId);
    } else if (
      action === "confirmed" ||
      action === "cancelled" ||
      action === "no_show"
    ) {
      await updateBookingStatus(bookingId, action);
    } else {
      return Response.json({ message: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof BookingNotFoundError) {
      return Response.json({ message: "ไม่พบคิวที่เลือก" }, { status: 404 });
    }
    if (error instanceof InvalidBookingTransitionError) {
      return Response.json(
        { message: "สถานะคิวเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลใหม่" },
        { status: 409 },
      );
    }
    console.error("Admin booking update failed", error);
    return Response.json({ message: "อัปเดตคิวไม่สำเร็จ" }, { status: 500 });
  }
}
