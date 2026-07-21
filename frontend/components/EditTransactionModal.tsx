"use client";

import { useRef, useState } from "react";
import { api, Transaction, currencySymbol, receiptViewUrl } from "@/lib/api";

export const CATEGORIES = [
  { value: "Transporte", icon: "local_taxi" },
  { value: "Alimentación", icon: "shopping_basket" },
  { value: "Ocio", icon: "local_activity" },
  { value: "Servicios", icon: "subscriptions" },
  { value: "Salario", icon: "payments" },
  { value: "Otros", icon: "receipt_long" },
];

function toDateInputValue(label: string) {
  // "date" here is a free-form display label (e.g. "Hoy, 10:45 AM"), so we
  // can't reliably parse it back into a real date — default to today.
  void label;
  return new Date().toISOString().slice(0, 10);
}

interface EditTransactionModalProps {
  transaction: Transaction;
  currency?: string;
  onClose: () => void;
  onSaved: (transaction: Transaction) => void;
  onDeleted: (id: number) => void;
}

export function EditTransactionModal({
  transaction,
  currency = "PEN",
  onClose,
  onSaved,
  onDeleted,
}: EditTransactionModalProps) {
  const isIncome = transaction.amount >= 0;
  const [title, setTitle] = useState(transaction.title);
  const [category, setCategory] = useState(
    CATEGORIES.some((c) => c.value === transaction.category)
      ? transaction.category
      : CATEGORIES[CATEGORIES.length - 1].value
  );
  const [amount, setAmount] = useState(String(Math.abs(transaction.amount)));
  const [date, setDate] = useState(toDateInputValue(transaction.date));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [receiptImage, setReceiptImage] = useState<string | null>(transaction.receipt_url ?? null);
  const [receiptChanged, setReceiptChanged] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewAmount = Number(amount) || 0;

  function handleReplaceImageClick() {
    fileInputRef.current?.click();
  }

  function handleImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => setNote("No pudimos cargar la imagen. Intenta con otra foto del comprobante.");
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setReceiptImage(dataUrl);
      setReceiptChanged(true);
      setScanning(true);
      setNote(null);
      setSaveError(null);
      try {
        const result = await api.scanReceipt(dataUrl);
        if (result.amount > 0) {
          setTitle(result.title);
          setCategory(
            CATEGORIES.some((c) => c.value === result.category)
              ? result.category
              : CATEGORIES[CATEGORIES.length - 1].value
          );
          setAmount(String(result.amount));
          setNote(
            "Datos actualizados por IA a partir de la nueva imagen: revisa que sean correctos antes de guardar."
          );
        } else {
          setNote(
            "La IA no pudo leer la nueva boleta con confianza: ajusta los datos manualmente."
          );
        }
      } catch {
        // The image is safely attached even when the optional AI extraction
        // service is unavailable. Keep that as a neutral review state rather
        // than exposing transport errors such as "Failed to fetch".
        setNote("Comprobante adjunto. No se pudo leer automáticamente; revisa los datos antes de guardar.");
      } finally {
        setScanning(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = Number(amount);
    if (!title.trim() || !amountNum) return;
    if (!isIncome && !receiptImage) {
      setNote("Adjunta un comprobante para poder guardar este gasto.");
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      const updated = await api.updateTransaction(transaction.id, {
        title: title.trim(),
        category,
        amount: isIncome ? Math.abs(amountNum) : -Math.abs(amountNum),
        completed: Boolean(receiptImage),
        ...(receiptChanged ? { receipt_url: receiptImage } : {}),
      });
      onSaved(updated);
    } catch {
      setSaveError("No se guardaron los cambios. El comprobante sigue adjunto; revisa tu conexión e inténtalo otra vez.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.deleteTransaction(transaction.id);
      onDeleted(transaction.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-[rgba(25,28,29,0.4)] backdrop-blur-sm p-0 md:p-md">
      <div className="w-full max-w-2xl bg-surface-container-lowest rounded-t-xl md:rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] max-h-[90vh] overflow-y-auto flex flex-col">
        <header className="flex justify-between items-center px-margin-mobile md:px-md py-base border-b border-surface-variant sticky top-0 bg-surface-container-lowest z-10">
          <h2 className="font-headline-md text-headline-md text-on-surface">
            Editar Movimiento
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-base hover:bg-surface-variant rounded-full transition-colors active:scale-90"
          >
            <span className="material-symbols-outlined text-on-surface-variant">
              close
            </span>
          </button>
        </header>

        <div className="p-margin-mobile md:p-md flex flex-col gap-md">
          {/* Preview */}
          <section className="p-md rounded-xl space-y-1 border-l-[3px] border-primary bg-gradient-to-r from-white to-primary/5">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                  Vista Previa
                </p>
                <h3 className="font-headline-md text-headline-md truncate">
                  {title || "Sin título"}
                </h3>
              </div>
              <span
                className={`font-headline-md text-headline-md shrink-0 ${
                  isIncome ? "text-secondary" : "text-error"
                }`}
              >
                {isIncome ? "+" : "-"}{currencySymbol(currency)} {previewAmount.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px] text-primary">
                auto_awesome
              </span>
              <p className="font-label-md text-label-md text-primary">
                Categoría: {category}
              </p>
            </div>
          </section>

          <form onSubmit={handleSave} className="flex flex-col gap-md">
            <div className="flex flex-col gap-xs">
              <label
                htmlFor="edit-title"
                className="font-label-md text-label-md text-on-surface-variant ml-1"
              >
                Nombre del comercio
              </label>
              <input
                id="edit-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej. Amazon, Netflix..."
                className="w-full bg-surface-bright border-0 rounded-xl px-4 py-3 font-body-md text-body-md focus:ring-2 focus:ring-primary outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <div className="flex flex-col gap-xs">
                <label
                  htmlFor="edit-amount"
                  className="font-label-md text-label-md text-on-surface-variant ml-1"
                >
                  Monto
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
                    {currencySymbol(currency)}
                  </span>
                  <input
                    id="edit-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-surface-bright border-0 rounded-xl pl-8 pr-4 py-3 font-body-md text-body-md focus:ring-2 focus:ring-primary outline-none"
                    required
                  />
                </div>
              </div>
              <div className="flex flex-col gap-xs">
                <label
                  htmlFor="edit-date"
                  className="font-label-md text-label-md text-on-surface-variant ml-1"
                >
                  Fecha
                </label>
                <input
                  id="edit-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-surface-bright border-0 rounded-xl px-4 py-3 font-body-md text-body-md focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col gap-xs">
              <label
                htmlFor="edit-category"
                className="font-label-md text-label-md text-on-surface-variant ml-1"
              >
                Categoría
              </label>
              <select
                id="edit-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-surface-bright border-0 rounded-xl px-4 py-3 font-body-md text-body-md focus:ring-2 focus:ring-primary outline-none appearance-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.value}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-xs">
              <label className="font-label-md text-label-md text-on-surface-variant ml-1">
                Comprobante {isIncome ? "(opcional)" : "(obligatorio)"}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelected}
              />
              <button
                type="button"
                onClick={handleReplaceImageClick}
                disabled={scanning}
                className="w-full py-4 rounded-xl border-2 border-dashed border-outline-variant text-on-surface-variant flex flex-col items-center justify-center gap-1 hover:bg-surface-container transition-colors disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-2xl">
                  {scanning ? "progress_activity" : "add_a_photo"}
                </span>
                <span className="font-label-md text-label-md">
                  {scanning
                    ? "Analizando con IA..."
                    : receiptImage
                      ? "Reemplazar comprobante"
                      : "Adjuntar comprobante"}
                </span>
              </button>
              {receiptImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={receiptViewUrl(receiptImage)} alt="Comprobante actual" className="mt-2 max-h-36 w-full rounded-lg object-cover" />
              )}
              {note && (
                <p className="text-label-sm text-outline bg-surface-container rounded-lg p-sm flex items-start gap-2">
                  <span className="material-symbols-outlined text-[18px] shrink-0">
                    info
                  </span>
                  {note}
                </p>
              )}
            </div>

            <div className={`flex items-center gap-3 p-md rounded-xl ${receiptImage ? "bg-secondary-container/20" : isIncome ? "bg-surface-bright" : "bg-error-container/40"}`}>
              <div className="flex items-center gap-3">
                <span
                  className={`material-symbols-outlined ${receiptImage ? "text-secondary" : isIncome ? "text-outline" : "text-error"}`}
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {receiptImage ? "verified" : isIncome ? "info" : "upload_file"}
                </span>
                <div>
                  <p className="font-body-md text-body-md text-on-surface">{receiptImage ? "Comprobante adjunto" : isIncome ? "Sin comprobante" : "Comprobante obligatorio"}</p>
                  <p className="text-label-sm text-on-surface-variant">{receiptImage ? "La imagen quedó lista para guardar." : isIncome ? "Puedes registrarlo sin evidencia." : "Adjunta una imagen para continuar."}</p>
                </div>
              </div>
            </div>

            {saveError && (
              <p role="alert" className="rounded-xl bg-error-container px-4 py-3 text-label-sm text-on-error-container flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
                {saveError}
              </p>
            )}

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="submit"
                disabled={saving || (!isIncome && !receiptImage)}
                className="w-full bg-primary text-on-primary font-headline-md text-headline-md py-3 rounded-xl shadow-lg hover:opacity-90 active:scale-95 transition-all disabled:opacity-60"
              >
                {saving ? "Guardando..." : "Guardar Cambios"}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="w-full border-2 border-error text-error font-label-md text-label-md py-3 rounded-xl hover:bg-error/5 active:scale-95 transition-all disabled:opacity-60"
              >
                {deleting ? "Eliminando..." : "Eliminar Movimiento"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
