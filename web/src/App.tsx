import { lazy, Suspense, useEffect, useState } from "react";
import { BarChart3, Building2, Check, GitCompareArrows, Link2, Map, Moon, Signpost, Sun, Table2 } from "lucide-react";
import { useFilters, type View } from "./lib/state";
import { initDb } from "./lib/db";
import { useMeta } from "./lib/meta";
import { useTheme } from "./lib/hooks";
import { fmtDate, fmtInt } from "./lib/format";
import { FilterBar } from "./components/FilterBar";
import { Spinner } from "./components/ui";
import { Overview } from "./views/Overview";
import { Compare } from "./views/Compare";
import { Bairro } from "./views/Bairro";
import { Explore } from "./views/Explore";
import { Rua } from "./views/Rua";

// o mapa (MapLibre) é carregado só quando a aba é aberta
const MapView = lazy(() => import("./views/MapView").then((m) => ({ default: m.MapView })));

const TABS: { id: View; label: string; icon: typeof Map }[] = [
  { id: "geral", label: "Visão geral", icon: BarChart3 },
  { id: "mapa", label: "Mapa", icon: Map },
  { id: "comparar", label: "Comparar", icon: GitCompareArrows },
  { id: "bairro", label: "Bairro", icon: Building2 },
  { id: "rua", label: "Rua", icon: Signpost },
  { id: "explorar", label: "Vendas", icon: Table2 },
];

export function App() {
  const { f, set, reset } = useFilters();
  const { meta } = useMeta();
  const { theme, toggle } = useTheme();
  const [db, setDb] = useState<"loading" | "ready" | "error">("loading");
  const [copied, setCopied] = useState(false);

  useEffect(() => { initDb().then(() => setDb("ready"), (e) => { console.error(e); setDb("error"); }); }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [f.view]);

  const share = async () => {
    try { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  };

  return (
    <div className="min-h-screen">
      <header className="relative z-40 lg:sticky lg:top-0 border-b border-line bg-page/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-accent text-white"><Building2 size={18} /></div>
            <div className="whitespace-nowrap leading-tight">
              <div className="text-[15px] font-semibold text-ink">Preço Imóvel BH</div>
              <div className="hidden text-[11px] text-muted lg:block">Vendas registradas no ITBI · Prefeitura de Belo Horizonte</div>
            </div>
          </div>
          <nav className="ml-auto hidden gap-1 lg:flex">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => set({ view: t.id })}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${f.view === t.id ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"}`}>
                <t.icon size={16} /> {t.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 lg:ml-2">
            <button onClick={share} title="Copiar link com os filtros atuais" className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted hover:text-ink">
              {copied ? <Check size={16} /> : <Link2 size={16} />}<span className="hidden lg:inline">{copied ? "Copiado" : "Compartilhar"}</span>
            </button>
            <button onClick={toggle} aria-label="Alternar tema" className="rounded-lg p-1.5 text-muted hover:text-ink">
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-[1400px] px-4 pb-3 sm:px-6">
          <FilterBar f={f} set={set} reset={reset} />
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-5 sm:px-6 lg:pb-10">
        {db === "loading" && (
          <div className="grid place-items-center py-24 text-center">
            <span className="size-8 animate-spin rounded-full border-[3px] border-line border-t-accent" />
            <p className="mt-4 text-sm font-medium text-ink">Carregando {meta ? fmtInt(meta.registros) : ""} vendas…</p>
            <p className="mt-1 text-xs text-muted">Os dados são processados no seu navegador (~15 MB, só na primeira vez).</p>
          </div>
        )}
        {db === "error" && <p className="py-24 text-center text-sm text-down">Não foi possível carregar os dados. Recarregue a página.</p>}
        {db === "ready" && (
          <>
            {f.view === "geral" && <Overview f={f} set={set} />}
            {f.view === "mapa" && <Suspense fallback={<Spinner label="Carregando mapa…" />}><MapView f={f} set={set} /></Suspense>}
            {f.view === "comparar" && <Compare f={f} set={set} />}
            {f.view === "bairro" && <Bairro f={f} set={set} />}
            {f.view === "rua" && <Rua f={f} set={set} />}
            {f.view === "explorar" && <Explore f={f} set={set} />}
          </>
        )}
        <footer className="mt-10 border-t border-line pt-4 text-xs leading-relaxed text-muted">
          Fonte: <a className="underline hover:text-ink" href="https://ckan.pbh.gov.br/dataset/itbi-relatorios" target="_blank" rel="noreferrer">Portal de Dados Abertos da PBH — ITBI Relatórios</a>
          {meta && <> · {fmtDate(meta.periodo.inicio)} a {fmtDate(meta.periodo.fim)} · {fmtInt(meta.registros)} transações · atualizado em {new Date(meta.atualizado_em).toLocaleDateString("pt-BR")}</>}.
          {" "}Valores são os declarados ao fisco no pagamento do ITBI e podem diferir do preço anunciado. Estatísticas usam a mediana e desconsideram
          valores por m² muito distantes da mediana do bairro (ex.: compras parciais ou valores simbólicos). Correção monetária pelo IPCA (Banco Central, série 433).
        </footer>
      </main>

      {/* navegação inferior no celular */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => set({ view: t.id })}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${f.view === t.id ? "text-accent" : "text-muted"}`}>
            <t.icon size={20} /> {t.label.replace("Visão geral", "Geral")}
          </button>
        ))}
      </nav>
    </div>
  );
}
