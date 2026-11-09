import { useMemo } from "react";
import type { Filters } from "../lib/state";
import { useMeta } from "../lib/meta";
import { useQuery } from "../lib/hooks";
import { m2, period, periodLabel, price, where } from "../lib/sql";
import { sqlStr } from "../lib/db";
import { fmtBRL, fmtInt, fmtM2 } from "../lib/format";
import { Card, Combo, Empty, Spinner } from "../components/ui";
import { Chart, baseOption } from "../components/Chart";
import { MultiLines } from "../components/charts";
import { SalesTable } from "../components/SalesTable";
import { Breakdowns, KpiRowView, SeriesCard } from "./Overview";

export function Bairro({ f, set }: { f: Filters; set: (p: Partial<Filters>) => void }) {
  const { bairros } = useMeta();
  const opts = useMemo(() => (bairros?.features ?? []).map((x) => ({ value: x.properties.nome, label: x.properties.nome, hint: x.properties.regional }))
    .sort((a, b) => a.label.localeCompare(b.label)), [bairros]);
  const reg = bairros?.features.find((x) => x.properties.nome === f.bairro)?.properties.regional;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Combo value={f.bairro} options={opts} onChange={(bairro) => set({ bairro })} placeholder="Buscar bairro…" />
        {reg && <span className="text-sm text-muted">Regional {reg}</span>}
      </div>
      {!f.bairro ? <TopBairros f={f} set={set} /> : (
        <>
          <KpiRowView f={f} bairros={[f.bairro]} />
          <div className="grid gap-4 xl:grid-cols-2">
            <SeriesCard f={f} set={set} bairros={[f.bairro]} title={`Evolução do preço · ${f.bairro}`} />
            <Card title="Comparado à regional e à cidade" subtitle="Mediana de R$/m² por ano">
              <VsCity f={f} bairro={f.bairro} regional={reg ?? ""} />
            </Card>
          </div>
          <Breakdowns f={f} bairros={[f.bairro]} />
          <Card title="Preço × área" subtitle={`Cada ponto é uma venda em ${f.ate}${f.ate > f.de ? ` e ${f.ate - 1}` : ""}`}>
            <Scatter f={f} bairro={f.bairro} />
          </Card>
          <Card title="Vendas registradas" subtitle="Endereço sem complemento (apto/bloco)">
            <SalesTable f={f} bairros={[f.bairro]} pageSize={15} showBairro={false} />
          </Card>
        </>
      )}
    </div>
  );
}

function TopBairros({ f, set }: { f: Filters; set: (p: Partial<Filters>) => void }) {
  const { data } = useQuery<any>(`select bairro, regional, count(*)::int n, median(${m2(f)}) med from vendas ${where(f)} and area > 0 group by all order by n desc limit 24`);
  return (
    <Card title="Bairros com mais vendas no período" subtitle="Escolha um bairro acima ou clique em um dos mais negociados">
      {!data ? <Spinner /> : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {data.map((r: any) => (
            <button key={r.bairro} onClick={() => set({ bairro: r.bairro })}
              className="rounded-xl border border-line p-3 text-left transition hover:border-accent/50 hover:bg-surface-2">
              <div className="font-medium text-ink">{r.bairro}</div>
              <div className="mt-0.5 flex justify-between text-xs text-muted"><span>{fmtInt(r.n)} vendas</span><span>{fmtM2(r.med)}</span></div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function VsCity({ f, bairro, regional }: { f: Filters; bairro: string; regional: string }) {
  const g = { ...f, regionais: [] };
  const v = m2(f);
  const sql = `
    select ${period("ano")} p,
      median(${v}) filter (where bairro = ${sqlStr(bairro)}) b, count(*) filter (where bairro = ${sqlStr(bairro)})::int nb,
      median(${v}) filter (where regional = ${sqlStr(regional)}) r, count(*) filter (where regional = ${sqlStr(regional)})::int nr,
      median(${v}) c, count(*)::int nc
    from vendas ${where(g)} and area > 0 group by 1 order by 1`;
  const { data } = useQuery<any>(sql);
  if (!data) return <Spinner />;
  if (!data.length) return <Empty>Sem dados.</Empty>;
  return (
    <MultiLines height={300} labels={data.map((d: any) => periodLabel(d.p, "ano"))} series={[
      { name: bairro, data: data.map((d: any) => (d.nb >= 3 ? d.b : null)), n: data.map((d: any) => d.nb) },
      { name: `Regional ${regional}`, data: data.map((d: any) => d.r), n: data.map((d: any) => d.nr) },
      { name: "Belo Horizonte", data: data.map((d: any) => d.c), n: data.map((d: any) => d.nc) },
    ]} />
  );
}

function Scatter({ f, bairro }: { f: Filters; bairro: string }) {
  const g = { ...f, de: Math.max(f.de, f.ate - 1) };
  const { data } = useQuery<any>(`select area, ${price(f)} v, padrao, data::varchar d from vendas ${where(g, { bairros: [bairro] })} and area > 0 limit 3000`);
  if (!data) return <Spinner />;
  if (!data.length) return <Empty>Sem vendas no período.</Empty>;
  const pads = ["P1", "P2", "P3", "P4", "P5"].filter((p) => data.some((d: any) => d.padrao === p));
  return (
    <Chart height={320} deps={[data]} build={(p) => {
      const b = baseOption(p) as Record<string, any>;
      // até 3 classes (validação "todos os pares" da paleta): agrupa padrões em baixo/médio/alto
      const groups = [
        { name: "P1–P2", match: ["P1", "P2"], color: p.series[2] },
        { name: "P3", match: ["P3"], color: p.series[0] },
        { name: "P4–P5", match: ["P4", "P5"], color: p.series[1] },
      ].filter((gr) => gr.match.some((m) => pads.includes(m)));
      return {
        ...b,
        grid: { ...b.grid, top: 36 },
        legend: { top: 0, left: 0, textStyle: { color: p.ink2 } },
        tooltip: { ...b.tooltip, trigger: "item", formatter: (it: any) => `${fmtBRL(it.value[1])}<br/>${fmtInt(it.value[0])} m² · ${fmtM2(it.value[1] / it.value[0])}<br/><span style="color:${p.muted}">${it.value[2]}</span>` },
        xAxis: { ...b.xAxis, type: "value", name: "m²", nameTextStyle: { color: p.muted }, splitLine: { show: false }, scale: true },
        yAxis: { ...b.yAxis, type: "value", scale: true, axisLabel: { ...b.yAxis.axisLabel, formatter: (v: number) => (v >= 1e6 ? `${v / 1e6} mi` : `${v / 1e3} mil`) } },
        series: groups.map((gr) => ({
          type: "scatter", name: gr.name, symbolSize: 8,
          itemStyle: { color: gr.color, opacity: 0.7, borderColor: p.surface, borderWidth: 1 },
          data: data.filter((d: any) => gr.match.includes(d.padrao)).map((d: any) => [d.area, d.v, d.d.split("-").reverse().join("/")]),
        })),
      };
    }} />
  );
}
