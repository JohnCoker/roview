import { useRef } from "react";
import ReactECharts from "echarts-for-react";
import { connect } from "echarts";
import type { ECharts } from "echarts";
import type { RunFile } from "./RunFile";
import { formatVal } from "./util";

export interface ChartGridProps {
  runFile: RunFile;
  selectedColumnNames: string[];
}

export function ChartGrid({ runFile, selectedColumnNames }: ChartGridProps) {
  const chartRefs = useRef<ECharts[]>([]);
  const prevSelectionRef = useRef<string[]>([]);

  const timeCol = runFile.timeColumn();
  if (!timeCol || selectedColumnNames.length === 0) {
    return (
      <p className="chart-grid-empty">Select columns above to add charts.</p>
    );
  }

  // Reset collected instances when the set of charts changes
  const selectionChanged =
    prevSelectionRef.current.length !== selectedColumnNames.length ||
    prevSelectionRef.current.some((n, i) => n !== selectedColumnNames[i]);
  if (selectionChanged) {
    prevSelectionRef.current = [...selectedColumnNames];
    chartRefs.current = [];
  }

  const handleChartReady = (chart: ECharts) => {
    chartRefs.current.push(chart);
    if (chartRefs.current.length === selectedColumnNames.length) {
      connect(chartRefs.current);
    }
  };

  const timeValues = runFile.getColumnValues(timeCol.name) as (number | null)[];

  return (
    <div className="chart-grid" key={selectedColumnNames.join(",")}>
      {selectedColumnNames.map((colName) => {
        const col = runFile.getColumn(colName);
        if (!col) return null;
        const yValues = runFile.getColumnValues(col.name);
        const data: (number | null)[][] = timeValues
          .map((t, i) => (t != null ? [t, yValues[i] ?? null] : null))
          .filter((p): p is [number, number | null] => p != null);

        const timeKind = timeCol.kind();
        const timeUnit = timeCol.unit();
        const colKind = col.kind();
        const colUnit = col.unit();

        const option = {
          // Use a fixed left margin so all Y axes align visually across charts.
          grid: { left: 100, right: 10, top: 8, bottom: 8, containLabel: false },
          tooltip: {
            trigger: "axis" as const,
            axisPointer: { type: "line" as const },
            formatter: (params: any) => {
              const p = Array.isArray(params) ? params[0] : params;
              const value = Array.isArray(p?.value) ? p.value : [p?.value, null];
              const time = value[0] as number | null | undefined;
              const y = value[1] as number | null | undefined;

              const timeLabel = `${timeKind}: ${formatVal(time)}${
                timeUnit ? ` ${timeUnit}` : ""
              }`;
              const colLabel = `${colKind}: ${formatVal(y)}${
                colUnit ? ` ${colUnit}` : ""
              }`;

              return `${timeLabel}<br/>${colLabel}`;
            },
          },
          xAxis: {
            type: "value" as const,
            name: "",
            nameGap: 0,
            splitLine: { show: false },
          },
          yAxis: {
            type: "value" as const,
            name: col.name,
            nameLocation: "middle",
            nameGap: 50,
            nameRotate: 90,
            splitLine: { show: true, lineStyle: { opacity: 0.3 } },
          },
          dataZoom: [
            {
              type: "inside",
              xAxisIndex: 0,
              zoomOnMouseWheel: "ctrl",
              moveOnMouseWheel: false,
              moveOnMouseMove: false,
              zoomLock: true,
            },
          ],
          series: [
            {
              type: "line" as const,
              data,
              symbol: "none",
              connectNulls: false,
            },
          ],
        };

        return (
          <div key={col.name} className="chart-grid-item">
            <ReactECharts
              option={option}
              style={{ width: "100%", aspectRatio: "3/2", minHeight: 200 }}
              onChartReady={handleChartReady}
            />
          </div>
        );
      })}
    </div>
  );
}
