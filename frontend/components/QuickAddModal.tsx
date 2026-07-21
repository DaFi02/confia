"use client";

import { useRef, useState } from "react";
import { api, formatMoney } from "@/lib/api";
import { CATEGORIES } from "@/components/EditTransactionModal";

export function QuickAddModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<"expense" | "income">("expense");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0].value);
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function selectReceipt(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => setSaveError("No pudimos cargar la imagen. Intenta con otra foto del comprobante.");
    reader.onload = () => {
      setReceipt(reader.result as string);
      setSaveError(null);
    };
    reader.readAsDataURL(file);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!title.trim() || value <= 0) return;
    if (type === "expense" && !receipt) return;
    setSaveError(null);
    setSaving(true);
    try {
      await api.addTransaction({
        title: title.trim(), category, amount: type === "income" ? value : -value,
        icon: type === "income" ? "payments" : CATEGORIES.find((item) => item.value === category)?.icon ?? "receipt_long",
        completed: Boolean(receipt), receipt_url: receipt,
      });
      onSaved();
    } catch {
      setSaveError("No se pudo guardar el movimiento. Tu comprobante sigue adjunto; revisa tu conexión e inténtalo otra vez.");
    } finally { setSaving(false); }
  }

  function changeType(nextType: "expense" | "income") {
    setType(nextType);
    if (nextType === "income") setCategory("Salario");
    if (nextType === "expense" && category === "Salario") setCategory(CATEGORIES[0].value);
  }

  const availableCategories = type === "income"
    ? CATEGORIES.filter((item) => item.value === "Salario" || item.value === "Otros")
    : CATEGORIES.filter((item) => item.value !== "Salario");

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[rgba(25,28,29,0.45)] p-0 backdrop-blur-sm md:items-center md:p-md" role="dialog" aria-modal="true" aria-labelledby="quick-add-title">
      <form
        onSubmit={submit}
        className="w-full max-w-[36rem] max-h-[92dvh] min-w-0 overflow-y-auto rounded-t-2xl bg-surface-container-lowest px-margin-mobile pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2 shadow-2xl md:rounded-2xl md:p-lg"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-outline-variant md:hidden" aria-hidden="true" />
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-label-sm font-semibold uppercase tracking-[0.12em] text-primary">Nuevo movimiento</p>
            <h2 id="quick-add-title" className="mt-1 font-headline-md text-headline-md text-on-surface">Registro rápido</h2>
            <p className="mt-1 text-label-sm text-on-surface-variant">Completa solo lo esencial.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="shrink-0 rounded-full p-3 text-on-surface-variant transition-colors hover:bg-surface-container active:scale-95"><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-surface-container p-1.5" aria-label="Tipo de movimiento">
          {([ ["expense", "Gasto", "north_east"], ["income", "Ingreso", "south_west"] ] as const).map(([value, label, icon]) => <button key={value} type="button" onClick={() => changeType(value)} aria-pressed={type === value} className={`flex min-h-12 items-center justify-center gap-2 rounded-lg text-label-md font-semibold transition-all active:scale-[0.98] ${type === value ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant"}`}><span className="material-symbols-outlined text-[18px]">{icon}</span>{label}</button>)}
        </div>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-label-sm font-medium text-on-surface-variant">Monto (S/)<input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" inputMode="decimal" min="0.01" step="0.01" required autoFocus placeholder="0.00" className="min-h-14 rounded-xl bg-surface-container px-4 font-headline-md text-headline-md text-on-surface outline-none transition-shadow placeholder:text-outline-variant focus:ring-2 focus:ring-primary" /></label>
          <label className="flex flex-col gap-1.5 text-label-sm font-medium text-on-surface-variant">¿Para qué fue?<input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder={type === "income" ? "Ej. Pago de julio" : "Ej. Almuerzo"} className="min-h-13 rounded-xl bg-surface-container px-4 text-body-md text-on-surface outline-none transition-shadow placeholder:text-outline-variant focus:ring-2 focus:ring-primary" /></label>
          <fieldset>
            <legend className="mb-2 text-label-sm font-medium text-on-surface-variant">Categoría</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {availableCategories.map((item) => <button key={item.value} type="button" onClick={() => setCategory(item.value)} aria-pressed={category === item.value} className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-left text-label-sm font-semibold transition-colors active:scale-[0.98] ${category === item.value ? "bg-primary-fixed text-on-primary-fixed ring-1 ring-primary" : "bg-surface-container text-on-surface-variant"}`}><span className="material-symbols-outlined text-[18px]">{item.icon}</span><span className="truncate">{item.value}</span></button>)}
            </div>
          </fieldset>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={selectReceipt} />
        <div className={`mt-4 flex items-center justify-between gap-3 rounded-xl p-3 ${receipt ? "bg-secondary-container/20" : type === "expense" ? "bg-error-container/40" : "bg-surface-container"}`}>
          <div className="min-w-0"><p className="text-label-md font-semibold text-on-surface">Comprobante <span className="font-normal text-on-surface-variant">· {type === "expense" ? "obligatorio" : "opcional"}</span></p><p className="truncate text-label-sm text-on-surface-variant">{receipt ? "Adjunto listo para guardar." : type === "expense" ? "Adjunta una imagen para guardar el gasto." : "Puedes agregarlo después."}</p></div>
          <button type="button" onClick={() => receipt ? setReceipt(null) : fileInputRef.current?.click()} className="shrink-0 rounded-lg px-3 py-2.5 text-label-sm font-semibold text-primary transition-colors hover:bg-primary/10 active:scale-95">{receipt ? "Quitar" : "Adjuntar"}</button>
        </div>
        {saveError && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-error-container px-4 py-3 text-label-sm text-on-error-container">
            <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
            {saveError}
          </p>
        )}
        <button disabled={saving || (type === "expense" && !receipt)} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-label-md font-semibold text-on-primary shadow-[0_8px_18px_rgba(48,54,211,0.22)] transition-transform active:scale-[0.98] disabled:opacity-60"><span className="material-symbols-outlined text-[20px]">check_circle</span>{saving ? "Guardando…" : type === "expense" && !receipt ? "Adjunta un comprobante para guardar" : `Guardar ${amount ? formatMoney(Number(amount)) : "movimiento"}`}</button>
      </form>
    </div>
  );
}
