import {
  BookingConflictError,
  BookingNotFoundError,
  completeBooking,
  createWalkInBooking,
  getBookingsForDate,
  getServices,
  getTherapists,
  InvalidBookingTransitionError,
  releaseExpiredHolds,
} from "@/lib/db";

export const runtime = "nodejs";

function hasValidOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function GET(): Promise<Response> {
  try {
    await releaseExpiredHolds();
    const [bookings, services, therapists] = await Promise.all([
      getBookingsForDate(),
      getServices(),
      getTherapists(),
    ]);
    return Response.json({ ok: true, bookings, services, therapists });
  } catch (error) {
    console.error("POS data query failed", error);
    return Response.json({ message: "โหลดข้อมูล POS ไม่สำเร็จ" }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!hasValidOrigin(request)) {
    return Response.json({ message: "คำขอไม่ถูกต้อง" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("action" in body)) {
    return Response.json({ message: "ข้อมูลไม่ครบ" }, { status: 400 });
  }

  try {
    if (body.action === "complete") {
      const bookingId =
        "bookingId" in body && typeof body.bookingId === "string"
          ? body.bookingId
          : null;
      const paymentMethod =
        "paymentMethod" in body &&
        (body.paymentMethod === "cash" || body.paymentMethod === "transfer")
          ? body.paymentMethod
          : null;
      if (!bookingId || !paymentMethod) {
        return Response.json({ message: "ข้อมูลปิดบิลไม่ครบ" }, { status: 400 });
      }

      const booking = await completeBooking({ bookingId, paymentMethod });
      return Response.json({ ok: true, booking });
    }

    if (body.action === "walkin") {
      const customerName =
        "customerName" in body && typeof body.customerName === "string"
          ? body.customerName
          : "ลูกค้า Walk-in";
      const serviceId =
        "serviceId" in body && typeof body.serviceId === "string"
          ? body.serviceId
          : null;
      const therapistId =
        "therapistId" in body && typeof body.therapistId === "string"
          ? body.therapistId
          : null;
      const startAt =
        "startAt" in body && typeof body.startAt === "string"
          ? body.startAt
          : null;
      if (!serviceId || !therapistId || !startAt) {
        return Response.json({ message: "ข้อมูล Walk-in ไม่ครบ" }, { status: 400 });
      }

      const booking = await createWalkInBooking({
        customerName,
        serviceId,
        therapistId,
        startAt,
      });
      return Response.json({ ok: true, booking });
    }

    return Response.json({ message: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  } catch (error) {
    if (error instanceof BookingConflictError) {
      return Response.json(
        { message: "เวลานี้มีคิวแล้ว กรุณาเลือกเวลาอื่น" },
        { status: 409 },
      );
    }
    if (error instanceof BookingNotFoundError) {
      return Response.json({ message: "ไม่พบข้อมูลที่เลือก" }, { status: 404 });
    }
    if (error instanceof InvalidBookingTransitionError) {
      return Response.json(
        { message: "สถานะคิวเปลี่ยนไปแล้ว กรุณาโหลดใหม่" },
        { status: 409 },
      );
    }
    console.error("POS update failed", error);
    return Response.json({ message: "บันทึก POS ไม่สำเร็จ" }, { status: 500 });
  }
}
