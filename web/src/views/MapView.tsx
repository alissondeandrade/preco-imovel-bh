import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { ExpressionSpecification } from "maplibre-gl";
import { ArrowRight, X } from "lucide-react";
import type { Filters, MapMetric } from "../lib/state";
import { useMeta } from "../lib/meta";
import { cssVar, useQuery, useTheme } from "../lib/hooks";
import { m2, price, where } from "../lib/sql";
import { seriesSql, toSeries } from "../lib/queries";
import { fmtInt, fmtM2, fmtPct, fmtShort } from "../lib/format";
import { Card, Segmented, Spinner } from "../components/ui";
import { PriceBand } from "../components/charts";

// worker copiado de node_modules por "npm run vendor" (ver package.json)
maplibregl.setWorkerUrl(new URL("vendor/maplibre-gl-worker.mjs", document.baseURI).href);

const STYLE = { light: "https://tiles.openfreemap.org/styles/positron", dark: "https://tiles.openfreemap.org/styles/dark" };
const SEQ = ["--seq-0", "--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5", "--seq-6"];

interface Stat { bairro: string; n: number; med: number; ticket: number; var: number | null }

const METRICS: { value: MapMetric; label: string }[] = [
  { value: "m2", label: "R$/m²" },
  { value: "ticket", label: "Valor mediano" },
  { value: "n", label: "Nº de vendas" },
  { value: "var", label: "Variação" },
];

function fmtMetric(m: MapMetric, v: number | null | undefined) {
  if (m === "m2") return fmtM2(v);
  if (m === "ticket") return fmtShort(v);
  if (m === "n") return fmtInt(v);
  return fmtPct(v);
}

/** Quebras por quantis (classes com quantidade parecida de bairros). */
function quantileBreaks(vals: number[], k: number) {
  const s = [...vals].sort((a, b) => a - b);
  return Array.from({ length: k - 1 }, (_, i) => s[Math.floor(((i + 1) / k) * s.length)]);
}

export function MapView({ f, set }: { f: Filters; set: (p: Partial<Filters>) => void }) {
  const { bairros } = useMeta();
  const { theme } = useTheme();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const metric = f.metrica;

  const sql = `
    with b as (select bairro, ano, ${m2(f)} m2, ${price(f)} v from vendas ${where(f)} and area > 0)
    select bairro, count(*) filter (where ano = ${f.ate})::int n,
      median(m2) filter (where ano = ${f.ate}) med, median(v) filter (where ano = ${f.ate}) ticket,
      case when count(*) filter (where ano = ${f.de}) >= 10 and count(*) filter (where ano = ${f.ate}) >= 10 and ${f.de} < ${f.ate}
           then median(m2) filter (where ano = ${f.ate}) / median(m2) filter (where ano = ${f.de}) - 1 end as var
    from b group by 1`;
  const { data, loading } = useQuery<Stat>(sql);
  const stats = useMemo(() => new Map((data ?? []).map((d) => [d.bairro, d])), [data]);

  const value = (s?: Stat) => {
    if (!s) return null;
    if (metric === "n") return s.n;
    if (s.n < 5) return null;
    return metric === "m2" ? s.med : metric === "ticket" ? s.ticket : s.var;
  };

  const legend = useMemo(() => {
    const vals = [...stats.values()].map(value).filter((v): v is number => v != null && isFinite(v));
    if (!vals.length) return null;
    if (metric === "var") {
      // divergente com meio neutro em ±2%; cada lado dividido pelos quantis dos seus próprios valores
      const pos = vals.filter((v) => v > 0.02), neg = vals.filter((v) => v < -0.02).map((v) => -v);
      const [p1, p2] = pos.length >= 3 ? quantileBreaks(pos, 3) : [0.1, 0.2];
      const [n1, n2] = neg.length >= 3 ? quantileBreaks(neg, 3) : [0.1, 0.2];
      return { kind: "div" as const, breaks: [-n2, -n1, -0.02, 0.02, p1, p2] };
    }
    return { kind: "seq" as const, breaks: quantileBreaks(vals, 7) };
  }, [stats, metric]);

  const colors = useMemo(() => {
    void theme;
    if (legend?.kind === "div") {
      const neg = cssVar("--div-neg"), pos = cssVar("--div-pos"), mid = cssVar("--div-mid");
      return [neg, mix(neg, mid, 0.4), mix(neg, mid, 0.75), mid, mix(pos, mid, 0.75), mix(pos, mid, 0.4), pos];
    }
    return SEQ.map(cssVar);
  }, [legend?.kind, theme]);

  // cria o mapa (recria ao trocar tema, pois o estilo base muda)
  useEffect(() => {
    if (!box.current || !bairros) return;
    const m = new maplibregl.Map({
      container: box.current, style: STYLE[theme], center: [-43.95, -19.89], zoom: 10.6, attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    m.on("load", () => {
      m.addSource("bairros", { type: "geojson", data: bairros, promoteId: "nome" });
      const firstSymbol = m.getStyle().layers.find((l) => l.type === "symbol")?.id;
      m.addLayer({ id: "fill", type: "fill", source: "bairros", paint: { "fill-color": "#888", "fill-opacity": 0.78 } }, firstSymbol);
      m.addLayer({ id: "line", type: "line", source: "bairros", paint: {
        "line-color": theme === "dark" ? "#0d0d0d" : "#ffffff",
        "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2.5, 0.6] } }, firstSymbol);
      m.addLayer({ id: "sel", type: "line", source: "bairros", paint: { "line-color": cssVar("--ink"), "line-width": 2.5 }, filter: ["==", ["get", "nome"], ""] });
      const bounds = new maplibregl.LngLatBounds();
      bairros.features.forEach((ft) => (ft.geometry.type === "Polygon" ? [ft.geometry.coordinates] : ft.geometry.coordinates)
        .forEach((poly) => poly[0].forEach((c) => bounds.extend(c as [number, number]))));
      m.fitBounds(bounds, { padding: 20, duration: 0 });
      setLoaded((x) => x + 1);
    });
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
    let hovered: string | null = null;
    m.on("mousemove", "fill", (e) => {
      const ft = e.features?.[0];
      if (!ft) return;
      const id = ft.properties.nome as string;
      if (hovered && hovered !== id) m.setFeatureState({ source: "bairros", id: hovered }, { hover: false });
      hovered = id;
      m.setFeatureState({ source: "bairros", id }, { hover: true });
      m.getCanvas().style.cursor = "pointer";
      popup.setLngLat(e.lngLat).setHTML(tooltipRef.current(id, ft.properties.regional as string)).addTo(m);
    });
    m.on("mouseleave", "fill", () => {
      if (hovered) m.setFeatureState({ source: "bairros", id: hovered }, { hover: false });
      hovered = null; m.getCanvas().style.cursor = ""; popup.remove();
    });
    m.on("click", "fill", (e) => setSel((e.features?.[0]?.properties.nome as string) ?? null));
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, [bairros, theme]);

  // tooltip sempre com os dados atuais
  const tooltipRef = useRef<(id: string, reg: string) => string>(() => "");
  tooltipRef.current = (id, reg) => {
    const s = stats.get(id);
    const v = value(s);
    return `<div style="font:12px Inter,system-ui"><b>${id}</b><div style="color:var(--muted)">${reg}</div>` +
      `<div style="margin-top:4px;font-size:14px;font-weight:600">${v == null ? "Poucos dados" : fmtMetric(metric, v)}</div>` +
      `<div style="color:var(--muted)">${fmtInt(s?.n ?? 0)} vendas em ${f.ate}</div></div>`;
  };

  // aplica as cores
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded || !m.getLayer("fill") || !legend) return;
    const empty = cssVar("--surface-2");
    const match: unknown[] = ["match", ["get", "nome"]];
    for (const [b, s] of stats) {
      const v = value(s);
      if (v == null || !isFinite(v)) continue;
      let i = legend.breaks.findIndex((br) => v < br);
      if (i === -1) i = legend.breaks.length;
      match.push(b, colors[i]);
    }
    match.push(empty);
    m.setPaintProperty("fill", "fill-color", (match.length > 3 ? match : empty) as ExpressionSpecification);
  }, [stats, legend, colors, loaded, metric]);

  useEffect(() => {
    const m = map.current;
    if (m && loaded && m.getLayer("sel")) m.setFilter("sel", ["==", ["get", "nome"], sel ?? ""]);
  }, [sel, loaded]);

  const selStat = sel ? stats.get(sel) : undefined;
  const selReg = sel ? bairros?.features.find((x) => x.properties.nome === sel)?.properties.regional : "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented value={metric} onChange={(metrica) => set({ metrica })} options={METRICS} />
        <p className="text-xs text-muted">
          {metric === "var" ? `Variação da mediana de R$/m² entre ${f.de} e ${f.ate} (mín. 10 vendas em cada ano)` : `Vendas de ${f.ate} · mín. 5 vendas por bairro`}
        </p>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface">
        <div ref={box} className="h-[calc(100vh-260px)] min-h-[440px] w-full" />
        {loading && <div className="absolute left-3 top-3 rounded-lg bg-surface/90 px-2"><Spinner label="Calculando…" /></div>}
        {legend && (
          <div className="absolute bottom-3 left-3 rounded-xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur">
            <div className="mb-1.5 text-[11px] font-semibold text-ink-2">{METRICS.find((x) => x.value === metric)?.label}</div>
            <div className="flex">
              {colors.map((c, i) => <div key={i} className="h-2.5 w-10 first:rounded-l last:rounded-r" style={{ background: c }} />)}
            </div>
            {/* rótulos centralizados nas divisas entre as classes */}
            <div className="relative mt-1 h-3 text-[10px] text-muted tabular" style={{ width: colors.length * 40 }}>
              {legend.breaks.map((b, i) => (
                <span key={i} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: (i + 1) * 40 }}>
                  {metric === "var" ? `${b > 0 ? "+" : ""}${Math.round(b * 100)}%` : metric === "n" ? fmtInt(b) : short(b)}
                </span>
              ))}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted">
              <span className="inline-block size-2.5 rounded-sm" style={{ background: "var(--surface-2)" }} /> sem dados suficientes
            </div>
          </div>
        )}
        {sel && (
          <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-line bg-surface p-4 shadow-xl sm:inset-x-auto sm:right-3 sm:top-3 sm:bottom-auto sm:w-96">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-base font-semibold text-ink">{sel}</div>
                <div className="text-xs text-muted">{selReg}</div>
              </div>
              <button onClick={() => setSel(null)} aria-label="Fechar" className="text-muted hover:text-ink"><X size={18} /></button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Mini label={`R$/m² ${f.ate}`} value={fmtM2(selStat?.med).replace("/m²", "")} />
              <Mini label={`Valor ${f.ate}`} value={fmtShort(selStat?.ticket)} />
              <Mini label={`Vendas ${f.ate}`} value={fmtInt(selStat?.n ?? 0)} />
            </div>
            <SelSeries f={f} bairro={sel} />
            <button onClick={() => set({ view: "bairro", bairro: sel })}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90">
              Ver análise completa <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-surface-2 px-2 py-1.5"><div className="text-[10px] text-muted">{label}</div><div className="text-sm font-semibold text-ink">{value}</div></div>;
}

function SelSeries({ f, bairro }: { f: Filters; bairro: string }) {
  const g = { ...f, gran: "ano" as const, regionais: [] };
  const { data } = useQuery<any>(seriesSql(g, { bairros: [bairro] }));
  const rows = useMemo(() => toSeries(data, g), [data]);
  return <div className="mt-3">{data ? <PriceBand rows={rows} height={170} /> : <Spinner />}</div>;
}

const short = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1).replace(".", ",")}mi` : v >= 1000 ? `${(v / 1000).toFixed(1).replace(".", ",")}k` : String(Math.round(v)));

function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v * (1 - t) + y[i] * t).toString(16).padStart(2, "0")).join("");
}
