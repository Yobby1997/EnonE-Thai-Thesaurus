import { readFile } from "node:fs/promises";
import type { ThesaurusData } from "./types.js";

export async function loadThesaurusData(path: string): Promise<ThesaurusData> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as ThesaurusData;
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error("Unsupported thesaurus data schema");
  }
  return parsed;
}
