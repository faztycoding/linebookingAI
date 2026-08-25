import { processLineWebhookEvent } from "@/lib/booking-flow";
import {
  type LineWebhookBody,
  type LineWebhookEvent,
  verifyLineSignature,
} from "@/lib/line";

export const runtime = "nodejs";

function isLineWebhookEvent(value: unknown): value is LineWebhookEvent {
  return Boolean(
    value &&
      typeof value === "object" &&
      "webhookEventId" in value &&
      typeof value.webhookEventId === "string" &&
      value.webhookEventId &&
      "type" in value &&
      typeof value.type === "string",
  );
}

function parseWebhookBody(rawBody: string): LineWebhookBody | null {
  try {
    const body: unknown = JSON.parse(rawBody);
    if (!body || typeof body !== "object" || !("events" in body)) {
      return null;
    }

    const events = body.events;
    if (!Array.isArray(events)) {
      return null;
    }

    return {
      destination:
        "destination" in body && typeof body.destination === "string"
          ? body.destination
          : undefined,
      events: events.filter(isLineWebhookEvent),
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!verifyLineSignature(rawBody, signature)) {
    return Response.json({ message: "ลายเซ็น webhook ไม่ถูกต้อง" }, { status: 401 });
  }

  const body = parseWebhookBody(rawBody);
  if (!body) {
    return Response.json({ message: "ข้อมูล webhook ไม่ถูกต้อง" }, { status: 400 });
  }

  console.log("LINE webhook received", {
    events: body.events.map((event) => ({
      id: event.webhookEventId,
      type: event.type,
      ...(event.postback ? { postbackData: event.postback.data } : {}),
    })),
  });

  for (const event of body.events) {
    try {
      await processLineWebhookEvent(event);
    } catch (error) {
      console.error("Unhandled LINE event failure", {
        eventId: event.webhookEventId,
        error,
      });
    }
  }

  return new Response(null, { status: 200 });
}
