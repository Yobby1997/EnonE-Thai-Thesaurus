import type { Suggestion, ThesaurusData, ThesaurusEntry } from "./types.js";

const normalize = (word: string): string => word.normalize("NFC").trim();

export class ThaiThesaurus {
  private readonly entries = new Map<string, ThesaurusEntry>();

  constructor(data: ThesaurusData) {
    for (const entry of data.entries) {
      this.entries.set(normalize(entry.word), entry);
    }
  }

  has(word: string): boolean {
    return this.entries.has(normalize(word));
  }

  get(word: string): ThesaurusEntry | undefined {
    return this.entries.get(normalize(word));
  }

  suggest(word: string, pos?: string): Suggestion[] {
    const source = this.get(word);
    if (!source) return [];

    return source.synonyms
      .map((candidate) => ({
        entry: this.get(candidate),
        relationPos: source.synonymPos?.[candidate]
      }))
      .filter((item): item is { entry: ThesaurusEntry; relationPos: string[] | undefined } => Boolean(item.entry))
      .filter(({ entry, relationPos }) => !pos || (relationPos ?? entry.pos).includes(pos))
      .map(({ entry, relationPos }) => {
        const { word, pos: candidatePos, register, registerRank, source: entrySource } = entry;
        const allowedPos = relationPos ?? source.pos;
        const matchingPos = candidatePos.filter((item) => allowedPos.includes(item));
        return {
          word,
          pos: matchingPos.length ? matchingPos : candidatePos,
          register,
          registerRank,
          source: entrySource
        };
      })
      .sort((a, b) =>
        a.registerRank - b.registerRank || a.word.localeCompare(b.word, "th")
      );
  }
}
