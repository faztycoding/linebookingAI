# Project Engineering Handbook

เอกสารนี้คือกฎปฏิบัติระดับโปรเจกต์สำหรับมนุษย์และ AI agents โดยยึดหลักจาก [Agentic Coding Engineering Handbook (TH)](./Agentic_Coding_Engineering_Handbook_TH.docx) ซึ่งเป็น handbook ฉบับเต็มและแหล่งอ้างอิงหลักของโปรเจกต์

## Project: AI Receptionist + Booking + POS-lite Demo

อ่าน `SPEC.md` และ `PROGRESS.md` ก่อนเริ่มทุก session โดย `SPEC.md` เป็น source of truth สำหรับ schema, tool definitions และ system prompt ห้ามคิด schema ใหม่หรือเปลี่ยนชื่อ column โดยไม่ขออนุมัติ

### Stack ที่ล็อกไว้

- Next.js 15 App Router + TypeScript
- Supabase JS client โดยไม่ใช้ Prisma หรือ ORM
- Anthropic SDK และ Claude Haiku แบบ tool calling
- Tailwind เท่านั้น ห้ามเพิ่ม component library
- ห้ามใช้ Docker, auth library, state management library หรือ testing framework

### กฎเฉพาะ Demo

- เขียนตรงไปตรงมาและห้าม over-abstract
- ห้ามสร้างไฟล์, helper หรือ feature ที่ยังไม่มีผู้เรียกใช้
- LLM ห้ามเรียก Supabase โดยตรง ต้องผ่าน tool functions ใน `src/lib/tools.ts`
- ใช้ timezone `Asia/Bangkok` ทุกจุด และเก็บเวลาในฐานข้อมูลเป็น `timestamptz`
- ข้อความถึงลูกค้าใช้ภาษาไทยล้วนและห้ามใช้ Markdown
- LINE replies ต้องใช้ `replyToken`; ห้ามใช้ push message เว้นแต่ได้รับอนุมัติ
- LINE webhook ต้องตรวจ `x-line-signature` ก่อนประมวลผล
- ห้ามแก้ system prompt นอก task ที่ได้รับอนุมัติ
- Feature นอก scope ให้บันทึกใน `PHASE2.md` แทนการ implement
- Server-side logic อยู่ใน `src/lib/`; route handlers ต้องบาง
- ทุก error ที่แสดงต่อลูกค้าต้องเป็นภาษาไทยที่เข้าใจง่าย
- ท้ายทุก session ต้องอัปเดต `PROGRESS.md`

## หลักการหลัก

- ใช้วงจร `Define → Contextualize → Plan → Execute → Verify → Review → Learn`
- AI เป็น execution engine; มนุษย์เป็น system designer, decision maker และ verifier
- ห้ามถือว่างานเสร็จจากความมั่นใจ ต้องมีหลักฐานจาก repository, diff และผลการตรวจสอบ
- ระดับ autonomy ต้องสัมพันธ์กับความเสี่ยงของงาน

## ก่อนเริ่มงาน

1. นิยาม goal, scope, out-of-scope และ acceptance criteria ให้ตรวจสอบได้
2. ระบุ invariants, failure modes, ความเสี่ยง และกรณีที่ต้องขอ human approval
3. ค้นหาไฟล์, symbols, tests, architecture docs และ ADR ที่เกี่ยวข้องจาก repository ก่อนสรุปข้อเท็จจริง
4. อ่าน tests ก่อนแก้ behavior ที่ซับซ้อน และอ่าน ADR ก่อนเปลี่ยน architecture
5. งานกลาง งานใหญ่ หรืองานเสี่ยงต้องมีแผนที่ได้รับอนุมัติก่อนแก้ไฟล์

## ขอบเขตการเปลี่ยนแปลง

- แก้เฉพาะไฟล์ที่จำเป็นต่อ task
- ห้าม refactor, reformat, rename หรืออัปเกรด dependency ที่ไม่เกี่ยวข้อง
- รักษา architecture, public contracts, backward compatibility และ conventions เดิม เว้นแต่ task ระบุให้เปลี่ยน
- ห้ามกล่าวอ้าง behavior หรือโครงสร้างระบบโดยไม่มีหลักฐานจาก repository
- หาก requirement ขัดกันหรือกระทบ scope อย่างมีนัยสำคัญ ให้หยุดและขอคำตัดสิน

## การลงมือพัฒนา

- ทำตามแผนที่อนุมัติและเลือก diff ที่เล็กและปลอดภัยที่สุด
- สำหรับ bug ให้สร้าง failing test ก่อนเมื่อมี test infrastructure และทำได้อย่างเหมาะสม
- ใช้ library, utility และ pattern ที่มีอยู่แล้วก่อนเพิ่ม abstraction หรือ dependency ใหม่
- แยก responsibility และเคารพ module/service boundaries
- ไม่ซ่อน error, ลด validation หรือ bypass quality/security controls เพื่อให้ checks ผ่าน

## Verification และ Definition of Done

ตรวจจากแคบไปกว้างตามความเหมาะสม:

1. Targeted tests สำหรับ behavior ที่เปลี่ยน
2. Typecheck หรือ compile
3. Lint และ static analysis
4. Integration/E2E tests ที่เกี่ยวข้อง
5. Security checks สำหรับพื้นที่เสี่ยง
6. Full suite ก่อน merge เมื่อเหมาะสม

ถือว่างานเสร็จเมื่อ:

- behavior และ acceptance criteria ครบ
- important paths และ edge cases มี test ครอบคลุม
- checks ที่เกี่ยวข้องผ่าน
- security, permissions และ data concerns ได้รับการตรวจ
- diff ไม่มี unrelated changes
- docs หรือ ADR ถูกอัปเดตเมื่อจำเป็น
- รายงาน command และผลลัพธ์จริง พร้อม known limitations และ remaining risks

ห้ามอ้างว่า check ผ่านหากไม่ได้รัน หากรันไม่ได้ให้ระบุเหตุผลอย่างชัดเจน

## Review

ตรวจ diff โดยตั้งสมมติฐานว่า implementation อาจผิด และค้นหา:

- violated invariants หรือ acceptance criteria
- security, authentication, authorization และ secret exposure
- race conditions, retries, idempotency และ partial failures
- regressions, hidden edge cases และ architecture drift
- unrelated changes หรือ scope creep

แก้เฉพาะ finding ที่ยืนยันด้วยหลักฐาน และตรวจซ้ำหลังแก้

## งานความเสี่ยงสูง

Authentication, authorization, permissions, payments, migrations, production data, secrets และ destructive operations เป็นงานความเสี่ยงสูง:

- ใช้ least privilege และห้ามเปิดเผย secrets ใน code, logs, tests หรือ fixtures
- ต้องมี stronger verification และ adversarial/security review
- migration ต้องมี compatibility, rollback และ recovery plan
- destructive หรือ irreversible action ต้องได้รับ human approval แบบชัดเจนก่อนดำเนินการ

## Git และการส่งมอบ

- ตรวจ diff และ repository status ก่อนส่งมอบ
- commit ต้องเล็ก สื่อ intent และไม่มี unrelated formatting
- หลังงานแต่ละรอบผ่าน verification และอัปเดต `PROGRESS.md` แล้ว ต้อง save, commit และ push ไปยัง remote เสมอ
- หาก push ไม่สำเร็จจาก authentication, network หรือ remote configuration ให้รายงาน blocker ทันที
- ห้าม rewrite history, force push หรือ bypass hooks
- PR/merge ต้องมี evidence จาก tests และ checks ที่เกี่ยวข้อง
- completion report ต้องสรุปสิ่งที่เปลี่ยน ไฟล์ที่เกี่ยวข้อง commands/results findings ข้อจำกัด และระดับความเสี่ยง

## Project Memory

- `AGENTS.md`: กฎที่ต้องทำหรือห้ามทำ
- handbook ฉบับเต็ม: แนวคิด workflow templates และ glossary
- `docs/architecture.md`: ระบบทำงานอย่างไร
- `docs/decisions/`: ทำไมจึงเลือกการตัดสินใจสำคัญ
- `docs/runbooks/`: วิธีรับมือ operational failures
- tests และ CI: external source of truth

เมื่อเกิดความผิดพลาดซ้ำ ให้แก้ระบบด้วย rule, test, skill, ADR หรือ runbook ที่เหมาะสม ไม่ใช่แก้เฉพาะเหตุการณ์นั้น
