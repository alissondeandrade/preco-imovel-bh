// IPCA mensal (Banco Central, SGS série 433) convertido em número-índice acumulado (base = 100 no primeiro mês).
export async function fetchIpca(desde = "01/01/2008"): Promise<{ mes: string; indice: number }[]> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=${desde}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`BCB HTTP ${res.status}`);
  const rows = (await res.json()) as { data: string; valor: string }[];
  let idx = 100;
  return rows.map((r) => {
    const [, m, y] = r.data.split("/");
    idx *= 1 + Number(r.valor) / 100;
    return { mes: `${y}-${m}`, indice: Math.round(idx * 1000) / 1000 };
  });
}
