import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist/src/browser", { recursive: true });
await copyFile("src/browser/style.css", "dist/src/browser/style.css");
