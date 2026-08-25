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

export type LineWebhookEvent = {
  webhookEventId: string;
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
  postback?: { data?: string };
};

export type LineWebhookBody = {
  destination?: string;
  events: LineWebhookEvent[];
};

function getChannelAccessToken(): string {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!channelAccessToken) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured");
  }

  return channelAccessToken;
}

export function textMessage(text: string): LineMessage {
  return { type: "text", text };
}

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
  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getChannelAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
  });

  if (!response.ok) {
    throw new Error(
      `LINE reply failed (${response.status}): ${await response.text()}`,
    );
  }
}

export async function startChatLoading(userId: string): Promise<void> {
  const response = await fetch(
    "https://api.line.me/v2/bot/chat/loading/start",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getChannelAccessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chatId: userId, loadingSeconds: 20 }),
    },
  );

  if (!response.ok) {
    console.error("LINE chat loading failed", {
      status: response.status,
      body: await response.text(),
    });
  }
}

export async function getLineProfile(
  userId: string,
): Promise<{ displayName: string }> {
  const response = await fetch(
    `https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${getChannelAccessToken()}` } },
  );

  if (!response.ok) {
    throw new Error(`LINE profile request failed (${response.status})`);
  }

  const profile: unknown = await response.json();
  if (
    !profile ||
    typeof profile !== "object" ||
    !("displayName" in profile) ||
    typeof profile.displayName !== "string"
  ) {
    throw new Error("LINE profile response is invalid");
  }

  return { displayName: profile.displayName };
}
