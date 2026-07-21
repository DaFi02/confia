import { ProactiveBrief } from "@/lib/api";

const styles = {
  success: {
    icon: "bg-secondary/10 text-secondary",
    badge: "bg-secondary/10 text-secondary",
  },
  info: {
    icon: "bg-primary-fixed text-primary",
    badge: "bg-primary-fixed text-on-primary-fixed",
  },
  warning: {
    icon: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
    badge: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  },
};

function formatMoney(value: number) {
  return `$${Math.max(0, value).toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
}

export function ProactiveBriefPanel({ brief }: { brief: ProactiveBrief }) {
  const projectionOnTrack = brief.snapshot.projected_savings >= brief.snapshot.savings_target;

  return (
    <section aria-labelledby="assistant-brief-title" className="bg-surface-container-lowest rounded-xl p-md shadow-[0_4px_8px_rgba(0,0,0,0.08)]">
      <div className="flex items-start justify-between gap-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-fixed overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/confia-icon-transparent.png"
              alt=""
              className="h-7 w-7 object-contain"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 id="assistant-brief-title" className="font-label-md text-label-md font-bold text-on-surface">
                Tu asistente financiero
              </h2>
              <span className="flex items-center gap-1 text-label-sm text-secondary">
                <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                Al día
              </span>
            </div>
            <p className="mt-1 text-label-sm leading-relaxed text-on-surface-variant">{brief.summary}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-sm rounded-lg bg-surface-container-low p-sm">
        <div>
          <p className="text-label-sm text-on-surface-variant">Ahorro al cierre</p>
          <p className={projectionOnTrack ? "mt-1 font-label-md text-label-md font-bold text-secondary" : "mt-1 font-label-md text-label-md font-bold text-error"}>
            {formatMoney(brief.snapshot.projected_savings)}
          </p>
        </div>
        <div>
          <p className="text-label-sm text-on-surface-variant">Meta del mes</p>
          <p className="mt-1 font-label-md text-label-md font-bold text-on-surface">{formatMoney(brief.snapshot.savings_target)}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {brief.insights.map((insight) => {
          const style = styles[insight.priority];
          return (
            <article key={insight.id} className="flex gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${style.icon}`}>
                <span className="material-symbols-outlined text-[19px]">{insight.icon}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-label-md text-label-md font-bold text-on-surface">{insight.title}</h3>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-label-sm font-semibold ${style.badge}`}>{insight.action}</span>
                </div>
                <p className="mt-1 text-label-sm leading-relaxed text-on-surface-variant">{insight.message}</p>
              </div>
            </article>
          );
        })}
      </div>
      {brief.generated_by === "fallback" && (
        <p className="mt-4 text-label-sm text-outline">Tu plan se actualiza automáticamente al registrar un movimiento.</p>
      )}
    </section>
  );
}
