import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const publicDir = "apps/web/public";
const iconSvg = await readFile(`${publicDir}/icon.svg`);
const maskableSvg = await readFile(`${publicDir}/icon-maskable.svg`);

await Promise.all([
  sharp(iconSvg).resize(192, 192).png().toFile(`${publicDir}/icons/icon-192.png`),
  sharp(iconSvg).resize(512, 512).png().toFile(`${publicDir}/icons/icon-512.png`),
  sharp(iconSvg).resize(180, 180).png().toFile(`${publicDir}/icons/apple-touch-icon.png`),
  sharp(iconSvg).resize(64, 64).png().toFile(`${publicDir}/favicon.png`),
  sharp(maskableSvg).resize(512, 512).png().toFile(`${publicDir}/icons/icon-maskable-512.png`),
]);

const icoSizes = [16, 32, 48, 64];
const icoImages = await Promise.all(icoSizes.map((size) => sharp(iconSvg).resize(size, size).png().toBuffer()));
const headerSize = 6 + icoImages.length * 16;
const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoImages.length, 4);
let offset = headerSize;
icoImages.forEach((image, index) => {
  const entry = 6 + index * 16;
  header.writeUInt8(icoSizes[index] === 256 ? 0 : icoSizes[index], entry);
  header.writeUInt8(icoSizes[index] === 256 ? 0 : icoSizes[index], entry + 1);
  header.writeUInt8(0, entry + 2);
  header.writeUInt8(0, entry + 3);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
await writeFile(`${publicDir}/favicon.ico`, Buffer.concat([header, ...icoImages]));
