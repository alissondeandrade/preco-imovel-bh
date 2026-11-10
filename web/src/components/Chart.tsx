import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, BoxplotChart, LineChart, ScatterChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { LegacyGridContainLabel } from "echarts/features";
import type { EChartsCoreOption } from "echarts/core";
import { cssVar, useTheme } from "../lib/hooks";

echarts.use([LegacyGridContainLabel, BarChart, BoxplotChart, LineChart, ScatterChart, DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, CanvasRenderer]);

export interface Palette {
  ink: string; ink2: string; muted: string; grid: string; axis: string; surface: string;
  series: string[]; accent: string;
}
export function palette(): Palette {
  return {
    ink: cssVar("--ink"), ink2: cssVar("--ink-2"), muted: cssVar("--muted"), grid: cssVar("--grid"),
    axis: cssVar("--axis"), surface: cssVar("--surface"), accent: cssVar("--accent"),
    series: ["--s1", "--s2", "--s3", "--s4", "--s5"].map(cssVar),
  };
}

/** Eixos/tooltip padrão: grade discreta, texto em tinta neutra. */
export function baseOption(p: Palette): EChartsCoreOption {
  return {
    animationDuration: 300,
    textStyle: { fontFamily: "Inter, system-ui, sans-serif", color: p.ink2 },
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis", backgroundColor: p.surface, borderColor: p.grid, textStyle: { color: p.ink, fontSize: 12 },
      axisPointer: { type: "line", lineStyle: { color: p.axis } },
    },
    xAxis: { axisLine: { lineStyle: { color: p.axis } }, axisTick: { show: false }, axisLabel: { color: p.muted } },
    yAxis: { splitLine: { lineStyle: { color: p.grid } }, axisLabel: { color: p.muted } },
  };
}

export function Chart({ build, height = 280, deps }: { build: (p: Palette) => EChartsCoreOption; height?: number; deps: unknown[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!ref.current) return;
    inst.current = echarts.init(ref.current);
    const ro = new ResizeObserver(() => inst.current?.resize());
    ro.observe(ref.current);
    return () => { ro.disconnect(); inst.current?.dispose(); inst.current = null; };
  }, []);

  useEffect(() => {
    inst.current?.setOption(build(palette()), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, ...deps]);

  return <div ref={ref} style={{ height }} className="w-full min-w-0 overflow-hidden" />;
}
