// Forgiving name search: ignores case, accents and punctuation, accepts words
// in any order or partially typed, and tolerates small typos
// ("studed leather +1" finds "Armor, +1: Studded Leather").

export interface SearchText {
  text: string;
  tokens: string[];
}

function normalize(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();
}

export function toSearchText(raw: string): SearchText {
  const text = normalize(raw);
  return { text, tokens: text ? text.split(' ') : [] };
}

// Words under six letters must match exactly (or as a prefix): one typo in a
// short word is too often another real word ("boots"/"bolts", "cloak"/"clock").
function typoBudget(word: string): number {
  if (word.length >= 9) {
    return 2;
  }
  return word.length >= 6 ? 1 : 0;
}

// Optimal string alignment distance (adjacent swaps count as one edit),
// abandoned early once it must exceed `max`.
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) {
    return max + 1;
  }
  let prevPrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, prevPrev[j - 2] + 1);
      }
      row.push(d);
      rowMin = Math.min(rowMin, d);
    }
    if (rowMin > max) {
      return max + 1;
    }
    prevPrev = prev;
    prev = row;
  }
  return prev[b.length];
}

function wordMatches(queryWord: string, nameWord: string): boolean {
  if (nameWord.startsWith(queryWord)) {
    return true;
  }
  const budget = typoBudget(queryWord);
  if (budget === 0) {
    return false;
  }
  return (
    editDistance(queryWord, nameWord, budget) <= budget ||
    editDistance(queryWord, nameWord.slice(0, queryWord.length), budget) <= budget
  );
}

export function matchesSearch(name: SearchText, query: SearchText): boolean {
  if (!query.tokens.length || name.text.includes(query.text)) {
    return true;
  }
  return query.tokens.every((q) => name.tokens.some((n) => wordMatches(q, n)));
}
