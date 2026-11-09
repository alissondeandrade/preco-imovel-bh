import { describe, expect, it } from "vitest";
import { DuckDBInstance } from "@duckdb/node-api";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanSql } from "../sql.ts";
import { looseKey, normalizeName } from "../normalize.ts";
import { decodeText } from "../ckan.ts";
import { parseCsv, parseWkt, titleCase } from "../geo.ts";

const HEADER = "Endereco;Bairro;Ano;AT;AC;AS;Padrao;Fracao;Tipo;Ocup;Decl;Base;Zona;Data";

async function clean(lines: string[]) {
  const dir = mkdtempSync(join(tmpdir(), "itbi-"));
  writeFileSync(join(dir, "a.csv"), [HEADER, ...lines].join("\n"));
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run(cleanSql(join(dir, "*.csv").replace(/\\/g, "/")));
  return (await c.runAndReadAll("select * from stage")).getRowObjectsJson() as Record<string, any>[];
}

describe("limpeza SQL", () => {
  it("lê números com vírgula decimal e ponto de milhar", async () => {
    const [r] = await clean([
      "AVE AFONSO PENA 3924 - APT 60 - CRUZEIRO - 30130-009 - BELO HORIZONTE - MG;CRUZEIRO;1976;1.119,00;128,5;128,5;P3;0,00447;AP;RESIDENCIAL;1.250.000,00;1.300.000,50;ZA;02/01/2008",
    ]);
    expect(r.area_terreno).toBe(1119);
    expect(r.area_construida).toBe(128.5);
    expect(r.valor_declarado).toBe(1250000);
    expect(r.valor_base).toBe(1300000.5);
    expect(r.fracao_ideal).toBeCloseTo(0.00447);
    expect(String(r.data)).toBe("2008-01-02");
  });

  it("remove complemento do endereço e extrai CEP", async () => {
    const [r] = await clean([
      "AVE ALVARES CABRAL 1181 - APT 408 - LOURDES - 30170-004 - BELO HORIZONTE - MG;LOURDES;1998;1265,78;79,6;79,6;P5;0,008271;AP;RESIDENCIAL;430000;430000;ZCBH;01/09/2026",
    ]);
    expect(r.logradouro).toBe("AVE ALVARES CABRAL 1181");
    expect(r.cep).toBe("30170-004");
    expect(r.area).toBe(79.6);
    expect(Number(r.m2_decl)).toBeCloseTo(430000 / 79.6);
  });

  it("lote vago usa área do terreno × fração ideal", async () => {
    const [r] = await clean(["RUA X 10 - BURITIS - 30000-000 - BELO HORIZONTE - MG;BURITIS;0;400;0;0;TE;0,5;LV;TERRITORIAL;200000;200000;ZAR2;10/05/2020"]);
    expect(r.area).toBe(200);
    expect(r.ano_construcao).toBeNull();
    expect(r.padrao).toBeNull();
  });

  it("descarta linhas sem tipo válido ou sem valor", async () => {
    const rows = await clean([
      "RUA A 1;CENTRO;2000;100;50;50;P3;1;-3;VALOR NULO;100000;100000;ZA;01/01/2020",
      "RUA B 2;CENTRO;2000;100;50;50;P3;1;AP;RESIDENCIAL;0;100000;ZA;01/01/2020",
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe("nomes de bairro", () => {
  it("normaliza acentos, caixa e espaços", () => {
    expect(normalizeName("  São  Cristóvão ")).toBe("SAO CRISTOVAO");
    expect(normalizeName("Sagrada Família")).toBe(normalizeName("SAGRADA FAMILIA"));
  });
  it("chave solta expande abreviações e algarismos romanos", () => {
    expect(looseKey("STA EFIGENIA")).toBe(looseKey("Santa Efigênia"));
    expect(looseKey("Conjunto Califórnia II")).toBe("CONJUNTO CALIFORNIA 2");
  });
  it("title case de regionais", () => {
    expect(titleCase("CENTRO-SUL")).toBe("Centro-Sul");
    expect(titleCase("VENDA NOVA")).toBe("Venda Nova");
  });
});

describe("utilitários", () => {
  it("decodifica Latin-1 quando o arquivo não é UTF-8", () => {
    expect(decodeText(Buffer.from([0x53, 0xe3, 0x6f]))).toBe("São");
    expect(decodeText(Buffer.from("﻿São", "utf8"))).toBe("São");
  });
  it("lê CSV com aspas", () => {
    expect(parseCsv('a,b\n1,"x, y"\n', ",")).toEqual([["a", "b"], ["1", "x, y"]]);
  });
  it("converte WKT UTM 23S para lat/long em BH", () => {
    const g = parseWkt("POLYGON ((611000 7797000, 612000 7797000, 612000 7798000, 611000 7797000))");
    const [lon, lat] = g.coordinates[0][0] as number[];
    expect(lon).toBeGreaterThan(-44.1); expect(lon).toBeLessThan(-43.8);
    expect(lat).toBeGreaterThan(-20.1); expect(lat).toBeLessThan(-19.7);
  });
});
