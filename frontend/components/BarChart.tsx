"use client";

export interface BarChartItem {
  label: string;
  value: number;
}

interface BarChartProps {
  items: BarChartItem[];
  formatValue?: (value: number) => string;
  height?: number;
}

/**
 * Bar chart simple en CSS/SVG, sin dependencias externas. Pensado para
 * comparativas de pocas barras (ej. gasto total de los últimos N meses).
 */
export function BarChart({ items, formatValue, height = 140 }: BarChartProps) {
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <div
      className="flex items-end gap-2 w-full"
      style={{ height }}
      role="img"
      aria-label="Comparativa de gastos por mes"
    >
      {items.map((item) => {
        const barHeight = item.value <= 0 ? 2 : Math.max(6, Math.round((item.value / max) * (height - 28)));
        return (
          <div key={item.label} className="flex flex-1 min-w-0 flex-col items-center gap-1">
            <span className="text-[10px] leading-tight text-on-surface-variant text-center truncate max-w-full">
              {formatValue ? formatValue(item.value) : item.value}
            </span>
            <div className="flex w-full items-end justify-center">
              <div
                className="w-full max-w-8 rounded-t-lg bg-primary transition-[height] duration-300"
                style={{ height: barHeight }}
              />
            </div>
            <span className="text-[10px] leading-tight text-outline text-center break-words">
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
