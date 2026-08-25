import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

const benefits = [
  {
    number: "24/7",
    title: "ตอบลูกค้าได้ตลอด",
    detail: "AI ตอบคำถามบริการ ราคา และข้อมูลร้านจากฐานข้อมูลจริง",
  },
  {
    number: "0",
    title: "ลดคิวซ้อน",
    detail: "ทุกเวลาถูกตรวจและล็อกในระบบเดียวก่อนยืนยันการจอง",
  },
  {
    number: "2 วิ",
    title: "คิวเข้าหน้าร้าน",
    detail: "คิวใหม่แสดงบน Admin แบบ Realtime โดยไม่ต้องจดซ้ำ",
  },
];

const flow = [
  ["01", "ลูกค้าทัก LINE", "ถามตามธรรมชาติ ไม่ต้องจำคำสั่ง"],
  ["02", "เลือกบริการและเวลา", "กดปุ่มจากตัวเลือกที่ว่างจริง"],
  ["03", "มัดจำและยืนยัน", "QR ผูกกับยอดของ booking โดยตรง"],
  ["04", "คิวเด้งเข้าร้าน", "Admin เห็นทันทีและปิดบิลต่อได้"],
];

export default async function Home() {
  const lineUrl = process.env.NEXT_PUBLIC_LINE_OA_URL;
  const qrDataUrl = lineUrl
    ? await QRCode.toDataURL(lineUrl, {
        width: 560,
        margin: 2,
        color: { dark: "#183126", light: "#FFFDF8" },
      })
    : null;

  return (
    <main className="min-h-screen overflow-hidden px-5 pb-16 pt-5 sm:px-8 lg:px-12">
      <nav className="mx-auto flex max-w-7xl items-center justify-between rounded-full border border-[var(--spa-line)] bg-[rgba(255,253,248,.72)] px-5 py-3 backdrop-blur-xl sm:px-7">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-[var(--spa-green)] text-lg text-white">
            ใบ
          </span>
          <div>
            <p className="text-sm font-bold tracking-wide">BAAN SABAI SPA</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--spa-leaf)]">
              AI Receptionist Demo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin"
            className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--spa-green)] transition hover:bg-white"
          >
            Admin
          </Link>
          <Link
            href="/pos"
            className="rounded-full bg-[var(--spa-green)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--spa-ink)]"
          >
            POS-lite
          </Link>
        </div>
      </nav>

      <section className="mx-auto grid max-w-7xl items-center gap-12 py-16 lg:grid-cols-[1.2fr_.8fr] lg:py-24">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--spa-line)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--spa-green)]">
            <span className="size-2 rounded-full bg-[#32A852] shadow-[0_0_0_5px_rgba(50,168,82,.12)]" />
            ทดลองระบบจริงผ่าน LINE
          </div>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[1.08] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
            จากข้อความแรก
            <br />
            ถึงคิวที่หน้าร้าน
            <br />
            <span className="text-[var(--spa-green)]">โดยไม่ต้องจดซ้ำ</span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-[var(--spa-leaf)] sm:text-xl">
            AI Receptionist ช่วยตอบคำถาม พาลูกค้าเลือกบริการ พนักงาน และเวลาว่าง
            ก่อนส่งคิวเข้าสู่ตารางร้านแบบ Realtime
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            {lineUrl ? (
              <a
                href={lineUrl}
                className="rounded-full bg-[var(--spa-green)] px-7 py-4 font-bold text-white shadow-lg shadow-green-950/10 transition hover:-translate-y-0.5 hover:bg-[var(--spa-ink)]"
              >
                เปิด LINE เพื่อทดลอง
              </a>
            ) : (
              <span className="rounded-full bg-[var(--spa-green)] px-7 py-4 font-bold text-white opacity-50">
                รอตั้งค่า LINE OA URL
              </span>
            )}
            <a
              href="#how-it-works"
              className="rounded-full border border-[var(--spa-line)] bg-white/60 px-7 py-4 font-bold text-[var(--spa-green)]"
            >
              ดูขั้นตอนการทำงาน
            </a>
          </div>
        </div>

        <div className="spa-card relative mx-auto w-full max-w-md rounded-[2.5rem] p-6 sm:p-8">
          <div className="absolute -right-5 -top-5 rounded-full bg-[var(--spa-gold)] px-4 py-2 text-xs font-bold text-white shadow-lg">
            LIVE DEMO
          </div>
          <div className="rounded-[2rem] bg-white p-5 text-center">
            {qrDataUrl ? (
              <Image
                src={qrDataUrl}
                width={560}
                height={560}
                alt="QR Code สำหรับทดลองจองผ่าน LINE"
                className="mx-auto h-auto w-full rounded-2xl"
                priority
              />
            ) : (
              <div className="spa-grid flex aspect-square items-center justify-center rounded-2xl text-sm text-[var(--spa-leaf)]">
                เพิ่ม NEXT_PUBLIC_LINE_OA_URL
                <br />
                เพื่อแสดง QR
              </div>
            )}
          </div>
          <p className="mt-5 text-center text-xl font-bold">สแกนแล้วลองถามเองได้เลย</p>
          <p className="mt-2 text-center text-sm leading-6 text-[var(--spa-leaf)]">
            ลองพิมพ์ “วันนี้มีนวดอะไรบ้าง” แล้วเลือกคิวจนจบ Flow
          </p>
          <div className="mt-5 rounded-2xl bg-[#FFF7E7] px-4 py-3 text-center text-xs leading-5 text-[#7A5A22]">
            ข้อมูลและการยืนยันชำระเงินในหน้านี้เป็น Demo
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
        {benefits.map((benefit) => (
          <article key={benefit.title} className="spa-card rounded-3xl p-7">
            <p className="text-4xl font-semibold text-[var(--spa-gold)]">
              {benefit.number}
            </p>
            <h2 className="mt-5 text-xl font-bold">{benefit.title}</h2>
            <p className="mt-2 leading-7 text-[var(--spa-leaf)]">{benefit.detail}</p>
          </article>
        ))}
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl py-20 lg:py-28">
        <div className="mb-10 max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--spa-gold)]">
            ONE CONNECTED FLOW
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            ลูกค้าใช้ง่าย ร้านเห็นทุกคิว
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-4">
          {flow.map(([number, title, detail]) => (
            <article
              key={number}
              className="relative overflow-hidden rounded-3xl border border-[var(--spa-line)] bg-[var(--spa-paper)] p-7"
            >
              <span className="absolute right-4 top-2 text-6xl font-semibold text-[rgba(49,92,67,.08)]">
                {number}
              </span>
              <h3 className="mt-12 text-xl font-bold">{title}</h3>
              <p className="mt-3 leading-7 text-[var(--spa-leaf)]">{detail}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
