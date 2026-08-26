import type { Booking, Service, Therapist } from "@/lib/db";
import type { LineMessage } from "@/lib/line";
import type { AvailableSlot } from "@/lib/tools";

const COLORS = {
  olive: "#5A6345",
  oliveDark: "#434B35",
  cream: "#FFF8EB",
  creamDeep: "#F4E5C8",
  gold: "#C89B4B",
  goldPale: "#E7C98D",
  text: "#3F4935",
  muted: "#766F5E",
  danger: "#A44F45",
};

export type DateOption = {
  date: string;
  label: string;
};

function price(value: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(value);
}

function postback(
  label: string,
  action: string,
  values: Record<string, string>,
): Record<string, unknown> {
  const data = new URLSearchParams({ action, ...values }).toString();
  if (data.length > 300) {
    throw new Error("LINE postback data exceeds 300 characters");
  }

  return {
    type: "postback",
    label,
    data,
    displayText: label,
  };
}

export function getNextSevenDates(): DateOption[] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const base = Date.UTC(get("year"), get("month") - 1, get("day"), 12);

  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(base + index * 24 * 60 * 60 * 1000);
    const date = [
      value.getUTCFullYear(),
      String(value.getUTCMonth() + 1).padStart(2, "0"),
      String(value.getUTCDate()).padStart(2, "0"),
    ].join("-");
    const label = new Intl.DateTimeFormat("th-TH", {
      timeZone: "UTC",
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(value);
    return { date, label };
  });
}

export function serviceCarousel(services: Service[]): LineMessage {
  return {
    type: "flex",
    altText: "เลือกบริการสปา",
    contents: {
      type: "carousel",
      contents: services.slice(0, 10).map((service) => ({
        type: "bubble",
        size: "kilo",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: COLORS.olive,
          paddingAll: "18px",
          contents: [
            {
              type: "text",
              text: "BAAN SABAI • SPA & WELLNESS",
              color: COLORS.cream,
              weight: "bold",
              size: "xxs",
            },
            {
              type: "text",
              text: service.name,
              color: COLORS.cream,
              weight: "bold",
              size: "lg",
              wrap: true,
              margin: "sm",
            },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          backgroundColor: COLORS.cream,
          spacing: "md",
          contents: [
            {
              type: "text",
              text: service.description ?? "บริการดูแลและผ่อนคลาย",
              color: COLORS.text,
              size: "sm",
              wrap: true,
              maxLines: 3,
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                {
                  type: "text",
                  text: `${service.duration_min} นาที`,
                  color: COLORS.muted,
                  size: "sm",
                },
                {
                  type: "text",
                  text: price(service.price),
                  color: COLORS.oliveDark,
                  weight: "bold",
                  align: "end",
                  size: "md",
                },
              ],
            },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          backgroundColor: COLORS.cream,
          paddingTop: "0px",
          contents: [
            {
              type: "button",
              style: "primary",
              color: COLORS.olive,
              action: postback("เลือกบริการนี้", "select_service", {
                id: service.id,
              }),
            },
          ],
        },
      })),
    },
  };
}

export function therapistList(therapists: Therapist[]): LineMessage {
  return {
    type: "flex",
    altText: "เลือกพนักงานนวด",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.creamDeep,
        borderColor: COLORS.gold,
        borderWidth: "1px",
        contents: [
          {
            type: "text",
            text: "BAAN SABAI • SPA & WELLNESS",
            color: COLORS.oliveDark,
            weight: "bold",
            size: "xxs",
          },
          {
            type: "text",
            text: "เลือกพนักงานนวด",
            color: COLORS.olive,
            weight: "bold",
            size: "xl",
            margin: "sm",
          },
          {
            type: "text",
            text: "ทุกท่านให้บริการหลักได้ครบ เลือกจากความถนัดได้เลยค่ะ",
            color: COLORS.muted,
            size: "sm",
            wrap: true,
            margin: "sm",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.cream,
        spacing: "md",
        contents: therapists.map((therapist) => ({
          type: "box",
          layout: "vertical",
          backgroundColor: COLORS.cream,
          borderColor: COLORS.gold,
          borderWidth: "1px",
          cornerRadius: "14px",
          paddingAll: "14px",
          spacing: "sm",
          contents: [
            {
              type: "text",
              text: therapist.nickname ?? therapist.name,
              color: COLORS.text,
              weight: "bold",
              size: "md",
            },
            {
              type: "text",
              text: therapist.specialty ?? "บริการนวดเพื่อผ่อนคลาย",
              color: COLORS.muted,
              size: "xs",
              wrap: true,
            },
            {
              type: "button",
              style: "primary",
              color: COLORS.olive,
              height: "sm",
              action: postback(
                `เลือก ${therapist.nickname ?? therapist.name}`,
                "select_therapist",
                { id: therapist.id },
              ),
            },
          ],
        })),
      },
    },
  };
}

export function datePicker(dates: DateOption[]): LineMessage {
  return {
    type: "flex",
    altText: "เลือกวันที่เข้ารับบริการ",
    contents: {
      type: "carousel",
      contents: dates.map((date) => ({
        type: "bubble",
        size: "micro",
        body: {
          type: "box",
          layout: "vertical",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: COLORS.creamDeep,
          borderColor: COLORS.gold,
          borderWidth: "1px",
          paddingAll: "18px",
          contents: [
            {
              type: "text",
              text: date.label,
              color: COLORS.olive,
              weight: "bold",
              align: "center",
              wrap: true,
            },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          backgroundColor: COLORS.cream,
          paddingTop: "8px",
          contents: [
            {
              type: "button",
              style: "primary",
              color: COLORS.olive,
              height: "sm",
              action: postback("เลือกวันนี้", "select_date", {
                date: date.date,
              }),
            },
          ],
        },
      })),
    },
  };
}

export function timeGrid(slots: AvailableSlot[]): LineMessage {
  // A full-day shift (e.g. 10:00-20:00) with a 60-minute service plus the
  // 15-minute room buffer can generate up to ~18 valid 30-minute start
  // times. Capping at 10 previously hid slots later in the day (including
  // ones the AI had just confirmed as available in free text), so the limit
  // is raised to comfortably cover a full shift.
  const visibleSlots = slots.slice(0, 20);
  return {
    type: "flex",
    altText: "เลือกเวลาว่าง",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.olive,
        contents: [
          {
            type: "text",
            text: "BAAN SABAI • SPA & WELLNESS",
            color: COLORS.cream,
            weight: "bold",
            size: "xxs",
          },
          {
            type: "text",
            text: "เวลาว่างที่เลือกได้",
            color: COLORS.cream,
            weight: "bold",
            size: "xl",
            margin: "sm",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.cream,
        spacing: "sm",
        contents: visibleSlots.map((slot) => ({
          type: "button",
          style: "secondary",
          color: COLORS.creamDeep,
          height: "sm",
          action: postback(slot.label, "select_time", {
            start_at: slot.start_at,
          }),
        })),
      },
      footer: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.cream,
        borderColor: COLORS.gold,
        borderWidth: "1px",
        contents: [
          {
            type: "text",
            text:
              slots.length > visibleSlots.length
                ? "แสดง 20 เวลาแรก หากต้องการเวลาอื่นสอบถามแอดมินได้ค่ะ"
                : "เวลารวมช่วงเก็บห้อง 15 นาทีแล้วค่ะ",
            color: COLORS.muted,
            size: "xs",
            wrap: true,
            align: "center",
          },
        ],
      },
    },
  };
}

function appointmentLabel(startAt: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(startAt));
}

export function paymentSummary(input: {
  booking: Booking;
  service: Service;
  therapist: Therapist;
  startAt: string;
  qrUrl: string;
}): LineMessage {
  return {
    type: "flex",
    altText: `ชำระมัดจำ ${price(input.booking.deposit_amount)}`,
    contents: {
      type: "bubble",
      hero: {
        type: "image",
        url: input.qrUrl,
        size: "full",
        aspectRatio: "1:1",
        aspectMode: "fit",
        backgroundColor: COLORS.cream,
      },
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.olive,
        contents: [
          {
            type: "text",
            text: "BAAN SABAI • SPA & WELLNESS",
            color: COLORS.cream,
            weight: "bold",
            size: "xxs",
          },
          {
            type: "text",
            text: "สรุปการจองและมัดจำ",
            color: COLORS.cream,
            weight: "bold",
            size: "xl",
            margin: "sm",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.cream,
        spacing: "md",
        contents: [
          {
            type: "text",
            text: input.service.name,
            color: COLORS.text,
            weight: "bold",
            size: "lg",
            wrap: true,
          },
          {
            type: "text",
            text: input.therapist.nickname ?? input.therapist.name,
            color: COLORS.muted,
            size: "sm",
          },
          {
            type: "text",
            text: appointmentLabel(input.startAt),
            color: COLORS.muted,
            size: "sm",
          },
          { type: "separator", color: COLORS.goldPale, margin: "md" },
          {
            type: "box",
            layout: "horizontal",
            margin: "md",
            contents: [
              { type: "text", text: "ยอดรวม", color: COLORS.muted, size: "sm" },
              {
                type: "text",
                text: price(input.booking.total_amount),
                color: COLORS.text,
                align: "end",
                size: "sm",
              },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "มัดจำ 30%",
                color: COLORS.olive,
                weight: "bold",
              },
              {
                type: "text",
                text: price(input.booking.deposit_amount),
                color: COLORS.oliveDark,
                weight: "bold",
                align: "end",
              },
            ],
          },
          {
            type: "text",
            text: "คิวถูกล็อกไว้ 10 นาที สำหรับ Demo ให้กดปุ่มหลังสแกน QR โดยระบบยังไม่ตรวจสลิปอัตโนมัติ",
            color: COLORS.muted,
            size: "xs",
            wrap: true,
            margin: "md",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.cream,
        borderColor: COLORS.gold,
        borderWidth: "1px",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: COLORS.olive,
            action: postback("ชำระแล้ว (Demo)", "confirm_payment", {
              booking_id: input.booking.id,
            }),
          },
          {
            type: "button",
            style: "secondary",
            color: COLORS.creamDeep,
            height: "sm",
            action: postback("ยกเลิกคิวนี้", "cancel_booking_confirm", {
              booking_id: input.booking.id,
            }),
          },
        ],
      },
    },
  };
}

export function bookingConfirmation(input: {
  booking: Booking;
  service: Service;
  therapist: Therapist;
  startAt: string;
}): LineMessage {
  return {
    type: "flex",
    altText: `ยืนยันการจอง ${input.booking.booking_code}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.olive,
        paddingAll: "22px",
        contents: [
          {
            type: "text",
            text: "BAAN SABAI • SPA & WELLNESS",
            color: COLORS.cream,
            weight: "bold",
            size: "xxs",
            align: "center",
          },
          {
            type: "text",
            text: "ยืนยันการจองแล้ว (Demo)",
            color: COLORS.cream,
            weight: "bold",
            size: "xl",
            align: "center",
            margin: "sm",
          },
          {
            type: "text",
            text: `รหัส ${input.booking.booking_code}`,
            color: COLORS.cream,
            size: "sm",
            align: "center",
            margin: "sm",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.cream,
        spacing: "md",
        contents: [
          {
            type: "text",
            text: input.service.name,
            color: COLORS.text,
            weight: "bold",
            size: "lg",
            wrap: true,
          },
          {
            type: "text",
            text: input.therapist.nickname ?? input.therapist.name,
            color: COLORS.muted,
            size: "sm",
          },
          {
            type: "text",
            text: appointmentLabel(input.startAt),
            color: COLORS.muted,
            size: "sm",
          },
          { type: "separator", color: COLORS.goldPale, margin: "md" },
          {
            type: "text",
            text: `บันทึกมัดจำ Demo ${price(input.booking.paid_amount)} เหลือชำระที่ร้าน ${price(input.booking.total_amount - input.booking.paid_amount)}`,
            color: COLORS.olive,
            weight: "bold",
            size: "sm",
            wrap: true,
            margin: "md",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.cream,
        borderColor: COLORS.gold,
        borderWidth: "1px",
        contents: [
          {
            type: "button",
            style: "secondary",
            color: COLORS.creamDeep,
            height: "sm",
            action: postback("ยกเลิกคิวนี้", "cancel_booking_confirm", {
              booking_id: input.booking.id,
            }),
          },
        ],
      },
    },
  };
}

export function cancelConfirmation(input: {
  bookingId: string;
  bookingCode: string;
}): LineMessage {
  return {
    type: "flex",
    altText: "ยืนยันการยกเลิกคิว",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.creamDeep,
        borderColor: COLORS.gold,
        borderWidth: "1px",
        contents: [
          {
            type: "text",
            text: "BAAN SABAI • SPA & WELLNESS",
            color: COLORS.oliveDark,
            weight: "bold",
            size: "xxs",
            align: "center",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.cream,
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "ยืนยันยกเลิกคิวใช่ไหมคะ",
            weight: "bold",
            size: "lg",
            color: COLORS.text,
          },
          {
            type: "text",
            text: `รหัสคิว ${input.bookingCode}`,
            color: COLORS.muted,
            size: "sm",
          },
          {
            type: "text",
            text: "หากยกเลิกกระชั้นชิดก่อนเวลานัดหมาย ทางร้านอาจไม่คืนมัดจำตามนโยบายค่ะ",
            color: COLORS.danger,
            size: "xs",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.cream,
        borderColor: COLORS.gold,
        borderWidth: "1px",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: COLORS.danger,
            action: postback("ยืนยันยกเลิก", "cancel_booking", {
              booking_id: input.bookingId,
            }),
          },
          {
            type: "button",
            style: "secondary",
            color: COLORS.creamDeep,
            height: "sm",
            action: postback("ไม่ยกเลิก", "cancel_booking_abort", {}),
          },
        ],
      },
    },
  };
}
