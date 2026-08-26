import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const RICH_MENU_WIDTH = 2500;
export const RICH_MENU_HEIGHT = 1686;

export async function buildRichMenuImage(): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  const source = await readFile(
    join(process.cwd(), "ChatGPT Image Aug 26, 2026, 03_34_28 PM.png"),
  );
  return sharp(source)
    .resize(RICH_MENU_WIDTH, RICH_MENU_HEIGHT, { fit: "fill" })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

export const RICH_MENU_AREAS = [
  {
    bounds: { x: 760, y: 445, width: 980, height: 210 },
    action: {
      type: "postback",
      data: "action=menu_start_booking",
      displayText: "จองบริการเพิ่ม",
    },
  },
  {
    bounds: { x: 40, y: 660, width: 1200, height: 480 },
    action: {
      type: "postback",
      data: "action=menu_start_booking",
      displayText: "เริ่มจองและดูเมนู",
    },
  },
  {
    bounds: { x: 1260, y: 660, width: 1200, height: 480 },
    action: {
      type: "postback",
      data: "action=menu_my_booking",
      displayText: "เช็คคิวของฉัน",
    },
  },
  {
    bounds: { x: 40, y: 1150, width: 1200, height: 490 },
    action: {
      type: "postback",
      data: "action=menu_contact_admin",
      displayText: "ติดต่อแอดมิน",
    },
  },
  {
    bounds: { x: 1260, y: 1150, width: 1200, height: 490 },
    action: {
      type: "postback",
      data: "action=menu_about_shop",
      displayText: "เกี่ยวกับร้าน",
    },
  },
];

export const RICH_MENU_DEFINITION = {
  size: { width: RICH_MENU_WIDTH, height: RICH_MENU_HEIGHT },
  selected: true,
  name: "Baan Sabai Spa - Main Menu",
  chatBarText: "เมนู",
  areas: RICH_MENU_AREAS,
};
