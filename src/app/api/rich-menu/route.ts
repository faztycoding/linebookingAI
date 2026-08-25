import { timingSafeEqual } from "node:crypto";

import { buildRichMenuImage, RICH_MENU_DEFINITION } from "@/lib/rich-menu";

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

function getChannelAccessToken(): string {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured");
  }
  return token;
}

async function deleteExistingRichMenus(token: string): Promise<void> {
  const listResponse = await fetch("https://api.line.me/v2/bot/richmenu/list", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listResponse.ok) {
    throw new Error(
      `List rich menus failed (${listResponse.status}): ${await listResponse.text()}`,
    );
  }

  const { richmenus } = (await listResponse.json()) as {
    richmenus: { richMenuId: string }[];
  };

  for (const menu of richmenus) {
    await fetch(`https://api.line.me/v2/bot/richmenu/${menu.richMenuId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

export async function POST(request: Request): Promise<Response> {
  const richMenuSecret = process.env.RICH_MENU_SECRET;
  const authorization = request.headers.get("authorization");

  if (!richMenuSecret || !secretsMatch(authorization, richMenuSecret)) {
    return Response.json({ message: "ไม่มีสิทธิ์ตั้งค่าเมนูค่ะ" }, { status: 401 });
  }

  try {
    const token = getChannelAccessToken();

    await deleteExistingRichMenus(token);

    const createResponse = await fetch("https://api.line.me/v2/bot/richmenu", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(RICH_MENU_DEFINITION),
    });
    if (!createResponse.ok) {
      throw new Error(
        `Create rich menu failed (${createResponse.status}): ${await createResponse.text()}`,
      );
    }
    const { richMenuId } = (await createResponse.json()) as {
      richMenuId: string;
    };

    const image = await buildRichMenuImage();
    const uploadResponse = await fetch(
      `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "image/png",
        },
        body: new Uint8Array(image),
      },
    );
    if (!uploadResponse.ok) {
      throw new Error(
        `Upload rich menu image failed (${uploadResponse.status}): ${await uploadResponse.text()}`,
      );
    }

    const setDefaultResponse = await fetch(
      `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!setDefaultResponse.ok) {
      throw new Error(
        `Set default rich menu failed (${setDefaultResponse.status}): ${await setDefaultResponse.text()}`,
      );
    }

    return Response.json({ ok: true, richMenuId });
  } catch (error) {
    console.error("Rich menu setup failed", error);
    return Response.json(
      { message: "ตั้งค่าเมนูไม่สำเร็จค่ะ" },
      { status: 500 },
    );
  }
}
