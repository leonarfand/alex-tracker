import sharp from "sharp";
import { readFileSync } from "fs";

const svg = readFileSync("icon-source.svg");
await sharp(svg, { density: 384 })
  .resize(1024, 1024)
  .png()
  .toFile("icon-1024.png");
console.log("Wrote icon-1024.png");
