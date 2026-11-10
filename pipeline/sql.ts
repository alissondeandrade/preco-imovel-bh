// SQL de limpeza dos CSVs do ITBI. As colunas são lidas por posição porque os
// cabeçalhos variam entre os arquivos (espaços, acentos, nomes diferentes).

export const TIPOS: Record<string, { nome: string; grupo: string }> = {
  AP: { nome: "Apartamento", grupo: "Residencial" },
  CA: { nome: "Casa", grupo: "Residencial" },
  BA: { nome: "Barracão", grupo: "Residencial" },
  VR: { nome: "Vaga de garagem", grupo: "Residencial" },
  SL: { nome: "Sala", grupo: "Comercial" },
  LJ: { nome: "Loja", grupo: "Comercial" },
  AC: { nome: "Apto. comercial", grupo: "Comercial" },
  CC: { nome: "Casa comercial", grupo: "Comercial" },
  BC: { nome: "Barracão comercial", grupo: "Comercial" },
  GP: { nome: "Galpão", grupo: "Comercial" },
  VC: { nome: "Vaga comercial", grupo: "Comercial" },
  VV: { nome: "Vaga uso misto", grupo: "Comercial" },
  LV: { nome: "Lote vago", grupo: "Terreno" },
};

const COLS = [
  "endereco", "bairro", "ano_construcao", "area_terreno", "area_construida", "area_somada",
  "padrao", "fracao_ideal", "tipo", "ocupacao", "valor_declarado", "valor_base", "zona", "data",
];

/** "1.234,56" | "1234,56" | "1234" → 1234.56 */
export const num = (col: string) =>
  `try_cast(replace(replace(trim(${col}), '.', ''), ',', '.') as double)`;

export function cleanSql(glob: string) {
  const columns = COLS.map((c) => `'${c}': 'VARCHAR'`).join(", ");
  const tipos = Object.keys(TIPOS).map((t) => `'${t}'`).join(",");
  return `
  create table stage as
  with src as (
    select * from read_csv('${glob}', delim=';', header=true, quote='"', columns={${columns}})
  ), parsed as (
    select
      strptime(trim(data), '%d/%m/%Y')::date                                    as data,
      nullif(upper(trim(bairro)), '')                                            as bairro_raw,
      case when trim(tipo) in (${tipos}) then trim(tipo) end                     as tipo,
      case trim(ocupacao) when 'RESIDENCIAL' then 'Residencial'
           when 'NAO RESIDENCIAL' then 'Não residencial'
           when 'TERRITORIAL' then 'Territorial' end                             as ocupacao,
      case when trim(padrao) in ('P1','P2','P3','P4','P5') then trim(padrao) end as padrao,
      case when try_cast(ano_construcao as int) between 1880 and 2030
           then try_cast(ano_construcao as int) end                             as ano_construcao,
      ${num("area_terreno")}                                                     as area_terreno,
      ${num("area_construida")}                                                  as area_construida,
      ${num("fracao_ideal")}                                                     as fracao_ideal,
      ${num("valor_declarado")}                                                  as valor_declarado,
      ${num("valor_base")}                                                       as valor_base,
      nullif(trim(zona), '')                                                     as zona,
      -- endereço: "LOGRADOURO NUM - COMPLEMENTO - BAIRRO - CEP - BELO HORIZONTE - MG"
      trim(split_part(endereco, ' - ', 1))                                       as logradouro,
      -- complemento = tudo entre o logradouro e o bairro (pode conter " - ", ex.: "APT 701 - TORRE 2")
      nullif(trim(array_to_string(list_slice(string_split(endereco, ' - '), 2,
             len(string_split(endereco, ' - ')) - 4), ' - ')), '')              as complemento,
      regexp_extract(endereco, '(\\d{5}-\\d{3})')                                as cep
    from src
  ), unid as (
    select *,
      -- número da unidade: "APT 408 BLOCO 2" → "408"; "SALA 1704" → "1704"
      nullif(regexp_extract(complemento, '(APT|APTO|SALA|LOJA|CASA|GARAGE|COB|COBERTURA|LJ|SL|LOTE)\\.? *([0-9]+[A-Z]?)', 2), '') as unidade,
      try_cast(nullif(regexp_extract(complemento, 'PAVMTO *([0-9]+)', 1), '') as int) as pavimento
    from parsed
  ), final as (
  select * exclude (pavimento),
    -- andar (só apartamentos e salas): "PAVMTO n" quando informado; senão centenas da unidade
    -- com 3–4 dígitos (408 → 4, 1305 → 13). Unidades de 1–2 dígitos são ambíguas e ficam sem andar.
    -- Acima de 35 (ex.: "4001", em que o 1º dígito é o bloco) o valor é descartado em "andar".
    case when tipo in ('AP', 'SL', 'AC') then coalesce(pavimento,
      case when length(regexp_extract(unidade, '^[0-9]+')) between 3 and 4
           then try_cast(regexp_extract(unidade, '^[0-9]+') as int) // 100 end) end as andar_bruto,
    -- "RUA DA BAHIA 1192" → rua "RUA DA BAHIA", número "1192" (sem número: rua = logradouro)
    coalesce(nullif(regexp_extract(logradouro, '^(.*?) +([0-9]+[^ ]*)$', 1), ''), logradouro) as rua,
    nullif(regexp_extract(logradouro, '^(.*?) +([0-9]+[^ ]*)$', 2), '')                   as numero,
    -- área usada para R$/m²: construída; para lote vago, terreno × fração ideal
    case when tipo = 'LV' then nullif(round(area_terreno * coalesce(fracao_ideal, 1), 2), 0)
         when area_construida >= 5 then area_construida end                    as area,
    valor_declarado / case when tipo = 'LV' then nullif(area_terreno * coalesce(fracao_ideal, 1), 0)
         when area_construida >= 5 then area_construida end                    as m2_decl
  from unid
  where data is not null and tipo is not null and valor_declarado > 0
  )
  select * exclude (andar_bruto), case when andar_bruto <= 35 then andar_bruto end as andar from final`;
}
