"use client";

import { FixedExpense } from "@/lib/api";

export interface FixedExpenseForm {
  id: number;
  name: string;
  day: string;
  varies: boolean;
  amount: string;
}

let counter = 0;

/**
 * Constrains "día de cobro" to a real day-of-month as the user types.
 *
 * `<input type="number" min max>` only validates on form submit, not on
 * keystroke, so without this a user could type "123132123" and it would
 * sit there uncorrected (see reported bug). Strips non-digits, caps at two
 * characters, and clamps the parsed value to the 1-31 range.
 */
function sanitizeDayOfMonth(rawValue: string): string {
  const digitsOnly = rawValue.replace(/\D/g, "").slice(0, 2);
  if (!digitsOnly) return "";
  const numeric = Number(digitsOnly);
  if (numeric > 31) return "31";
  return digitsOnly;
}

export function newFixedExpense(): FixedExpenseForm {
  return { id: counter++, name: "", day: "", varies: false, amount: "" };
}

export function fixedExpenseFromApi(fe: FixedExpense): FixedExpenseForm {
  // Older profiles stored a full date (for example, "2026-07-27"). A fixed
  // expense is recurrent, so retain only its day of month when editing it.
  const match = fe.day?.match(/(?:^|-)0?(\d{1,2})$/);
  return {
    id: counter++,
    name: fe.name,
    day: match?.[1] ?? "",
    varies: fe.varies,
    amount: fe.amount != null ? String(fe.amount) : "",
  };
}

export function fixedExpensesToApi(items: FixedExpenseForm[]): FixedExpense[] {
  return items
    .filter((it) => it.name.trim())
    .map((it) => ({
      name: it.name.trim(),
      day: it.day || null,
      varies: it.varies,
      amount: it.varies ? null : Number(it.amount) || 0,
    }));
}

interface FixedExpensesEditorProps {
  items: FixedExpenseForm[];
  onChange: (items: FixedExpenseForm[]) => void;
}

export function FixedExpensesEditor({ items, onChange }: FixedExpensesEditorProps) {
  function update(id: number, patch: Partial<FixedExpenseForm>) {
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function remove(id: number) {
    onChange(items.filter((it) => it.id !== id));
  }
  function add() {
    onChange([...items, newFixedExpense()]);
  }

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-center justify-between">
        <label className="font-label-md text-label-md text-on-surface-variant">
          Gastos Fijos
        </label>
        <button
          type="button"
          onClick={add}
          className="text-primary flex items-center gap-1 font-label-md hover:opacity-80 transition-opacity"
        >
          <span className="material-symbols-outlined text-[20px]">
            add_circle
          </span>
          Añadir
        </button>
      </div>
      <p className="font-label-sm text-label-sm text-on-surface-variant">
        Agrega tus suscripciones o pagos recurrentes.
      </p>
      <div className="flex flex-col gap-sm">
        {items.length === 0 && (
          <p className="font-label-sm text-label-sm text-outline">
            No has agregado gastos fijos todavía.
          </p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="p-sm bg-background rounded-xl border border-outline-variant flex flex-col gap-sm transition-all"
          >
            <div className="flex justify-between items-center gap-2">
              <input
                type="text"
                value={item.name}
                onChange={(e) => update(item.id, { name: e.target.value })}
                placeholder="Ej. Netflix, Luz"
                className="bg-transparent border-0 font-body-md text-body-md p-0 focus:ring-0 w-full placeholder:text-outline-variant outline-none"
              />
              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label="Eliminar gasto fijo"
                className="text-on-surface-variant hover:text-error transition-colors shrink-0"
              >
                <span className="material-symbols-outlined text-[20px]">
                  delete
                </span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-sm">
              <div className="flex flex-col gap-xs">
                <span className="text-[10px] uppercase font-bold text-outline">
                  Día de cobro
                </span>
                <input
                  type="number"
                  min="1"
                  max="31"
                  inputMode="numeric"
                  value={item.day}
                  onChange={(e) => update(item.id, { day: sanitizeDayOfMonth(e.target.value) })}
                  placeholder="Ej. 27"
                  className="bg-surface-container rounded-lg border-0 text-label-sm py-2 px-2 focus:ring-1 focus:ring-primary outline-none"
                />
                <span className="text-[10px] text-outline">
                  Se repite cada mes
                </span>
              </div>
              <div className="flex flex-col gap-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase font-bold text-outline">
                    Importe variable
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={item.varies}
                    onClick={() => update(item.id, { varies: !item.varies })}
                    className={`relative w-8 h-4 rounded-full transition-colors ${
                      item.varies ? "bg-primary" : "bg-surface-container-high"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${
                        item.varies ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
                <div
                  className={`relative ${
                    item.varies ? "opacity-30 pointer-events-none" : ""
                  }`}
                >
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-xs">
                    S/
                  </span>
                  <input
                    type="text"
                    value={item.varies ? "" : item.amount}
                    onChange={(e) =>
                      update(item.id, { amount: e.target.value })
                    }
                    placeholder="0.00"
                    disabled={item.varies}
                    className="w-full bg-surface-container rounded-lg border-0 text-label-sm py-2 pl-5 pr-2 focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
