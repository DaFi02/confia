"use client";

import { useEffect, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import {
  FixedExpensesEditor,
  FixedExpenseForm,
  fixedExpenseFromApi,
  fixedExpensesToApi,
} from "@/components/FixedExpensesEditor";
import { api, CURRENCIES, currencySymbol } from "@/lib/api";
import { useLanguage } from "@/components/LanguageProvider";

export default function AjustesPage() {
  const [ingreso, setIngreso] = useState("");
  const [expenses, setExpenses] = useState<FixedExpenseForm[]>([]);
  const [ahorro, setAhorro] = useState("20");
  const [currency, setCurrency] = useState("PEN");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { language, setLanguage } = useLanguage();

  useEffect(() => {
    api
      .profile()
      .then((p) => {
        setIngreso(String(p.ingreso));
        setExpenses(p.gastos_fijos.map(fixedExpenseFromApi));
        setAhorro(String(p.ahorro_pct));
        setCurrency(p.currency);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await api.onboarding({
        ingreso: Number(ingreso) || 0,
        gastos_fijos: fixedExpensesToApi(expenses),
        ahorro_pct: Number(ahorro) || 0,
        currency,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-surface flex items-center gap-3 px-margin-mobile h-16 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="w-10 h-10 bg-primary-container rounded-xl flex items-center justify-center text-on-primary-container">
          <span className="material-symbols-outlined">settings</span>
        </div>
        <div>
          <h1 className="font-headline-md text-headline-md font-bold text-on-surface">
            Ajustes
          </h1>
          <p className="text-label-sm text-on-surface-variant">
            confIA — Yo confío, tú confIA
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-margin-mobile pb-28 w-full flex flex-col gap-md">
        <section className="bg-surface-container-lowest rounded-xl p-md shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex items-center gap-4">
          <div className="w-14 h-14 rounded-full overflow-hidden bg-surface-container-high border border-outline-variant">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="w-full h-full object-cover"
              alt="Avatar de usuario"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBIs9fAhcItQOmOMQTVZUl37ggt0_tJVrnCKfblrZjEIg4XykshL_k-x-sEUbJQvI9ninp-dU8_JwOfUqozYv-9iCl9ELmTITuzX4SNM_WbkDzzj7bhMqubh6pHKtgHaODhbRYC4GzKlJz02y3dUzCBJe8bcKrAODF_ybLA2DGmgsljaqATKEVT4NjNQ3L3bOuLdv4Z2NgFneGCrJ-6vrMGm-J3vX1eTU0waunsKBe4Kz4lQxqwUQf_MaVg92t2Qfbw60gGCw-wSH-2"
            />
          </div>
          <div>
            <h2 className="font-body-lg text-body-lg text-on-surface font-semibold">
              Usuario
            </h2>
            <p className="text-label-sm text-on-surface-variant">
              Cuenta personal · Plan gratuito
            </p>
          </div>
        </section>

        <section className="bg-surface-container-lowest rounded-xl p-md shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-md">
            Preferencias
          </h2>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-body-md text-body-md text-on-surface">
                Notificaciones
              </p>
              <p className="text-label-sm text-on-surface-variant">
                Alertas de gastos y consejos de la IA
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifications}
              onClick={() => setNotifications((v) => !v)}
              className={`w-12 h-7 rounded-full flex items-center px-1 transition-colors ${
                notifications ? "bg-primary justify-end" : "bg-surface-container-highest justify-start"
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-white shadow" />
            </button>
          </div>
          <div className="mt-3 border-t border-surface-variant pt-3">
            <label htmlFor="language" className="font-body-md text-body-md text-on-surface">
              Language
            </label>
            <p className="mb-2 text-label-sm text-on-surface-variant">
              Choose how confIA is displayed.
            </p>
            <select
              id="language"
              value={language}
              onChange={(event) => setLanguage(event.target.value as "en" | "es")}
              className="w-full rounded-xl bg-background px-4 py-3 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </div>
        </section>

        <section className="bg-surface-container-lowest rounded-xl p-md shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-md">
            Mi perfil financiero
          </h2>

          {loading ? (
            <p className="text-on-surface-variant">Cargando...</p>
          ) : (
            <form onSubmit={handleSave} className="flex flex-col gap-md">
              <Field
                id="s-ingreso"
                label="Ingreso fijo estimado"
                prefix={currencySymbol(currency)}
                value={ingreso}
                onChange={setIngreso}
              />

              <div className="flex flex-col gap-xs">
                <label htmlFor="s-currency" className="font-label-md text-label-md text-on-surface-variant">Moneda de visualización</label>
                <select id="s-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full rounded-xl bg-background px-4 py-4 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary">
                  {(["Latinoamérica", "Internacional", "Europa"] as const).map((group) => <optgroup key={group} label={group}>{CURRENCIES.filter(([, , region]) => region === group).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</optgroup>)}
                </select>
              </div>

              <FixedExpensesEditor items={expenses} onChange={setExpenses} />

              <Field
                id="s-ahorro"
                label="Meta de ahorro (%)"
                suffix="%"
                value={ahorro}
                onChange={setAhorro}
              />

              {error && (
                <p className="text-error text-label-sm font-medium">{error}</p>
              )}
              {saved && (
                <p className="text-secondary text-label-sm font-medium">
                  Perfil actualizado correctamente.
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full bg-primary hover:bg-primary-container text-on-primary py-4 px-lg rounded-xl font-label-md text-label-md flex items-center justify-center gap-sm active:scale-[0.98] transition-all disabled:opacity-60"
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </form>
          )}
        </section>

        <section className="text-center text-label-sm text-outline pt-sm">
          confIA v1.0 · Hecho con IA para tu tranquilidad financiera
        </section>
      </main>

      <BottomNav />
    </>
  );
}

function Field({
  id,
  label,
  prefix,
  suffix,
  value,
  onChange,
}: {
  id: string;
  label: string;
  prefix?: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-xs">
      <label
        htmlFor={id}
        className="font-label-md text-label-md text-on-surface-variant"
      >
        {label}
      </label>
      <div className="relative group">
        {prefix && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full bg-background border-0 rounded-xl py-4 font-body-md text-body-md focus:ring-2 focus:ring-primary focus:bg-surface-container-lowest outline-none ${
            prefix ? "pl-8 pr-4" : suffix ? "pl-4 pr-8" : "px-4"
          }`}
          required
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
