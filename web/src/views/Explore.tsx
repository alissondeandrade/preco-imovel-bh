import { useMemo } from "react";
import type { Filters } from "../lib/state";
import { useMeta } from "../lib/meta";
import { Card, MultiSelect } from "../components/ui";
import { SalesTable } from "../components/SalesTable";

export function Explore({ f, set }: { f: Filters; set: (p: Partial<Filters>) => void }) {
  const { bairros } = useMeta();
  const opts = useMemo(() => (bairros?.features ?? [])
    .map((x) => ({ value: x.properties.nome, label: x.properties.nome, group: x.properties.regional }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label)), [bairros]);
  return (
    <Card title="Explorar vendas" subtitle="Todas as transações que atendem aos filtros. Clique nos cabeçalhos para ordenar."
      actions={<MultiSelect label="Bairros" searchable align="right" options={opts} value={f.cmp} onChange={(cmp) => set({ cmp })} />}>
      <SalesTable f={f} bairros={f.cmp.length ? f.cmp : undefined} />
    </Card>
  );
}
