// Redaction before any AI call — build_spec §8.4. Removes phone numbers, emails, and ID/card-like numbers.
// Keeps ordinary quantities (sizes, BHK, years, budgets) so extraction still works.
import type { TranscriptTurn } from "@/db/schema";

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Indian mobiles (+91 / 0 prefix optional) and generic 10+ digit runs with separators
const PHONE = /(?:\+?91[\s-]?|0)?[6-9]\d{2}[\s-]?\d{3}[\s-]?\d{4}\b|\+\d[\d\s-]{9,}\d/g;
// Aadhaar (4-4-4), card numbers (13–19 digits with optional separators)
const AADHAAR = /\b\d{4}[\s-]\d{4}[\s-]\d{4}\b/g;
const CARD = /\b(?:\d[ -]?){13,19}\b/g;
// PAN: 5 letters, 4 digits, 1 letter
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;

export function redactText(s: string): string {
  return s
    .replace(EMAIL, "[email]")
    .replace(PAN, "[id]")
    .replace(AADHAAR, "[id]")
    .replace(CARD, "[number]")
    .replace(PHONE, "[phone]");
}

export function redactTranscript(turns: TranscriptTurn[]): TranscriptTurn[] {
  return turns.map((t) => ({ ...t, text: redactText(t.text) }));
}
