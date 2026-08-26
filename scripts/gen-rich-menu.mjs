// Regenerate the LINE rich menu background image into public/rich-menu.jpg.
// Run locally with: npm run gen:rich-menu
// Requires sharp (a devDependency) — this script is NOT run on Vercel.
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildRichMenuImage } from "../src/lib/rich-menu.ts";

const outPath = join(process.cwd(), "public", "rich-menu.jpg");
await mkdir(join(process.cwd(), "public"), { recursive: true });
const buffer = await buildRichMenuImage();
await writeFile(outPath, buffer);
console.log(`Rich menu image written to ${outPath} (${buffer.length} bytes)`);
