// Pipeline completo: CKAN → limpeza (DuckDB) → web/public/data/{vendas.parquet, bairros.geojson, ...}
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { packageResources, syncPackageCsvs, decodeText } from "./ckan.ts";
import { buildBairros, buildRegionais } from "./geo.ts";
import { normalizeName } from "./normalize.ts";
import { fetchIpca } from "./ipca.ts";
import { cleanSql, TIPOS } from "./sql.ts";

const RAW = "data/raw";
const OUT = "web/public/data";
const downloadOnly = process.argv.includes("--download-only");

async function latestCsv(pkg: string, file: string): Promise<string> {
  const path = join(RAW, file);
  if (!existsSync(path)) {
    const res = (await packageResources(pkg)).filter((r) => r.format.toUpperCase() === "CSV");
    const latest = res.sort((a, b) => (a.created < b.created ? -1 : 1)).pop()!;
    console.log(`  ↓ ${pkg}: ${latest.name}`);
    const buf = Buffer.from(await (await fetch(latest.url)).arrayBuffer());
    writeFileSync(path, decodeText(buf), "utf8");
  }
  return readFileSync(path, "utf8");
}

async function main() {
  mkdirSync(RAW, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  console.log("1/5 Sincronizando ITBI com o CKAN…");
  const files = await syncPackageCsvs("itbi-relatorios", join(RAW, "itbi"));
  console.log(`    ${files.length} arquivos CSV`);
  if (downloadOnly) return;

  console.log("2/5 Geometrias de bairros e regionais…");
  const bairros = buildBairros(await latestCsv("bairro-popular", "bairro_popular.csv"), await latestCsv("regiao-administrativa", "regional.csv"));
  const regionais = buildRegionais(readFileSync(join(RAW, "regional.csv"), "utf8"));
  writeFileSync(join(OUT, "bairros.geojson"), JSON.stringify(bairros));
  writeFileSync(join(OUT, "regionais.geojson"), JSON.stringify(regionais));

  console.log("3/5 Limpando e consolidando transações…");
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  // tabela de bairros (chave normalizada → nome oficial + regional)
  await c.run(`create table bairro_ref (key varchar, nome varchar, regional varchar)`);
  const ins = await c.prepare(`insert into bairro_ref values ($1, $2, $3)`);
  for (const f of bairros.features) {
    ins.bindVarchar(1, f.properties.key); ins.bindVarchar(2, f.properties.nome); ins.bindVarchar(3, f.properties.regional);
    await ins.run();
  }
  // a normalização de nomes é feita em JS para garantir a mesma regra dos polígonos
  const globPath = join(RAW, "itbi", "*.csv").replace(/\\/g, "/");
  await c.run(cleanSql(globPath));
  const names = (await c.runAndReadAll(`select distinct bairro_raw from stage where bairro_raw is not null`)).getRows().map((r) => String(r[0]));
  await c.run(`create table bairro_map (bairro_raw varchar, key varchar)`);
  const insMap = await c.prepare(`insert into bairro_map values ($1, $2)`);
  for (const n of names) { insMap.bindVarchar(1, n); insMap.bindVarchar(2, normalizeName(n)); await insMap.run(); }

  await c.run(`
    create table vendas as
    with j as (
      select s.*, coalesce(b.nome, s.bairro_raw) as bairro, b.regional,
             b.nome is not null as bairro_mapa
      from stage s left join bairro_map m using (bairro_raw) left join bairro_ref b on b.key = m.key
    ),
    -- limites globais por tipo/ano: só os extremos (valores simbólicos, erros de digitação)
    lim as (
      select tipo, year(data) ano, quantile_cont(m2_decl, 0.005) lo, quantile_cont(m2_decl, 0.9999) hi
      from j where m2_decl is not null group by all
    ),
    -- limites locais: R$/m² muito distante da mediana do próprio bairro/tipo/ano
    loc as (
      select bairro, tipo, year(data) ano, median(m2_decl) med, count(*) n
      from j where m2_decl is not null group by all
    )
    select j.* exclude (bairro_raw, bairro_mapa, m2_decl),
           (j.bairro_mapa and j.m2_decl between lim.lo and lim.hi
             and (loc.n < 10 or j.m2_decl between 0.3 * loc.med and 3.5 * loc.med)) as valido
    from j
    left join lim on lim.tipo = j.tipo and lim.ano = year(j.data)
    left join loc on loc.bairro = j.bairro and loc.tipo = j.tipo and loc.ano = year(j.data)
    order by data, bairro`);

  const stats = (await c.runAndReadAll(`
    select count(*)::int n, count(*) filter (where valido)::int validos, min(data)::varchar ini, max(data)::varchar fim,
           count(*) filter (where regional is null)::int sem_bairro from vendas`)).getRowObjectsJson()[0];
  console.log("   ", stats);
  const unmatched = (await c.runAndReadAll(`select bairro, count(*)::int n from vendas where regional is null group by 1 order by 2 desc`)).getRowObjectsJson();
  writeFileSync(join(RAW, "bairros_nao_casados.json"), JSON.stringify(unmatched, null, 2));

  console.log("4/5 Gravando Parquet…");
  const pq = join(OUT, "vendas.parquet").replace(/\\/g, "/");
  if (existsSync(pq)) rmSync(pq);
  await c.run(`copy (select * from vendas) to '${pq}' (format parquet, compression zstd, row_group_size 100000)`);
  console.log(`    ${(statSync(pq).size / 1e6).toFixed(1)} MB`);

  console.log("5/5 IPCA e metadados…");
  let ipca: { mes: string; indice: number }[] = [];
  try { ipca = await fetchIpca(); } catch (e) { console.warn("    IPCA indisponível:", (e as Error).message); }
  if (ipca.length) writeFileSync(join(OUT, "ipca.json"), JSON.stringify(ipca));

  const perMonth = (await c.runAndReadAll(`select strftime(data, '%Y-%m') mes, count(*)::int n from vendas group by 1 order by 1`)).getRowObjectsJson();
  writeFileSync(join(OUT, "meta.json"), JSON.stringify({
    atualizado_em: new Date().toISOString(),
    periodo: { inicio: stats.ini, fim: stats.fim },
    registros: stats.n,
    validos: stats.validos,
    arquivos: files.map((f) => f.name),
    tipos: TIPOS,
    vendas_por_mes: perMonth,
    fonte: "https://ckan.pbh.gov.br/dataset/itbi-relatorios",
  }, null, 1));
  console.log("Pronto ✔");
}

main().catch((e) => { console.error(e); process.exit(1); });
