/**
 * Bidirectional RU↔EN transliteration + fuzzy search.
 * Typing `gjbcr` finds `поиск` and vice versa.
 */

// Cyrillic → what it looks like typed on QWERTY
const RU_TO_EN: Record<string, string> = {
  й: "q", ц: "w", у: "e", к: "r", е: "t", н: "y", г: "u", ш: "i", щ: "o", з: "p",
  х: "[", ъ: "]", ф: "a", ы: "s", в: "d", а: "f", п: "g", р: "h", о: "j", л: "k",
  д: "l", ж: ";", э: "'", я: "z", ч: "x", с: "c", м: "v", и: "b", т: "n", ь: "m",
  б: ",", ю: ".",
  Й: "Q", Ц: "W", У: "E", К: "R", Е: "T", Н: "Y", Г: "U", Ш: "I", Щ: "O", З: "P",
  Х: "{", Ъ: "}", Ф: "A", Ы: "S", В: "D", А: "F", П: "G", Р: "H", О: "J", Л: "K",
  Д: "L", Ж: ":", Э: '"', Я: "Z", Ч: "X", С: "C", М: "V", И: "B", Т: "N", Ь: "M",
  Б: "<", Ю: ">",
};

const EN_TO_RU: Record<string, string> = Object.fromEntries(
  Object.entries(RU_TO_EN).map(([ru, en]) => [en, ru])
);

function transliterate(s: string, map: Record<string, string>): string {
  return s.split("").map(c => map[c] ?? c).join("");
}

/**
 * Fuzzy match: every character of `query` must appear in `text`
 * in order, but not necessarily adjacent.
 * e.g. "nts" matches "notes", "fzzy" matches "fuzzy".
 */
function fuzzyMatch(text: string, query: string): boolean {
  let ti = 0;
  let qi = 0;
  while (ti < text.length && qi < query.length) {
    if (text[ti] === query[qi]) qi++;
    ti++;
  }
  return qi === query.length;
}

/**
 * Returns true if `text` matches `query` under any transliteration variant.
 * If fuzzy is true, uses fuzzy matching (characters in order, not contiguous).
 * If fuzzy is false, uses exact substring matching.
 */
export function matchesQuery(text: string, query: string, fuzzy = true): boolean {
  if (!query) return true;
  const t = text.toLowerCase();
  const q = query.toLowerCase();

  const matcher = fuzzy ? fuzzyMatch : (txt: string, qry: string) => txt.includes(qry);

  if (matcher(t, q)) return true;
  if (matcher(t, transliterate(q, EN_TO_RU))) return true;
  if (matcher(t, transliterate(q, RU_TO_EN))) return true;
  if (matcher(transliterate(t, RU_TO_EN), q)) return true;
  if (matcher(transliterate(t, EN_TO_RU), q)) return true;
  return false;
}
