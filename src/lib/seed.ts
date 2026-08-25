import "server-only";

import { getSupabaseAdmin } from "@/lib/db";

const services = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "นวดไทยเพื่อผ่อนคลาย",
    name_en: "Thai Massage",
    description: "นวดไทยแบบพอดีแรง ช่วยคลายความเมื่อยล้าทั่วร่างกาย",
    duration_min: 60,
    price: 500,
    active: true,
    sort_order: 1,
  },
  {
    id: "11111111-1111-4111-8111-111111111112",
    name: "นวดอโรมา",
    name_en: "Aromatherapy Massage",
    description: "ผ่อนคลายด้วยน้ำมันอโรมากลิ่นอ่อนโยน",
    duration_min: 90,
    price: 900,
    active: true,
    sort_order: 2,
  },
  {
    id: "11111111-1111-4111-8111-111111111113",
    name: "นวดเท้า",
    name_en: "Foot Massage",
    description: "ดูแลเท้าและน่อง เหมาะสำหรับผู้ที่เดินหรือยืนนาน",
    duration_min: 60,
    price: 450,
    active: true,
    sort_order: 3,
  },
  {
    id: "11111111-1111-4111-8111-111111111114",
    name: "นวดประคบสมุนไพร",
    name_en: "Herbal Compress Massage",
    description: "นวดผ่อนคลายพร้อมลูกประคบสมุนไพรอุ่น",
    duration_min: 90,
    price: 1100,
    active: true,
    sort_order: 4,
  },
  {
    id: "11111111-1111-4111-8111-111111111115",
    name: "แพ็กเกจสปาบ้านสบาย",
    name_en: "Baan Sabai Signature",
    description: "สครับผิวและนวดอโรมาในแพ็กเกจเดียว",
    duration_min: 120,
    price: 1500,
    active: true,
    sort_order: 5,
  },
];

const therapists = [
  {
    id: "22222222-2222-4222-8222-222222222221",
    name: "อัญชลี ใจดี",
    nickname: "คุณแอน",
    specialty: "นวดไทยและดูแลอาการเมื่อยล้าจากการทำงาน",
    active: true,
    start_time: "10:00:00",
    end_time: "18:00:00",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "สายฝน พราวใจ",
    nickname: "คุณฝน",
    specialty: "อโรมาและการนวดเพื่อผ่อนคลาย",
    active: true,
    start_time: "12:00:00",
    end_time: "20:00:00",
  },
  {
    id: "22222222-2222-4222-8222-222222222223",
    name: "เมธาวี สุขใจ",
    nickname: "คุณเมย์",
    specialty: "นวดเท้าและประคบสมุนไพร",
    active: true,
    start_time: "10:00:00",
    end_time: "20:00:00",
  },
];

const shopInfo = [
  { key: "hours", value: "เปิดทุกวัน เวลา 10:00–20:00 น." },
  {
    key: "address",
    value: "Baan Sabai Spa (ข้อมูลสำหรับ Demo) ใจกลางกรุงเทพฯ",
  },
  { key: "parking", value: "มีที่จอดรถหน้าร้าน 4 คัน" },
  {
    key: "payment_methods",
    value: "รับเงินสด โอนผ่านธนาคาร และ PromptPay",
  },
  {
    key: "cancellation_policy",
    value: "กรุณาแจ้งเปลี่ยนแปลงล่วงหน้าอย่างน้อย 3 ชั่วโมง",
  },
  { key: "phone", value: "02-000-0000 (เบอร์สำหรับ Demo)" },
  {
    key: "promotions",
    value: "แพ็กเกจ Baan Sabai Signature ราคา 1,500 บาท",
  },
];

function bangkokDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function seedDemoData(): Promise<{
  services: number;
  therapists: number;
  shiftsInserted: number;
  shopInfo: number;
}> {
  const client = getSupabaseAdmin();
  const { error: serviceError } = await client
    .from("services")
    .upsert(services, { onConflict: "id" });

  if (serviceError) {
    throw new Error(serviceError.message);
  }

  const therapistRows = therapists.map((therapist) => ({
    id: therapist.id,
    name: therapist.name,
    nickname: therapist.nickname,
    specialty: therapist.specialty,
    active: therapist.active,
  }));
  const { error: therapistError } = await client
    .from("therapists")
    .upsert(therapistRows, { onConflict: "id" });

  if (therapistError) {
    throw new Error(therapistError.message);
  }

  const { error: shopInfoError } = await client
    .from("shop_info")
    .upsert(shopInfo, { onConflict: "key" });

  if (shopInfoError) {
    throw new Error(shopInfoError.message);
  }

  const dates = Array.from({ length: 14 }, (_, index) =>
    bangkokDate(new Date(Date.now() + index * 24 * 60 * 60 * 1000)),
  );
  const { data: existing, error: existingError } = await client
    .from("therapist_shifts")
    .select("therapist_id,work_date")
    .in(
      "therapist_id",
      therapists.map(({ id }) => id),
    )
    .gte("work_date", dates[0])
    .lte("work_date", dates[dates.length - 1]);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingKeys = new Set(
    (existing ?? []).map(
      (shift) => `${String(shift.therapist_id)}:${String(shift.work_date)}`,
    ),
  );
  const shifts = therapists.flatMap((therapist) =>
    dates
      .filter((date) => !existingKeys.has(`${therapist.id}:${date}`))
      .map((date) => ({
        therapist_id: therapist.id,
        work_date: date,
        start_time: therapist.start_time,
        end_time: therapist.end_time,
      })),
  );

  if (shifts.length) {
    const { error: shiftError } = await client
      .from("therapist_shifts")
      .insert(shifts);

    if (shiftError) {
      throw new Error(shiftError.message);
    }
  }

  return {
    services: services.length,
    therapists: therapists.length,
    shiftsInserted: shifts.length,
    shopInfo: shopInfo.length,
  };
}
