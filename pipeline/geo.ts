// Geometrias de bairros e regionais (CSV com WKT em EPSG:31983) → GeoJSON WGS84.
import proj4 from "proj4";
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import { normalizeName } from "./normalize.ts";

const UTM23S = "+proj=utm +zone=23 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";
const toWgs = proj4(UTM23S, "EPSG:4326");

/** Parser mínimo de WKT para POLYGON / MULTIPOLYGON. */
export function parseWkt(wkt: string): Polygon | MultiPolygon {
  const s = wkt.trim();
  const type = s.slice(0, s.indexOf("(")).trim().toUpperCase();
  const body = s.slice(s.indexOf("("));
  const ring = (txt: string): Position[] =>
    txt.split(",").map((p) => {
      const [x, y] = p.trim().split(/\s+/).map(Number);
      const [lon, lat] = toWgs.forward([x, y]);
      return [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6];
    });
  const polygon = (txt: string): Position[][] =>
    [...txt.matchAll(/\(([^()]+)\)/g)].map((m) => ring(m[1]));
  if (type === "POLYGON") return { type: "Polygon", coordinates: polygon(body) };
  if (type === "MULTIPOLYGON") {
    // divide em "((...),(...))" por nível de parênteses
    const polys: string[] = [];
    let depth = 0, start = -1;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (ch === "(") { depth++; if (depth === 2) start = i; }
      else if (ch === ")") { if (depth === 2) polys.push(body.slice(start, i + 1)); depth--; }
    }
    return { type: "MultiPolygon", coordinates: polys.map(polygon) };
  }
  throw new Error(`WKT não suportado: ${type}`);
}

/** Parser de CSV simples com suporte a campos entre aspas. */
export function parseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function detectDelim(text: string) {
  const head = text.slice(0, text.indexOf("\n"));
  return head.split(";").length > head.split(",").length ? ";" : ",";
}

function readFeatures(text: string): { props: Record<string, string>; geom: Polygon | MultiPolygon }[] {
  const rows = parseCsv(text.replace(/^﻿/, ""), detectDelim(text));
  const header = rows[0].map((h) => h.trim().toUpperCase());
  const gi = header.indexOf("GEOMETRIA");
  return rows.slice(1).map((r) => ({
    props: Object.fromEntries(header.map((h, i) => [h, r[i]])),
    geom: parseWkt(r[gi]),
  }));
}

export interface BairroProps {
  id: number;
  codigo: string;
  nome: string;
  key: string;
  regional: string;
  area_km2: number;
}

export function buildBairros(bairroCsv: string, regionalCsv: string): FeatureCollection<Polygon | MultiPolygon, BairroProps> {
  const regionais = readFeatures(regionalCsv).map((f) => ({
    nome: titleCase(f.props.NOME),
    feature: turf.feature(f.geom),
  }));
  const features = readFeatures(bairroCsv).map((f) => {
    const feat = turf.feature(f.geom) as Feature<Polygon | MultiPolygon>;
    const pt = turf.pointOnFeature(feat);
    const reg = regionais.find((r) => turf.booleanPointInPolygon(pt, r.feature as Feature<Polygon | MultiPolygon>));
    const simplified = turf.simplify(feat, { tolerance: 0.00008, highQuality: true });
    return {
      type: "Feature" as const,
      geometry: simplified.geometry,
      properties: {
        id: Number(f.props.ID),
        codigo: f.props.CODIGO,
        nome: f.props.NOME.trim(),
        key: normalizeName(f.props.NOME),
        regional: reg?.nome ?? "",
        area_km2: Number(f.props.AREA_KM2),
      },
    };
  });
  return { type: "FeatureCollection", features };
}

export function buildRegionais(regionalCsv: string): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: readFeatures(regionalCsv).map((f) => ({
      type: "Feature",
      geometry: turf.simplify(turf.feature(f.geom), { tolerance: 0.0001, highQuality: true }).geometry,
      properties: { nome: titleCase(f.props.NOME), sigla: f.props.SIGLA },
    })),
  };
}

export function titleCase(s: string) {
  const lower = new Set(["de", "da", "do", "das", "dos", "e"]);
  return s.trim().toLowerCase().split(/\s+/)
    .map((w, i) => (i > 0 && lower.has(w) ? w : w.replace(/(^|-)(\p{L})/gu, (_, a, b) => a + b.toUpperCase())))
    .join(" ");
}
