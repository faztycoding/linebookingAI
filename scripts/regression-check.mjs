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

import { getNextSevenDates, serviceCarousel, timeGrid } from "../src/lib/flex.ts";
import { verifyLineSignature } from "../src/lib/line.ts";

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
