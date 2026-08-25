import "server-only";

import { runReceptionist, type ToolExecution } from "@/lib/ai";
import {
  BookingExpiredError,
  BookingNotFoundError,
  cancelOwnBooking,
  claimWebhookEvent,
  confirmBookingPayment,
  getBookingById,
  getConversation,
  getServiceById,
  getShopInfo,
  getTherapistById,
  getTherapists,
  InvalidBookingTransitionError,
  mergeConversationState,
  releaseWebhookEvent,
  type Booking,
  type Service,
  type Therapist,
} from "@/lib/db";
import {
  bookingConfirmation,
  cancelConfirmation,
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidBookingId(value: string | null): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

const BOOK_AGAIN_QUICK_REPLY = {
  items: [
    {
      type: "action",
      action: {
        type: "postback",
        label: "จองบริการเพิ่ม",
        data: "action=book_again",
        displayText: "ต้องการจองบริการเพิ่มค่ะ",
      },
    },
  ],
};

// Deterministic guard for the generic "start booking" entry point (e.g. a
// LINE rich menu / quick reply button labeled "เริ่มใช้บริการ"). This is
// intentionally NOT left to the AI: real-device testing showed the model
// would sometimes reply in text that it "will show the menu" without
// actually calling get_services in that turn, so no carousel was ever
// sent. Matching these exact short phrases up front guarantees the menu
// always appears, regardless of what the AI decides to do.
const START_BOOKING_PHRASES = new Set([
  "เริ่มใช้บริการ",
  "เริ่มบริการ",
  "จองคิว",
  "จองบริการ",
  "จอง",
  "ดูเมนู",
  "เมนู",
  "ดูบริการ",
]);

function isStartBookingPhrase(text: string): boolean {
  return START_BOOKING_PHRASES.has(text.trim());
}

async function buildServiceCarouselMessages(): Promise<LineMessage[]> {
  const result = await executeTool("get_services", {});
  const services = resultArray<Service>(
    { name: "get_services", input: {}, result },
    "services",
  );

  return services.length
    ? [textMessage("เลือกบริการที่สนใจได้เลยค่ะ"), serviceCarousel(services)]
    : [
        textMessage(
          "ขณะนี้กำลังเตรียมข้อมูลบริการ รบกวนสอบถามแอดมินสักครู่นะคะ",
        ),
      ];
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
    if (!isValidBookingId(bookingId)) {
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

    const existingProfile =
      conversation.state.profile &&
      typeof conversation.state.profile === "object"
        ? (conversation.state.profile as Record<string, unknown>)
        : {};
    const previousVisits =
      typeof existingProfile.visit_count === "number"
        ? existingProfile.visit_count
        : 0;

    await mergeConversationState(lineUserId, {
      booking_id: booking.id,
      payment_confirmed: true,
      profile: {
        ...existingProfile,
        last_service_id: service.id,
        last_therapist_id: therapist.id,
        visit_count: previousVisits + 1,
      },
    });
    await replyMessage(replyToken, [
      textMessage("บันทึกการชำระแบบ Demo และยืนยันคิวเรียบร้อยแล้วค่ะ"),
      {
        ...bookingConfirmation({ booking, service, therapist, startAt }),
        quickReply: BOOK_AGAIN_QUICK_REPLY,
      },
    ]);
    return;
  }

  if (action === "cancel_booking_confirm") {
    const bookingId = params.get("booking_id");
    const booking = isValidBookingId(bookingId)
      ? await getBookingById(bookingId)
      : null;
    if (!booking || booking.line_user_id !== lineUserId) {
      await replyMessage(replyToken, [
        textMessage("ไม่พบคิวนี้ค่ะ"),
      ]);
      return;
    }
    if (!["hold", "pending_payment", "confirmed"].includes(booking.status)) {
      await replyMessage(replyToken, [
        textMessage("คิวนี้ไม่สามารถยกเลิกได้แล้วค่ะ"),
      ]);
      return;
    }

    await replyMessage(replyToken, [
      cancelConfirmation({
        bookingId: booking.id,
        bookingCode: booking.booking_code,
      }),
    ]);
    return;
  }

  if (action === "cancel_booking") {
    const bookingId = params.get("booking_id");
    if (!isValidBookingId(bookingId)) {
      await replyMessage(replyToken, [
        textMessage("ไม่พบคิวนี้ค่ะ"),
      ]);
      return;
    }

    try {
      const booking = await cancelOwnBooking({ bookingId, lineUserId });
      await mergeConversationState(lineUserId, {
        service_id: null,
        therapist_id: null,
        date: null,
        start_at: null,
        booking_id: null,
      });
      await replyMessage(replyToken, [
        {
          ...textMessage(`ยกเลิกคิว ${booking.booking_code} เรียบร้อยแล้วค่ะ`),
          quickReply: BOOK_AGAIN_QUICK_REPLY,
        },
      ]);
      return;
    } catch (error) {
      if (error instanceof BookingNotFoundError) {
        await replyMessage(replyToken, [
          textMessage("ไม่พบคิวนี้ค่ะ"),
        ]);
        return;
      }
      if (error instanceof InvalidBookingTransitionError) {
        await replyMessage(replyToken, [
          textMessage("คิวนี้ไม่สามารถยกเลิกได้แล้วค่ะ"),
        ]);
        return;
      }
      throw error;
    }
  }

  if (action === "cancel_booking_abort") {
    await replyMessage(replyToken, [
      textMessage("รับทราบค่ะ คิวยังคงเดิมไม่มีการเปลี่ยนแปลงค่ะ"),
    ]);
    return;
  }

  if (action === "book_again" || action === "menu_start_booking") {
    await mergeConversationState(lineUserId, {
      service_id: null,
      therapist_id: null,
      date: null,
      start_at: null,
      booking_id: null,
    });
    await replyMessage(replyToken, await buildServiceCarouselMessages());
    return;
  }

  if (action === "menu_my_booking") {
    const bookingId = stateString(conversation.state, "booking_id");
    const booking = bookingId ? await getBookingById(bookingId) : null;
    const activeStatuses = new Set(["hold", "pending_payment", "confirmed"]);

    if (!booking || !activeStatuses.has(booking.status)) {
      await replyMessage(replyToken, [
        textMessage(
          "ตอนนี้ยังไม่มีคิวที่กำลังใช้งานอยู่ค่ะ เลือกบริการเพื่อเริ่มจองได้เลยค่ะ",
        ),
        ...(await buildServiceCarouselMessages()),
      ]);
      return;
    }

    const [service, therapist] = await Promise.all([
      booking.service_id ? getServiceById(booking.service_id) : null,
      getTherapistById(booking.therapist_id),
    ]);
    const startAt = bookingStart(booking.time_range);

    if (!service || !therapist || !startAt) {
      await replyMessage(replyToken, [
        textMessage(
          `คิวของคุณคือรหัส ${booking.booking_code} ค่ะ กรุณาแจ้งแอดมินหากต้องการรายละเอียดเพิ่มเติม`,
        ),
      ]);
      return;
    }

    await replyMessage(
      replyToken,
      booking.status === "confirmed"
        ? [bookingConfirmation({ booking, service, therapist, startAt })]
        : [
            paymentSummary({
              booking,
              service,
              therapist,
              startAt,
              qrUrl: getPaymentQrUrl(booking.id),
            }),
          ],
    );
    return;
  }

  if (action === "menu_contact_admin") {
    await executeTool(
      "escalate_to_human",
      { reason: "ลูกค้ากดปุ่มติดต่อแอดมินจากเมนู" },
      { lineUserId },
    );
    await replyMessage(replyToken, [
      textMessage(
        "รับทราบค่ะ แอดมินจะติดต่อกลับโดยเร็วที่สุดค่ะ ระหว่างนี้สอบถามข้อมูลเพิ่มเติมได้เลยค่ะ",
      ),
    ]);
    return;
  }

  if (action === "menu_about_shop") {
    const info = await getShopInfo();
    const lines = [
      info.address ? `ที่อยู่: ${info.address}` : null,
      info.hours ? `เวลาเปิด-ปิด: ${info.hours}` : null,
      info.parking ? `ที่จอดรถ: ${info.parking}` : null,
      info.phone ? `โทร: ${info.phone}` : null,
    ].filter((line): line is string => Boolean(line));

    await replyMessage(replyToken, [
      textMessage(
        lines.length
          ? lines.join("\n")
          : "ขณะนี้ยังไม่มีข้อมูลร้านค่ะ สอบถามแอดมินได้เลยค่ะ",
      ),
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

  if (event.type === "follow") {
    const carouselMessages = await buildServiceCarouselMessages();
    await replyMessage(replyToken, [
      textMessage(
        "สวัสดีค่ะ ยินดีต้อนรับสู่ Baan Sabai Spa สอบถามข้อมูลหรือเลือกบริการได้เลยค่ะ",
      ),
      ...carouselMessages,
    ]);
    return;
  }

  if (event.type === "message" && event.message?.type === "text") {
    const conversation = await getConversation(lineUserId);
    const pauseUntil = conversation.ai_paused_until
      ? new Date(conversation.ai_paused_until)
      : null;
    if (pauseUntil && pauseUntil.getTime() > Date.now()) {
      return;
    }

    const userText = event.message.text?.trim() || "สวัสดี";
    if (isStartBookingPhrase(userText)) {
      await mergeConversationState(lineUserId, {
        service_id: null,
        therapist_id: null,
        date: null,
        start_at: null,
        booking_id: null,
      });
      await replyMessage(replyToken, await buildServiceCarouselMessages());
      return;
    }
    await replyForAiResult(lineUserId, replyToken, userText);
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
