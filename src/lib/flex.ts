import type { Service, Therapist } from "@/lib/db";
import type { LineMessage } from "@/lib/line";
import type { AvailableSlot } from "@/lib/tools";

const COLORS = {
  green: "#365C42",
  pale: "#EEF4EC",
  gold: "#B08A45",
  text: "#26332A",
  muted: "#68736B",
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
          backgroundColor: COLORS.green,
          paddingAll: "18px",
          contents: [
            {
              type: "text",
              text: service.name,
              color: "#FFFFFF",
              weight: "bold",
              size: "lg",
              wrap: true,
            },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
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
                  color: COLORS.gold,
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
          contents: [
            {
              type: "button",
              style: "primary",
              color: COLORS.green,
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
        backgroundColor: COLORS.pale,
        contents: [
          {
            type: "text",
            text: "เลือกพนักงานนวด",
            color: COLORS.green,
            weight: "bold",
            size: "xl",
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
        spacing: "lg",
        contents: therapists.map((therapist) => ({
          type: "box",
          layout: "vertical",
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
              style: "secondary",
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
          backgroundColor: COLORS.pale,
          paddingAll: "18px",
          contents: [
            {
              type: "text",
              text: date.label,
              color: COLORS.green,
              weight: "bold",
              align: "center",
              wrap: true,
            },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "button",
              style: "primary",
              color: COLORS.green,
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
  const visibleSlots = slots.slice(0, 10);
  return {
    type: "flex",
    altText: "เลือกเวลาว่าง",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.green,
        contents: [
          {
            type: "text",
            text: "เวลาว่างที่เลือกได้",
            color: "#FFFFFF",
            weight: "bold",
            size: "xl",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: visibleSlots.map((slot) => ({
          type: "button",
          style: "secondary",
          height: "sm",
          action: postback(slot.label, "select_time", {
            start_at: slot.start_at,
          }),
        })),
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text:
              slots.length > visibleSlots.length
                ? "แสดง 10 เวลาแรก หากต้องการเวลาอื่นสอบถามแอดมินได้ค่ะ"
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
