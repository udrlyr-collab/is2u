import argon2 from "argon2";

const pin = process.argv[2];
if (!pin || !/^\d{4}$/.test(pin)) {
  console.error("Usage: pnpm pin:hash -- <four-digit PIN>");
  process.exit(1);
}
const hash = await argon2.hash(pin, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
process.stdout.write(`${hash}\n`);
