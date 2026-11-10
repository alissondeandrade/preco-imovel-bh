import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, MapPin, Search, X } from "lucide-react";
import type { Filters } from "../lib/state";
import { useMeta } from "../lib/meta";
import { useQuery } from "../lib/hooks";
import { m2, price, streetLabel, streetSearchCond, where, type Scope } from "../lib/sql";
import { fmtDate, fmtInt, fmtM2, fmtPct, fmtShort } from "../lib/format";
import { Card, Empty, Spinner } from "../components/ui";
import { SalesTable } from "../components/SalesTable";
import { KpiRowView, SeriesCard } from "./Overview";

type SetF = (p: Partial<Filters>) => void;

export function Rua({ f, set }: { f: Filters; set: SetF }) {
  const [numero, setNumero] = useState<string | null>(null);
  const salesRef = useRef<HTMLDivElement>(null);
  useEffect(() => setNumero(null), [f.rua]);

  const pickNumero = (n: string | null) => {
    setNumero(n);
    if (n) setTimeout(() => salesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const scope: Scope = { rua: f.rua };
  return (
    <div className="space-y-4">
      <StreetSearch value={f.rua} onPick={(rua) => set({ rua })} />
      {!f.rua ? <TopStreets f={f} set={set} /> : (
        <>
          <StreetHeader f={f} set={set} />
          <KpiRowView f={f} scope={scope} />
          <div className="grid gap-4 xl:grid-cols-2">
            <SeriesCard f={f} set={set} scope={scope} title={`Evolução do preço · ${streetLabel(f.rua)}`} />
            <VsBairro f={f} />
          </div>
          <ByNumber f={f} selected={numero} onPick={pickNumero} />
          <div ref={salesRef} className="scroll-mt-4">
            <Card title="Vendas registradas"
              subtitle={numero ? `Somente o número ${numero}` : "Todas as vendas da rua no período"}
              actions={numero && (
                <button onClick={() => setNumero(null)} className="flex items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1 text-sm font-medium text-ink">
                  Nº {numero} <X size={14} />
                </button>
              )}>
              <SalesTable f={f} set={set} scope={{ rua: f.rua, numero: numero ?? undefined }} pageSize={15} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

/** Campo de busca com sugestões (todas as palavras digitadas precisam aparecer no nome). */
function StreetSearch({ value, onPick }: { value: string; onPick: (rua: string) => void }) {
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = setTimeout(() => setTerm(text.trim()), 200); return () => clearTimeout(t); }, [text]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const sql = term.length >= 2 ? `
    select rua, count(*)::int n, string_agg(distinct bairro, ', ' order by bairro) bairros
    from vendas where valido and ${streetSearchCond(term)}
    group by rua order by n desc limit 12` : null;
  const { data, loading } = useQuery<{ rua: string; n: number; bairros: string }>(sql);
  useEffect(() => setHi(0), [data]);

  const pick = (rua: string) => { onPick(rua); setText(""); setTerm(""); setOpen(false); };
  const list = term.length >= 2 ? data ?? [] : [];

  return (
    <div className="relative max-w-2xl" ref={box}>
      <div className="flex h-12 items-center gap-2 rounded-2xl border border-line bg-surface px-4 shadow-sm focus-within:border-accent">
        <Search size={18} className="text-muted" />
        <input
          value={text} aria-label="Buscar rua"
          placeholder={value ? `Buscar outra rua (atual: ${streetLabel(value)})` : "Buscar rua ou avenida — ex.: Bahia, Contorno, Afonso Pena"}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!list.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((hi + 1) % list.length); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHi((hi - 1 + list.length) % list.length); }
            else if (e.key === "Enter") { e.preventDefault(); pick(list[hi].rua); }
            else if (e.key === "Escape") setOpen(false);
          }}
          className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted" />
        {loading && <span className="size-4 animate-spin rounded-full border-2 border-line border-t-accent" />}
      </div>
      {open && term.length >= 2 && !loading && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-xl">
          {list.length ? list.map((r, i) => (
            <button key={r.rua} onMouseEnter={() => setHi(i)} onClick={() => pick(r.rua)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left ${i === hi ? "bg-surface-2" : ""}`}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{streetLabel(r.rua)}</span>
                <span className="block truncate text-xs text-muted">{r.bairros}</span>
              </span>
              <span className="shrink-0 text-xs text-muted tabular">{fmtInt(r.n)} vendas</span>
            </button>
          )) : <div className="px-3 py-3 text-sm text-muted">Nenhuma rua encontrada com “{term}”.</div>}
        </div>
      )}
    </div>
  );
}

function StreetHeader({ f, set }: { f: Filters; set: SetF }) {
  const { meta } = useMeta();
  // contagem por tipo ignora o filtro de tipo, para mostrar o que existe na rua
  const tipos = useQuery<{ tipo: string; n: number }>(`
    select tipo, count(*)::int n from vendas ${where(f, { rua: f.rua, tipos: false })} group by 1 order by 2 desc`);
  const bairros = useQuery<{ bairro: string; regional: string; n: number }>(`
    select bairro, any_value(regional) regional, count(*)::int n from vendas ${where(f, { rua: f.rua, tipos: false })} group by 1 order by 3 desc`);
  const active = new Set(f.tipos);
  const total = (tipos.data ?? []).filter((t) => !f.tipos.length || active.has(t.tipo)).reduce((a, t) => a + t.n, 0);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{streetLabel(f.rua)}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-muted">
          <MapPin size={14} />
          {(bairros.data ?? []).slice(0, 6).map((b, i) => (
            <span key={b.bairro}>
              {i > 0 && " · "}
              <button onClick={() => set({ view: "bairro", bairro: b.bairro })} className="hover:text-accent hover:underline">{b.bairro}</button>
            </span>
          ))}
          {(bairros.data?.length ?? 0) > 6 && <span> e mais {bairros.data!.length - 6}</span>}
        </div>
      </div>
      {tipos.data && tipos.data.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-muted">Vendas {f.de}–{f.ate} por tipo:</span>
          {tipos.data.map((t) => {
            const on = active.has(t.tipo);
            return (
              <button key={t.tipo} onClick={() => set({ tipos: on && f.tipos.length === 1 ? [] : [t.tipo] })}
                title={on ? "Tipo selecionado" : "Filtrar por este tipo"}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${on ? "border-accent/50 bg-accent/10 text-ink" : "border-line text-ink-2 hover:text-ink"}`}>
                {meta?.tipos[t.tipo]?.nome ?? t.tipo} <span className="text-muted tabular">{fmtInt(t.n)}</span>
              </button>
            );
          })}
        </div>
      )}
      {tipos.data && total === 0 && (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-2">
          Não há vendas do tipo selecionado nesta rua entre {f.de} e {f.ate}. Escolha um dos tipos acima ou amplie o período.
        </p>
      )}
    </div>
  );
}

/** Mediana de R$/m² da rua vs. a do bairro (mesmos filtros e período), para cada bairro que a rua atravessa. */
function VsBairro({ f }: { f: Filters }) {
  const v = m2(f);
  const sql = `
    with r as (select bairro, count(*)::int n, median(${v}) med from vendas ${where(f, { rua: f.rua })} and area > 0 group by 1),
         b as (select bairro, count(*)::int n, median(${v}) med from vendas ${where(f, { regionais: false })} and area > 0
               and bairro in (select bairro from r) group by 1)
    select r.bairro, r.n, r.med, b.med bmed, b.n bn from r join b using (bairro) order by r.n desc`;
  const { data } = useQuery<{ bairro: string; n: number; med: number; bmed: number; bn: number }>(sql);
  return (
    <Card title="Comparado ao bairro" subtitle={`Mediana de R$/m² de ${f.de} a ${f.ate}, com os mesmos filtros`}>
      {!data ? <Spinner /> : !data.length ? <Empty>Sem vendas no período.</Empty> : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="px-2 py-2 font-medium">Bairro</th>
                <th className="px-2 py-2 text-right font-medium">Nesta rua</th>
                <th className="px-2 py-2 text-right font-medium">No bairro</th>
                <th className="px-2 py-2 text-right font-medium">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => {
                const diff = r.n >= 5 ? r.med / r.bmed - 1 : null;
                return (
                  <tr key={r.bairro} className="border-t border-line">
                    <td className="px-2 py-2 font-medium text-ink">{r.bairro}</td>
                    <td className="px-2 py-2 text-right text-ink">{fmtM2(r.med).replace("/m²", "")}<div className="text-[11px] text-muted">{fmtInt(r.n)} vendas</div></td>
                    <td className="px-2 py-2 text-right text-ink-2">{fmtM2(r.bmed).replace("/m²", "")}<div className="text-[11px] text-muted">{fmtInt(r.bn)} vendas</div></td>
                    <td className={`px-2 py-2 text-right font-medium ${diff == null ? "text-muted" : diff >= 0 ? "text-up" : "text-down"}`}>
                      {diff == null ? "poucas vendas" : fmtPct(diff)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 px-2 text-[11px] text-muted">Diferença calculada quando a rua tem ao menos 5 vendas no bairro.</p>
        </div>
      )}
    </Card>
  );
}

type NumKey = "num" | "n" | "ultima" | "med" | "ticket";

/** Agrupa as vendas por número (em geral, um prédio ou casa). */
function ByNumber({ f, selected, onPick }: { f: Filters; selected: string | null; onPick: (n: string | null) => void }) {
  const [sort, setSort] = useState<{ k: NumKey; desc: boolean }>({ k: "n", desc: true });
  const [all, setAll] = useState(false);
  const { meta } = useMeta();
  const sql = `
    select coalesce(numero, 's/n') numero, try_cast(regexp_extract(numero, '^[0-9]+') as int) num,
      mode(bairro) bairro, count(*)::int n, max(data)::varchar ultima,
      median(${m2(f)}) med, median(${price(f)}) ticket, mode(ano_construcao) constr, mode(tipo) tipo, mode(padrao) padrao
    from vendas ${where(f, { rua: f.rua })} group by 1, 2`;
  const { data } = useQuery<any>(sql);
  const rows = useMemo(() => {
    const dir = sort.desc ? -1 : 1;
    return [...(data ?? [])].sort((a, b) => {
      const va = a[sort.k], vb = b[sort.k];
      if (va == null) return 1; if (vb == null) return -1;
      return (typeof va === "string" ? va.localeCompare(vb) : va - vb) * dir;
    });
  }, [data, sort]);
  const shown = all ? rows : rows.slice(0, 12);
  const th = (k: NumKey, label: string, right = true) => (
    <th className={`cursor-pointer select-none whitespace-nowrap px-2 py-2 font-medium hover:text-ink ${right ? "text-right" : ""}`}
      onClick={() => setSort({ k, desc: sort.k === k ? !sort.desc : k !== "num" })}>
      <span className="inline-flex items-center gap-0.5">{label}{sort.k === k && (sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}</span>
    </th>
  );
  return (
    <Card title="Vendas por número" subtitle="Cada número costuma ser um prédio ou uma casa. Clique para ver as vendas daquele endereço.">
      {!data ? <Spinner /> : !rows.length ? <Empty>Sem vendas no período.</Empty> : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead className="text-left text-xs text-muted">
              <tr>
                {th("num", "Número", false)}
                <th className="px-2 py-2 font-medium">Imóvel</th>
                {th("n", "Vendas")}
                {th("ultima", "Última venda")}
                {th("med", "R$/m²")}
                {th("ticket", "Valor mediano")}
              </tr>
            </thead>
            <tbody>
              {shown.map((r: any) => (
                <tr key={r.numero} onClick={() => onPick(selected === r.numero ? null : r.numero)}
                  className={`cursor-pointer border-t border-line hover:bg-surface-2 ${selected === r.numero ? "bg-accent/10" : ""}`}>
                  <td className="px-2 py-2 font-semibold text-ink">{r.numero}</td>
                  <td className="px-2 py-2 text-ink-2">
                    {meta?.tipos[r.tipo]?.nome ?? r.tipo}{r.padrao ? ` · ${r.padrao}` : ""}{r.constr ? ` · ${r.constr}` : ""}
                    <div className="text-[11px] text-muted">{r.bairro}</div>
                  </td>
                  <td className="px-2 py-2 text-right text-ink">{fmtInt(r.n)}</td>
                  <td className="px-2 py-2 text-right text-ink-2">{fmtDate(r.ultima)}</td>
                  <td className="px-2 py-2 text-right font-medium text-ink">{fmtM2(r.med).replace("/m²", "")}</td>
                  <td className="px-2 py-2 text-right text-ink-2">{fmtShort(r.ticket)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 12 && (
            <button onClick={() => setAll(!all)} className="mt-2 px-2 text-sm font-medium text-accent hover:underline">
              {all ? "Mostrar menos" : `Mostrar todos os ${rows.length} números`}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

/** Sem rua escolhida: ruas com mais vendas no período/filtros atuais. */
function TopStreets({ f, set }: { f: Filters; set: SetF }) {
  const { data } = useQuery<any>(`
    select rua, count(*)::int n, median(${m2(f)}) med, mode(bairro) bairro
    from vendas ${where(f)} and area > 0 group by 1 order by 2 desc limit 24`);
  return (
    <Card title="Ruas com mais vendas no período" subtitle="Busque uma rua acima ou clique em uma das mais negociadas">
      {!data ? <Spinner /> : !data.length ? <Empty>Sem vendas para os filtros escolhidos.</Empty> : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {data.map((r: any) => (
            <button key={r.rua} onClick={() => set({ rua: r.rua })}
              className="rounded-xl border border-line p-3 text-left transition hover:border-accent/50 hover:bg-surface-2">
              <div className="truncate font-medium text-ink">{streetLabel(r.rua)}</div>
              <div className="mt-0.5 truncate text-xs text-muted">{r.bairro}</div>
              <div className="mt-1 flex justify-between text-xs text-muted"><span>{fmtInt(r.n)} vendas</span><span>{fmtM2(r.med)}</span></div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

