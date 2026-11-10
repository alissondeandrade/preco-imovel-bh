# Preço Imóvel BH

Plataforma para analisar o histórico de preços de venda de imóveis em Belo Horizonte, a partir dos
[relatórios de ITBI da Prefeitura](https://ckan.pbh.gov.br/dataset/itbi-relatorios) (2008 até o mês mais recente publicado).

É um **site estático**: um pipeline em Node baixa e limpa os dados, e o navegador faz todas as
consultas localmente com DuckDB-WASM. Pode ser hospedado de graça (GitHub Pages, Netlify, Vercel).

## O que dá para fazer

| Aba | Conteúdo |
|---|---|
| **Visão geral** | Indicadores dos últimos 12 meses, evolução do R$/m² (mediana e faixa 25–75%), volume de vendas, ranking de bairros, recortes por padrão, idade e área |
| **Mapa** | Mapa por bairro: R$/m², valor mediano, nº de vendas ou variação entre dois anos. Clique num bairro para ver a série |
| **Comparar** | Até 5 bairros ou regionais no mesmo gráfico, com tabela-resumo |
| **Bairro** | Página completa de um bairro: indicadores, comparação com regional e cidade, preço × área, lista de vendas |
| **Rua** | Busca por rua/avenida com sugestões; indicadores e evolução na rua, comparação com o bairro, vendas agrupadas por número (prédio) e lista de vendas |
| **Vendas** | Tabela com todas as transações filtradas e exportação para CSV |

Filtros globais: período, tipo de imóvel, padrão de acabamento, regional, área, ano de construção,
valor declarado × base de cálculo e correção pelo IPCA. Os filtros ficam na URL — o botão
**Compartilhar** copia um link que abre exatamente a mesma visão.

## Como rodar

Requer Node 20+.

```bash
npm install
```

```bash
npm run data
```

```bash
npm run dev
```

`npm run data` baixa do CKAN apenas os arquivos novos ou alterados (controle em `data/raw/itbi/manifest.json`),
reprocessa tudo (~15 s) e grava em `web/public/data/`. Rode novamente todo mês, quando a PBH publicar um novo arquivo.

Para gerar o site de produção em `dist/`:

```bash
npm run build
```

Testes do pipeline:

```bash
npm test
```

## Estrutura

```
pipeline/            download (CKAN), limpeza (DuckDB/SQL), geometrias e IPCA
  build.ts           orquestra tudo → web/public/data
  sql.ts             leitura dos CSVs e campos derivados
  geo.ts             bairros/regionais (WKT EPSG:31983 → GeoJSON WGS84)
web/src/             front-end React + Tailwind + ECharts + MapLibre
  lib/db.ts          DuckDB-WASM no navegador
  lib/state.ts       filtros sincronizados com a URL
  views/             uma tela por aba
web/public/data/     dados gerados (vendas.parquet, bairros.geojson, meta.json, ipca.json)
```

## Metodologia (resumo)

- **Valor**: por padrão, o *valor declarado* na transação. A *base de cálculo* é, na prática, o maior entre o
  declarado e a avaliação da PBH; ficou praticamente congelada entre 2016 e 2020, por isso não é o padrão.
- **R$/m²**: valor ÷ área construída adquirida (para lote vago, área do terreno × fração ideal).
- **Estatísticas**: sempre a mediana. Ficam de fora vendas com R$/m² fora de 0,3×–3,5× a mediana do mesmo
  bairro/tipo/ano (compras parciais, valores simbólicos) e os extremos globais (0,5% inferior / 0,01% superior).
  Cerca de 94% dos registros passam nesse filtro; todas as abas (inclusive Vendas) usam só esses registros.
- **Bairros**: nomes do ITBI casados com os polígonos de *Bairro Popular* da PBH (99,99% das vendas).
  A regional de cada bairro vem do polígono da *Região Administrativa*.
- **Unidade e andar**: o complemento do endereço (ex.: `BLOCO 3 APT 1305`) é mantido. Para apartamentos e salas, o
  andar vem do "PAVMTO" quando informado ou das centenas do número da unidade com 3–4 dígitos (408 → 4º, 1305 → 13º).
  Números de 1–2 dígitos (ex.: `APT 32`) são ambíguos e ficam sem andar; valores acima de 35 são descartados
  (em geral, códigos em que o 1º dígito é o bloco). É uma estimativa: há prédios com numeração própria.
- **IPCA**: série 433 do Banco Central, corrigindo para o último mês disponível.
- **Lacuna na fonte**: há poucos registros entre 2014 e o 1º semestre de 2015, com acúmulo no 3º trimestre de 2015.

## Publicar para outras pessoas

O conteúdo de `dist/` é estático. O arquivo `.github/workflows/atualizar.yml` já está pronto: num repositório
no GitHub com o Pages ativado (Settings → Pages → Source: GitHub Actions), ele roda todo dia 20, atualiza os
dados e publica o site. Observação: o DuckDB-WASM pesa ~36 MB (≈8 MB comprimido), acima do limite de 25 MB
por arquivo do Cloudflare Pages; GitHub Pages, Netlify e Vercel funcionam.

Fonte dos dados: Prefeitura de Belo Horizonte — Portal de Dados Abertos. Os valores refletem o que foi declarado
ao fisco e podem diferir dos preços anunciados.
