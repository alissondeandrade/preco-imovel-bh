/** Chave de comparação para nomes de bairro: maiúsculas, sem acento/pontuação, espaços simples. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ROMAN: Record<string, string> = { I: "1", II: "2", III: "3", IV: "4", V: "5", VI: "6", VII: "7", VIII: "8" };
const ABBREV: [RegExp, string][] = [
  [/\bSTA\b/g, "SANTA"], [/\bSTO\b/g, "SANTO"], [/\bS\b/g, "SAO"], [/\bN S\b/g, "NOSSA SENHORA"],
  [/\bNSA\b/g, "NOSSA"], [/\bSRA\b/g, "SENHORA"], [/\bJD\b/g, "JARDIM"], [/\bCJ\b/g, "CONJUNTO"],
  [/\bCONJ\b/g, "CONJUNTO"], [/\bVL\b/g, "VILA"], [/\bPQ\b/g, "PARQUE"], [/\bSEC\b/g, "SECAO"],
  [/\bPRES\b/g, "PRESIDENTE"], [/\bDR\b/g, "DOUTOR"], [/\bPE\b/g, "PADRE"], [/\bPROF\b/g, "PROFESSOR"],
];
const STOP = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);

/** Chave "solta" usada como segunda tentativa de casamento entre o ITBI e os polígonos. */
export function looseKey(s: string): string {
  let k = " " + normalizeName(s) + " ";
  for (const [re, rep] of ABBREV) k = k.replace(re, rep);
  return k
    .split(" ")
    .filter((w) => w && !STOP.has(w))
    .map((w) => ROMAN[w] ?? w)
    .join(" ");
}
