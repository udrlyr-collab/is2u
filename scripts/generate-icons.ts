import { mkdir, readFile } from "node:fs/promises";
import sharp from "sharp";

const source = await readFile("apps/web/public/icon.svg");
const maskable = await readFile("apps/web/public/icon-maskable.svg");
await mkdir("apps/web/public/icons", { recursive: true });
await Promise.all([
  sharp(source).resize(192, 192).png().toFile("apps/web/public/icons/icon-192.png"),
  sharp(source).resize(512, 512).png().toFile("apps/web/public/icons/icon-512.png"),
  sharp(source).resize(180, 180).png().toFile("apps/web/public/icons/apple-touch-icon.png"),
  sharp(source).resize(64, 64).png().toFile("apps/web/public/favicon.png"),
  sharp(maskable).resize(512, 512).png().toFile("apps/web/public/icons/icon-maskable-512.png"),
]);
