import { getBookingById } from "@/lib/db";
import { generatePromptPayQr, verifyPaymentQrToken } from "@/lib/payment";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const bookingId = url.searchParams.get("booking");
  const token = url.searchParams.get("token");

  if (!bookingId || !verifyPaymentQrToken(bookingId, token)) {
    return Response.json({ message: "ลิงก์ QR ไม่ถูกต้อง" }, { status: 401 });
  }

  const booking = await getBookingById(bookingId);
  if (!booking || !["hold", "pending_payment", "confirmed"].includes(booking.status)) {
    return Response.json({ message: "ไม่พบรายการชำระเงิน" }, { status: 404 });
  }

  if (
    booking.status !== "confirmed" &&
    (!booking.hold_expires_at ||
      new Date(booking.hold_expires_at).getTime() <= Date.now())
  ) {
    return Response.json({ message: "QR นี้หมดอายุแล้ว" }, { status: 410 });
  }

  try {
    const png = await generatePromptPayQr(booking.deposit_amount);
    const body = new ArrayBuffer(png.byteLength);
    new Uint8Array(body).set(png);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `inline; filename="booking-${booking.booking_code}.png"`,
      },
    });
  } catch (error) {
    console.error("PromptPay QR generation failed", error);
    return Response.json({ message: "สร้าง QR ไม่สำเร็จ" }, { status: 500 });
  }
}
