import { timingSafeEqual } from "node:crypto";

import { deleteOldWebhookEvents, releaseExpiredHolds } from "@/lib/db";

export const runtime = "nodejs";

function isAuthorized(received: string | null, secret: string): boolean {
  if (!received) {
    return false;
  }

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(`Bearer ${secret}`);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || !isAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ message: "ไม่มีสิทธิ์เรียก cron" }, { status: 401 });
  }

  try {
    const [holdsReleased, webhookEventsRemoved] = await Promise.all([
      releaseExpiredHolds(),
      deleteOldWebhookEvents(),
    ]);
    return Response.json({ ok: true, holdsReleased, webhookEventsRemoved });
  } catch (error) {
    console.error("Release holds cron failed", error);
    return Response.json({ message: "ปล่อยคิวหมดอายุไม่สำเร็จ" }, { status: 500 });
  }
}
