"use client";

import { useEffect, useRef, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { api, currencySymbol } from "@/lib/api";

interface ChatEntry {
  id: number;
  from: "ai" | "user";
  text: string;
  image?: string;
  detected?: {
    category: string;
    amount: number;
    type: "income" | "expense";
    title?: string;
    date?: string;
    source?: "receipt" | "chat";
  };
}

type DetectedMovement = NonNullable<ChatEntry["detected"]>;

const CATEGORIES = [
  { value: "Transporte", icon: "local_taxi" },
  { value: "Alimentación", icon: "shopping_basket" },
  { value: "Ocio", icon: "local_activity" },
  { value: "Servicios", icon: "subscriptions" },
  { value: "Salario", icon: "payments" },
  { value: "Otros", icon: "receipt_long" },
];

function iconForCategory(category: string) {
  return (
    CATEGORIES.find((c) => c.value.toLowerCase() === category.toLowerCase())
      ?.icon ?? "receipt_long"
  );
}

let entryId = 0;

export default function AiHubPage() {
  const [entries, setEntries] = useState<ChatEntry[]>([
    {
      id: entryId++,
      from: "ai",
      text: "Hola. Soy confIA. Cuéntame un gasto o un ingreso (ej: 'gasté 45 en transporte' o 'recibí 500 de salario'), sube una foto de tu boleta, o regístralo manualmente con el botón +.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [scanningReceipt, setScanningReceipt] = useState(false);
  const [scanStage, setScanStage] = useState<"reading" | "structuring">("reading");
  const [toast, setToast] = useState<string | null>(null);
  const [confirmedIds, setConfirmedIds] = useState<Set<number>>(new Set());
  // Text chat is turn-based, but a money amount often arrives in the next
  // message ("gasté en comida" → "16.50"). Keep the useful context instead
  // of classifying that second message as a brand-new "Otros" transaction.
  const [pendingMovement, setPendingMovement] = useState<DetectedMovement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualType, setManualType] = useState<"expense" | "income">(
    "expense"
  );
  const [manualTitle, setManualTitle] = useState("");
  const [manualCategory, setManualCategory] = useState(CATEGORIES[0].value);
  const [manualAmount, setManualAmount] = useState("");
  const [manualSaving, setManualSaving] = useState(false);
  const [manualNote, setManualNote] = useState<string | null>(null);
  const [manualImage, setManualImage] = useState<string | null>(null);
  const [manualScanning, setManualScanning] = useState(false);
  const manualFileInputRef = useRef<HTMLInputElement>(null);
  const [currency, setCurrency] = useState("PEN");

  useEffect(() => {
    api.profile().then((p) => setCurrency(p.currency)).catch(() => {
      // Keep the PEN default if the profile fetch fails; not critical here.
    });
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const userEntry: ChatEntry = { id: entryId++, from: "user", text };
    setEntries((prev) => [...prev, userEntry]);

    // Honor a natural-language confirmation as well as the visible button.
    // This is especially helpful after the user supplies a missing amount.
    if (pendingMovement && /^(sí|si|confirmo|confirmar|dale|ok|okay)$/i.test(text)) {
      if (pendingMovement.type === "expense") {
        openExpenseWithReceipt(pendingMovement);
        setEntries((prev) => [...prev, {
          id: entryId++,
          from: "ai",
          text: "Abrí el registro con los datos detectados. Solo adjunta el comprobante para guardarlo.",
        }]);
      } else {
        setSending(true);
        try {
          await api.addTransaction({
            title: `Ingreso: ${pendingMovement.category}`,
            category: pendingMovement.category,
            amount: Math.abs(pendingMovement.amount),
            icon: "payments",
          });
          setEntries((prev) => [...prev, {
            id: entryId++,
            from: "ai",
            text: `Listo. Registré el ingreso por ${currencySymbol(currency)} ${pendingMovement.amount.toFixed(2)}.`,
          }]);
          setPendingMovement(null);
        } catch {
          setEntries((prev) => [...prev, {
            id: entryId++,
            from: "ai",
            text: "No pude registrar el ingreso. Inténtalo nuevamente.",
          }]);
        } finally {
          setSending(false);
        }
      }
      return;
    }

    setSending(true);
    try {
      const res = await api.aiChat(text);
      const detectedAmount = res.detected_amount;
      const isAmountOnlyReply = detectedAmount > 0 && /^\s*(?:s\/|\$)?\s*\d+(?:[.,]\d{1,2})?\s*$/.test(text);
      const detected: DetectedMovement | undefined =
        detectedAmount > 0
          ? {
              category: isAmountOnlyReply && pendingMovement
                ? pendingMovement.category
                : res.detected_category,
              amount: detectedAmount,
              type: isAmountOnlyReply && pendingMovement
                ? pendingMovement.type
                : res.detected_type,
            }
          : undefined;

      if (detected) {
        setPendingMovement(detected);
      } else if (
        res.detected_category !== "Otros" ||
        /\b(gast[ée]|pag[ué]|compr[ée]|ingreso|recib[íi]|sueldo|salario)\b/i.test(text)
      ) {
        // Preserve a meaningful category while waiting for the amount.
        setPendingMovement({
          category: res.detected_category,
          amount: 0,
          type: res.detected_type,
        });
      }
      const aiEntry: ChatEntry = {
        id: entryId++,
        from: "ai",
        text: detected && isAmountOnlyReply && pendingMovement
          ? `Detecté un ${detected.type === "income" ? "ingreso" : "gasto"} de ${currencySymbol(currency)} ${detected.amount.toFixed(2)} en ${detected.category}. ¿Quieres que lo registre?`
          : res.reply,
        detected,
      };
      setEntries((prev) => [...prev, aiEntry]);
    } catch (err) {
      setEntries((prev) => [
        ...prev,
        {
          id: entryId++,
          from: "ai",
          text:
            err instanceof Error
              ? `No pude procesar ese mensaje ahora. ${err.message}`
              : "No pude procesar ese mensaje ahora. Inténtalo de nuevo en unos segundos.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function openExpenseWithReceipt(detected: DetectedMovement) {
    setManualType("expense");
    setManualTitle(`Gasto: ${detected.category}`);
    setManualCategory(detected.category);
    setManualAmount(String(detected.amount));
    setManualImage(null);
    setManualNote("Adjunta el comprobante para registrar este gasto.");
    setManualOpen(true);
  }

  async function handleConfirm(entry: ChatEntry) {
    if (!entry.detected) return;
    if (entry.detected.source === "receipt" && entry.image) {
      try {
        await api.addTransaction({
          title: entry.detected.title ?? `Gasto: ${entry.detected.category}`,
          category: entry.detected.category,
          amount: entry.detected.type === "income" ? Math.abs(entry.detected.amount) : -Math.abs(entry.detected.amount),
          icon: iconForCategory(entry.detected.category),
          completed: true,
          receipt_url: entry.image,
        });
        setConfirmedIds((prev) => new Set(prev).add(entry.id));
        setPendingMovement(null);
        setToast("Registro guardado exitosamente");
        window.setTimeout(() => setToast(null), 3500);
      } catch {
        setToast("No se pudo guardar. Inténtalo nuevamente.");
        window.setTimeout(() => setToast(null), 3500);
      }
      return;
    }
    const isIncome = entry.detected.type === "income";
    if (!isIncome) {
      openExpenseWithReceipt(entry.detected);
      return;
    }
    await api.addTransaction({
      title: `${isIncome ? "Ingreso" : "Gasto"}: ${entry.detected.category}`,
      category: entry.detected.category,
      amount: isIncome
        ? Math.abs(entry.detected.amount)
        : -Math.abs(entry.detected.amount),
      icon: isIncome ? "payments" : "receipt_long",
      completed: false,
    });
    setConfirmedIds((prev) => new Set(prev).add(entry.id));
    setPendingMovement(null);
  }

  function handleManualImageButtonClick() {
    manualFileInputRef.current?.click();
  }

  function handleManualImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setManualImage(dataUrl);
      setManualScanning(true);
      setManualNote(null);
      try {
        const result = await api.scanReceipt(dataUrl);
        if (result.amount > 0) {
          setManualType(result.type);
          setManualTitle(result.title);
          setManualCategory(
            CATEGORIES.some((c) => c.value === result.category)
              ? result.category
              : CATEGORIES[CATEGORIES.length - 1].value
          );
          setManualAmount(String(result.amount));
          setManualNote(
            "Datos leídos automáticamente por IA a partir de la imagen: revisa que sean correctos antes de guardar."
          );
        } else {
          setManualNote(
            "La IA no pudo leer la boleta con confianza: completa los datos manualmente."
          );
        }
      } catch (err) {
        setManualNote(
          err instanceof Error
            ? err.message
            : "No se pudo usar la IA para leer la boleta: ajusta los datos manualmente."
        );
      } finally {
        setManualScanning(false);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleRemoveManualImage() {
    setManualImage(null);
    setManualNote(null);
  }

  function handleImageButtonClick() {
    fileInputRef.current?.click();
  }

  function handleImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setEntries((prev) => [
        ...prev,
        { id: entryId++, from: "user", text: "", image: dataUrl },
      ]);
      setManualImage(dataUrl);
      setScanningReceipt(true);
      setScanStage("reading");
      window.setTimeout(() => setScanStage("structuring"), 900);
      try {
        const result = await api.scanReceipt(dataUrl);
        if (result.amount > 0) {
          setEntries((prev) => [
            ...prev,
            {
              id: entryId++,
              from: "ai",
              text: "Extracción completada. Revisé los campos detectados y preparé un registro auditable.",
              image: dataUrl,
              detected: {
                title: result.title,
                category: result.category,
                amount: result.amount,
                type: result.type,
                date: result.date || new Intl.DateTimeFormat("es-PE", {
                  day: "2-digit", month: "short", year: "numeric",
                }).format(new Date()),
                source: "receipt",
              },
            },
          ]);
          setManualType(result.type);
          setManualTitle(result.title);
          setManualCategory(
            CATEGORIES.some((c) => c.value === result.category)
              ? result.category
              : CATEGORIES[CATEGORIES.length - 1].value
          );
          setManualAmount(String(result.amount));
          setManualNote(
            "Datos leídos automáticamente por IA a partir de la imagen: revisa que sean correctos antes de guardar."
          );
        } else {
          setEntries((prev) => [
            ...prev,
            {
              id: entryId++,
              from: "ai",
              text: "No pude leer los datos de la boleta con confianza. Completa el formulario manualmente.",
            },
          ]);
          setManualType("expense");
          setManualTitle("");
          setManualCategory(CATEGORIES[0].value);
          setManualAmount("");
          setManualNote(
            "La IA no pudo leer la boleta con confianza: ajusta los datos antes de guardar."
          );
        }
      } catch (err) {
        setEntries((prev) => [
          ...prev,
          {
            id: entryId++,
            from: "ai",
            text:
              err instanceof Error
                ? err.message
                : "No pude analizar la imagen. Completa el formulario manualmente.",
          },
        ]);
        setManualType("expense");
        setManualTitle("");
        setManualCategory(CATEGORIES[0].value);
        setManualAmount("");
        setManualNote(
          "No se pudo usar la IA para leer la boleta: ajusta los datos manualmente."
        );
      } finally {
        setScanningReceipt(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = Number(manualAmount);
    if (!manualTitle.trim() || !amountNum) return;
    if (manualType === "expense" && !manualImage) {
      setManualNote("Adjunta un comprobante para poder guardar este gasto.");
      return;
    }
    setManualSaving(true);
    try {
      const isIncome = manualType === "income";
      await api.addTransaction({
        title: manualTitle.trim(),
        category: manualCategory,
        amount: isIncome ? Math.abs(amountNum) : -Math.abs(amountNum),
        icon: isIncome ? "payments" : iconForCategory(manualCategory),
        completed: Boolean(manualImage),
        receipt_url: manualImage,
      });
      setEntries((prev) => [
        ...prev,
        {
          id: entryId++,
          from: "ai",
          text: `Listo. Registré ${isIncome ? "el ingreso" : "el gasto"} "${manualTitle.trim()}" por ${currencySymbol(currency)} ${Math.abs(
            amountNum
          ).toFixed(2)}.`,
        },
      ]);
      setManualOpen(false);
      setManualImage(null);
      setPendingMovement(null);
    } finally {
      setManualSaving(false);
    }
  }

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-surface flex justify-between items-center px-margin-mobile h-16 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="max-w-2xl mx-auto w-full flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-container/20 flex items-center justify-center overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/confia-icon-transparent.png"
              alt="confIA"
              className="w-7 h-7 object-contain"
            />
          </div>
          <div>
            <h1 className="font-headline-md text-headline-md font-bold text-primary">
              IA Financiera
            </h1>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-secondary-fixed-dim" />
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                En línea
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="pt-md pb-40 px-margin-mobile flex flex-col overflow-y-auto flex-1">
        <div className="max-w-2xl mx-auto w-full flex flex-col gap-gutter">
        {entries.map((entry) =>
          entry.from === "ai" ? (
            <div key={entry.id} className="flex flex-col gap-2 max-w-[90%] self-start">
              <div className="max-w-full p-md rounded-2xl bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)] border-l-2 border-primary">
                <p className="font-body-md text-body-md text-on-surface-variant">
                  {entry.text}
                </p>
              </div>
              {entry.detected && (
                <div className="overflow-hidden rounded-2xl bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
                  {entry.detected.source === "receipt" && (
                    <div className="flex items-center justify-between bg-primary px-md py-2 text-on-primary">
                      <span className="text-[11px] font-bold uppercase tracking-[0.14em]">JSON estructurado · listo para auditar</span>
                      <span className="material-symbols-outlined text-[18px]">data_object</span>
                    </div>
                  )}
                  <div className="p-md">
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-label-md text-label-md text-primary uppercase tracking-wider">
                      {entry.detected.source === "receipt" ? "Boleta procesada" : entry.detected.type === "income"
                        ? "Ingreso detectado"
                        : "Gasto detectado"}
                    </span>
                    <span className="material-symbols-outlined text-primary-container">
                      verified
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mb-4">
                    <div
                      className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                        entry.detected.type === "income"
                          ? "bg-secondary/10"
                          : "bg-error/10"
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined text-3xl ${
                          entry.detected.type === "income"
                            ? "text-secondary"
                            : "text-error"
                        }`}
                      >
                        {entry.detected.type === "income"
                          ? "payments"
                          : "shopping_bag"}
                      </span>
                    </div>
                    <div>
                      <h2
                        className={`font-headline-lg-mobile text-headline-lg-mobile ${
                          entry.detected.type === "income"
                            ? "text-secondary"
                            : "text-on-surface"
                        }`}
                      >
                        {entry.detected.type === "income" ? "+" : "-"}{currencySymbol(currency)}{" "}
                        {entry.detected.amount.toFixed(2)}
                      </h2>
                      <p className="font-body-md text-body-md text-on-surface-variant capitalize">
                        {entry.detected.category}
                      </p>
                    </div>
                  </div>
                  {entry.detected.source === "receipt" && (
                    <div className="mb-4 grid grid-cols-2 gap-2 border-y border-surface-container py-3 text-label-sm">
                      <div><p className="text-outline">Fecha</p><p className="mt-0.5 font-semibold text-on-surface">{entry.detected.date}</p></div>
                      <div><p className="text-outline">Categoría</p><p className="mt-0.5 font-semibold text-on-surface">{entry.detected.category}</p></div>
                      <div className="col-span-2"><p className="text-outline">Concepto extraído</p><p className="mt-0.5 font-semibold text-on-surface">{entry.detected.title}</p></div>
                    </div>
                  )}
                  <button
                    onClick={() => handleConfirm(entry)}
                    disabled={confirmedIds.has(entry.id)}
                    className="w-full py-3 bg-primary text-on-primary font-label-md text-label-md rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                  >
                    {confirmedIds.has(entry.id)
                      ? "Registrado ✓"
                      : entry.detected.source === "receipt"
                        ? "Aceptar y guardar"
                      : entry.detected.type === "expense"
                        ? "Adjuntar comprobante y registrar"
                        : "Confirmar transacción"}
                  </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              key={entry.id}
              className={`max-w-[70%] self-end ${
                entry.image
                  ? "p-1 rounded-2xl bg-primary shadow-md"
                  : "p-md rounded-2xl bg-primary text-on-primary shadow-md"
              }`}
            >
              {entry.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={entry.image}
                  alt="Boleta adjunta"
                  className="w-full max-h-64 object-cover rounded-xl"
                />
              )}
              {entry.text && (
                <p className="font-body-md text-body-md text-on-primary px-1 pt-1">
                  {entry.text}
                </p>
              )}
            </div>
          )
        )}
        {sending && (
          <p className="text-label-sm text-outline self-start">Escribiendo...</p>
        )}
        {scanningReceipt && (
          <div className="self-start rounded-2xl border border-primary/10 bg-primary-fixed/30 px-4 py-3 text-label-sm text-on-primary-fixed-variant shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-primary">
              <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
              Analizando con IA...
            </div>
            <p className="mt-1.5 text-[12px]">{scanStage === "reading" ? "Leyendo texto y totales de la boleta" : "Estructurando datos para tu historial"}</p>
          </div>
        )}
        </div>
      </main>

      <div className="fixed bottom-16 left-0 w-full px-margin-mobile py-4 bg-background">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleImageSelected}
          />
          <button type="button" onClick={handleImageButtonClick} aria-label="Escanear boleta" className="flex h-12 shrink-0 items-center gap-1 rounded-full bg-primary px-3 text-label-sm font-bold text-on-primary shadow-lg active:scale-95 transition-transform"><span className="material-symbols-outlined text-[20px]">photo_camera</span><span className="hidden sm:inline">Escanear</span></button>
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Describe un movimiento..."
              className="w-full h-12 pl-4 pr-12 rounded-2xl border-0 bg-surface-container-low text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary focus:bg-surface-container-lowest transition-all shadow-sm"
            />
            <button
              type="button"
              onClick={handleImageButtonClick}
              aria-label="Escanear boleta"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-primary"
            >
              <span className="material-symbols-outlined">photo_camera</span>
            </button>
          </div>
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-primary text-on-primary shadow-lg active:scale-90 transition-transform disabled:opacity-50 shrink-0"
          >
            <span className="material-symbols-outlined">send</span>
          </button>
        </div>
      </div>

      {manualOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40">
          <div className="w-full max-w-2xl bg-surface-container-lowest rounded-t-2xl p-md pb-8 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-md">
              <h2 className="font-headline-md text-headline-md text-on-surface">
                Registrar manualmente
              </h2>
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                aria-label="Cerrar"
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <input
              ref={manualFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleManualImageSelected}
            />

            {manualImage ? (
              <div className="relative mb-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={manualImage}
                  alt="Foto de la boleta"
                  className="w-full max-h-48 object-cover rounded-xl"
                />
                <button
                  type="button"
                  onClick={handleRemoveManualImage}
                  aria-label="Quitar imagen"
                  className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    close
                  </span>
                </button>
                {manualScanning && (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 rounded-xl text-white font-label-sm text-label-sm">
                    <span className="material-symbols-outlined animate-spin text-[18px]">
                      progress_activity
                    </span>
                    Analizando con IA...
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={handleManualImageButtonClick}
                className="w-full mb-md py-4 rounded-xl border-2 border-dashed border-outline-variant text-on-surface-variant flex flex-col items-center justify-center gap-1 hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-2xl">
                  add_photo_alternate
                </span>
                <span className="font-label-md text-label-md">
                  Agregar foto de la boleta (obligatorio para gastos)
                </span>
              </button>
            )}

            {manualNote && (
              <p className="text-label-sm text-outline bg-surface-container rounded-lg p-sm mb-md flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] shrink-0">
                  info
                </span>
                {manualNote}
              </p>
            )}

            <form onSubmit={handleManualSubmit} className="flex flex-col gap-md">
              <div className="grid grid-cols-2 gap-sm">
                <button
                  type="button"
                  onClick={() => setManualType("expense")}
                  className={`py-3 rounded-xl font-label-md text-label-md transition-colors ${
                    manualType === "expense"
                      ? "bg-error text-on-error"
                      : "bg-surface-container-high text-on-surface-variant"
                  }`}
                >
                  Gasto
                </button>
                <button
                  type="button"
                  onClick={() => setManualType("income")}
                  className={`py-3 rounded-xl font-label-md text-label-md transition-colors ${
                    manualType === "income"
                      ? "bg-secondary text-on-secondary"
                      : "bg-surface-container-high text-on-surface-variant"
                  }`}
                >
                  Ingreso
                </button>
              </div>

              <div className="flex flex-col gap-xs">
                <label
                  htmlFor="manual-title"
                  className="font-label-md text-label-md text-on-surface-variant"
                >
                  Título
                </label>
                <input
                  id="manual-title"
                  type="text"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="Ej. Supermercado, Taxi, Nómina..."
                  className="w-full bg-background border-0 rounded-xl px-4 py-3 font-body-md text-body-md focus:ring-2 focus:ring-primary outline-none"
                  required
                />
              </div>

              <div className="flex flex-col gap-xs">
                <label
                  htmlFor="manual-category"
                  className="font-label-md text-label-md text-on-surface-variant"
                >
                  Categoría
                </label>
                <select
                  id="manual-category"
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                  className="w-full bg-background border-0 rounded-xl px-4 py-3 font-body-md text-body-md focus:ring-2 focus:ring-primary outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.value}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-xs">
                <label
                  htmlFor="manual-amount"
                  className="font-label-md text-label-md text-on-surface-variant"
                >
                  Monto
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
                    {currencySymbol(currency)}
                  </span>
                  <input
                    id="manual-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-background border-0 rounded-xl pl-8 pr-4 py-3 font-body-md text-body-md focus:ring-2 focus:ring-primary outline-none"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={manualSaving || (manualType === "expense" && !manualImage)}
                className="w-full py-3 bg-primary text-on-primary font-label-md text-label-md rounded-xl active:scale-95 transition-transform disabled:opacity-50"
              >
                {manualSaving ? "Guardando..." : manualType === "expense" && !manualImage ? "Adjunta un comprobante para guardar" : "Guardar movimiento"}
              </button>
            </form>
          </div>
        </div>
      )}

      {toast && <div role="status" className="fixed bottom-24 left-1/2 z-[70] -translate-x-1/2 rounded-xl bg-secondary px-4 py-3 text-label-md font-semibold text-on-secondary shadow-xl">{toast}</div>}

      <BottomNav />
    </>
  );
}
