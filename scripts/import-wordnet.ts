import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { REGISTERS, type ThesaurusData, type ThesaurusEntry } from "../src/types.js";

// Imports Open Multilingual Wordnet TSV:
// synset-id<TAB>lemma<TAB>Thai lemma. Lemmas in one synset become candidates.
const input = process.argv[2];
const output = process.argv[3] ?? "data/generated/thesaurus.json";
if (!input) throw new Error("Usage: npm run import:wordnet -- <input.tab> [output.json]");

const lines = (await readFile(input, "utf8")).split(/\r?\n/);
const synsets = new Map<string, Set<string>>();
for (const line of lines) {
  if (!line || line.startsWith("#")) continue;
  const [id, relation, lemma] = line.split("\t");
  if (!id || relation !== "lemma" || !lemma) continue;
  const normalized = lemma.replaceAll("_", " ").normalize("NFC").trim();
  if (!isUsableThaiLemma(normalized)) continue;
  const words = synsets.get(id) ?? new Set<string>();
  words.add(normalized);
  synsets.set(id, words);
}

const byWord = new Map<string, Set<string>>();
for (const words of synsets.values()) {
  for (const word of words) {
    const related = byWord.get(word) ?? new Set<string>();
    for (const candidate of words) if (candidate !== word) related.add(candidate);
    byWord.set(word, related);
  }
}

const posFromId = (id: string): string => {
  const suffix = id.at(-1);
  return suffix === "n" ? "น." : suffix === "v" ? "ก." : suffix === "a" || suffix === "r" ? "ว." : "ไม่ระบุ";
};

const posByWord = new Map<string, Set<string>>();
for (const [id, words] of synsets) {
  for (const word of words) {
    const pos = posByWord.get(word) ?? new Set<string>();
    pos.add(posFromId(id));
    posByWord.set(word, pos);
  }
}

const entries: ThesaurusEntry[] = [...byWord]
  .filter(([, synonyms]) => synonyms.size > 0)
  .map(([word, synonyms]) => ({
  word,
  pos: [...(posByWord.get(word) ?? ["ไม่ระบุ"])],
  register: REGISTERS[2],
  registerRank: 3,
  synonyms: [...synonyms].sort((a, b) => a.localeCompare(b, "th")),
  source: "thai-wordnet",
  reviewStatus: "needs-review"
  }));
const data: ThesaurusData = { schemaVersion: 1, entries };
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`Imported ${entries.length} entries to ${output}`);

function isUsableThaiLemma(word: string): boolean {
  if (word.length < 2 || word.length > 40) return false;
  if (/[0-9๐-๙]/u.test(word)) return false;
  if (!/^[\u0E00-\u0E7F][\u0E00-\u0E7F\s-]*$/u.test(word)) return false;
  return word.split(/\s+/u).length <= 4;
}
