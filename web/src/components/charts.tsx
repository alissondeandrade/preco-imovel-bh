// Gráficos reutilizáveis construídos sobre <Chart>.
import { Chart, baseOption } from "./Chart";
import { fmtBRL, fmtInt, fmtM2, fmtShort } from "../lib/format";

export interface SeriesRow { p: string; label: string; n: number; med: number; q1: number; q3: number }

const axisMoney = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(v));

/** Mediana de R$/m² com faixa interquartil (25%–75%). */
export function PriceBand({ rows, height = 300, unit = "m2" }: { rows: SeriesRow[]; height?: number; unit?: "m2" | "total" }) {
  const fmt = unit === "m2" ? fmtM2 : fmtShort;
  return (
    <Chart height={height} deps={[rows, unit]} build={(p) => {
      const b = baseOption(p) as Record<string, any>;
      return {
        ...b,
        tooltip: {
          ...b.tooltip,
          formatter: (items: any[]) => {
            const r = rows[items[0].dataIndex];
            return `<b>${r.label}</b><br/>Mediana: <b>${fmt(r.med)}</b><br/>` +
              `<span style="color:${p.muted}">Faixa central (25–75%): ${fmt(r.q1)} – ${fmt(r.q3)}</span><br/>` +
              `<span style="color:${p.muted}">${fmtInt(r.n)} vendas</span>`;
          },
        },
        xAxis: { ...b.xAxis, type: "category", data: rows.map((r) => r.label), boundaryGap: false },
        yAxis: { ...b.yAxis, type: "value", scale: true, axisLabel: { ...b.yAxis.axisLabel, formatter: axisMoney } },
        series: [
          { type: "line", data: rows.map((r) => r.q1), stack: "band", lineStyle: { opacity: 0 }, symbol: "none", silent: true },
          { type: "line", data: rows.map((r) => r.q3 - r.q1), stack: "band", lineStyle: { opacity: 0 }, symbol: "none", silent: true,
            areaStyle: { color: p.series[0], opacity: 0.14 } },
          { type: "line", name: "Mediana", data: rows.map((r) => r.med), showSymbol: false, symbolSize: 8,
            lineStyle: { width: 2, color: p.series[0] }, itemStyle: { color: p.series[0] } },
        ],
      };
    }} />
  );
}

/** Número de vendas por período. */
export function VolumeBars({ rows, height = 160 }: { rows: SeriesRow[]; height?: number }) {
  return (
    <Chart height={height} deps={[rows]} build={(p) => {
      const b = baseOption(p) as Record<string, any>;
      return {
        ...b,
        tooltip: { ...b.tooltip, axisPointer: { type: "shadow" }, formatter: (it: any[]) => `<b>${it[0].name}</b><br/>${fmtInt(it[0].value)} vendas` },
        xAxis: { ...b.xAxis, type: "category", data: rows.map((r) => r.label) },
        yAxis: { ...b.yAxis, type: "value", splitNumber: 3, axisLabel: { ...b.yAxis.axisLabel, formatter: (v: number) => fmtInt(v) } },
        series: [{ type: "bar", data: rows.map((r) => r.n), barMaxWidth: 18, itemStyle: { color: p.series[0], opacity: 0.55, borderRadius: [4, 4, 0, 0] } }],
      };
    }} />
  );
}

/** Barras horizontais de mediana por categoria. */
export function CategoryBars({ rows, height, money = "m2" }: { rows: { k: string; v: number; n: number }[]; height?: number; money?: "m2" | "total" }) {
  const fmt = money === "m2" ? fmtM2 : fmtBRL;
  return (
    <Chart height={height ?? Math.max(120, rows.length * 34 + 30)} deps={[rows, money]} build={(p) => {
      const b = baseOption(p) as Record<string, any>;
      return {
        ...b,
        grid: { ...b.grid, right: 90 },
        tooltip: { ...b.tooltip, axisPointer: { type: "shadow" }, formatter: (it: any[]) => `<b>${it[0].name}</b><br/>Mediana: ${fmt(it[0].value)}<br/>${fmtInt(rows[it[0].dataIndex].n)} vendas` },
        xAxis: { ...b.yAxis, type: "value", axisLabel: { ...b.yAxis.axisLabel, formatter: axisMoney } },
        yAxis: { ...b.xAxis, type: "category", inverse: true, data: rows.map((r) => r.k), axisLabel: { color: p.ink2 } },
        series: [{
          type: "bar", data: rows.map((r) => r.v), barMaxWidth: 18,
          itemStyle: { color: p.series[0], borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: "right", color: p.ink2, fontSize: 11, formatter: (x: any) => (money === "m2" ? fmtBRL(x.value) : fmtShort(x.value)) },
        }],
      };
    }} />
  );
}

/** Várias séries de mediana (comparação entre bairros). */
export function MultiLines({ labels, series, height = 340, unit = "m2" }: {
  labels: string[]; series: { name: string; data: (number | null)[]; n: (number | null)[] }[]; height?: number; unit?: "m2" | "total";
}) {
  const fmt = unit === "m2" ? fmtM2 : fmtShort;
  return (
    <Chart height={height} deps={[labels, series, unit]} build={(p) => {
      const b = baseOption(p) as Record<string, any>;
      return {
        ...b,
        color: p.series,
        grid: { ...b.grid, top: 40, right: series.length <= 4 ? 120 : 16 },
        legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 12, itemHeight: 4, textStyle: { color: p.ink2 } },
        tooltip: {
          ...b.tooltip,
          formatter: (items: any[]) => `<b>${items[0].name}</b><br/>` + items
            .filter((i) => i.value != null)
            .sort((a, z) => z.value - a.value)
            .map((i) => `${i.marker} ${i.seriesName}: <b>${fmt(i.value)}</b> <span style="color:${p.muted}">(${fmtInt(series[i.seriesIndex].n[i.dataIndex])})</span>`)
            .join("<br/>"),
        },
        xAxis: { ...b.xAxis, type: "category", data: labels, boundaryGap: false },
        yAxis: { ...b.yAxis, type: "value", scale: true, axisLabel: { ...b.yAxis.axisLabel, formatter: axisMoney } },
        series: series.map((s) => ({
          type: "line", name: s.name, data: s.data, connectNulls: true, showSymbol: false, symbolSize: 8, lineStyle: { width: 2 },
          endLabel: series.length <= 4 ? { show: true, formatter: s.name, color: p.ink2, fontSize: 11 } : undefined,
        })),
      };
    }} />
  );
}
