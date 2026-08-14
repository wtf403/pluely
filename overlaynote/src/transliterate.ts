/**
 * Bidirectional RU↔EN transliteration for layout-agnostic search.
 * Maps each key position: Cyrillic typed on EN layout → Latin characters
 * and EN typed on RU layout → Cyrillic characters.
 *
 * Strategy: for a query, produce all possible interpretations
 * (original + transliterated) and match any of them.
 */

// Cyrillic → what it looks like typed on QWERTY (phonetic-ish)
const RU_TO_EN: Record<string, string> = {
  й: "q", ц: "w", у: "e", к: "r", е: "t", н: "y", г: "u", ш: "i", щ: "o", з: "p",
  х: "[", ъ: "]", ф: "a", ы: "s", в: "d", а: "f", п: "g", р: "h", о: "j", л: "k",
  д: "l", ж: ";", э: "'", я: "z", ч: "x", с: "c", м: "v", и: "b", т: "n", ь: "m",
  б: ",", ю: ".",
  // uppercase
  Й: "Q", Ц: "W", У: "E", К: "R", Е: "T", Н: "Y", Г: "U", Ш: "I", Щ: "O", З: "P",
  Х: "{", Ъ: "}", Ф: "A", Ы: "S", В: "D", А: "F", П: "G", Р: "H", О: "J", Л: "K",
  Д: "L", Ж: ":", Э: '"', Я: "Z", Ч: "X", С: "C", М: "V", И: "B", Т: "N", Ь: "M",
  Б: "<", Ю: ">",
};

// EN → Cyrillic (same key positions)
const EN_TO_RU: Record<string, string> = Object.fromEntries(
  Object.entries(RU_TO_EN).map(([ru, en]) => [en, ru])
);

function transliterate(s: string, map: Record<string, string>): string {
  return s.split("").map(c => map[c] ?? c).join("");
}

/**
 * Returns true if `text` matches `query` under any of:
 *  - direct substring
 *  - query transliterated RU→EN
 *  - query transliterated EN→RU
 *  - text transliterated + direct query
 */
export function matchesQuery(text: string, query: string): boolean {
  if (!query) return true;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (t.includes(q)) return true;
  if (t.includes(transliterate(q, EN_TO_RU))) return true;
  if (t.includes(transliterate(q, RU_TO_EN))) return true;
  // also try transliterating the text itself
  const tRu = transliterate(t, RU_TO_EN);
  const tEn = transliterate(t, EN_TO_RU);
  if (tRu.includes(q)) return true;
  if (tEn.includes(q)) return true;
  return false;
}
