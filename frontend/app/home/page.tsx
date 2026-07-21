"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { TrustScoreBreakdownModal } from "@/components/TrustScoreBreakdownModal";
import { ProactiveBriefPanel } from "@/components/ProactiveBrief";
import { QuickAddModal } from "@/components/QuickAddModal";
import { useLanguage } from "@/components/LanguageProvider";
import { api, DashboardData, formatMoney } from "@/lib/api";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function getFormattedDate(language: "en" | "es") {
  const label = new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function HomePage() {
  const router = useRouter();
  const { language } = useLanguage();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [variableExpensesAlert, setVariableExpensesAlert] = useState<
    { fixed_expense_id: number; name: string; month: string }[]
  >([]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      api
        .dashboard()
        .then((result) => {
          if (active) setData(result);
        })
        .catch((err) => {
          if (active) setError(err instanceof Error ? err.message : "Error");
        });
      api
        .alerts()
        .then((res) => {
          if (active) setVariableExpensesAlert(res.variable_expenses_missing_amount);
        })
        .catch(() => {
          // Non-critical: the Action Center alert is additive to the dashboard,
          // so a failure here shouldn't block the rest of Home from rendering.
        });
    };
    refresh();
    // Keeps an open dashboard current without repeatedly calling the model:
    // the API itself refreshes the NVIDIA brief only when its six-hour cache
    // expires or the user's financial data has changed.
    const interval = window.setInterval(refresh, 15 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!data) {
    return <LoadingState />;
  }

  const {
    trust_score,
    balance,
    proactive_brief,
    recent,
    missing_data,
    fixed_expenses,
    safety_cushion_days,
    daily_budget,
  } = data;
  const progress = trust_score.value / trust_score.max;
  const gaugeCircumference = Math.PI * 40;

  return (
    <>
      <header className="bg-surface sticky top-0 z-40 w-full flex justify-between items-center px-margin-mobile h-16 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/confia-icon-transparent.png"
            alt="confIA"
            className="h-8 w-8 object-contain shrink-0"
          />
          <div className="flex flex-col">
            <h1 className="font-headline-md text-headline-md text-primary font-bold tracking-tight">
              {getGreeting()}, Usuario
            </h1>
            <p className="text-label-sm text-on-surface-variant">
              {getFormattedDate(language)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="material-symbols-outlined text-on-surface-variant">
            notifications
          </span>
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
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBIs9fAhcItQOmOMQTVZUl37ggt0_tJVrnCKfblrZjEIg4XykshL_k-x-sEUbJQvI9ninp-dU8_JwOfUqozYv-9iCl9ELmTITuzX4SNM_WbkDzzj7bhMqubh6pHKtgHaODhbRYC4GzKlJz02y3dUzCBJe8bcKrAODF_ybLA2DGmgsljaqATKEVT4NjNQ3L3bOuLdv4Z2NgFneGCrJ-6vrMGm-J3vX1eTU0waunsKBe4Kz4lQxqwUQf_MaVg92t2Qfbw60gGCw-wSH-2"
            />
          </button>
        </div>
      </header>

      <main className="px-margin-mobile py-md flex flex-col gap-md max-w-2xl mx-auto pb-24 w-full">
        <section className="bg-surface-container-lowest rounded-xl p-md shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex flex-col items-center text-center">
          <div className="relative w-[220px] h-[110px] mb-2">
            <svg className="w-full h-full" viewBox="0 0 100 50">
              <path
                d="M10,50 A40,40 0 0,1 90,50"
                fill="none"
                stroke="var(--color-surface-container-highest)"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M10,50 A40,40 0 0,1 90,50"
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={gaugeCircumference}
                strokeDashoffset={gaugeCircumference * (1 - progress)}
                style={{ transition: "stroke-dashoffset 1s ease-out" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
              <span className="font-headline-lg text-headline-lg text-on-surface font-bold">
                {trust_score.value}/{trust_score.max}
              </span>
              <span className="text-label-sm text-secondary font-bold">
                {trust_score.label}
              </span>
            </div>
          </div>
          <h2 className="font-body-lg text-body-lg text-on-surface-variant mb-1">
            Tu Trust Score actual
          </h2>
          <p className="text-label-sm text-outline px-4">
            Tu salud financiera está en el top 10% este mes.
          </p>
          <button
            type="button"
            onClick={() => setShowBreakdown(true)}
            className="mt-2 flex items-center gap-1 text-label-sm text-label-sm text-primary font-semibold hover:underline"
          >
            <span className="material-symbols-outlined text-[16px]">
              info
            </span>
            Ver cómo se calcula
          </button>
        </section>

        {showBreakdown && (
          <TrustScoreBreakdownModal
            breakdown={trust_score.breakdown}
            onClose={() => setShowBreakdown(false)}
          />
        )}

        <section className="flex justify-center">
          <button
            onClick={() => router.push("/ai-hub")}
            className="w-full bg-primary-container text-on-primary-container h-14 rounded-full flex items-center justify-center gap-2 shadow-lg hover:opacity-90 active:scale-95 transition-all group"
          >
            <span className="material-symbols-outlined transition-transform group-hover:rotate-12">
              auto_awesome
            </span>
            <span className="font-label-md text-label-md font-bold tracking-wide">
              Registrar egreso / ingreso con IA
            </span>
          </button>
        </section>

        <button type="button" onClick={() => setQuickAddOpen(true)} className="flex h-11 items-center justify-center gap-2 rounded-lg bg-surface-container-lowest text-label-md font-semibold text-primary hover:bg-primary/5">
          <span className="material-symbols-outlined text-[19px]">add</span> Registrar manualmente
        </button>

        <section className="grid grid-cols-2 gap-sm">
          <div className="bg-surface-container-lowest p-4 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <p className="text-label-sm text-on-surface-variant mb-1">
              Ingresos del mes
            </p>
            <p className="font-headline-md text-headline-md text-secondary">
              {formatMoney(balance.ingresos, 0, data.currency)}
            </p>
          </div>
          <div className="bg-surface-container-lowest p-4 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <p className="text-label-sm text-on-surface-variant mb-1">
              Gastos totales
            </p>
            <p className="font-headline-md text-headline-md text-error">
              {formatMoney(balance.gastos, 0, data.currency)}
            </p>
          </div>
          <div className="bg-surface-container-lowest p-4 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <div className="mb-1 flex items-center gap-1"><p className="text-label-sm text-on-surface-variant">Meta de ahorro</p><span title="La eliges al crear tu perfil. Es el porcentaje de tus ingresos mensuales que quieres separar antes de gastar." className="material-symbols-outlined text-[15px] text-outline">info</span></div>
            <div className="flex items-center gap-2">
              <span className="font-headline-md text-headline-md text-on-surface">
                {balance.meta_ahorro_pct}%
              </span>
              <div className="w-2 h-2 rounded-full bg-secondary" />
            </div>
          </div>
          <div className="bg-surface-container-lowest p-4 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <p className="text-label-sm text-on-surface-variant mb-1">
              Colchón Seguridad
            </p>
            <p className="font-headline-md text-headline-md text-primary">
              {safety_cushion_days} días
            </p>
            <p className="text-[10px] text-outline">Respaldo actual</p>
          </div>
          <div className="col-span-2 bg-surface-container-lowest p-4 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <div className="flex justify-between items-end mb-2">
              <div>
                <p className="text-label-sm text-on-surface-variant">
                  Disponible para gastar hoy
                </p>
                {!daily_budget.is_available && (
                  <p className="mt-1 text-[11px] text-outline">
                    Registra un ingreso para calcular tu presupuesto real.
                  </p>
                )}
              </div>
              <p className="font-label-md font-bold text-on-surface">
                {formatMoney(daily_budget.remaining, 2, data.currency)}
              </p>
            </div>
            <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-1000"
                style={{ width: `${daily_budget.limit_pct}%` }}
              />
            </div>
            {!daily_budget.is_available && (
              <button
                type="button"
                onClick={() => router.push("/ai-hub")}
                className="mt-3 inline-flex items-center gap-1 text-label-sm font-semibold text-primary hover:underline"
              >
                <span className="material-symbols-outlined text-[16px]">add_circle</span>
                Registrar ingreso
              </button>
            )}
          </div>
        </section>

        <ProactiveBriefPanel brief={proactive_brief} />

        {missing_data.length > 0 && (
          <section className="bg-error-container/30 border border-error/10 rounded-xl p-md flex gap-4">
            <span className="material-symbols-outlined text-error shrink-0">
              report
            </span>
            <div>
              <h3 className="font-label-md text-on-error-container font-bold mb-1">
                Gastos con datos faltantes
              </h3>
              <ul className="text-label-sm text-on-error-container/80 space-y-1">
                {missing_data.map((m) => (
                  <li key={m.id}>• {m.title}: falta comprobante</li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {variableExpensesAlert.length > 0 && (
          <section className="bg-primary-fixed/30 border border-primary/10 rounded-xl p-md flex gap-4">
            <span className="material-symbols-outlined text-primary shrink-0">
              edit_note
            </span>
            <div className="flex-1">
              <h3 className="font-label-md text-on-surface font-bold mb-1">
                Gastos variables sin monto este mes
              </h3>
              <ul className="text-label-sm text-on-surface-variant space-y-1 mb-2">
                {variableExpensesAlert.map((v) => (
                  <li key={v.fixed_expense_id}>
                    • {v.name}: falta ingresar el monto de {v.month}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => router.push("/ajustes")}
                className="font-label-sm text-label-sm text-primary font-bold hover:underline"
              >
                Ingresar monto
              </button>
            </div>
          </section>
        )}

        {fixed_expenses.length > 0 && (
          <section className="flex flex-col gap-sm">
            <h2 className="font-label-md text-on-surface-variant font-bold px-1 uppercase tracking-wider">
              Compromisos del Mes
            </h2>
            <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden divide-y divide-surface-container">
              {fixed_expenses.map((fe, idx) => (
                <div key={idx} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center">
                      <span className="material-symbols-outlined text-on-surface-variant">
                        {fe.icon}
                      </span>
                    </div>
                    <div>
                      <p className="font-body-md text-on-surface font-medium">
                        {fe.name}
                      </p>
                      <p className="text-label-sm text-outline">
                        {fe.day ? `Vence: ${fe.day}` : "Sin fecha de cobro"}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase shrink-0 ${
                      fe.status === "pagado"
                        ? "bg-secondary-container/30 text-secondary"
                        : fe.status === "falta_comprobante"
                        ? "bg-primary-fixed/30 text-primary"
                        : "bg-error-container/30 text-error"
                    }`}
                  >
                    {fe.status === "pagado"
                      ? "Pagado"
                      : fe.status === "falta_comprobante"
                      ? "Falta Comprobante"
                      : "Pendiente"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-sm">
          <div className="flex justify-between items-center px-1">
            <h2 className="font-label-md text-on-surface-variant font-bold uppercase tracking-wider">
              Actividad Reciente
            </h2>
            <button
              onClick={() => router.push("/historial")}
              className="text-primary text-label-md font-medium"
            >
              Ver todo
            </button>
          </div>
          <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden">
            {recent.map((t, idx) => (
              <div
                key={t.id}
                className={`flex items-center gap-4 p-md hover:bg-surface-container transition-colors ${
                  idx < recent.length - 1 ? "border-b border-surface-container" : ""
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center text-on-surface-variant shrink-0">
                  <span className="material-symbols-outlined">{t.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-body-md text-body-md text-on-surface font-medium truncate">
                    {t.title}
                  </h4>
                  <p className="text-label-sm text-outline">{t.date}</p>
                </div>
                <span
                  className={`font-body-md text-body-md font-semibold shrink-0 ${
                    t.amount < 0 ? "text-error" : "text-secondary"
                  }`}
                >
                  {t.amount < 0 ? "-" : "+"}{formatMoney(t.amount, 2, data.currency)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>

      {quickAddOpen && <QuickAddModal onClose={() => setQuickAddOpen(false)} onSaved={() => { setQuickAddOpen(false); setToast("Movimiento registrado correctamente."); api.dashboard().then(setData); window.setTimeout(() => setToast(null), 3000); }} />}
      {toast && <div role="status" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-inverse-surface px-4 py-3 text-label-md text-inverse-on-surface shadow-lg">{toast}</div>}

      <BottomNav />
    </>
  );
}

function LoadingState() {
  return (
    <main className="flex-1 flex items-center justify-center pb-24">
      <p className="text-on-surface-variant">Cargando...</p>
      <BottomNav />
    </main>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-2 p-md pb-24 text-center">
      <p className="text-error font-medium">No se pudo conectar con la API</p>
      <p className="text-label-sm text-on-surface-variant">{message}</p>
      <p className="text-label-sm text-outline">
        Verifica que el backend esté corriendo en http://localhost:8000
      </p>
      <BottomNav />
    </main>
  );
}
