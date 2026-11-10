import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { Filters } from "../lib/state";
import { useMeta, PADROES } from "../lib/meta";
import { query } from "../lib/db";
import { useQuery } from "../lib/hooks";
import { m2, price, where, type Scope } from "../lib/sql";
import { fmtBRL, fmtDate, fmtInt, fmtM2 } from "../lib/format";
import { Empty, Spinner, Tag } from "./ui";

type Key = "data" | "bairro" | "andar" | "area" | "valor" | "m2" | "ano_construcao";

/** 0 → "Térreo", 4 → "4º andar" */
export const fmtAndar = (a: number | null | undefined) => (a == null ? null : a === 0 ? "Térreo" : `${a}º andar`);

/** Tabela paginada de transações com ordenação e exportação CSV. */
export function SalesTable({ f, set, scope, pageSize = 25, showBairro = true }: {
  f: Filters; set?: (p: Partial<Filters>) => void; scope?: Scope; pageSize?: number; showBairro?: boolean;
}) {
  const { meta } = useMeta();
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ k: Key; desc: boolean }>({ k: "data", desc: true });
  const w = where(f, scope);
  useEffect(() => setPage(0), [w]);
  const base = `select data, bairro, regional, logradouro, complemento, andar, rua, cep, tipo, padrao, ano_construcao, area, ${price(f)} valor, ${m2(f)} m2
                from vendas ${w}`;
  const total = useQuery<{ n: number }>(`select count(*)::int n from vendas ${w}`);
  const { data, loading } = useQuery<any>(`${base} order by ${sort.k} ${sort.desc ? "desc" : "asc"} nulls last limit ${pageSize} offset ${page * pageSize}`);
  const n = total.data?.[0]?.n ?? 0;
  const pages = Math.max(1, Math.ceil(n / pageSize));
  const padrao = Object.fromEntries(PADROES.map((p) => [p.value, p.label]));

  const exportCsv = async () => {
    const rows = await query<any>(`${base} order by data desc limit 50000`);
    const head = ["data", "bairro", "regional", "logradouro", "complemento", "andar", "cep", "tipo", "padrao", "ano_construcao", "area_m2", "valor", "valor_m2"];
    const esc = (v: unknown) => (v == null ? "" : typeof v === "number" ? String(Math.round(v * 100) / 100).replace(".", ",") : `"${String(v).replace(/"/g, '""')}"`);
    const csv = [head.join(";"), ...rows.map((r) => [r.data, r.bairro, r.regional, r.logradouro, r.complemento, r.andar, r.cep, meta?.tipos[r.tipo]?.nome ?? r.tipo, r.padrao, r.ano_construcao, r.area, r.valor, r.m2].map(esc).join(";"))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `vendas_bh_${f.de}-${f.ate}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const th = (k: Key | null, label: string, right = false) => (
    <th className={`whitespace-nowrap px-2 py-2 font-medium ${right ? "text-right" : ""} ${k ? "cursor-pointer select-none hover:text-ink" : ""}`}
      onClick={() => { if (k) { setSort({ k, desc: sort.k === k ? !sort.desc : true }); setPage(0); } }}>
      <span className="inline-flex items-center gap-0.5">{label}{k && sort.k === k && (sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}</span>
    </th>
  );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted">{fmtInt(n)} vendas encontradas</div>
        <button onClick={exportCsv} disabled={!n}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-2 hover:text-ink disabled:opacity-50">
          <Download size={14} /> Exportar CSV
        </button>
      </div>
      {loading && !data ? <Spinner /> : !data?.length ? <Empty>Nenhuma venda encontrada.</Empty> : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead className="text-left text-xs text-muted">
              <tr>
                {th("data", "Data")}
                {th(null, "Endereço")}
                {th("andar", "Unidade")}
                {showBairro && th("bairro", "Bairro")}
                {th(null, "Tipo")}
                {th("area", "Área", true)}
                {th("ano_construcao", "Constr.", true)}
                {th("valor", "Valor", true)}
                {th("m2", "R$/m²", true)}
              </tr>
            </thead>
            <tbody className={loading ? "opacity-60" : ""}>
              {data.map((r: any, i: number) => (
                <tr key={i} className="border-t border-line">
                  <td className="whitespace-nowrap px-2 py-2 text-ink-2">{fmtDate(r.data)}</td>
                  <td className="px-2 py-2 text-ink">
                    {set && r.rua !== scope?.rua ? (
                      <button onClick={() => set({ view: "rua", rua: r.rua })} title="Ver todas as vendas nesta rua"
                        className="block max-w-64 truncate text-left hover:text-accent hover:underline">{r.logradouro}</button>
                    ) : <div className="max-w-64 truncate" title={r.logradouro}>{r.logradouro}</div>}<div className="text-[11px] text-muted">{r.cep}</div></td>
                  <td className="px-2 py-2">
                    <div className="max-w-44 truncate text-ink" title={r.complemento ?? ""}>{r.complemento ?? "—"}</div>
                    {r.andar != null && <div className="text-[11px] text-muted">{fmtAndar(r.andar)}</div>}
                  </td>
                  {showBairro && <td className="px-2 py-2 text-ink-2">{r.bairro}</td>}
                  <td className="px-2 py-2"><div className="flex flex-wrap gap-1"><Tag>{meta?.tipos[r.tipo]?.nome ?? r.tipo}</Tag>{r.padrao && <Tag><span title={padrao[r.padrao]}>{r.padrao}</span></Tag>}</div></td>
                  <td className="whitespace-nowrap px-2 py-2 text-right text-ink-2">{r.area ? `${fmtInt(r.area)} m²` : "—"}</td>
                  <td className="px-2 py-2 text-right text-ink-2">{r.ano_construcao ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-medium text-ink">{fmtBRL(r.valor)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right text-ink-2">{fmtM2(r.m2).replace("/m²", "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm text-muted">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-lg border border-line p-1.5 disabled:opacity-40" aria-label="Anterior"><ChevronLeft size={16} /></button>
          Página {fmtInt(page + 1)} de {fmtInt(pages)}
          <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="rounded-lg border border-line p-1.5 disabled:opacity-40" aria-label="Próxima"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}
