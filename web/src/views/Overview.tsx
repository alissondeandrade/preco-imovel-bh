import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { Filters } from "../lib/state";
import { useQuery } from "../lib/hooks";
import { m2, where, type Scope } from "../lib/sql";
import { growth, kpiSql, seriesSql, toSeries, type KpiRow } from "../lib/queries";
import { fmtBRL, fmtDate, fmtInt, fmtM2, fmtPct } from "../lib/format";
import { Card, Empty, Kpi, Segmented, Spinner } from "../components/ui";
import { CategoryBars, PriceBand, VolumeBars } from "../components/charts";
import { PADROES } from "../lib/meta";

export function KpiRowView({ f, scope }: { f: Filters; scope?: Scope }) {
  const { data } = useQuery<KpiRow>(kpiSql(f, scope));
  const k = data?.[0];
  const hint = "vs. 12 meses anteriores";
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="Mediana R$/m² · 12 meses" value={k ? fmtM2(k.m12) : "…"} delta={k ? growth(k.m12, k.m12p) : null} hint={hint} />
      <Kpi label="Valor mediano · 12 meses" value={k ? fmtBRL(k.t12) : "…"} delta={k ? growth(k.t12, k.t12p) : null} hint={hint} />
      <Kpi label="Vendas · 12 meses" value={k ? fmtInt(k.n12) : "…"} delta={k ? growth(k.n12, k.n12p) : null} hint={hint} />
      <Kpi label="Área mediana · 12 meses" value={k?.a12 ? `${fmtInt(k.a12)} m²` : "…"} hint={k?.fim ? `até ${fmtDate(k.fim)}` : undefined} />
    </div>
  );
}

export function SeriesCard({ f, set, scope, title }: { f: Filters; set: (p: Partial<Filters>) => void; scope?: Scope; title: string }) {
  const [unit, setUnit] = useState<"m2" | "total">("m2");
  const { data, loading } = useQuery<any>(seriesSql(f, scope, unit));
  const rows = useMemo(() => toSeries(data, f), [data, f.gran]);
  return (
    <Card title={title}
      subtitle={`Mediana ${unit === "m2" ? "do preço por m²" : "do valor de venda"} · faixa sombreada = metade central das vendas (25%–75%)${f.real ? " · valores corrigidos pelo IPCA" : ""}`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Segmented size="sm" value={unit} onChange={setUnit} options={[{ value: "m2", label: "R$/m²" }, { value: "total", label: "Valor" }]} />
          <Segmented size="sm" value={f.gran} onChange={(gran) => set({ gran })}
            options={[{ value: "mes", label: "Mês" }, { value: "trimestre", label: "Trimestre" }, { value: "ano", label: "Ano" }]} />
        </div>
      }>
      {loading && !data ? <Spinner /> : rows.length ? (
        <>
          <PriceBand rows={rows} unit={unit} />
          <div className="mt-2 text-xs font-medium text-muted">Número de vendas</div>
          <VolumeBars rows={rows} />
          {f.de <= 2015 && f.ate >= 2014 && (
            <p className="mt-2 text-[11px] text-muted">Obs.: a base da PBH tem poucos registros entre 2014 e o 1º semestre de 2015, com um acúmulo no 3º trimestre de 2015 (lacuna na fonte, não queda do mercado).</p>
          )}
        </>
      ) : <Empty>Sem vendas para os filtros escolhidos.</Empty>}
    </Card>
  );
}

type SortKey = "bairro" | "n" | "med" | "var";

function Ranking({ f, set }: { f: Filters; set: (p: Partial<Filters>) => void }) {
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: "med", desc: true });
  const [all, setAll] = useState(false);
  const sql = `
    with b as (select bairro, regional, ano, ${m2(f)} m2 from vendas ${where(f)} and area > 0)
    select bairro, any_value(regional) regional, count(*) filter (where ano = ${f.ate})::int n,
      median(m2) filter (where ano = ${f.ate}) med,
      median(m2) filter (where ano = ${f.de}) med0,
      count(*) filter (where ano = ${f.de})::int n0
    from b group by 1 having count(*) filter (where ano = ${f.ate}) >= 10`;
  const { data, loading } = useQuery<any>(sql);
  const rows = useMemo(() => {
    const r = (data ?? []).map((x) => ({ ...x, var: x.n0 >= 10 && f.de !== f.ate ? x.med / x.med0 - 1 : null }));
    const dir = sort.desc ? -1 : 1;
    return r.sort((a, b) => {
      const va = a[sort.k], vb = b[sort.k];
      if (va == null) return 1; if (vb == null) return -1;
      return (typeof va === "string" ? va.localeCompare(vb) : va - vb) * dir;
    });
  }, [data, sort, f.de, f.ate]);
  const shown = all ? rows : rows.slice(0, 15);
  const th = (k: SortKey, label: string, cls = "") => (
    <th className={`cursor-pointer select-none px-2 py-2 font-medium hover:text-ink ${cls}`} onClick={() => setSort({ k, desc: sort.k === k ? !sort.desc : true })}>
      <span className="inline-flex items-center gap-0.5">{label}{sort.k === k && (sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}</span>
    </th>
  );
  return (
    <Card title={`Ranking de bairros · ${f.ate}`}
      subtitle={`Bairros com ao menos 10 vendas em ${f.ate}. Variação = mediana de ${f.ate} vs. ${f.de}. Clique para detalhar.`}>
      {loading && !data ? <Spinner /> : !rows.length ? <Empty>Poucas vendas para montar o ranking.</Empty> : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="w-8 px-2 py-2 font-medium">#</th>
                {th("bairro", "Bairro")}
                {th("med", "R$/m²", "text-right")}
                {th("var", `Var. desde ${f.de}`, "text-right")}
                {th("n", "Vendas", "text-right")}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.bairro} onClick={() => set({ view: "bairro", bairro: r.bairro })}
                  className="cursor-pointer border-t border-line hover:bg-surface-2">
                  <td className="px-2 py-2 text-muted">{i + 1}</td>
                  <td className="px-2 py-2"><div className="font-medium text-ink">{r.bairro}</div><div className="text-[11px] text-muted">{r.regional}</div></td>
                  <td className="px-2 py-2 text-right font-medium text-ink">{fmtM2(r.med)}</td>
                  <td className={`px-2 py-2 text-right ${r.var == null ? "text-muted" : r.var >= 0 ? "text-up" : "text-down"}`}>{fmtPct(r.var)}</td>
                  <td className="px-2 py-2 text-right text-ink-2">{fmtInt(r.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 15 && (
            <button onClick={() => setAll(!all)} className="mt-2 px-2 text-sm font-medium text-accent hover:underline">
              {all ? "Mostrar menos" : `Mostrar todos (${rows.length})`}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

export function Breakdowns({ f, scope }: { f: Filters; scope?: Scope }) {
  const w = where(f, scope);
  const pad = useQuery<any>(`select padrao k, median(${m2(f)}) v, count(*)::int n from vendas ${w} and area > 0 and padrao is not null group by 1 order by 1`);
  const idade = useQuery<any>(`
    select case when ano - ano_construcao <= 5 then '0–5 anos' when ano - ano_construcao <= 15 then '6–15 anos'
                when ano - ano_construcao <= 30 then '16–30 anos' else 'Mais de 30 anos' end k,
           min(ano - ano_construcao) o, median(${m2(f)}) v, count(*)::int n
    from vendas ${w} and area > 0 and ano_construcao is not null group by 1 order by o`);
  const area = useQuery<any>(`
    select case when area < 50 then 'Até 50 m²' when area < 80 then '50–80 m²' when area < 120 then '80–120 m²'
                when area < 200 then '120–200 m²' else '200 m² ou mais' end k, min(area) o,
           median(${m2(f)}) v, count(*)::int n
    from vendas ${w} and area > 0 group by 1 order by o`);
  // andar estimado a partir do nº da unidade (só apartamentos e salas; ver pipeline/sql.ts)
  const andar = useQuery<any>(`
    select case when andar <= 2 then 'Térreo ao 2º' when andar <= 5 then '3º ao 5º' when andar <= 10 then '6º ao 10º'
                when andar <= 15 then '11º ao 15º' else '16º ou acima' end k, min(andar) o,
           median(${m2(f)}) v, count(*)::int n
    from vendas ${w} and area > 0 and andar is not null group by 1 having count(*) >= 5 order by o`);
  const padLabel = Object.fromEntries(PADROES.map((p) => [p.value, p.label]));
  const showAndar = (andar.data?.length ?? 0) > 1;
  return (
    <div className={`grid gap-4 md:grid-cols-2 ${showAndar ? "2xl:grid-cols-4" : "xl:grid-cols-3"}`}>
      {showAndar && (
        <Card title="Por andar" subtitle="Andar estimado pelo nº do apartamento · mediana R$/m²">
          <CategoryBars rows={andar.data!} />
        </Card>
      )}
      <Card title="Por padrão de acabamento" subtitle="Mediana R$/m² no período">
        {pad.data ? <CategoryBars rows={pad.data.map((r: any) => ({ ...r, k: padLabel[r.k] ?? r.k }))} /> : <Spinner />}
      </Card>
      <Card title="Por idade do imóvel" subtitle="Idade na data da venda · mediana R$/m²">
        {idade.data ? <CategoryBars rows={idade.data} /> : <Spinner />}
      </Card>
      <Card title="Por faixa de área" subtitle="Área construída adquirida · mediana R$/m²">
        {area.data ? <CategoryBars rows={area.data} /> : <Spinner />}
      </Card>
    </div>
  );
}

export function Overview({ f, set }: { f: Filters; set: (p: Partial<Filters>) => void }) {
  return (
    <div className="space-y-4">
      <KpiRowView f={f} />
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <SeriesCard f={f} set={set} title="Evolução do preço" />
        <Ranking f={f} set={set} />
      </div>
      <Breakdowns f={f} />
    </div>
  );
}
