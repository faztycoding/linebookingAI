import {
  BookingNotFoundError,
  ConversationConflictError,
  InvalidBookingTransitionError,
  getBookingsForDate,
  getEscalatedConversations,
  pauseAiForBooking,
  releaseExpiredHolds,
  resolveConversationEscalation,
  updateBookingStatus,
} from "@/lib/db";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hasValidOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function GET(request: Request): Promise<Response> {
  const requestedDate = new URL(request.url).searchParams.get("date");
  if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    return Response.json({ message: "รูปแบบวันที่ไม่ถูกต้อง" }, { status: 400 });
  }
  const date = requestedDate || undefined;

  try {
    await releaseExpiredHolds();
    const [bookings, escalations] = await Promise.all([
      getBookingsForDate(date),
      getEscalatedConversations(),
    ]);
    return Response.json({ ok: true, bookings, escalations });
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
    "bookingId" in body &&
    typeof body.bookingId === "string" &&
    UUID_PATTERN.test(body.bookingId)
      ? body.bookingId
      : null;
  const lineUserId =
    "lineUserId" in body && typeof body.lineUserId === "string"
      ? body.lineUserId
      : null;
  const action =
    "action" in body && typeof body.action === "string" ? body.action : null;

  if (!action) {
    return Response.json({ message: "ข้อมูลไม่ครบ" }, { status: 400 });
  }

  try {
    if (action === "resolve_escalation") {
      if (!lineUserId || lineUserId.length > 100) {
        return Response.json({ message: "ข้อมูลลูกค้าไม่ถูกต้อง" }, { status: 400 });
      }
      await resolveConversationEscalation(lineUserId);
    } else if (!bookingId) {
      return Response.json({ message: "ข้อมูลคิวไม่ครบ" }, { status: 400 });
    } else if (action === "pause_ai") {
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
    if (
      error instanceof InvalidBookingTransitionError ||
      error instanceof ConversationConflictError
    ) {
      return Response.json(
        { message: "ข้อมูลเปลี่ยนไปแล้ว กรุณาลองอีกครั้ง" },
        { status: 409 },
      );
    }
    console.error("Admin booking update failed", error);
    return Response.json({ message: "อัปเดตคิวไม่สำเร็จ" }, { status: 500 });
  }
}
