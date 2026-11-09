import { createContext, useContext, type ReactNode } from "react";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useJson } from "./hooks";

export interface Meta {
  atualizado_em: string;
  periodo: { inicio: string; fim: string };
  registros: number;
  validos: number;
  tipos: Record<string, { nome: string; grupo: string }>;
  vendas_por_mes: { mes: string; n: number }[];
  fonte: string;
}
export interface BairroProps { id: number; nome: string; regional: string; area_km2: number }
export type Bairros = FeatureCollection<Polygon | MultiPolygon, BairroProps>;

interface Ctx { meta: Meta | null; bairros: Bairros | null; regionais: string[] }
const MetaCtx = createContext<Ctx>({ meta: null, bairros: null, regionais: [] });

export function MetaProvider({ children }: { children: ReactNode }) {
  const meta = useJson<Meta>("meta.json");
  const bairros = useJson<Bairros>("bairros.geojson");
  const regionais = bairros ? [...new Set(bairros.features.map((f) => f.properties.regional))].filter(Boolean).sort() : [];
  return <MetaCtx.Provider value={{ meta, bairros, regionais }}>{children}</MetaCtx.Provider>;
}
export const useMeta = () => useContext(MetaCtx);

export const PADROES = [
  { value: "P1", label: "P1 · Baixo" },
  { value: "P2", label: "P2 · Normal baixo" },
  { value: "P3", label: "P3 · Normal" },
  { value: "P4", label: "P4 · Alto" },
  { value: "P5", label: "P5 · Luxo" },
];
