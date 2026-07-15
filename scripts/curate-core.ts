import { readFile, writeFile } from "node:fs/promises";
import { REGISTERS, type Register, type ThesaurusData, type ThesaurusEntry } from "../src/types.js";

const input = process.argv[2] ?? "data/generated/wordnet.json";
const output = process.argv[3] ?? "data/thesaurus.json";
const coreWords = new Set(JSON.parse(await readFile("data/core-words.json", "utf8")) as string[]);
const overrides = JSON.parse(await readFile("data/register-overrides.json", "utf8")) as Record<string, Register>;
const editorial = JSON.parse(await readFile("data/editorial-entries.json", "utf8")) as Array<Pick<ThesaurusEntry, "word" | "pos" | "synonyms">>;
const imported = JSON.parse(await readFile(input, "utf8")) as ThesaurusData;
const byWord = new Map(imported.entries.map((entry) => [entry.word, entry]));
const editorialByWord = new Map(editorial.map((entry) => [entry.word, entry]));
const editorialCandidateMeta = new Map<string, { pos: string[]; sources: Set<string> }>();
for (const entry of editorial) {
  for (const synonym of entry.synonyms) {
    const meta = editorialCandidateMeta.get(synonym) ?? { pos: [], sources: new Set<string>() };
    meta.pos = [...new Set([...meta.pos, ...entry.pos])];
    meta.sources.add(entry.word);
    editorialCandidateMeta.set(synonym, meta);
  }
}

// Select core writing words plus their one-hop synonym candidates.
const selected = new Set<string>();
for (const word of coreWords) {
  const entry = byWord.get(word);
  if (!entry) continue;
  selected.add(word);
  for (const synonym of entry.synonyms) selected.add(synonym);
}
for (const entry of editorial) {
  selected.add(entry.word);
  for (const synonym of entry.synonyms) selected.add(synonym);
}

const rankOf = (register: Register): number => REGISTERS.indexOf(register) + 1;
const entries: ThesaurusEntry[] = [];
for (const word of selected) {
  const importedEntry = byWord.get(word);
  const editorialEntry = editorialByWord.get(word);
  const candidateMeta = editorialCandidateMeta.get(word);
  const entry = editorialEntry
    ? { ...importedEntry, ...editorialEntry, source: "editorial-seed" } as ThesaurusEntry
    : importedEntry ? {
        ...importedEntry,
        pos: [...new Set([...importedEntry.pos, ...(candidateMeta?.pos ?? [])])]
      } : (candidateMeta ? {
        word,
        pos: candidateMeta.pos,
        synonyms: [...candidateMeta.sources],
        register: "ทั่วไป",
        registerRank: 3,
        source: "editorial-seed",
        reviewStatus: "reviewed"
      } as ThesaurusEntry : undefined);
  if (!entry) continue;
  const synonyms = [...new Set([
    ...entry.synonyms.filter((candidate) => selected.has(candidate)),
    ...(!editorialEntry && candidateMeta ? [...candidateMeta.sources] : [])
  ])];
  if (!synonyms.length) continue;
  const register = overrides[word] ?? "ทั่วไป";
  entries.push({
    ...entry,
    register,
    registerRank: rankOf(register),
    synonyms,
    reviewStatus: editorialEntry || overrides[word] ? "reviewed" : "inferred"
  });
}

entries.sort((a, b) => a.word.localeCompare(b.word, "th"));
await writeFile(output, JSON.stringify({ schemaVersion: 1, entries }, null, 2) + "\n", "utf8");
const reviewed = entries.filter((entry) => entry.reviewStatus === "reviewed").length;
console.log(`Curated ${entries.length} entries (${reviewed} register-reviewed) to ${output}`);
