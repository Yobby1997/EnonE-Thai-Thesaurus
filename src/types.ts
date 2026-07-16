export const REGISTERS = [
  "หยาบ", "ภาษาพูด", "ทั่วไป", "กึ่งทางการ", "ทางการ",
  "วรรณกรรม", "พระสงฆ์", "ราชาศัพท์"
] as const;

export type Register = (typeof REGISTERS)[number];

export interface ThesaurusEntry {
  word: string;
  pos: string[];
  register: Register;
  registerRank: number;
  synonyms: string[];
  /** Limits each synonym relation to the applicable part(s) of speech. */
  synonymPos?: Record<string, string[]>;
  source: string;
  reviewStatus?: "reviewed" | "inferred" | "needs-review";
}

export interface ThesaurusData {
  schemaVersion: 1;
  entries: ThesaurusEntry[];
}

export interface Suggestion {
  word: string;
  pos: string[];
  register: Register;
  registerRank: number;
  source: string;
}
