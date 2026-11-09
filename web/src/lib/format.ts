const brl0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export const fmtBRL = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : brl0.format(v));
export const fmtInt = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : int.format(v));
export const fmtPct = (v: number | null | undefined) =>
  v == null || !isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${dec1.format(v * 100)}%`;

/** Valor compacto: R$ 1,2 mi / R$ 850 mil */
export function fmtShort(v: number | null | undefined) {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e6) return `R$ ${dec1.format(v / 1e6)} mi`;
  if (a >= 1e3) return `R$ ${int.format(v / 1e3)} mil`;
  return brl0.format(v);
}
export const fmtM2 = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : `${brl0.format(v)}/m²`);
export const fmtDate = (s: string) => s.split("-").reverse().join("/");
