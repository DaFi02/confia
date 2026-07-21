"use client";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  centerLabel?: string;
  centerSubLabel?: string;
}

/**
 * Gráfico de dona simple en SVG, sin dependencias externas.
 * Usa un viewBox de 36x36 con radio 15.9 (circunferencia ≈ 100),
 * así cada porcentaje se traduce directo a un valor de stroke-dasharray.
 */
export function DonutChart({
  segments,
  size = 128,
  centerLabel,
  centerSubLabel,
}: DonutChartProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  let cumulative = 0;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle
          cx="18"
          cy="18"
          r="15.9"
          fill="transparent"
          stroke="var(--color-surface-container-highest)"
          strokeWidth="4"
        />
        {total > 0 &&
          segments.map((seg) => {
            const pct = (seg.value / total) * 100;
            const dashArray = `${pct} ${100 - pct}`;
            const dashOffset = -cumulative;
            cumulative += pct;
            return (
              <circle
                key={seg.label}
                cx="18"
                cy="18"
                r="15.9"
                fill="transparent"
                stroke={seg.color}
                strokeWidth="4"
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
              />
            );
          })}
      </svg>
      {(centerLabel || centerSubLabel) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
          {centerLabel && (
            <span className="font-headline-md text-headline-md text-on-surface leading-none">
              {centerLabel}
            </span>
          )}
          {centerSubLabel && (
            <span className="text-label-sm text-outline mt-1">
              {centerSubLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function DonutLegend({
  segments,
  total,
  formatValue,
}: {
  segments: DonutSegment[];
  total: number;
  formatValue?: (value: number) => string;
}) {
  return (
    <div className="flex flex-col gap-sm flex-1 min-w-0">
      {segments.map((seg) => {
        const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
        return (
          <div key={seg.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              <span className="truncate">{seg.label}</span>
            </span>
            <span className="font-label-md text-label-md font-bold text-on-surface shrink-0">
              {pct}%
              {formatValue && (
                <span className="text-outline font-normal ml-1">
                  ({formatValue(seg.value)})
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
