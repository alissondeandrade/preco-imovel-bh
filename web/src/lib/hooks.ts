import { useEffect, useState } from "react";
import { query } from "./db";

/** Executa uma consulta SQL sempre que o texto muda; descarta respostas obsoletas. */
export function useQuery<T>(sql: string | null) {
  const [state, setState] = useState<{ data: T[] | null; loading: boolean; error: string | null }>({ data: null, loading: !!sql, error: null });
  useEffect(() => {
    if (!sql) { setState({ data: null, loading: false, error: null }); return; }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    query<T>(sql).then(
      (data) => alive && setState({ data, loading: false, error: null }),
      (e) => alive && setState({ data: null, loading: false, error: String(e?.message ?? e) }),
    );
    return () => { alive = false; };
  }, [sql]);
  return state;
}

export function useJson<T>(file: string) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    fetch(new URL(`data/${file}`, document.baseURI).href).then((r) => r.json()).then(setData).catch(() => setData(null));
  }, [file]);
  return data;
}

export type Theme = "light" | "dark";
function current(): Theme {
  const t = document.documentElement.dataset.theme;
  if (t === "light" || t === "dark") return t;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(current);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setTheme(current());
    mq.addEventListener("change", on);
    const obs = new MutationObserver(on);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { mq.removeEventListener("change", on); obs.disconnect(); };
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch { /* ignore */ }
  };
  return { theme, toggle };
}

/** Lê uma variável CSS do tema atual. */
export const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
