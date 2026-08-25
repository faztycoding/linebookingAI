import "server-only";

import {
  BookingConflictError,
  createHoldBooking,
  getBookingsOverlapping,
  getServiceById,
  getServices,
  getShopInfo,
  getTherapistById,
  getTherapists,
  getTherapistShifts,
  markConversationEscalated,
  releaseExpiredHolds,
} from "@/lib/db";

export const toolDefinitions = [
  {
    name: "get_services",
    description:
      "ดึงรายการบริการทั้งหมดของร้าน พร้อมราคาและระยะเวลา ใช้เมื่อลูกค้าถามว่ามีบริการอะไร หรือถามราคา",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_therapists",
    description: "ดึงรายชื่อพนักงานนวดที่ให้บริการนั้นได้",
    input_schema: {
      type: "object",
      properties: { service_id: { type: "string" } },
      required: ["service_id"],
    },
  },
  {
    name: "get_available_slots",
    description:
      "เช็คเวลาว่างจริงของพนักงานนวดในวันที่ระบุ ห้ามเดาเวลาว่างเองเด็ดขาด",
    input_schema: {
      type: "object",
      properties: {
        therapist_id: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        service_id: { type: "string" },
      },
      required: ["therapist_id", "date", "service_id"],
    },
  },
  {
    name: "hold_slot",
    description:
      "ล็อกคิวชั่วคราว 10 นาทีเพื่อรอชำระมัดจำ เรียกเมื่อลูกค้ายืนยันเวลาแล้วเท่านั้น",
    input_schema: {
      type: "object",
      properties: {
        therapist_id: { type: "string" },
        service_id: { type: "string" },
        start_at: { type: "string", description: "ISO8601" },
        customer_name: { type: "string" },
      },
      required: ["therapist_id", "service_id", "start_at"],
    },
  },
  {
    name: "get_shop_info",
    description:
      "ดึงข้อมูลร้าน เช่น เวลาเปิด-ปิด ที่อยู่ ที่จอดรถ วิธีชำระเงิน นโยบายยกเลิก โปรโมชั่น",
    input_schema: {
      type: "object",
      properties: { key: { type: "string" } },
    },
  },
  {
    name: "escalate_to_human",
    description:
      "ส่งต่อให้แอดมิน ใช้เมื่อลูกค้าขอคุยกับคน ขอเลื่อน/ยกเลิก/คืนเงิน ร้องเรียน หรือเมื่อไม่สามารถช่วยได้",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
  },
] as const;

export type ToolContext = {
  lineUserId?: string;
};

export type AvailableSlot = {
  start_at: string;
  label: string;
};

function requireString(
  input: Record<string, unknown>,
  key: string,
): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function toBangkokDate(date: string, time: string): Date {
  const normalizedTime = time.slice(0, 8);
  const value = new Date(`${date}T${normalizedTime}+07:00`);

  if (Number.isNaN(value.getTime())) {
    throw new Error("วันที่หรือเวลาไม่ถูกต้อง");
  }

  return value;
}

function parseRange(value: string): [Date, Date] | null {
  const match = value.match(/^[[(]"?([^",]+)"?,"?([^"\])]+)"?[\])]$/);
  if (!match) {
    return null;
  }

  const start = new Date(match[1]);
  const end = new Date(match[2]);
  return Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())
    ? null
    : [start, end];
}

function formatBangkokTime(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

export async function getAvailableSlots(input: {
  therapistId: string;
  serviceId: string;
  date: string;
}): Promise<AvailableSlot[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error("วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD");
  }

  const [service, therapist] = await Promise.all([
    getServiceById(input.serviceId),
    getTherapistById(input.therapistId),
  ]);

  if (!service) {
    throw new Error("ไม่พบบริการที่เลือกค่ะ");
  }
  if (!therapist) {
    throw new Error("ไม่พบพนักงานนวดที่เลือกค่ะ");
  }

  await releaseExpiredHolds();
  const shifts = await getTherapistShifts(input.therapistId, input.date);
  if (!shifts.length) {
    return [];
  }

  const shiftStarts = shifts.map((shift) =>
    toBangkokDate(input.date, shift.start_time),
  );
  const shiftEnds = shifts.map((shift) =>
    toBangkokDate(input.date, shift.end_time),
  );
  const windowStart = new Date(
    Math.min(...shiftStarts.map((value) => value.getTime())),
  );
  const windowEnd = new Date(
    Math.max(...shiftEnds.map((value) => value.getTime())),
  );
  const bookings = await getBookingsOverlapping(
    input.therapistId,
    windowStart,
    windowEnd,
  );
  const bookedRanges = bookings
    .map(({ time_range }) => parseRange(time_range))
    .filter((range): range is [Date, Date] => range !== null);
  const serviceLengthMs = (service.duration_min + 15) * 60_000;
  const slots: AvailableSlot[] = [];

  for (const shift of shifts) {
    const shiftStart = toBangkokDate(input.date, shift.start_time);
    const shiftEnd = toBangkokDate(input.date, shift.end_time);

    if (shiftEnd <= shiftStart) {
      continue;
    }

    for (
      let start = shiftStart.getTime();
      start + serviceLengthMs <= shiftEnd.getTime();
      start += 30 * 60_000
    ) {
      const end = start + serviceLengthMs;
      const overlaps = bookedRanges.some(
        ([bookedStart, bookedEnd]) =>
          start < bookedEnd.getTime() && end > bookedStart.getTime(),
      );

      if (!overlaps) {
        const startDate = new Date(start);
        slots.push({
          start_at: startDate.toISOString(),
          label: `${formatBangkokTime(startDate)} น.`,
        });
      }
    }
  }

  return slots;
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  context: ToolContext = {},
): Promise<Record<string, unknown>> {
  switch (name) {
    case "get_services":
      return { ok: true, services: await getServices() };

    case "get_therapists": {
      const serviceId = requireString(input, "service_id");
      const service = await getServiceById(serviceId);
      if (!service) {
        return { ok: false, message: "ไม่พบบริการที่เลือกค่ะ" };
      }
      return { ok: true, therapists: await getTherapists() };
    }

    case "get_available_slots": {
      const slots = await getAvailableSlots({
        therapistId: requireString(input, "therapist_id"),
        serviceId: requireString(input, "service_id"),
        date: requireString(input, "date"),
      });
      return {
        ok: true,
        slots,
        message: slots.length
          ? undefined
          : "วันที่เลือกยังไม่มีเวลาว่างค่ะ กรุณาเลือกวันอื่น",
      };
    }

    case "hold_slot": {
      const serviceId = requireString(input, "service_id");
      const therapistId = requireString(input, "therapist_id");
      const [service, therapist] = await Promise.all([
        getServiceById(serviceId),
        getTherapistById(therapistId),
      ]);

      if (!service || !therapist) {
        return { ok: false, message: "ไม่พบบริการหรือพนักงานที่เลือกค่ะ" };
      }

      try {
        const booking = await createHoldBooking({
          lineUserId: context.lineUserId,
          customerName:
            typeof input.customer_name === "string"
              ? input.customer_name.trim()
              : undefined,
          service,
          therapistId,
          startAt: requireString(input, "start_at"),
        });
        return { ok: true, booking };
      } catch (error) {
        if (error instanceof BookingConflictError) {
          return {
            ok: false,
            message:
              "คิวนี้เพิ่งถูกจองไปพอดีค่ะ รบกวนเลือกเวลาอื่นนะคะ",
          };
        }
        throw error;
      }
    }

    case "get_shop_info": {
      const key = typeof input.key === "string" ? input.key.trim() : undefined;
      const info = await getShopInfo(key || undefined);
      return Object.keys(info).length
        ? { ok: true, info }
        : { ok: false, message: "ยังไม่มีข้อมูลส่วนนี้ค่ะ" };
    }

    case "escalate_to_human": {
      const reason = requireString(input, "reason");
      if (context.lineUserId) {
        await markConversationEscalated(context.lineUserId, reason);
      }
      return {
        ok: true,
        escalated: true,
        message: "รับทราบค่ะ แอดมินจะเข้ามาดูแลต่อโดยเร็วที่สุดค่ะ",
      };
    }

    default:
      return { ok: false, message: "ไม่พบเครื่องมือที่เรียกใช้ค่ะ" };
  }
}
