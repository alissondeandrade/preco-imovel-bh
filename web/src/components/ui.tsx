import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export function Card({ title, subtitle, actions, children, className = "" }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, delta, hint }: { label: string; value: ReactNode; delta?: number | null; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-ink">{value}</div>
      {delta != null && isFinite(delta) && (
        <div className={`mt-1 text-xs font-medium ${delta >= 0 ? "text-up" : "text-down"}`}>
          {delta >= 0 ? "▲" : "▼"} {(Math.abs(delta) * 100).toFixed(1).replace(".", ",")}%
          <span className="ml-1 font-normal text-muted">{hint}</span>
        </div>
      )}
      {delta == null && hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = "md" }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-lg bg-surface-2 p-0.5" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`rounded-md font-medium transition ${size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"} ${
            value === o.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function useOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return ref;
}

/** Dropdown de múltipla escolha com busca opcional. */
export function MultiSelect({ label, options, value, onChange, searchable = false, max, allLabel = "Todos", align = "left" }: {
  label: string; options: { value: string; label: string; group?: string }[]; value: string[];
  onChange: (v: string[]) => void; searchable?: boolean; max?: number; allLabel?: string; align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useOutside(() => setOpen(false));
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const shown = useMemo(() => options.filter((o) => !q || norm(o.label).includes(norm(q))).slice(0, 300), [options, q]);
  const summary = value.length === 0 ? allLabel
    : value.length === 1 ? options.find((o) => o.value === value[0])?.label ?? value[0]
    : `${value.length} selecionados`;
  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else if (!max || value.length < max) onChange([...value, v]);
  };
  let lastGroup: string | undefined;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition ${
          value.length ? "border-accent/40 bg-accent/10 text-ink" : "border-line bg-surface text-ink-2 hover:text-ink"}`}>
        <span className="text-muted">{label}:</span>
        <span className="max-w-40 truncate font-medium">{summary}</span>
        <ChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <div className={`absolute z-30 mt-1 w-64 rounded-xl border border-line bg-surface p-1 shadow-xl ${align === "right" ? "right-0" : "left-0"}`}>
          {searchable && (
            <div className="flex items-center gap-2 border-b border-line px-2 pb-1">
              <Search size={14} className="text-muted" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…"
                className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted" />
            </div>
          )}
          <div className="max-h-72 overflow-auto py-1">
            {shown.map((o) => {
              const header = o.group && o.group !== lastGroup ? (lastGroup = o.group) : null;
              const on = value.includes(o.value);
              return (
                <div key={o.value}>
                  {header && <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{header}</div>}
                  <button onClick={() => toggle(o.value)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink hover:bg-surface-2">
                    <span className={`grid size-4 place-items-center rounded border ${on ? "border-accent bg-accent text-white" : "border-line"}`}>
                      {on && <Check size={12} strokeWidth={3} />}
                    </span>
                    {o.label}
                  </button>
                </div>
              );
            })}
            {!shown.length && <div className="px-2 py-3 text-sm text-muted">Nada encontrado</div>}
          </div>
          {value.length > 0 && (
            <button onClick={() => onChange([])} className="w-full border-t border-line px-2 py-2 text-left text-xs font-medium text-muted hover:text-ink">
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Combobox de escolha única com busca (ex.: bairro). */
export function Combo({ value, options, onChange, placeholder = "Selecione…" }: {
  value: string; options: { value: string; label: string; hint?: string }[]; onChange: (v: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useOutside(() => setOpen(false));
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const shown = options.filter((o) => !q || norm(o.label).includes(norm(q))).slice(0, 200);
  return (
    <div className="relative w-full sm:w-80" ref={ref}>
      <div className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-accent">
        <Search size={16} className="text-muted" />
        <input value={open ? q : value} placeholder={placeholder}
          onFocus={() => { setOpen(true); setQ(""); }} onChange={(e) => setQ(e.target.value)}
          className="w-full bg-transparent text-sm font-medium outline-none placeholder:font-normal placeholder:text-muted" />
        {value && !open && <button onClick={() => onChange("")} aria-label="Limpar"><X size={14} className="text-muted" /></button>}
      </div>
      {open && (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-line bg-surface p-1 shadow-xl">
          {shown.map((o) => (
            <button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink hover:bg-surface-2">
              <span>{o.label}</span>{o.hint && <span className="text-xs text-muted">{o.hint}</span>}
            </button>
          ))}
          {!shown.length && <div className="px-2 py-3 text-sm text-muted">Nada encontrado</div>}
        </div>
      )}
    </div>
  );
}

export function Spinner({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted">
      <span className="size-4 animate-spin rounded-full border-2 border-line border-t-accent" /> {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-muted">{children}</div>;
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-2">{children}</span>;
}
