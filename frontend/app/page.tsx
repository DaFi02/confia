"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useState } from "react";
import {
  FixedExpensesEditor,
  FixedExpenseForm,
  fixedExpensesToApi,
  newFixedExpense,
} from "@/components/FixedExpensesEditor";
import { api, CURRENCIES, currencySymbol } from "@/lib/api";

export default function OnboardingPage() {
  const router = useRouter();
  const [ingreso, setIngreso] = useState("");
  const [expenses, setExpenses] = useState<FixedExpenseForm[]>([
    newFixedExpense(),
  ]);
  const [ahorro, setAhorro] = useState("20");
  const [currency, setCurrency] = useState("PEN");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ahorroValue = Math.min(60, Math.max(0, Number(ahorro) || 0));
  const ahorroLabel =
    ahorroValue <= 15
      ? "Prudente"
      : ahorroValue <= 30
        ? "Equilibrada"
        : "Ambiciosa";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const ingresoValue = Number(ingreso);
    const ahorroPct = Number(ahorro);
    if (!Number.isFinite(ingresoValue) || ingresoValue <= 0) {
      setError("Ingresa un monto mensual mayor a 0 para continuar.");
      return;
    }
    if (!Number.isFinite(ahorroPct) || ahorroPct < 0 || ahorroPct > 60) {
      setError("Elige una meta de ahorro entre 0% y 60%.");
      return;
    }
    setLoading(true);
    try {
      await api.onboarding({
        ingreso: ingresoValue,
        gastos_fijos: fixedExpensesToApi(expenses),
        ahorro_pct: ahorroPct,
        currency,
      });
      router.push("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-margin-mobile md:p-margin-desktop">
      <div className="w-full max-w-[36rem] flex flex-col gap-lg mb-8">
        <header className="flex flex-col gap-base text-center md:text-left">
          <div className="flex justify-center md:justify-start mb-sm">
            <div className="flex h-12 items-center rounded-xl bg-primary px-4 shadow-[0_8px_18px_rgba(48,54,211,0.22)]">
              <Image
                src="/brand/confia-wordmark-v2-transparent.png"
                alt="confIA"
                width={150}
                height={104}
                priority
                className="h-8 w-auto"
              />
            </div>
          </div>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface tracking-tight">
            Configuremos tu perfil financiero
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-[28rem] mx-auto md:mx-0">
            Ayúdanos a entender tu situación para que nuestra IA pueda
            optimizar tu flujo de caja de manera personalizada.
          </p>
        </header>

        <div className="bg-surface-container-lowest rounded-xl p-md md:p-lg shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex flex-col gap-md">
          <form onSubmit={handleSubmit} className="flex flex-col gap-md">
            <div className="flex flex-col gap-xs">
              <label htmlFor="currency" className="font-label-md text-label-md text-on-surface-variant">Moneda para tus registros</label>
              <select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full rounded-xl bg-background px-4 py-4 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary">
                {(["Latinoamérica", "Internacional", "Europa"] as const).map((group) => <optgroup key={group} label={group}>{CURRENCIES.filter(([, , region]) => region === group).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</optgroup>)}
              </select>
              <p className="font-label-sm text-label-sm text-on-surface-variant">No convierte importes: define cómo se mostrarán tus montos.</p>
            </div>

            <div className="flex flex-col gap-xs">
              <label
                htmlFor="ingreso"
                className="font-label-md text-label-md text-on-surface-variant"
              >
                Ingreso Fijo Estimado
              </label>
              <p className="font-label-sm text-label-sm text-on-surface-variant mb-2">
                Lo que recibes mensualmente de forma segura.
              </p>
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors">
                  {currencySymbol(currency)}
                </span>
                <input
                  id="ingreso"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={ingreso}
                  onChange={(e) => setIngreso(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-background border-0 rounded-xl px-8 py-4 font-body-md text-body-md focus:ring-2 focus:ring-primary focus:bg-surface-container-lowest transition-all outline-none"
                  required
                />
              </div>
            </div>

            <FixedExpensesEditor items={expenses} onChange={setExpenses} />

            <div className="flex flex-col gap-sm">
              <label
                htmlFor="ahorro"
                className="font-label-md text-label-md text-on-surface-variant"
              >
                Meta de Ahorro (%)
              </label>
              <p className="font-label-sm text-label-sm text-on-surface-variant mb-2">
                El porcentaje de tus ingresos que deseas guardar.
              </p>
              <div className="flex items-center justify-between rounded-lg bg-primary-fixed px-sm py-xs text-on-primary-fixed">
                <span className="font-label-sm text-label-sm">
                  Nivel de meta
                </span>
                <span className="font-label-md text-label-md font-semibold">
                  {ahorroLabel} · {ahorroValue}%
                </span>
              </div>
              <div className="relative">
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors">
                  %
                </span>
                <input
                  id="ahorro"
                  type="number"
                  min="0"
                  max="60"
                  step="1"
                  value={ahorro}
                  onChange={(e) => setAhorro(e.target.value)}
                  placeholder="20"
                  className="w-full bg-background border-0 rounded-xl px-4 py-4 font-body-md text-body-md focus:ring-2 focus:ring-primary focus:bg-surface-container-lowest transition-all outline-none"
                  required
                />
              </div>
              <div className="flex flex-col gap-xs px-1">
                <input
                  aria-label="Meta de ahorro"
                  aria-valuetext={`${ahorroValue}% — ${ahorroLabel}`}
                  type="range"
                  min="0"
                  max="60"
                  step="1"
                  value={ahorroValue}
                  onChange={(e) => setAhorro(e.target.value)}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full accent-primary"
                  style={{
                    background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${(ahorroValue / 60) * 100}%, var(--color-surface-container-high) ${(ahorroValue / 60) * 100}%, var(--color-surface-container-high) 100%)`,
                  }}
                />
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-outline">
                  <span>0% · Prudente</span>
                  <span>30% · Equilibrada</span>
                  <span>60% · Ambiciosa</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-xs">
                {[
                  { value: "10", label: "Conservadora" },
                  { value: "20", label: "Equilibrada" },
                  { value: "35", label: "Ambiciosa" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setAhorro(option.value)}
                    aria-pressed={ahorroValue === Number(option.value)}
                    className={`rounded-lg px-2 py-2 text-label-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                      ahorroValue === Number(option.value)
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container text-on-surface-variant hover:bg-primary-fixed"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-error-container px-sm py-xs text-label-sm font-medium text-on-error-container">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-container text-on-primary py-5 px-lg rounded-xl font-headline-md text-headline-md flex items-center justify-center gap-sm active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {loading ? "Optimizando perfil..." : "Comenzar a optimizar"}
              <span className="material-symbols-outlined">rocket_launch</span>
            </button>
            <p className="text-center font-label-sm text-label-sm text-on-surface-variant">
              Al continuar, aceptas nuestros términos de servicio y
              privacidad de datos de confIA.
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
