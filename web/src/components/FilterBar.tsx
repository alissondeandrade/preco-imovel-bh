import { useEffect, useRef, useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { ANO_MAX, ANO_MIN, DEFAULTS, type Filters } from "../lib/state";
import { PADROES, useMeta } from "../lib/meta";
import { MultiSelect, Segmented } from "./ui";

const years = Array.from({ length: ANO_MAX - ANO_MIN + 1 }, (_, i) => ANO_MIN + i);

function NumInput({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder: string }) {
  const [txt, setTxt] = useState(value == null ? "" : String(value));
  useEffect(() => setTxt(value == null ? "" : String(value)), [value]);
  return (
    <input inputMode="numeric" value={txt} placeholder={placeholder}
      onChange={(e) => setTxt(e.target.value.replace(/\D/g, ""))}
      onBlur={() => onChange(txt === "" ? null : Number(txt))}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="h-9 w-24 rounded-lg border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-accent" />
  );
}

export function FilterBar({ f, set, reset, showPeriod = true }: {
  f: Filters; set: (p: Partial<Filters>) => void; reset: () => void; showPeriod?: boolean;
}) {
  const { meta, regionais } = useMeta();
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMore(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const tipoOpts = meta ? Object.entries(meta.tipos).map(([k, t]) => ({ value: k, label: t.nome, group: t.grupo })) : [];
  const extra = [f.areaMin, f.areaMax, f.constrMin, f.constrMax].filter((v) => v != null).length;
  const dirty = JSON.stringify({ ...f, view: 0, bairro: 0, rua: 0, cmp: 0, metrica: 0, gran: 0 }) !==
    JSON.stringify({ ...DEFAULTS, view: 0, bairro: 0, rua: 0, cmp: 0, metrica: 0, gran: 0 });

  const sel = "h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-accent";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showPeriod && (
        <div className="flex items-center gap-1.5">
          <select aria-label="Ano inicial" className={sel} value={f.de} onChange={(e) => set({ de: Number(e.target.value), ate: Math.max(f.ate, Number(e.target.value)) })}>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
          <span className="text-sm text-muted">a</span>
          <select aria-label="Ano final" className={sel} value={f.ate} onChange={(e) => set({ ate: Number(e.target.value), de: Math.min(f.de, Number(e.target.value)) })}>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
        </div>
      )}
      <MultiSelect label="Tipo" options={tipoOpts} value={f.tipos} onChange={(tipos) => set({ tipos })} />
      <MultiSelect label="Padrão" options={PADROES} value={f.padroes} onChange={(padroes) => set({ padroes })} />
      <MultiSelect label="Regional" options={regionais.map((r) => ({ value: r, label: r }))} value={f.regionais} onChange={(r) => set({ regionais: r })} allLabel="Todas" />

      <div className="relative" ref={moreRef}>
        <button onClick={() => setMore(!more)}
          className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm ${extra ? "border-accent/40 bg-accent/10 text-ink" : "border-line bg-surface text-ink-2 hover:text-ink"}`}>
          <SlidersHorizontal size={14} /> Mais filtros{extra ? ` (${extra})` : ""}
        </button>
        {more && (
          <div className="absolute z-30 mt-1 w-72 space-y-3 rounded-xl border border-line bg-surface p-3 shadow-xl max-sm:-left-24">
            <div>
              <div className="mb-1 text-xs font-medium text-muted">Área (m²)</div>
              <div className="flex items-center gap-2">
                <NumInput value={f.areaMin} onChange={(v) => set({ areaMin: v })} placeholder="mín." />
                <span className="text-muted">–</span>
                <NumInput value={f.areaMax} onChange={(v) => set({ areaMax: v })} placeholder="máx." />
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted">Ano de construção</div>
              <div className="flex items-center gap-2">
                <NumInput value={f.constrMin} onChange={(v) => set({ constrMin: v })} placeholder="de" />
                <span className="text-muted">–</span>
                <NumInput value={f.constrMax} onChange={(v) => set({ constrMax: v })} placeholder="até" />
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted">Valor considerado</div>
              <Segmented size="sm" value={f.valor} onChange={(valor) => set({ valor })}
                options={[{ value: "decl", label: "Declarado na venda" }, { value: "base", label: "Base de cálculo" }]} />
              <p className="mt-1 text-[11px] leading-snug text-muted">
                Declarado = preço informado pelo comprador. Base de cálculo = maior valor entre o declarado e a avaliação da PBH.
              </p>
            </div>
          </div>
        )}
      </div>

      <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-ink-2 select-none"
        title="Corrige os valores pela inflação (IPCA) até o mês mais recente">
        <input type="checkbox" className="accent-[var(--accent)]" checked={f.real} onChange={(e) => set({ real: e.target.checked })} />
        Corrigir pelo IPCA
      </label>

      {dirty && (
        <button onClick={reset} className="flex h-9 items-center gap-1 px-2 text-sm text-muted hover:text-ink">
          <RotateCcw size={14} /> Limpar
        </button>
      )}
    </div>
  );
}
