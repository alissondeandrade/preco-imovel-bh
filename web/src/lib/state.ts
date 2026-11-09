// Estado global de filtros, sincronizado com a URL (links compartilháveis).
import { useCallback, useEffect, useState } from "react";

export type View = "geral" | "mapa" | "comparar" | "bairro" | "explorar";
export type Gran = "mes" | "trimestre" | "ano";
export type MapMetric = "m2" | "n" | "var" | "ticket";

export interface Filters {
  view: View;
  de: number;
  ate: number;
  tipos: string[];
  padroes: string[];
  regionais: string[];
  areaMin: number | null;
  areaMax: number | null;
  constrMin: number | null;
  constrMax: number | null;
  valor: "decl" | "base";
  real: boolean;
  gran: Gran;
  bairro: string;
  cmp: string[];
  metrica: MapMetric;
}

export const ANO_MIN = 2008;
export const ANO_MAX = new Date().getFullYear();

export const DEFAULTS: Filters = {
  view: "geral",
  de: 2015,
  ate: ANO_MAX,
  tipos: ["AP"],
  padroes: [],
  regionais: [],
  areaMin: null,
  areaMax: null,
  constrMin: null,
  constrMax: null,
  valor: "decl",
  real: false,
  gran: "trimestre",
  bairro: "",
  cmp: [],
  metrica: "m2",
};

const LIST_KEYS = ["tipos", "padroes", "regionais", "cmp"] as const;
const NUM_KEYS = ["de", "ate", "areaMin", "areaMax", "constrMin", "constrMax"] as const;

function fromUrl(): Filters {
  const p = new URLSearchParams(location.hash.replace(/^#\/?/, ""));
  const f: Filters = { ...DEFAULTS };
  for (const [k, v] of p) {
    if ((LIST_KEYS as readonly string[]).includes(k)) (f as unknown as Record<string, unknown>)[k] = v ? v.split(",") : [];
    else if ((NUM_KEYS as readonly string[]).includes(k)) (f as unknown as Record<string, unknown>)[k] = v === "" ? null : Number(v);
    else if (k === "real") f.real = v === "1";
    else if (k in f) (f as unknown as Record<string, unknown>)[k] = v;
  }
  return f;
}

function toUrl(f: Filters) {
  const p = new URLSearchParams();
  for (const k of Object.keys(DEFAULTS) as (keyof Filters)[]) {
    const v = f[k], d = DEFAULTS[k];
    if (JSON.stringify(v) === JSON.stringify(d)) continue;
    p.set(k, Array.isArray(v) ? v.join(",") : typeof v === "boolean" ? (v ? "1" : "0") : v == null ? "" : String(v));
  }
  const s = p.toString();
  history.replaceState(null, "", s ? `#${s}` : location.pathname + location.search);
}

export function useFilters() {
  const [f, setF] = useState<Filters>(fromUrl);
  useEffect(() => toUrl(f), [f]);
  useEffect(() => {
    const on = () => setF(fromUrl());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const set = useCallback((patch: Partial<Filters>) => setF((prev) => ({ ...prev, ...patch })), []);
  const reset = useCallback(() => setF((prev) => ({ ...DEFAULTS, view: prev.view, bairro: prev.bairro, cmp: prev.cmp })), []);
  return { f, set, reset };
}
