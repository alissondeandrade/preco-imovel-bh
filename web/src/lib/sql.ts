import { sqlStr } from "./db";
import type { Filters, Gran } from "./state";

/** Recorte geográfico explícito (bairro, rua ou número). */
export type Scope = { bairros?: string[]; rua?: string; numero?: string };
type Opt = { periodo?: boolean; regionais?: boolean; tipos?: boolean; bairros?: string[]; rua?: string; numero?: string };

/** Cláusula WHERE comum a todas as visões. */
export function where(f: Filters, opt: Opt = {}): string {
  const c = ["valido"];
  if (opt.periodo !== false) c.push(`ano between ${f.de} and ${f.ate}`);
  if (opt.tipos !== false && f.tipos.length) c.push(`tipo in (${f.tipos.map(sqlStr).join(",")})`);
  if (f.padroes.length) c.push(`padrao in (${f.padroes.map(sqlStr).join(",")})`);
  // bairro ou rua escolhidos explicitamente prevalecem sobre o filtro de regional
  if (opt.regionais !== false && !opt.bairros?.length && !opt.rua && f.regionais.length) c.push(`regional in (${f.regionais.map(sqlStr).join(",")})`);
  if (opt.rua) c.push(`rua = ${sqlStr(opt.rua)}`);
  if (opt.numero) c.push(`numero = ${sqlStr(opt.numero)}`);
  if (f.areaMin != null) c.push(`area >= ${Number(f.areaMin)}`);
  if (f.areaMax != null) c.push(`area <= ${Number(f.areaMax)}`);
  if (f.constrMin != null) c.push(`ano_construcao >= ${Number(f.constrMin)}`);
  if (f.constrMax != null) c.push(`ano_construcao <= ${Number(f.constrMax)}`);
  if (opt.bairros?.length) c.push(`bairro in (${opt.bairros.map(sqlStr).join(",")})`);
  return "where " + c.join(" and ");
}

/** Valor da transação (declarado ou base de cálculo), opcionalmente corrigido pelo IPCA. */
export const price = (f: Filters) =>
  `(${f.valor === "base" ? "valor_base" : "valor_declarado"}${f.real ? " * fator" : ""})`;
export const m2 = (f: Filters) => `(${price(f)} / area)`;

export function period(g: Gran) {
  if (g === "ano") return `ano::varchar`;
  if (g === "trimestre") return `ano || '-T' || quarter(data)`;
  return `mes`;
}

/** Converte rótulo de período em data aproximada (para ordenar/eixo). */
export function periodLabel(p: string, g: Gran) {
  if (g === "mes") {
    const [y, m] = p.split("-");
    return `${["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][Number(m) - 1]}/${y.slice(2)}`;
  }
  if (g === "trimestre") return p.replace("-T", " T");
  return p;
}

const PREFIXOS: Record<string, string> = {
  RUA: "Rua", AVE: "Avenida", PCA: "Praça", ROD: "Rodovia", ALA: "Alameda", BEC: "Beco",
  EST: "Estrada", TRV: "Travessa", VIA: "Via", VDP: "Viaduto", VDT: "Viaduto",
};
const MINUSC = new Set(["DA", "DE", "DO", "DAS", "DOS", "E"]);

/** "AVE DO CONTORNO" → "Avenida do Contorno" (só exibição; a busca usa o texto original). */
export function streetLabel(rua: string) {
  return rua.split(" ").map((w, i) => {
    if (i === 0 && PREFIXOS[w]) return PREFIXOS[w];
    if (i > 0 && MINUSC.has(w)) return w.toLowerCase();
    if (/^[IVX]+$/.test(w) && w.length <= 4) return w;
    return w.charAt(0) + w.slice(1).toLowerCase();
  }).join(" ");
}

/** Termo digitado → condição SQL: todas as palavras precisam aparecer no nome da rua (sem acento). */
export function streetSearchCond(term: string) {
  const words = term.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return words.length ? words.map((w) => `rua like ${sqlStr(`%${w}%`)}`).join(" and ") : "false";
}
