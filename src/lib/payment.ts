import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import generatePromptPayPayload from "promptpay-qr";
import QRCode from "qrcode";

function getQrSecret(): string {
  const secret = process.env.PAYMENT_QR_SECRET;
  if (!secret) {
    throw new Error("PAYMENT_QR_SECRET is not configured");
  }
  return secret;
}

function getAppUrl(): string {
  const configured = process.env.APP_URL;
  const vercelUrl = process.env.VERCEL_URL;
  const value = configured || (vercelUrl ? `https://${vercelUrl}` : "");

  if (!value) {
    throw new Error("APP_URL is not configured");
  }

  const url = new URL(value);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !isLocal) {
    throw new Error("APP_URL must use HTTPS");
  }

  return url.toString();
}

export function signPaymentQr(bookingId: string): string {
  return createHmac("sha256", getQrSecret())
    .update(bookingId)
    .digest("hex");
}

export function verifyPaymentQrToken(
  bookingId: string,
  token: string | null,
): boolean {
  if (!token) {
    return false;
  }

  const expected = Buffer.from(signPaymentQr(bookingId));
  const received = Buffer.from(token);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export function getPaymentQrUrl(bookingId: string): string {
  const url = new URL("/api/payment/qr", getAppUrl());
  url.searchParams.set("booking", bookingId);
  url.searchParams.set("token", signPaymentQr(bookingId));
  return url.toString();
}

export async function generatePromptPayQr(
  amount: number,
): Promise<Uint8Array> {
  const promptPayId = process.env.PROMPTPAY_ID;
  if (!promptPayId) {
    throw new Error("PROMPTPAY_ID is not configured");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("PromptPay amount is invalid");
  }

  const payload = generatePromptPayPayload(promptPayId, { amount });
  const buffer = await QRCode.toBuffer(payload, {
    type: "png",
    width: 720,
    margin: 3,
    color: { dark: "#203629", light: "#FFFFFF" },
    errorCorrectionLevel: "M",
  });
  return new Uint8Array(buffer);
}
