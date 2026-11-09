import { useMemo, useState } from "react";
import type { Filters } from "../lib/state";
import { useMeta } from "../lib/meta";
import { useQuery } from "../lib/hooks";
import { m2, period, periodLabel, price, where } from "../lib/sql";
import { sqlStr } from "../lib/db";
import { fmtInt, fmtM2, fmtPct, fmtShort } from "../lib/format";
import { Card, Empty, MultiSelect, Segmented, Spinner } from "../components/ui";
import { MultiLines } from "../components/charts";

const DEFAULT_REGS = ["Centro-Sul", "Oeste", "Pampulha", "Noroeste", "Nordeste"];

export function Compare({ f, set }: { f: Filters; set: (p: Partial<Filters>) => void }) {
  const { bairros, regionais } = useMeta();
  const [mode, setMode] = useState<"bairro" | "regional">(f.cmp.length || !f.regionais.length ? "bairro" : "regional");
  const [unit, setUnit] = useState<"m2" | "total">("m2");

  const bairroOpts = useMemo(() => (bairros?.features ?? [])
    .map((x) => ({ value: x.properties.nome, label: x.properties.nome, group: x.properties.regional }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label)), [bairros]);

  // no máximo 5 séries (paleta categórica validada); sem seleção, mostra as 5 maiores regionais em volume
  const ents = mode === "bairro" ? f.cmp : f.regionais.length ? f.regionais.slice(0, 5) : DEFAULT_REGS.filter((r) => regionais.includes(r));
  const col = mode === "bairro" ? "bairro" : "regional";
  const v = unit === "m2" ? m2(f) : price(f);
  const sql = ents.length ? `
    select ${col} e, ${period(f.gran)} p, median(${v}) med, count(*)::int n
    from vendas ${where(f, { regionais: mode === "bairro" ? false : true })} and area > 0
      and ${col} in (${ents.map(sqlStr).join(",")})
    group by 1, 2 order by 2` : null;
  const { data, loading } = useQuery<{ e: string; p: string; med: number; n: number }>(sql);

  const summarySql = ents.length ? `
    select ${col} e,
      median(${v}) filter (where ano = ${f.ate}) fim, count(*) filter (where ano = ${f.ate})::int nfim,
      median(${v}) filter (where ano = ${f.de}) ini, count(*) filter (where ano = ${f.de})::int nini, count(*)::int n
    from vendas ${where(f, { regionais: mode === "bairro" ? false : true })} and area > 0 and ${col} in (${ents.map(sqlStr).join(",")})
    group by 1` : null;
  const summary = useQuery<any>(summarySql);

  const chart = useMemo(() => {
    if (!data) return null;
    const ps = [...new Set(data.map((d) => d.p))].sort();
    const order = ents;
    // mantém a cor de cada entidade pela ordem de seleção
    return {
      labels: ps.map((p) => periodLabel(p, f.gran)),
      series: order.map((e) => {
        const byP = new Map(data.filter((d) => d.e === e).map((d) => [d.p, d]));
        // com poucas vendas no período, a mediana é instável: oculta pontos com menos de 3 vendas
        return { name: e, data: ps.map((p) => ((byP.get(p)?.n ?? 0) >= 3 ? byP.get(p)!.med : null)), n: ps.map((p) => byP.get(p)?.n ?? null) };
      }),
    };
  }, [data, ents, f.gran]);

  const fmt = unit === "m2" ? fmtM2 : fmtShort;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={mode} onChange={setMode} options={[{ value: "bairro", label: "Bairros" }, { value: "regional", label: "Regionais" }]} />
        {mode === "bairro" ? (
          <MultiSelect label="Bairros" searchable max={5} options={bairroOpts} value={f.cmp} onChange={(cmp) => set({ cmp })} allLabel="escolha até 5" />
        ) : (
          <MultiSelect label="Regionais" max={5} options={regionais.map((r) => ({ value: r, label: r }))} value={f.regionais} onChange={(r) => set({ regionais: r })} allLabel="5 maiores" />
        )}
        <div className="ml-auto flex gap-2">
          <Segmented size="sm" value={unit} onChange={setUnit} options={[{ value: "m2", label: "R$/m²" }, { value: "total", label: "Valor" }]} />
          <Segmented size="sm" value={f.gran} onChange={(gran) => set({ gran })}
            options={[{ value: "mes", label: "Mês" }, { value: "trimestre", label: "Trim." }, { value: "ano", label: "Ano" }]} />
        </div>
      </div>

      <Card title={`Comparação de ${mode === "bairro" ? "bairros" : "regionais"}`}
        subtitle={`Mediana ${unit === "m2" ? "de R$/m²" : "do valor de venda"} por ${f.gran === "mes" ? "mês" : f.gran}; pontos com menos de 3 vendas são omitidos${f.real ? " · corrigido pelo IPCA" : ""}`}>
        {!ents.length ? <Empty>Escolha até 5 bairros no seletor acima para comparar.</Empty>
          : loading && !data ? <Spinner />
          : chart && chart.series.length ? <MultiLines labels={chart.labels} series={chart.series} unit={unit} />
          : <Empty>Sem vendas para os filtros escolhidos.</Empty>}
      </Card>

      {summary.data && summary.data.length > 0 && (
        <Card title="Resumo" subtitle={`${f.de} vs. ${f.ate}`}>
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full text-sm tabular">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="px-2 py-2 font-medium">{mode === "bairro" ? "Bairro" : "Regional"}</th>
                  <th className="px-2 py-2 text-right font-medium">{f.de}</th>
                  <th className="px-2 py-2 text-right font-medium">{f.ate}</th>
                  <th className="px-2 py-2 text-right font-medium">Variação</th>
                  <th className="px-2 py-2 text-right font-medium">Vendas no período</th>
                </tr>
              </thead>
              <tbody>
                {ents.map((e, i) => {
                  const r = summary.data!.find((x: any) => x.e === e);
                  if (!r) return null;
                  const vr = r.nini >= 5 && r.nfim >= 5 && f.de !== f.ate ? r.fim / r.ini - 1 : null;
                  return (
                    <tr key={e} className={`border-t border-line ${mode === "bairro" ? "cursor-pointer hover:bg-surface-2" : ""}`}
                      onClick={() => mode === "bairro" && set({ view: "bairro", bairro: e })}>
                      <td className="px-2 py-2 font-medium text-ink">
                        <span className="mr-2 inline-block h-1 w-3 rounded-full align-middle" style={{ background: `var(--s${(i % 5) + 1})` }} />{e}
                      </td>
                      <td className="px-2 py-2 text-right text-ink-2">{r.nini >= 5 ? fmt(r.ini) : "—"}</td>
                      <td className="px-2 py-2 text-right font-medium text-ink">{r.nfim >= 5 ? fmt(r.fim) : "—"}</td>
                      <td className={`px-2 py-2 text-right ${vr == null ? "text-muted" : vr >= 0 ? "text-up" : "text-down"}`}>{fmtPct(vr)}</td>
                      <td className="px-2 py-2 text-right text-ink-2">{fmtInt(r.n)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
