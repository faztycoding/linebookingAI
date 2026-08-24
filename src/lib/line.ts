import { createHmac, timingSafeEqual } from "node:crypto";

export type LineMessage = {
  type:
    | "text"
    | "image"
    | "video"
    | "audio"
    | "location"
    | "sticker"
    | "imagemap"
    | "template"
    | "flex";
  [key: string]: unknown;
};

export function verifyLineSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  if (!channelSecret || !signature) {
    return false;
  }

  const expected = createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest();
  const received = Buffer.from(signature, "base64");

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export async function replyMessage(
  replyToken: string,
  messages: LineMessage[],
): Promise<void> {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!channelAccessToken) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured");
  }

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ replyToken, messages }),
  });

  if (!response.ok) {
    throw new Error(
      `LINE reply failed (${response.status}): ${await response.text()}`,
    );
  }
}
