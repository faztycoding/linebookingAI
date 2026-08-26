// Lightweight regression checks for the AI receptionist behavior.
//
// This is a plain Node script, not a testing framework (per AGENTS.md,
// no Jest/Vitest/etc. is used). Run with: npm run check:regression
//
// It exists because the AI system prompt has been edited several times
// (selection-state memory, reschedule-vs-cancel handling, prompt-injection
// defense) and each edit risks silently breaking an earlier fix. This script
// re-checks the things that actually broke in real-device testing.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

import {
  bookingConfirmation,
  cancelConfirmation,
  datePicker,
  getNextSevenDates,
  paymentSummary,
  serviceCarousel,
  therapistList,
  timeGrid,
} from "../src/lib/flex.ts";
import { verifyLineSignature } from "../src/lib/line.ts";
import {
  buildRichMenuImage,
  RICH_MENU_AREAS,
  RICH_MENU_HEIGHT,
  RICH_MENU_WIDTH,
} from "../src/lib/rich-menu.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const results = [];

function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error });
  }
}

// --- flex.ts: getNextSevenDates ---

check("getNextSevenDates returns exactly 7 unique YYYY-MM-DD dates", () => {
  const dates = getNextSevenDates();
  assert.equal(dates.length, 7);
  const unique = new Set(dates.map((item) => item.date));
  assert.equal(unique.size, 7);
  for (const item of dates) {
    assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(item.label.length > 0);
  }
});

// --- flex.ts: postback data length guard (300 char LINE limit) ---

check("serviceCarousel rejects a postback payload over 300 characters", () => {
  const oversizedService = {
    id: "x".repeat(320),
    name: "ทดสอบ",
    name_en: null,
    description: null,
    duration_min: 60,
    price: 100,
    active: true,
    sort_order: 0,
  };

  assert.throws(() => serviceCarousel([oversizedService]), /300 characters/);
});

check("serviceCarousel accepts a normal-sized service without throwing", () => {
  const service = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "นวดไทยเพื่อผ่อนคลาย",
    name_en: null,
    description: "ทดสอบ",
    duration_min: 60,
    price: 500,
    active: true,
    sort_order: 0,
  };

  const message = serviceCarousel([service]);
  assert.equal(message.type, "flex");
});

check("all customer Flex cards use the cream-gold-olive brand palette", () => {
  const service = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "นวดไทยเพื่อผ่อนคลาย",
    name_en: null,
    description: "บริการสาธิต",
    duration_min: 60,
    price: 500,
    active: true,
    sort_order: 0,
  };
  const therapist = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "พนักงานสาธิต",
    nickname: "คุณเมย์",
    specialty: "นวดเพื่อผ่อนคลาย",
    active: true,
  };
  const booking = {
    id: "33333333-3333-4333-8333-333333333333",
    booking_code: "DEMO01",
    line_user_id: "demo-line-user",
    customer_name: "ลูกค้าสาธิต",
    customer_phone: null,
    service_id: service.id,
    therapist_id: therapist.id,
    time_range: "[\"2026-08-27T03:00:00.000Z\",\"2026-08-27T04:15:00.000Z\")",
    status: "confirmed",
    source: "line",
    deposit_amount: 150,
    total_amount: 500,
    paid_amount: 150,
    payment_method: "promptpay_demo",
    hold_expires_at: null,
    note: null,
    created_at: "2026-08-26T00:00:00.000Z",
  };
  const startAt = "2026-08-27T03:00:00.000Z";
  const messages = [
    serviceCarousel([service]),
    therapistList([therapist]),
    datePicker([{ date: "2026-08-27", label: "พฤ. 27 ส.ค." }]),
    timeGrid([{ start_at: startAt, label: "10:00 น." }]),
    paymentSummary({
      booking,
      service,
      therapist,
      startAt,
      qrUrl: "https://linebooking-ai.vercel.app/api/payment/qr?booking_id=demo",
    }),
    bookingConfirmation({ booking, service, therapist, startAt }),
    cancelConfirmation({ bookingId: booking.id, bookingCode: booking.booking_code }),
  ];
  const payload = JSON.stringify(messages);
  for (const color of ["#5A6345", "#FFF8EB", "#F4E5C8", "#C89B4B"]) {
    assert.ok(payload.includes(color), `expected brand color ${color}`);
  }
  assert.ok(payload.includes("BAAN SABAI • SPA & WELLNESS"));
  assert.ok(!payload.includes("#365C42"));
  assert.ok(!payload.includes("#EEF4EC"));
  assert.ok(!payload.includes("#FFFDF7"));
});

// --- flex.ts: timeGrid must not hide a full day's slots ---
//
// A real-device bug showed the AI confirming a specific time (e.g. 17:30)
// was available, then rendering a button grid that did not include that
// time because it only showed the first 10 slots of a full-day shift.

check("timeGrid shows every slot for a typical full-day shift (<= 18)", () => {
  const slots = Array.from({ length: 18 }, (_, index) => ({
    start_at: new Date(Date.now() + index * 30 * 60_000).toISOString(),
    label: `slot-${index}`,
  }));
  const message = timeGrid(slots);
  const buttons = message.contents.body.contents;
  assert.equal(buttons.length, 18);
});

check("timeGrid still caps extreme slot counts instead of an unbounded card", () => {
  const slots = Array.from({ length: 40 }, (_, index) => ({
    start_at: new Date(Date.now() + index * 30 * 60_000).toISOString(),
    label: `slot-${index}`,
  }));
  const message = timeGrid(slots);
  const buttons = message.contents.body.contents;
  assert.ok(buttons.length < slots.length);
});

// --- line.ts: webhook signature verification ---

check("verifyLineSignature accepts a correctly signed body", async () => {
  const { createHmac } = await import("node:crypto");
  process.env.LINE_CHANNEL_SECRET = "regression-test-secret";
  const body = '{"events":[]}';
  const signature = createHmac("sha256", "regression-test-secret")
    .update(body)
    .digest("base64");

  assert.equal(verifyLineSignature(body, signature), true);
});

check("verifyLineSignature rejects a tampered body", () => {
  process.env.LINE_CHANNEL_SECRET = "regression-test-secret";
  assert.equal(
    verifyLineSignature('{"events":[]}', "not-a-real-signature"),
    false,
  );
});

check("verifyLineSignature rejects when no secret is configured", () => {
  delete process.env.LINE_CHANNEL_SECRET;
  assert.equal(verifyLineSignature('{"events":[]}', "anything"), false);
});

// --- booking-flow.ts: booking-ID validation (reimplemented copy) ---
//
// booking-flow.ts imports "server-only", so it cannot be imported directly
// by this plain Node script. The regex below must stay in sync with
// `UUID_PATTERN` in src/lib/booking-flow.ts.

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

check("booking-flow UUID pattern accepts a real UUID", () => {
  assert.ok(UUID_PATTERN.test("11111111-1111-4111-8111-111111111111"));
});

check("booking-flow UUID pattern rejects a crafted non-UUID value", () => {
  assert.equal(UUID_PATTERN.test("../../etc/passwd"), false);
  assert.equal(UUID_PATTERN.test("' OR 1=1 --"), false);
});

// --- ai.ts: system prompt source assertions ---
//
// ai.ts imports "server-only" and the Anthropic SDK, so it is not imported
// directly. Instead this checks that the literal rules we added after real
// bugs are still present in the source, so a future prompt edit cannot
// silently delete them.

check("ai.ts still contains the reschedule-escalates rule", () => {
  const source = readFileSync(
    path.join(__dirname, "..", "src", "lib", "ai.ts"),
    "utf8",
  );
  assert.match(source, /เปลี่ยนเวลาหรือเลื่อนคิว/);
  assert.match(source, /escalate_to_human/);
});

check("ai.ts still contains the cancel-button rule (not escalate)", () => {
  const source = readFileSync(
    path.join(__dirname, "..", "src", "lib", "ai.ts"),
    "utf8",
  );
  assert.match(source, /ยกเลิกคิวนี้/);
});

check("ai.ts still contains the prompt-injection defense rule", () => {
  const source = readFileSync(
    path.join(__dirname, "..", "src", "lib", "ai.ts"),
    "utf8",
  );
  assert.match(source, /ห้ามเปิดเผย.+system prompt/);
});

check("ai.ts forces get_services when the customer just wants to start, without asking again", () => {
  const source = readFileSync(
    path.join(__dirname, "..", "src", "lib", "ai.ts"),
    "utf8",
  );
  assert.match(source, /เริ่มใช้บริการ/);
  assert.match(source, /ให้เรียก get_services ทันที/);
});

check("ai.ts still injects the current selection summary into the prompt", () => {
  const source = readFileSync(
    path.join(__dirname, "..", "src", "lib", "ai.ts"),
    "utf8",
  );
  assert.match(source, /ข้อมูลที่ลูกค้าเลือกไว้แล้วในการสนทนานี้/);
  assert.match(source, /\$\{selectionSummary\}/);
});

check("ai.ts still injects returning-customer profile memory", () => {
  const source = readFileSync(
    path.join(__dirname, "..", "src", "lib", "ai.ts"),
    "utf8",
  );
  assert.match(source, /เคยจองมาก่อน/);
  assert.match(source, /function getProfile\(/);
  assert.match(source, /visit_count/);
});

check("booking-flow merges into the existing profile instead of overwriting it", () => {
  const source = readFileSync(
    path.join(__dirname, "..", "src", "lib", "booking-flow.ts"),
    "utf8",
  );
  assert.match(source, /profile:\s*\{\s*\n?\s*\.\.\.existingProfile/);
});

// --- booking-flow.ts: deterministic "start booking" short-circuit ---
//
// Real-device testing showed the AI would sometimes reply in text that it
// "will show the menu" without ever calling get_services, so no carousel
// was sent. A deterministic phrase match now bypasses the AI for this
// entry point. booking-flow.ts imports "server-only", so the exact-match
// set is reimplemented here from source text to keep this check honest
// about the current phrase list while still exercising real Set behavior.

// --- rich-menu.ts: LINE rich menu image and tap areas ---

check("rich-menu has five non-overlapping tap areas inside the image", () => {
  assert.equal(RICH_MENU_AREAS.length, 5);
  for (const [index, area] of RICH_MENU_AREAS.entries()) {
    assert.ok(area.bounds.x >= 0);
    assert.ok(area.bounds.y >= 0);
    assert.ok(area.bounds.x + area.bounds.width <= RICH_MENU_WIDTH);
    assert.ok(area.bounds.y + area.bounds.height <= RICH_MENU_HEIGHT);

    for (const other of RICH_MENU_AREAS.slice(index + 1)) {
      const overlaps =
        area.bounds.x < other.bounds.x + other.bounds.width &&
        area.bounds.x + area.bounds.width > other.bounds.x &&
        area.bounds.y < other.bounds.y + other.bounds.height &&
        area.bounds.y + area.bounds.height > other.bounds.y;
      assert.equal(overlaps, false);
    }
  }
});

check("rich-menu areas use the five expected deterministic postbacks", () => {
  const actions = RICH_MENU_AREAS.map((area) => {
    assert.equal(area.action.type, "postback");
    return area.action.data;
  });
  assert.deepEqual(actions, [
    "action=menu_start_booking",
    "action=menu_start_booking",
    "action=menu_my_booking",
    "action=menu_contact_admin",
    "action=menu_about_shop",
  ]);
});

check("buildRichMenuImage renders an uploadable JPEG at LINE dimensions", async () => {
  const buffer = await buildRichMenuImage();
  const { default: sharp } = await import("sharp");
  const metadata = await sharp(buffer).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, RICH_MENU_WIDTH);
  assert.equal(metadata.height, RICH_MENU_HEIGHT);
  assert.ok(buffer.length < 1_000_000, "LINE rich menu images must be under 1 MB");
});

check("booking-flow short-circuits known start-booking phrases before the AI call", () => {
  const source = readFileSync(
    path.join(__dirname, "..", "src", "lib", "booking-flow.ts"),
    "utf8",
  );
  assert.match(source, /isStartBookingPhrase\(userText\)/);
  assert.match(
    source,
    /await replyForAiResult\(lineUserId, replyToken, userText\);/,
  );

  const setMatch = source.match(
    /START_BOOKING_PHRASES = new Set\(\[([\s\S]*?)\]\)/,
  );
  assert.ok(setMatch, "expected to find START_BOOKING_PHRASES literal");
  const phrases = [...setMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(phrases.includes("เริ่มใช้บริการ"));
  assert.ok(phrases.includes("เริ่มบริการ"));

  const isStartBookingPhrase = (text) =>
    new Set(phrases).has(text.trim());
  assert.ok(isStartBookingPhrase("เริ่มบริการ"));
  assert.ok(isStartBookingPhrase(" เริ่มใช้บริการ "));
  assert.equal(
    isStartBookingPhrase("อยากนวดแก้ปวดหลังหน่อยค่ะ"),
    false,
  );
});

check("booking-flow handles all four rich-menu postback actions", () => {
  const source = readFileSync(
    path.join(__dirname, "..", "src", "lib", "booking-flow.ts"),
    "utf8",
  );
  assert.match(source, /action === "menu_start_booking"/);
  assert.match(source, /action === "menu_my_booking"/);
  assert.match(source, /action === "menu_contact_admin"/);
  assert.match(source, /action === "menu_about_shop"/);
});

check("my-booking queries active LINE bookings instead of conversation booking_id", () => {
  const dbSource = readFileSync(
    path.join(__dirname, "..", "src", "lib", "db.ts"),
    "utf8",
  );
  const flowSource = readFileSync(
    path.join(__dirname, "..", "src", "lib", "booking-flow.ts"),
    "utf8",
  );
  assert.match(dbSource, /getActiveBookingsForLineUser/);
  assert.match(dbSource, /\.eq\("line_user_id", lineUserId\)/);
  assert.match(
    dbSource,
    /\.in\("status", \["hold", "pending_payment", "confirmed"\]\)/,
  );
  assert.match(
    flowSource,
    /action === "menu_my_booking"[\s\S]*?getActiveBookingsForLineUser\(lineUserId\)/,
  );
});

check("admin API returns escalations and supports resolving them", () => {
  const source = readFileSync(
    path.join(
      __dirname,
      "..",
      "src",
      "app",
      "api",
      "admin",
      "bookings",
      "route.ts",
    ),
    "utf8",
  );
  assert.match(source, /getEscalatedConversations\(\)/);
  assert.match(source, /action === "resolve_escalation"/);
  assert.match(source, /resolveConversationEscalation\(lineUserId\)/);
  assert.match(source, /UUID_PATTERN\.test\(body\.bookingId\)/);
  assert.match(source, /รูปแบบวันที่ไม่ถูกต้อง/);
});

check("resolving an escalation uses optimistic concurrency", () => {
  const source = readFileSync(
    path.join(__dirname, "..", "src", "lib", "db.ts"),
    "utf8",
  );
  assert.match(
    source,
    /resolveConversationEscalation[\s\S]*?\.eq\("updated_at", conversation\.updated_at\)/,
  );
  assert.match(source, /throw new ConversationConflictError\(\)/);
});

check("admin dashboard queries the selected date and renders escalations", () => {
  const source = readFileSync(
    path.join(
      __dirname,
      "..",
      "src",
      "app",
      "admin",
      "admin-dashboard.tsx",
    ),
    "utf8",
  );
  assert.match(source, /new URLSearchParams\(\{ date: selectedDate \}\)/);
  assert.match(source, /type="date"/);
  assert.match(source, /resolveEscalation\(escalation.line_user_id\)/);
  assert.match(source, /window\.setInterval\(\(\) => void refresh\(\), 10_000\)/);
});

// --- report ---

const failed = results.filter((result) => !result.ok);

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name}`);
  if (!result.ok) {
    console.error(`      ${result.error.message}`);
  }
}

console.log(`\n${results.length - failed.length}/${results.length} passed`);

if (failed.length > 0) {
  process.exitCode = 1;
}
