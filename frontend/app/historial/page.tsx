"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { CATEGORIES } from "@/components/EditTransactionModal";
import { EditTransactionModal } from "@/components/EditTransactionModal";
import { api, Transaction, formatMoney, receiptViewUrl } from "@/lib/api";

type Filter = "all" | "income" | "expense";
type EvidenceFilter = "" | "with" | "without";

export default function HistorialPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currency, setCurrency] = useState("PEN");
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState("");
  const [month, setMonth] = useState("");
  const [evidence, setEvidence] = useState<EvidenceFilter>("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Transaction | null>(null);

  function buildParams(kind: Filter) {
    const params: { category?: string; kind?: string; month?: string; evidence?: string } = {};
    if (kind !== "all") params.kind = kind;
    if (category) params.category = category;
    if (month) params.month = month;
    if (evidence) params.evidence = evidence;
    return Object.keys(params).length ? params : undefined;
  }

  async function load(kind: Filter) {
    setLoading(true);
    const res = await api.transactions(buildParams(kind));
    setTransactions(res.transactions);
    setCurrency(res.currency);
    setLoading(false);
  }

  useEffect(() => {
    // Deferred to a microtask so the fetch's setState calls aren't
    // synchronous within the effect body (react-hooks/set-state-in-effect).
    queueMicrotask(() => load(filter));
  }, [filter, category, month, evidence]);

  async function handleDelete(id: number) {
    await api.deleteTransaction(id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }

  function handleSaved(updated: Transaction) {
    setTransactions((prev) =>
      prev.map((t) => (t.id === updated.id ? updated : t))
    );
    setEditing(null);
  }

  function handleDeletedFromModal(id: number) {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    setEditing(null);
  }

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-surface flex justify-between items-center px-margin-mobile h-16 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/ajustes")}
            aria-label="Ir a Ajustes"
            className="w-10 h-10 rounded-full overflow-hidden bg-surface-container active:scale-90 transition-transform"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="w-full h-full object-cover"
              alt="Avatar de usuario"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBdwgt4uRaPN3In-sVvuPTBIj_XFPR4sqhEYz2PqTmX_xyKR14wXmG0QEFeEVKH0e-3THg-rx-OTIfOrmfpRqcm95d_GUtQNCImOwHjUNYxN2_NoQUHBpy8SoOjK9Jxs7Ktb4m6HUYCA8jiA3Q9htdCb4JUzLQU6679Pdjtg6aDwq-dcDuC0mbHBVm9H2ZY_AljbsODX5-Vms9yyr-ifUj8rg_2e6DgtiU02CTlcE7MgZ6boF5A0UuzAFXm49RLemTpgz3D2KmaqxSM"
            />
          </button>
          <div className="flex flex-col">
            <span className="font-headline-md text-headline-md font-bold text-primary">
              Historial
            </span>
            <span className="text-label-sm text-on-surface-variant">
              Encuentra cualquier movimiento
            </span>
          </div>
        </div>
        <span className="material-symbols-outlined text-primary">
          notifications
        </span>
      </header>

      <main className="max-w-5xl mx-auto px-margin-mobile pt-md md:pt-lg pb-24 w-full">
        <div className="mb-md md:mb-lg">
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-xl md:text-headline-xl text-on-surface tracking-tight mb-sm md:mb-md">
            Todos los Movimientos
          </h1>
          <div className="grid grid-cols-3 gap-1 bg-surface-container-highest/60 p-1 rounded-full">
            {(
              [
                { key: "all", label: "Todos", icon: "calendar_month" },
                { key: "income", label: "Ingresos", icon: "arrow_downward" },
                { key: "expense", label: "Gastos", icon: "arrow_upward" },
              ] as { key: Filter; label: string; icon: string }[]
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-2 py-base rounded-full font-label-md text-label-md flex items-center justify-center gap-1.5 transition-all ${
                  filter === f.key
                    ? "bg-primary text-on-primary shadow-[0_2px_8px_rgba(70,72,212,0.3)]"
                    : "text-on-surface-variant hover:bg-surface-variant/60"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {f.icon}
                </span>
                {f.label}
              </button>
            ))}
          </div>
          <div className="mt-sm grid grid-cols-3 gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="col-span-1 px-2 py-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest text-label-sm text-label-sm text-on-surface"
            >
              <option value="">Toda categoría</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.value}
                </option>
              ))}
            </select>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="col-span-1 px-2 py-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest text-label-sm text-label-sm text-on-surface"
            />
            <select
              value={evidence}
              onChange={(e) => setEvidence(e.target.value as EvidenceFilter)}
              className="col-span-1 px-2 py-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest text-label-sm text-label-sm text-on-surface"
            >
              <option value="">Toda evidencia</option>
              <option value="with">Con comprobante</option>
              <option value="without">Sin comprobante</option>
            </select>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden">
          {loading && (
            <p className="p-md text-on-surface-variant">Cargando...</p>
          )}
          {!loading && transactions.length === 0 && (
            <p className="p-md text-on-surface-variant">
              No hay movimientos para este filtro.
            </p>
          )}
          <div className="divide-y divide-surface-variant">
            {transactions.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 px-md py-sm transition-colors hover:bg-surface-container"
              >
                <button
                  type="button"
                  onClick={() => setEditing(t)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <div className="relative w-11 h-11 rounded-xl bg-surface-container-high flex items-center justify-center text-on-surface-variant shrink-0">
                    <span className="material-symbols-outlined">{t.icon}</span>
                    <span
                      className="absolute -bottom-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-surface-container-lowest"
                      title={
                        t.receipt_url
                          ? "Con comprobante"
                          : "Falta comprobante"
                      }
                    >
                      <span className="material-symbols-outlined text-[13px] leading-none">
                        {t.receipt_url ? (
                          <span className="text-secondary">check_circle</span>
                        ) : (
                          <span className="text-primary">warning</span>
                        )}
                      </span>
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-label-md text-label-md text-on-surface truncate">
                      {t.title}
                    </p>
                    <p className="font-label-sm text-label-sm text-outline truncate">
                      {t.category} · {t.date}
                    </p>
                  </div>
                  {t.receipt_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={receiptViewUrl(t.receipt_url)} alt="Comprobante adjunto" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                  )}
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <span
                    className={`font-body-md text-body-md font-semibold ${
                      t.amount < 0 ? "text-error" : "text-secondary"
                    }`}
                  >
                    {t.amount < 0 ? "-" : "+"}{formatMoney(t.amount, 2, currency)}
                  </span>
                  <button
                    onClick={() => setEditing(t)}
                    className="p-2 text-outline-variant hover:text-primary transition-colors hover:bg-primary/5 rounded-lg"
                    aria-label="Editar movimiento"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      edit
                    </span>
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="p-2 text-outline-variant hover:text-error transition-colors hover:bg-error/5 rounded-lg"
                    aria-label="Eliminar movimiento"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      delete
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="px-md py-md border-t border-surface-variant flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-outline">
              Mostrando {transactions.length} movimiento(s)
            </span>
            <button
              type="button"
              onClick={() => api.exportTransactions(buildParams(filter))}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full font-label-sm text-label-sm font-semibold text-on-primary bg-primary shadow-[0_2px_8px_rgba(70,72,212,0.25)] hover:bg-primary/90 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">
                download
              </span>
              Exportar CSV
            </button>
          </div>
        </div>

        <div className="mt-xl p-md rounded-xl bg-primary-fixed/40 shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex items-start gap-md">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container-lowest overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/confia-icon-transparent.png"
              alt=""
              className="h-7 w-7 object-contain"
            />
          </div>
          <div>
            <h3 className="font-label-md text-label-md text-primary font-bold mb-xs">
              Insight de IA: confIA
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
              Tus gastos en &quot;Ocio&quot; han disminuido un 12% este mes en
              comparación con el anterior. Mantén este ritmo para alcanzar tu
              meta de ahorro de fin de año.
            </p>
          </div>
        </div>
      </main>

      {editing && (
        <EditTransactionModal
          transaction={editing}
          currency={currency}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onDeleted={handleDeletedFromModal}
        />
      )}

      <BottomNav />
    </>
  );
}
