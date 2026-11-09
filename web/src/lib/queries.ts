// Consultas compartilhadas entre as visões.
import type { Filters } from "./state";
import { m2, period, periodLabel, price, where } from "./sql";
import type { SeriesRow } from "../components/charts";

/** Série temporal de mediana/quartis (R$/m² ou valor total). */
export function seriesSql(f: Filters, bairros?: string[], unit: "m2" | "total" = "m2") {
  const v = unit === "m2" ? m2(f) : price(f);
  return `
    select ${period(f.gran)} as p, count(*)::int n, median(${v}) med,
           quantile_cont(${v}, 0.25) q1, quantile_cont(${v}, 0.75) q3
    from vendas ${where(f, { bairros })} ${unit === "m2" ? "and area > 0" : ""}
    group by 1 order by 1`;
}
export const toSeries = (rows: Omit<SeriesRow, "label">[] | null, f: Filters): SeriesRow[] =>
  (rows ?? []).map((r) => ({ ...r, label: periodLabel(r.p, f.gran) }));

/**
 * Indicadores dos últimos 12 meses (até o fim do período escolhido) vs. os 12 meses anteriores.
 */
export function kpiSql(f: Filters, bairros?: string[]) {
  return `
    with b as (select data, ${m2(f)} m2, ${price(f)} v, area from vendas ${where(f, { periodo: false, bairros })} and ano <= ${f.ate}),
         r as (select max(data) d from b)
    select r.d::varchar as fim,
      count(*) filter (where data > r.d - interval 12 month)::int n12,
      count(*) filter (where data <= r.d - interval 12 month and data > r.d - interval 24 month)::int n12p,
      median(m2) filter (where data > r.d - interval 12 month) m12,
      median(m2) filter (where data <= r.d - interval 12 month and data > r.d - interval 24 month) m12p,
      median(v) filter (where data > r.d - interval 12 month) t12,
      median(v) filter (where data <= r.d - interval 12 month and data > r.d - interval 24 month) t12p,
      median(area) filter (where data > r.d - interval 12 month) a12
    from b, r group by r.d`;
}
export interface KpiRow { fim: string; n12: number; n12p: number; m12: number; m12p: number; t12: number; t12p: number; a12: number }
export const growth = (a?: number | null, b?: number | null) => (a && b ? a / b - 1 : null);
