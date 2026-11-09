// DuckDB-WASM: carrega vendas.parquet uma vez na memória do navegador e responde consultas SQL.
import * as duckdb from "@duckdb/duckdb-wasm";
import mvpWasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import mvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import ehWasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import ehWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

export type Row = Record<string, unknown>;

let conn: duckdb.AsyncDuckDBConnection | null = null;
let ready: Promise<void> | null = null;

const dataUrl = (f: string) => new URL(`data/${f}`, document.baseURI).href;

export function initDb(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    const bundle = await duckdb.selectBundle({
      mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
      eh: { mainModule: ehWasm, mainWorker: ehWorker },
    });
    const worker = new Worker(bundle.mainWorker!);
    const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    conn = await db.connect();

    const buf = new Uint8Array(await (await fetch(dataUrl("vendas.parquet"))).arrayBuffer());
    await db.registerFileBuffer("vendas.parquet", buf);

    let ipca: { mes: string; indice: number }[] = [];
    try { ipca = await (await fetch(dataUrl("ipca.json"))).json(); } catch { /* opcional */ }
    await conn.query(`create table ipca (mes varchar, indice double)`);
    if (ipca.length) await conn.query(`insert into ipca values ${ipca.map((r) => `('${r.mes}', ${r.indice})`).join(",")}`);

    // "fator" corrige valores nominais para reais do último mês com IPCA publicado
    await conn.query(`
      create table vendas as
      select v.*, strftime(v.data, '%Y-%m') as mes, year(v.data) as ano,
             coalesce((select max_by(indice, mes) from ipca) / i.indice, 1.0) as fator
      from read_parquet('vendas.parquet') v left join ipca i on i.mes = strftime(v.data, '%Y-%m')`);
  })();
  return ready;
}

function plain(v: unknown): unknown {
  if (typeof v === "bigint") return Number(v);
  if (v && typeof v === "object" && "toArray" in (v as object)) return Array.from((v as { toArray(): unknown[] }).toArray(), plain);
  return v;
}

export async function query<T = Row>(sql: string): Promise<T[]> {
  await initDb();
  const res = await conn!.query(sql);
  const fields = res.schema.fields;
  const out: T[] = [];
  for (const row of res) {
    const o: Row = {};
    for (const f of fields) {
      let v = plain(row[f.name]);
      if (f.type.typeId === 8 /* Date */ && typeof v === "number") v = new Date(v).toISOString().slice(0, 10);
      o[f.name] = v;
    }
    out.push(o as T);
  }
  return out;
}

export const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;
