import { verifyLineSignature } from "@/lib/line";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!verifyLineSignature(rawBody, signature)) {
    return Response.json({ message: "ลายเซ็น webhook ไม่ถูกต้อง" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ message: "ข้อมูล webhook ไม่ถูกต้อง" }, { status: 400 });
  }

  console.log("LINE webhook event", body);

  return new Response(null, { status: 200 });
}
