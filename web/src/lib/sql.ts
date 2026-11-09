import { sqlStr } from "./db";
import type { Filters, Gran } from "./state";

type Opt = { periodo?: boolean; regionais?: boolean; bairros?: string[] };

/** Cláusula WHERE comum a todas as visões. */
export function where(f: Filters, opt: Opt = {}): string {
  const c = ["valido"];
  if (opt.periodo !== false) c.push(`ano between ${f.de} and ${f.ate}`);
  if (f.tipos.length) c.push(`tipo in (${f.tipos.map(sqlStr).join(",")})`);
  if (f.padroes.length) c.push(`padrao in (${f.padroes.map(sqlStr).join(",")})`);
  if (opt.regionais !== false && !opt.bairros?.length && f.regionais.length) c.push(`regional in (${f.regionais.map(sqlStr).join(",")})`);
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
