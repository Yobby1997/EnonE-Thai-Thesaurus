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
      .map((candidate) => this.get(candidate))
      .filter((entry): entry is ThesaurusEntry => Boolean(entry))
      .filter((entry) => !pos || entry.pos.includes(pos))
      .map(({ word, pos, register, registerRank, source: entrySource }) => {
        const matchingPos = pos.filter((item) => source.pos.includes(item));
        return {
          word,
          pos: matchingPos.length ? matchingPos : pos,
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
