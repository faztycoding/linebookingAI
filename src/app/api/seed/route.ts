import { timingSafeEqual } from "node:crypto";

import { seedDemoData } from "@/lib/seed";

export const runtime = "nodejs";

function secretsMatch(received: string | null, expected: string): boolean {
  if (!received) {
    return false;
  }

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(`Bearer ${expected}`);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export async function POST(request: Request): Promise<Response> {
  const seedSecret = process.env.SEED_SECRET;
  const authorization = request.headers.get("authorization");

  if (!seedSecret || !secretsMatch(authorization, seedSecret)) {
    return Response.json({ message: "ไม่มีสิทธิ์สร้างข้อมูล Demo" }, { status: 401 });
  }

  try {
    const result = await seedDemoData();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("Demo seed failed", error);
    return Response.json(
      { message: "สร้างข้อมูล Demo ไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
