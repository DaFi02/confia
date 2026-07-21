"use client";

interface TrustScoreBreakdownModalProps {
  breakdown: {
    comprobantes_pct: number;
    limite_diario_pct: number;
    pago_puntual_pct: number;
  };
  onClose: () => void;
}

const ITEMS = [
  {
    key: "comprobantes_pct" as const,
    label: "Comprobantes validados",
    weight: 8,
    icon: "receipt_long",
    description: "Porcentaje de gastos del mes con foto de comprobante.",
  },
  {
    key: "limite_diario_pct" as const,
    label: "Respeto del límite diario",
    weight: 8,
    icon: "speed",
    description: "Días del mes en los que te mantuviste dentro de tu presupuesto diario.",
  },
  {
    key: "pago_puntual_pct" as const,
    label: "Pago puntual de gastos fijos",
    weight: 4,
    icon: "event_available",
    description: "Gastos fijos pagados antes o en su fecha de vencimiento.",
  },
];

export function TrustScoreBreakdownModal({
  breakdown,
  onClose,
}: TrustScoreBreakdownModalProps) {
  return (
    <section className="mx-1 -mt-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-[0_4px_12px_rgba(0,0,0,0.08)]" aria-label="Detalle del Trust Score">
      <div>
        <div className="flex items-center justify-between mb-sm">
          <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
            ¿Cómo se calcula tu Trust Score?
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 -m-2 text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <p className="text-body-md text-body-md text-on-surface-variant mb-md">
          Tu score (0-20) es la suma ponderada de tres factores, medidos sobre
          el mes en curso.
        </p>
        <div className="flex flex-col gap-sm">
          {ITEMS.map((item) => {
            const pct = breakdown[item.key];
            const earned = Math.round(pct * item.weight * 10) / 10;
            return (
              <div
                key={item.key}
                className="flex items-start gap-3 p-sm rounded-xl bg-surface-container"
              >
                <span className="material-symbols-outlined text-primary shrink-0">
                  {item.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-label-md text-label-md text-on-surface font-semibold">
                      {item.label}
                    </p>
                    <span className="font-label-sm text-label-sm text-secondary font-bold shrink-0">
                      {earned}/{item.weight} pts
                    </span>
                  </div>
                  <p className="text-label-sm text-outline mt-0.5">
                    {item.description}
                  </p>
                  <div className="mt-1.5 h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.round(pct * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
