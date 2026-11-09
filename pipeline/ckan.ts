// Download incremental dos recursos do portal de dados abertos da PBH (CKAN).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const CKAN = "https://ckan.pbh.gov.br/api/3/action";

export interface CkanResource {
  id: string;
  name: string;
  format: string;
  url: string;
  last_modified: string | null;
  created: string;
}

export async function packageResources(pkg: string): Promise<CkanResource[]> {
  const res = await fetch(`${CKAN}/package_show?id=${encodeURIComponent(pkg)}`);
  if (!res.ok) throw new Error(`CKAN ${pkg}: HTTP ${res.status}`);
  const json = (await res.json()) as { result: { resources: CkanResource[] } };
  return json.result.resources;
}

/** Decodifica como UTF-8; se inválido, cai para Latin-1 (alguns arquivos da PBH vêm em ISO-8859-1). */
export function decodeText(buf: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("latin1").decode(buf);
  }
}

interface ManifestEntry { id: string; name: string; file: string; version: string }
type Manifest = Record<string, ManifestEntry>;

/**
 * Baixa para `dir` todos os CSVs do pacote que ainda não estão no manifesto
 * (ou que mudaram de versão). Arquivos são gravados normalizados em UTF-8.
 * Retorna a lista de arquivos locais na ordem do portal.
 */
export async function syncPackageCsvs(pkg: string, dir: string, log = console.log): Promise<ManifestEntry[]> {
  mkdirSync(dir, { recursive: true });
  const manifestPath = join(dir, "manifest.json");
  const manifest: Manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
  const resources = (await packageResources(pkg)).filter((r) => r.format.toUpperCase() === "CSV");
  const out: ManifestEntry[] = [];

  for (const r of resources) {
    const version = r.last_modified ?? r.created;
    const file = decodeURIComponent(r.url.split("/").pop() || `${r.id}.csv`);
    const prev = manifest[r.id];
    if (prev && prev.version === version && existsSync(join(dir, prev.file))) {
      out.push(prev);
      continue;
    }
    log(`  ↓ ${r.name}`);
    const res = await fetch(r.url);
    if (!res.ok) throw new Error(`Falha ao baixar ${r.url}: HTTP ${res.status}`);
    const text = decodeText(Buffer.from(await res.arrayBuffer()));
    writeFileSync(join(dir, file), text, "utf8");
    manifest[r.id] = { id: r.id, name: r.name, file, version };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    out.push(manifest[r.id]);
  }
  return out;
}
