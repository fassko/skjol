// Rasterizes app/icon.svg into app/apple-icon.png and a multi-size app/favicon.ico.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

// sharp is not a direct dependency; borrow the copy Next.js installs for image optimization.
const sharp = createRequire(createRequire(import.meta.url).resolve("next/package.json"))("sharp");

const svg = await readFile(new URL("../app/icon.svg", import.meta.url));

const png = (size) => sharp(svg, { density: 72 * (size / 64) * 4 }).resize(size, size).png().toBuffer();

// apple-touch-icon is shown full-bleed and masked by iOS, so render it without the rounded corners.
const squareSvg = Buffer.from(svg.toString().replace('rx="14"', 'rx="0"'));
const apple = await sharp(squareSvg, { density: 72 * (180 / 64) * 4 }).resize(180, 180).png().toBuffer();
await writeFile(new URL("../app/apple-icon.png", import.meta.url), apple);

// ICO container with embedded PNG images (supported by all current browsers).
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((size, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size, 0);
  e.writeUInt8(size, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(images[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += images[i].length;
  return e;
});
await writeFile(new URL("../app/favicon.ico", import.meta.url), Buffer.concat([header, ...entries, ...images]));

console.log("wrote app/apple-icon.png, app/favicon.ico");
