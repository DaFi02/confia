"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { BarChart } from "@/components/BarChart";
import { DonutChart, DonutLegend } from "@/components/DonutChart";
import { api, AnalyticsData, formatMoney } from "@/lib/api";

export default function AnaliticaPage() {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [historical, setHistorical] = useState<{ label: string; total_gastos: number }[] | null>(null);
  const [dailyPace, setDailyPace] = useState<{ day: number; cumulative_spend: number }[] | null>(null);

  useEffect(() => {
    api.analytics().then(setData);
    api.analyticsHistorical(5).then((res) => setHistorical(res.months));
    api.analyticsDailyPace().then((res) => setDailyPace(res.days));
  }, []);

  if (!data) {
    return (
      <main className="flex-1 flex items-center justify-center pb-24">
        <p className="text-on-surface-variant">Cargando...</p>
        <BottomNav />
      </main>
    );
  }

  const trendMax = Math.max(20, ...data.tranquility_trend);
  const trendCoordinates = data.tranquility_trend.map((value, index) => {
    const x =
      data.tranquility_trend.length > 1
        ? 8 + (index / (data.tranquility_trend.length - 1)) * 284
        : 150;
    const y = 108 - (Math.max(0, value) / trendMax) * 88;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const trendPoints = trendCoordinates.join(" ");
  const trendLastPoint = trendCoordinates.at(-1)?.split(",") ?? ["292", "108"];
  const spendMax = Math.max(
    data.spend_pace.today,
    data.spend_pace.yesterday_same_day,
    1
  );
  const barHeight = (value: number) =>
    value <= 0 ? 4 : Math.max(14, Math.round((value / spendMax) * 112));

  const paceMax = Math.max(1, ...(dailyPace ?? []).map((d) => d.cumulative_spend));
  const paceCoordinates = (dailyPace ?? []).map((d, index, arr) => {
    const x = arr.length > 1 ? 8 + (index / (arr.length - 1)) * 284 : 150;
    const y = 108 - (Math.max(0, d.cumulative_spend) / paceMax) * 88;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const pacePoints = paceCoordinates.join(" ");

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-surface flex justify-between items-center px-margin-mobile h-16 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/ajustes")}
            aria-label="Ir a Ajustes"
            className="w-10 h-10 rounded-full bg-surface-container-high overflow-hidden border border-outline-variant active:scale-90 transition-transform"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="w-full h-full object-cover"
              alt="Avatar de usuario"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuCUK0SoIFV1Tm_Bai1ZgRwfS7lavbqwM5KcEZT93dKbxf1jRZcXx3tpVubzxhs-86cHwb_OL09RI6Bw68PYi6M_KlGglLA5fnWTpehRZGnzWJtDx0jLgC0z3ciC6gxOWQKn7Lqo4VQcM9zqr-7ayJBPdb806AM0qSJk36pWFqW-o417triZRrVofKwEpqNDyVBccet2F1N2bQnU_Rel-VKC-uufu6TeG5hArZNpR5ag3oBOjcLGCE562evA6UuE5hOhHx2OBmb0ln57"
            />
          </button>
          <div className="flex flex-col">
            <h1 className="font-headline-md text-headline-md font-bold text-primary tracking-tight">
              Tu Analítica
            </h1>
            <p className="text-label-sm text-on-surface-variant">
              Tus finanzas, fáciles de entender
            </p>
          </div>
        </div>
        <span className="material-symbols-outlined text-primary">
          notifications
        </span>
      </header>

      <main className="pt-md pb-32 px-margin-mobile max-w-5xl mx-auto space-y-md w-full">
        <section className="bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-xl p-md">
          <div className="flex items-start justify-between gap-sm">
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface mb-xs">
                Evolución de tu Tranquilidad
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Mira cómo ha cambiado tu puntaje en los últimos 30 días.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-primary-fixed px-sm py-xs font-label-sm text-label-sm font-semibold text-on-primary-fixed">
              {data.score_today} pts
            </span>
          </div>
          <div className="mt-md h-40 w-full overflow-hidden">
            <svg
              viewBox="0 0 300 120"
              preserveAspectRatio="none"
              className="h-full w-full"
              role="img"
              aria-label={`Evolución del puntaje de tranquilidad. Hoy: ${data.score_today} puntos.`}
            >
              <line x1="8" x2="292" y1="108" y2="108" stroke="var(--color-outline-variant)" strokeWidth="1" />
              <line x1="8" x2="292" y1="64" y2="64" stroke="var(--color-surface-container-high)" strokeWidth="1" strokeDasharray="3 4" />
              <polyline
                points={trendPoints}
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={trendLastPoint[0]}
                cy={trendLastPoint[1]}
                r="4"
                fill="var(--color-primary)"
                stroke="var(--color-surface-container-lowest)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
          <div className="flex justify-between mt-4 text-label-sm font-label-sm text-outline">
            <span>Hace 30 días</span>
            <span>Hoy</span>
          </div>
        </section>

        <section className="bg-surface shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-xl p-md">
          <h2 className="font-headline-md text-headline-md text-on-surface mb-xs">
            Ingresos vs Gastos
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant mb-md">
            Así se reparte tu dinero este mes, de un vistazo.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-md">
            <DonutChart
              segments={[
                {
                  label: "Ingresos",
                  value: data.income_vs_expense.ingresos,
                  color: "var(--color-secondary)",
                },
                {
                  label: "Gastos",
                  value: data.income_vs_expense.gastos,
                  color: "var(--color-error)",
                },
              ]}
              centerLabel={formatMoney(
                data.income_vs_expense.ingresos - data.income_vs_expense.gastos,
                0,
                data.currency
              )}
              centerSubLabel="Balance"
            />
            <DonutLegend
              segments={[
                {
                  label: "Ingresos",
                  value: data.income_vs_expense.ingresos,
                  color: "var(--color-secondary)",
                },
                {
                  label: "Gastos",
                  value: data.income_vs_expense.gastos,
                  color: "var(--color-error)",
                },
              ]}
              total={
                data.income_vs_expense.ingresos + data.income_vs_expense.gastos
              }
              formatValue={(v) => formatMoney(v, 0, data.currency)}
            />
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          <section className="bg-surface shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-xl p-md flex flex-col">
            <h2 className="font-headline-md text-headline-md text-on-surface mb-xs">
              Tu ritmo de gasto
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-md">
              Compara lo que has gastado hoy con el mismo día del mes pasado.
            </p>
            <div className="mt-auto grid grid-cols-2 items-end gap-lg pt-sm">
              <div className="flex min-w-0 flex-col items-center gap-2">
                <span className="font-label-md text-label-md font-bold text-primary">
                  {formatMoney(data.spend_pace.today, 2, data.currency)}
                </span>
                <div className="flex h-28 w-full items-end justify-center rounded-lg bg-primary-fixed/40 px-4">
                  <div
                    className="w-10 max-w-full bg-primary rounded-t-lg transition-[height] duration-300"
                    style={{ height: `${barHeight(data.spend_pace.today)}px` }}
                  />
                </div>
                <span className="text-center text-label-sm text-on-surface-variant">
                  Hoy
                </span>
              </div>
              <div className="flex min-w-0 flex-col items-center gap-2">
                <span className="font-label-md text-label-md font-bold text-on-surface">
                  {formatMoney(data.spend_pace.yesterday_same_day, 2, data.currency)}
                </span>
                <div className="flex h-28 w-full items-end justify-center rounded-lg bg-surface-container px-4">
                <div
                    className="w-10 max-w-full bg-outline rounded-t-lg transition-[height] duration-300"
                    style={{ height: `${barHeight(data.spend_pace.yesterday_same_day)}px` }}
                />
                </div>
                <span className="text-label-sm text-on-surface-variant">
                  Mes pasado
                </span>
              </div>
            </div>
          </section>

          <section className="bg-surface shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-xl p-md">
            <h2 className="font-headline-md text-headline-md text-on-surface mb-xs">
              ¿En qué se va más rápido?
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-md">
              Tus categorías de gasto más grandes del mes.
            </p>
            {data.top_categories.length > 0 ? (
              <div className="flex flex-col sm:flex-row items-center gap-md">
                <DonutChart
                  segments={data.top_categories.map((c) => ({
                    label: c.name,
                    value: c.amount,
                    color: c.color,
                  }))}
                  centerLabel={`${data.top_categories[0].pct}%`}
                  centerSubLabel={data.top_categories[0].name}
                />
                <DonutLegend
                  segments={data.top_categories.map((c) => ({
                    label: c.name,
                    value: c.amount,
                    color: c.color,
                  }))}
                  total={data.top_categories.reduce((s, c) => s + c.amount, 0)}
                  formatValue={(v) => formatMoney(v, 2, data.currency)}
                />
              </div>
            ) : (
              <p className="text-label-sm text-outline">
                Aún no tienes gastos registrados este mes.
              </p>
            )}
          </section>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          <section className="bg-surface shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-xl p-md">
            <h2 className="font-headline-md text-headline-md text-on-surface mb-xs">
              Comparativa Histórica
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-md">
              Total gastado en los últimos 5 meses.
            </p>
            {historical && historical.length > 0 ? (
              <BarChart
                items={historical.map((m) => ({ label: m.label, value: m.total_gastos }))}
                formatValue={(v) => formatMoney(v, 0, data.currency)}
              />
            ) : (
              <p className="text-label-sm text-outline">Cargando historial...</p>
            )}
          </section>

          <section className="bg-surface shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-xl p-md">
            <h2 className="font-headline-md text-headline-md text-on-surface mb-xs">
              Ritmo de Gasto Diario
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-md">
              Gasto acumulado del mes, día a día.
            </p>
            {dailyPace && dailyPace.length > 0 ? (
              <div className="h-32 w-full overflow-hidden">
                <svg
                  viewBox="0 0 300 120"
                  preserveAspectRatio="none"
                  className="h-full w-full"
                  role="img"
                  aria-label="Gasto acumulado del mes por día"
                >
                  <line x1="8" x2="292" y1="108" y2="108" stroke="var(--color-outline-variant)" strokeWidth="1" />
                  <polyline
                    points={pacePoints}
                    fill="none"
                    stroke="var(--color-error)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </div>
            ) : (
              <p className="text-label-sm text-outline">Cargando ritmo diario...</p>
            )}
          </section>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          <section className="bg-surface shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-xl p-md border-b-4 border-tertiary">
            <div className="flex justify-between items-start mb-sm">
              <h2 className="font-headline-md text-headline-md text-on-surface">
                Pequeños antojos
              </h2>
              <span className="material-symbols-outlined text-tertiary text-3xl">
                coffee
              </span>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant mb-md">
              Esos gastos diarios que parecen poco, pero se acumulan.
            </p>
            <div className="flex items-baseline gap-1">
              <span className="font-headline-xl text-headline-xl text-tertiary">
                {formatMoney(data.small_treats.amount, 0, data.currency)}
              </span>
              <span className="font-label-md text-label-md text-on-surface-variant">
                este mes
              </span>
            </div>
            <div className="mt-4 bg-tertiary-fixed text-on-tertiary-fixed p-3 rounded-lg flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">
                trending_up
              </span>
              <span className="font-label-sm text-label-sm">
                Equivale a {data.small_treats.equivalent}
              </span>
            </div>
          </section>

          <section className="bg-surface shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-xl p-md">
            <div className="flex justify-between items-start mb-sm">
              <h2 className="font-headline-md text-headline-md text-on-surface">
                Colchón de Seguridad
              </h2>
              <span className="material-symbols-outlined text-secondary text-3xl">
                calendar_today
              </span>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant mb-md">
              Días que podrías cubrir tus gastos básicos sin ingresos.
            </p>
            <div className="flex flex-col items-center justify-center py-4 bg-secondary-container/20 rounded-xl">
              <span className="font-headline-xl text-headline-xl text-secondary font-extrabold">
                {data.safety_cushion_days} días
              </span>
              <span className="font-label-md text-label-md text-on-secondary-fixed-variant">
                Nivel: Estable
              </span>
            </div>
          </section>
        </div>

        <section className="bg-surface shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-xl p-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-md">
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface mb-xs">
                Disponible para gastar hoy
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Mantente dentro de tu presupuesto mensual.
              </p>
            </div>
            <div className="mt-4 md:mt-0 text-right">
              <span className="font-headline-lg text-headline-lg text-primary block">
                {formatMoney(data.daily_budget.remaining, 2, data.currency)} libres
              </span>
              <span className="font-label-md text-label-md text-outline">
                {data.daily_budget.is_available
                  ? "Límite diario sugerido"
                  : "Registra un ingreso para activarlo"}
              </span>
            </div>
          </div>
          <div className="w-full bg-surface-container-highest h-6 rounded-full overflow-hidden">
            <div
              className="bg-primary h-full rounded-full transition-all duration-1000"
              style={{ width: `${data.daily_budget.limit_pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 font-label-sm text-label-sm text-outline">
            <span>Gastado: {formatMoney(data.daily_budget.spent, 2, data.currency)}</span>
            <span>{data.daily_budget.is_available ? `Restante: ${formatMoney(data.daily_budget.remaining, 2, data.currency)}` : "Sin ingresos registrados este mes"}</span>
          </div>
        </section>

        <div className="bg-primary-container text-on-primary-container p-md rounded-xl flex gap-md items-center">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-container-lowest/90 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/confia-icon-transparent.png"
              alt=""
              className="h-8 w-8 object-contain"
            />
          </div>
          <div>
            <h3 className="font-label-md text-label-md font-bold uppercase tracking-wider">
              Consejo de confIA
            </h3>
            <p className="font-body-md text-body-md">{data.ai_advice}</p>
          </div>
        </div>
      </main>

      <BottomNav />
    </>
  );
}
