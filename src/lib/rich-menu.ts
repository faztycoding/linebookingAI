import sharp from "sharp";

const COLORS = {
  green: "#365C42",
  greenDark: "#28452F",
  gold: "#C9A05A",
  cream: "#F4EEE3",
};

// LINE rich menu: 2500x1686, split into a 2x2 grid of 1250x843 tap areas.
export const RICH_MENU_WIDTH = 2500;
export const RICH_MENU_HEIGHT = 1686;
const CELL_WIDTH = RICH_MENU_WIDTH / 2;
const CELL_HEIGHT = RICH_MENU_HEIGHT / 2;

type MenuCell = {
  icon: string;
  label: string;
};

// Icons are drawn as plain SVG shapes rather than emoji glyphs: emoji
// rendering depends on whichever fallback font is installed on the machine
// running sharp/librsvg, which is not guaranteed to match between local
// development and the Vercel build machine. Plain shapes render identically
// everywhere.
const ICONS: Record<string, string> = {
  flower: `
    <g fill="#F4EEE3">
      <ellipse cx="0" cy="-55" rx="34" ry="52" />
      <ellipse cx="0" cy="55" rx="34" ry="52" />
      <ellipse cx="-55" cy="0" rx="52" ry="34" />
      <ellipse cx="55" cy="0" rx="52" ry="34" />
    </g>
    <circle cx="0" cy="0" r="30" fill="#C9A05A" />
  `,
  calendar: `
    <rect x="-70" y="-60" width="140" height="120" rx="14" fill="#F4EEE3" />
    <rect x="-70" y="-60" width="140" height="34" rx="14" fill="#C9A05A" />
    <rect x="-40" y="-78" width="14" height="30" rx="6" fill="#C9A05A" />
    <rect x="26" y="-78" width="14" height="30" rx="6" fill="#C9A05A" />
    <g fill="#365C42">
      <rect x="-52" y="-10" width="22" height="22" rx="4" />
      <rect x="-11" y="-10" width="22" height="22" rx="4" />
      <rect x="30" y="-10" width="22" height="22" rx="4" />
      <rect x="-52" y="24" width="22" height="22" rx="4" />
      <rect x="-11" y="24" width="22" height="22" rx="4" />
    </g>
  `,
  chat: `
    <path d="M -75 -50 h 150 a 18 18 0 0 1 18 18 v 55 a 18 18 0 0 1 -18 18 h -95 l -35 32 v -32 h -20 a 18 18 0 0 1 -18 -18 v -55 a 18 18 0 0 1 18 -18 z" fill="#F4EEE3" />
    <circle cx="-30" cy="6" r="9" fill="#365C42" />
    <circle cx="0" cy="6" r="9" fill="#365C42" />
    <circle cx="30" cy="6" r="9" fill="#365C42" />
  `,
  pin: `
    <path d="M 0 -85 C 45 -85 72 -55 72 -18 C 72 35 0 90 0 90 C 0 90 -72 35 -72 -18 C -72 -55 -45 -85 0 -85 Z" fill="#F4EEE3" />
    <circle cx="0" cy="-14" r="30" fill="#365C42" />
  `,
};

const CELLS: MenuCell[] = [
  { icon: "flower", label: "เริ่มจอง / ดูเมนู" },
  { icon: "calendar", label: "คิวของฉัน" },
  { icon: "chat", label: "ติดต่อแอดมิน" },
  { icon: "pin", label: "เกี่ยวกับร้าน" },
];

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => {
    switch (char) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      default:
        return "&apos;";
    }
  });
}

function cellSvg(cell: MenuCell, x: number, y: number, index: number): string {
  const centerX = x + CELL_WIDTH / 2;
  const iconCenterY = y + CELL_HEIGHT / 2 - 60;
  const bg = index % 2 === 0 ? COLORS.green : COLORS.greenDark;
  return `
    <rect x="${x}" y="${y}" width="${CELL_WIDTH}" height="${CELL_HEIGHT}" fill="${bg}" />
    <g transform="translate(${centerX}, ${iconCenterY})">${ICONS[cell.icon]}</g>
    <text x="${centerX}" y="${y + CELL_HEIGHT / 2 + 140}" font-size="64" font-weight="bold" fill="${COLORS.cream}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">${escapeXml(cell.label)}</text>
  `;
}

function buildRichMenuSvg(): string {
  const cells = CELLS.map((cell, index) => {
    const x = (index % 2) * CELL_WIDTH;
    const y = Math.floor(index / 2) * CELL_HEIGHT;
    return cellSvg(cell, x, y, index);
  }).join("\n");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${RICH_MENU_WIDTH}" height="${RICH_MENU_HEIGHT}">
      ${cells}
      <line x1="${CELL_WIDTH}" y1="0" x2="${CELL_WIDTH}" y2="${RICH_MENU_HEIGHT}" stroke="${COLORS.gold}" stroke-width="4" />
      <line x1="0" y1="${CELL_HEIGHT}" x2="${RICH_MENU_WIDTH}" y2="${CELL_HEIGHT}" stroke="${COLORS.gold}" stroke-width="4" />
    </svg>
  `;
}

export async function buildRichMenuImage(): Promise<Buffer> {
  return sharp(Buffer.from(buildRichMenuSvg())).png().toBuffer();
}

export const RICH_MENU_AREAS = [
  {
    bounds: { x: 0, y: 0, width: CELL_WIDTH, height: CELL_HEIGHT },
    action: {
      type: "postback",
      data: "action=menu_start_booking",
      displayText: "เริ่มใช้บริการ",
    },
  },
  {
    bounds: { x: CELL_WIDTH, y: 0, width: CELL_WIDTH, height: CELL_HEIGHT },
    action: {
      type: "postback",
      data: "action=menu_my_booking",
      displayText: "เช็คคิวของฉัน",
    },
  },
  {
    bounds: { x: 0, y: CELL_HEIGHT, width: CELL_WIDTH, height: CELL_HEIGHT },
    action: {
      type: "postback",
      data: "action=menu_contact_admin",
      displayText: "ติดต่อแอดมิน",
    },
  },
  {
    bounds: {
      x: CELL_WIDTH,
      y: CELL_HEIGHT,
      width: CELL_WIDTH,
      height: CELL_HEIGHT,
    },
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
