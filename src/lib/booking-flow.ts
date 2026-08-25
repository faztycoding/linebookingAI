import "server-only";

import { runReceptionist, type ToolExecution } from "@/lib/ai";
import {
  BookingExpiredError,
  BookingNotFoundError,
  claimWebhookEvent,
  confirmBookingPayment,
  getConversation,
  getServiceById,
  getTherapistById,
  getTherapists,
  mergeConversationState,
  releaseWebhookEvent,
  type Booking,
  type Service,
  type Therapist,
} from "@/lib/db";
import {
  bookingConfirmation,
  datePicker,
  getNextSevenDates,
  paymentSummary,
  serviceCarousel,
  therapistList,
  timeGrid,
} from "@/lib/flex";
import {
  getLineProfile,
  type LineMessage,
  type LineWebhookEvent,
  replyMessage,
  startChatLoading,
  textMessage,
} from "@/lib/line";
import { getPaymentQrUrl } from "@/lib/payment";
import {
  executeTool,
  getAvailableSlots,
  type AvailableSlot,
} from "@/lib/tools";

function stateString(
  state: Record<string, unknown>,
  key: string,
): string | null {
  return typeof state[key] === "string" && state[key]
    ? String(state[key])
    : null;
}

function resultArray<T>(
  execution: ToolExecution,
  key: string,
): T[] {
  const value = execution.result[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

function resultBooking(value: unknown): Booking | null {
  return value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    "booking_code" in value &&
    typeof value.booking_code === "string"
    ? (value as Booking)
    : null;
}

function bookingStart(timeRange: string): string | null {
  const match = timeRange.match(/^[[(]"?([^",]+)"?,/);
  return match?.[1] ?? null;
}

async function replyForAiResult(
  lineUserId: string,
  replyToken: string,
  userText: string,
): Promise<void> {
  await startChatLoading(lineUserId);
  const result = await runReceptionist(lineUserId, userText);
  if (result.paused) {
    return;
  }

  const messages: LineMessage[] = result.text
    ? [textMessage(result.text)]
    : [];

  for (const execution of result.toolExecutions) {
    if (execution.name === "get_services") {
      const services = resultArray<Service>(execution, "services");
      if (services.length) {
        messages.push(serviceCarousel(services));
      }
    }

    if (execution.name === "get_therapists") {
      const serviceId = execution.input.service_id;
      const therapists = resultArray<Therapist>(execution, "therapists");
      if (typeof serviceId === "string" && therapists.length) {
        await mergeConversationState(lineUserId, {
          service_id: serviceId,
          therapist_id: null,
          date: null,
          start_at: null,
        });
        messages.push(therapistList(therapists));
      }
    }

    if (execution.name === "get_available_slots") {
      const { service_id, therapist_id, date } = execution.input;
      const slots = resultArray<AvailableSlot>(execution, "slots");
      if (
        typeof service_id === "string" &&
        typeof therapist_id === "string" &&
        typeof date === "string"
      ) {
        await mergeConversationState(lineUserId, {
          service_id,
          therapist_id,
          date,
          start_at: null,
        });
        if (slots.length) {
          messages.push(timeGrid(slots));
        }
      }
    }
  }

  if (!messages.length) {
    messages.push(textMessage("ขออภัยค่ะ รบกวนลองส่งข้อความอีกครั้งนะคะ"));
  }

  await replyMessage(replyToken, messages);
}

async function handlePostback(
  lineUserId: string,
  replyToken: string,
  data: string,
): Promise<void> {
  const params = new URLSearchParams(data);
  const action = params.get("action");
  const conversation = await getConversation(lineUserId);

  if (action === "select_service") {
    const serviceId = params.get("id");
    const service = serviceId ? await getServiceById(serviceId) : null;
    if (!service) {
      await replyMessage(replyToken, [
        textMessage("ไม่พบบริการนี้แล้วค่ะ กรุณาเลือกรายการใหม่"),
      ]);
      return;
    }

    const therapists = await getTherapists();
    await mergeConversationState(lineUserId, {
      service_id: service.id,
      therapist_id: null,
      date: null,
      start_at: null,
      booking_id: null,
    });
    await replyMessage(replyToken, [
      textMessage(`เลือก ${service.name} แล้วค่ะ ต่อไปเลือกพนักงานนวดได้เลยค่ะ`),
      therapistList(therapists),
    ]);
    return;
  }

  if (action === "select_therapist") {
    const serviceId = stateString(conversation.state, "service_id");
    const therapistId = params.get("id");
    const therapist = therapistId
      ? await getTherapistById(therapistId)
      : null;
    if (!serviceId || !therapist) {
      await replyMessage(replyToken, [
        textMessage("ข้อมูลการจองไม่ครบค่ะ กรุณาเริ่มเลือกบริการใหม่"),
      ]);
      return;
    }

    await mergeConversationState(lineUserId, {
      therapist_id: therapist.id,
      date: null,
      start_at: null,
      booking_id: null,
    });
    await replyMessage(replyToken, [
      textMessage(
        `เลือก ${therapist.nickname ?? therapist.name} แล้วค่ะ กรุณาเลือกวันที่สะดวกค่ะ`,
      ),
      datePicker(getNextSevenDates()),
    ]);
    return;
  }

  if (action === "select_date") {
    const serviceId = stateString(conversation.state, "service_id");
    const therapistId = stateString(conversation.state, "therapist_id");
    const date = params.get("date");
    const allowedDates = new Set(getNextSevenDates().map((item) => item.date));

    if (!serviceId || !therapistId || !date || !allowedDates.has(date)) {
      await replyMessage(replyToken, [
        textMessage("ข้อมูลวันที่ไม่ถูกต้องค่ะ กรุณาเริ่มเลือกวันใหม่"),
      ]);
      return;
    }

    const slots = await getAvailableSlots({ serviceId, therapistId, date });
    await mergeConversationState(lineUserId, {
      date,
      start_at: null,
      booking_id: null,
    });
    await replyMessage(
      replyToken,
      slots.length
        ? [textMessage("เลือกเวลาที่สะดวกได้เลยค่ะ"), timeGrid(slots)]
        : [textMessage("วันนี้ยังไม่มีเวลาว่างค่ะ กรุณาเลือกวันอื่นนะคะ")],
    );
    return;
  }

  if (action === "select_time") {
    const serviceId = stateString(conversation.state, "service_id");
    const therapistId = stateString(conversation.state, "therapist_id");
    const date = stateString(conversation.state, "date");
    const startAt = params.get("start_at");

    if (!serviceId || !therapistId || !date || !startAt) {
      await replyMessage(replyToken, [
        textMessage("ข้อมูลการจองไม่ครบค่ะ กรุณาเริ่มเลือกบริการใหม่"),
      ]);
      return;
    }

    const availableSlots = await getAvailableSlots({
      serviceId,
      therapistId,
      date,
    });
    if (!availableSlots.some((slot) => slot.start_at === startAt)) {
      await replyMessage(replyToken, [
        textMessage("คิวนี้เพิ่งถูกจองไปค่ะ กรุณาเลือกเวลาอื่นนะคะ"),
      ]);
      return;
    }

    const profile = await getLineProfile(lineUserId).catch(() => ({
      displayName: "ลูกค้า LINE",
    }));
    const result = await executeTool(
      "hold_slot",
      {
        service_id: serviceId,
        therapist_id: therapistId,
        start_at: startAt,
        customer_name: profile.displayName,
      },
      { lineUserId },
    );

    const booking = resultBooking(result.booking);
    if (result.ok !== true || !booking) {
      await replyMessage(replyToken, [
        textMessage(
          typeof result.message === "string"
            ? result.message
            : "ล็อกคิวไม่สำเร็จค่ะ กรุณาเลือกเวลาอื่น",
        ),
      ]);
      return;
    }

    const [service, therapist] = await Promise.all([
      getServiceById(serviceId),
      getTherapistById(therapistId),
    ]);
    if (!service || !therapist) {
      await replyMessage(replyToken, [
        textMessage("เตรียมข้อมูลชำระเงินไม่สำเร็จค่ะ กรุณาติดต่อแอดมิน"),
      ]);
      return;
    }

    await mergeConversationState(lineUserId, {
      start_at: startAt,
      booking_id: booking.id,
    });
    await replyMessage(replyToken, [
      textMessage("ล็อกคิวไว้ให้ 10 นาทีแล้วค่ะ สแกน QR เพื่อดูขั้นตอนมัดจำได้เลยค่ะ"),
      paymentSummary({
        booking,
        service,
        therapist,
        startAt,
        qrUrl: getPaymentQrUrl(booking.id),
      }),
    ]);
    return;
  }

  if (action === "confirm_payment") {
    const bookingId = params.get("booking_id");
    if (!bookingId) {
      await replyMessage(replyToken, [
        textMessage("ไม่พบรายการชำระเงินค่ะ กรุณาเริ่มจองใหม่"),
      ]);
      return;
    }

    let booking: Booking;
    try {
      booking = await confirmBookingPayment({ bookingId, lineUserId });
    } catch (error) {
      if (error instanceof BookingExpiredError) {
        await replyMessage(replyToken, [
          textMessage("คิวที่ล็อกไว้หมดเวลาแล้วค่ะ กรุณาเลือกเวลาใหม่"),
        ]);
        return;
      }
      if (error instanceof BookingNotFoundError) {
        await replyMessage(replyToken, [
          textMessage("ไม่พบรายการจองนี้ค่ะ กรุณาติดต่อแอดมิน"),
        ]);
        return;
      }
      throw error;
    }

    const [service, therapist] = await Promise.all([
      booking.service_id ? getServiceById(booking.service_id) : null,
      getTherapistById(booking.therapist_id),
    ]);
    const startAt =
      stateString(conversation.state, "booking_id") === booking.id
        ? stateString(conversation.state, "start_at")
        : bookingStart(booking.time_range);

    if (!service || !therapist || !startAt) {
      await replyMessage(replyToken, [
        textMessage("ยืนยันคิวแล้วค่ะ กรุณาแจ้งรหัสจองกับแอดมินเมื่อมาถึงร้าน"),
      ]);
      return;
    }

    await mergeConversationState(lineUserId, {
      booking_id: booking.id,
      payment_confirmed: true,
    });
    await replyMessage(replyToken, [
      textMessage("บันทึกการชำระแบบ Demo และยืนยันคิวเรียบร้อยแล้วค่ะ"),
      bookingConfirmation({ booking, service, therapist, startAt }),
    ]);
    return;
  }

  await replyMessage(replyToken, [
    textMessage("ไม่พบขั้นตอนนี้ค่ะ กรุณาเริ่มเลือกบริการใหม่"),
  ]);
}

async function handleClaimedEvent(event: LineWebhookEvent): Promise<void> {
  const lineUserId = event.source?.userId;
  const replyToken = event.replyToken;

  if (!lineUserId || !replyToken) {
    return;
  }

  const conversation = await getConversation(lineUserId);
  const pauseUntil = conversation.ai_paused_until
    ? new Date(conversation.ai_paused_until)
    : null;
  if (pauseUntil && pauseUntil.getTime() > Date.now()) {
    return;
  }

  if (event.type === "follow") {
    const result = await executeTool("get_services", {});
    const services = Array.isArray(result.services)
      ? (result.services as Service[])
      : [];
    await replyMessage(
      replyToken,
      services.length
        ? [
            textMessage(
              "สวัสดีค่ะ ยินดีต้อนรับสู่ Baan Sabai Spa สอบถามข้อมูลหรือเลือกบริการได้เลยค่ะ",
            ),
            serviceCarousel(services),
          ]
        : [
            textMessage(
              "สวัสดีค่ะ ขณะนี้กำลังเตรียมข้อมูลบริการ รบกวนสอบถามแอดมินสักครู่นะคะ",
            ),
          ],
    );
    return;
  }

  if (event.type === "message" && event.message?.type === "text") {
    await replyForAiResult(
      lineUserId,
      replyToken,
      event.message.text?.trim() || "สวัสดี",
    );
    return;
  }

  if (event.type === "postback" && event.postback?.data) {
    await handlePostback(lineUserId, replyToken, event.postback.data);
    return;
  }

  await replyMessage(replyToken, [
    textMessage("ตอนนี้รับข้อความตัวอักษรก่อนนะคะ พิมพ์คำถามได้เลยค่ะ"),
  ]);
}

export async function processLineWebhookEvent(
  event: LineWebhookEvent,
): Promise<void> {
  if (!event.webhookEventId) {
    return;
  }

  const claimed = await claimWebhookEvent(event.webhookEventId);
  if (!claimed) {
    return;
  }

  try {
    await handleClaimedEvent(event);
  } catch (error) {
    console.error("LINE event processing failed", {
      eventId: event.webhookEventId,
      type: event.type,
      error,
    });

    if (event.replyToken) {
      try {
        await replyMessage(event.replyToken, [
          textMessage("ขออภัยค่ะ ระบบขัดข้องชั่วคราว รบกวนลองอีกครั้งนะคะ"),
        ]);
        return;
      } catch (replyError) {
        console.error("LINE fallback reply failed", replyError);
      }
    }

    await releaseWebhookEvent(event.webhookEventId);
  }
}
