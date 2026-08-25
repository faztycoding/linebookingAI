import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlockParam,
  MessageParam,
  Tool,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages";

import {
  getConversation,
  getServiceById,
  getTherapistById,
  saveConversationHistory,
} from "@/lib/db";
import { executeTool, toolDefinitions } from "@/lib/tools";

export type ToolExecution = {
  name: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
};

export type ReceptionistResult = {
  text: string;
  toolExecutions: ToolExecution[];
  paused: boolean;
};

type StoredTurn = {
  role: "user" | "assistant";
  text: string;
};

function getBangkokNow(): { date: string; time: string } {
  const formatter = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "full",
    timeStyle: "short",
  });
  const [date, time = ""] = formatter.format(new Date()).split(" เวลา ");
  return { date, time };
}

function stateString(
  state: Record<string, unknown>,
  key: string,
): string | null {
  return typeof state[key] === "string" && state[key]
    ? String(state[key])
    : null;
}

async function buildSelectionSummary(
  state: Record<string, unknown>,
): Promise<string> {
  const serviceId = stateString(state, "service_id");
  const therapistId = stateString(state, "therapist_id");
  const date = stateString(state, "date");
  const startAt = stateString(state, "start_at");

  if (!serviceId && !therapistId && !date) {
    return "";
  }

  const [service, therapist] = await Promise.all([
    serviceId ? getServiceById(serviceId) : Promise.resolve(null),
    therapistId ? getTherapistById(therapistId) : Promise.resolve(null),
  ]);
  const lines: string[] = [];

  if (service) {
    lines.push(`- บริการที่เลือกไว้: ${service.name} (service_id: ${service.id})`);
  }
  if (therapist) {
    lines.push(
      `- พนักงานนวดที่เลือกไว้: ${therapist.nickname ?? therapist.name} (therapist_id: ${therapist.id})`,
    );
  }
  if (date) {
    lines.push(`- วันที่เลือกไว้: ${date}`);
  }
  if (startAt) {
    lines.push(`- เวลาที่เพิ่งเลือก/ล็อกคิวไว้: ${startAt}`);
  }

  return lines.length
    ? `\n## ข้อมูลที่ลูกค้าเลือกไว้แล้วในการสนทนานี้\nใช้ค่าเหล่านี้ได้ทันทีโดยไม่ต้องถามซ้ำ เช่น ถ้าลูกค้าถามเรื่องเวลาว่างเพิ่มเติม ให้เรียก get_available_slots ด้วย service_id/therapist_id/date เหล่านี้ทันที\n${lines.join("\n")}`
    : "";
}

function getSystemPrompt(selectionSummary: string): string {
  const { date, time } = getBangkokNow();
  return `คุณคือพนักงานต้อนรับของ Baan Sabai Spa ร้านนวดแผนไทยและสปา
คุยกับลูกค้าผ่าน LINE ด้วยภาษาไทยที่สุภาพ อบอุ่น กระชับ

## กฎเหล็ก
1. ห้ามบอกราคา เวลาว่าง ชื่อพนักงานนวด หรือข้อมูลร้าน จากความรู้ของตัวเอง
   ต้องเรียก tool ทุกครั้ง ถ้า tool ไม่มีข้อมูล ให้บอกว่าจะเช็คให้แล้วเรียก escalate_to_human
2. ห้ามยืนยันคิวเอง การยืนยันเกิดจากระบบหลังลูกค้าชำระมัดจำเท่านั้น
3. ห้ามสัญญาส่วนลด ของแถม หรือเงื่อนไขพิเศษใด ๆ
4. ถ้าลูกค้าถามเรื่องอาการเจ็บป่วยหรือรักษาโรค ให้บอกว่าเราเป็นบริการนวดเพื่อผ่อนคลาย
   ไม่ใช่การรักษาทางการแพทย์ แล้วแนะนำให้ปรึกษาแพทย์
5. หญิงตั้งครรภ์ ผู้มีโรคประจำตัว หรืออาการบาดเจ็บ ให้เรียก escalate_to_human เสมอ
6. ถ้าลูกค้าขอเปลี่ยนเวลาหรือเลื่อนคิวที่ล็อกหรือยืนยันไปแล้ว
   ให้บอกทันทีว่าระบบยังไม่รองรับการเปลี่ยนเวลาเอง แล้วเรียก escalate_to_human
   ห้ามตอบราวกับว่าลืมข้อมูลเดิมหรือให้เริ่มเลือกบริการใหม่
7. ถ้าลูกค้าขอยกเลิกคิวที่ล็อกหรือยืนยันไปแล้ว ให้บอกว่ากดปุ่ม "ยกเลิกคิวนี้"
   ที่การ์ดสรุปการจองหรือการ์ดยืนยันคิวได้เลย ไม่ต้องเรียก escalate_to_human

## ขั้นตอนการจอง
เลือกบริการ → เลือกพนักงานนวด → เลือกวันเวลา → ชำระมัดจำ → ยืนยัน
ในแต่ละขั้น ให้เรียก tool เพื่อดึงตัวเลือกจริง ระบบจะแสดงปุ่มให้ลูกค้ากดเอง
คุณไม่ต้องพิมพ์รายการตัวเลือกยาว ๆ ให้พูดสั้น ๆ นำเข้าสู่ปุ่ม
${selectionSummary}

## โทน
- ลงท้าย "ค่ะ"
- ตอบไม่เกิน 3 บรรทัดต่อข้อความ
- ไม่ใช้ bullet point และไม่ใช้ markdown
- ใช้ emoji ได้ไม่เกิน 1 ตัวต่อข้อความ

วันนี้คือ ${date} เวลา ${time} (Asia/Bangkok)`;
}

function parseHistory(history: unknown[]): StoredTurn[] {
  return history.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const role = "role" in item ? item.role : undefined;
    const text = "text" in item ? item.text : undefined;
    return (role === "user" || role === "assistant") && typeof text === "string"
      ? [{ role, text }]
      : [];
  });
}

function anthropicTools(): Tool[] {
  return toolDefinitions.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: "object",
      properties: tool.input_schema.properties,
      ...("required" in tool.input_schema
        ? { required: [...tool.input_schema.required] }
        : {}),
    },
  }));
}

function getClient(): { client: Anthropic; model: string } {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;

  if (!apiKey || !model) {
    throw new Error("Anthropic environment is not configured");
  }

  return { client: new Anthropic({ apiKey }), model };
}

async function persistHistory(
  lineUserId: string,
  turns: StoredTurn[],
): Promise<void> {
  await saveConversationHistory(lineUserId, turns);
}

export async function runReceptionist(
  lineUserId: string,
  userText: string,
): Promise<ReceptionistResult> {
  const conversation = await getConversation(lineUserId);
  const pauseUntil = conversation.ai_paused_until
    ? new Date(conversation.ai_paused_until)
    : null;

  if (pauseUntil && pauseUntil.getTime() > Date.now()) {
    return { text: "", toolExecutions: [], paused: true };
  }

  const storedHistory = parseHistory(conversation.history);
  const turns: StoredTurn[] = [
    ...storedHistory,
    { role: "user", text: userText },
  ];
  const messages: MessageParam[] = turns.map((turn) => ({
    role: turn.role,
    content: turn.text,
  }));
  const { client, model } = getClient();
  const toolExecutions: ToolExecution[] = [];
  const systemPrompt = getSystemPrompt(
    await buildSelectionSummary(conversation.state),
  );

  for (let iteration = 0; iteration < 5; iteration += 1) {
    const response = await client.messages.create({
      model,
      max_tokens: 500,
      system: systemPrompt,
      messages,
      tools: anthropicTools(),
    });
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text.trim())
      .filter(Boolean)
      .join("\n");
    const toolUses = response.content.filter(
      (block) => block.type === "tool_use",
    );

    if (!toolUses.length) {
      const finalText =
        text || "ขออภัยค่ะ ตอนนี้ยังตอบไม่ได้ รบกวนลองอีกครั้งนะคะ";
      turns.push({ role: "assistant", text: finalText });
      await persistHistory(lineUserId, turns);
      return { text: finalText, toolExecutions, paused: false };
    }

    const assistantContent: ContentBlockParam[] = [];
    for (const block of response.content) {
      if (block.type === "text") {
        assistantContent.push({ type: "text", text: block.text });
      }
      if (block.type === "tool_use") {
        assistantContent.push({
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input,
        });
      }
    }
    messages.push({ role: "assistant", content: assistantContent });

    const toolResults: ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const input =
        toolUse.input && typeof toolUse.input === "object"
          ? (toolUse.input as Record<string, unknown>)
          : {};
      let result: Record<string, unknown>;
      let isError = false;

      try {
        result = await executeTool(toolUse.name, input, { lineUserId });
      } catch (error) {
        console.error("AI tool failed", { name: toolUse.name, error });
        result = {
          ok: false,
          message: "ตรวจสอบข้อมูลไม่สำเร็จค่ะ กรุณาลองอีกครั้ง",
        };
        isError = true;
      }

      toolExecutions.push({ name: toolUse.name, input, result });
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
        is_error: isError,
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  const escalation = await executeTool(
    "escalate_to_human",
    { reason: "AI tool loop exceeded five iterations" },
    { lineUserId },
  );
  const finalText = String(
    escalation.message ?? "แอดมินจะเข้ามาดูแลต่อโดยเร็วที่สุดค่ะ",
  );
  turns.push({ role: "assistant", text: finalText });
  await persistHistory(lineUserId, turns);
  return { text: finalText, toolExecutions, paused: false };
}
