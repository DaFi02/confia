const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const SESSION_ID_KEY = "confia_session_id";
const LANGUAGE_KEY = "confia_language";

// Anonymous per-browser identifier so concurrent visitors don't share the
// same profile/transactions. Generated once and persisted in localStorage;
// sent as X-Session-Id on every request. The backend uses it to isolate data
// per visitor instead of a single implicit user (see main.py `_resolve_user`).
function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

// English is the default UI language (see LanguageProvider). The frontend's
// DOM-text translator can only match static, non-interpolated strings, so
// backend-generated text with live data (dates, trust-score labels, AI
// insights) is translated server-side instead — this header tells it which
// language to render those in (see main.py `_resolve_language`).
function getLanguage(): string {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(LANGUAGE_KEY);
  return stored === "es" || stored === "en" ? stored : "en";
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": getSessionId(),
      // Lets the backend bucket "today"/months in the visitor's own local
      // calendar day instead of the server's — important for a global
      // audience spread across timezones (see main.py `_resolve_timezone`).
      "X-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
      "X-Language": getLanguage(),
      ...options?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const raw = await res.text();
    let message = raw;
    try {
      const parsed = JSON.parse(raw);
      message = parsed.detail ?? raw;
    } catch {
      // raw body wasn't JSON, keep as-is
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export interface Transaction {
  id: number;
  title: string;
  category: string;
  amount: number;
  date: string;
  icon: string;
  completed: boolean;
  receipt_url?: string | null;
  receipt_status?: "required" | "uploaded" | "processing" | "needs_review" | "verified";
}

export const CURRENCIES = [
  ["PEN", "Soles peruanos (S/)", "Latinoamérica"], ["ARS", "Peso argentino ($)", "Latinoamérica"], ["BOB", "Boliviano (Bs)", "Latinoamérica"], ["BRL", "Real brasileño (R$)", "Latinoamérica"], ["CLP", "Peso chileno ($)", "Latinoamérica"], ["COP", "Peso colombiano ($)", "Latinoamérica"], ["CRC", "Colón costarricense (₡)", "Latinoamérica"], ["CUP", "Peso cubano ($)", "Latinoamérica"], ["DOP", "Peso dominicano (RD$)", "Latinoamérica"], ["GTQ", "Quetzal (Q)", "Latinoamérica"], ["HNL", "Lempira (L)", "Latinoamérica"], ["MXN", "Peso mexicano ($)", "Latinoamérica"], ["NIO", "Córdoba (C$)", "Latinoamérica"], ["PAB", "Balboa (B/.)", "Latinoamérica"], ["PYG", "Guaraní (₲)", "Latinoamérica"], ["UYU", "Peso uruguayo ($)", "Latinoamérica"], ["VES", "Bolívar (Bs.)", "Latinoamérica"],
  ["USD", "Dólar estadounidense (US$)", "Internacional"], ["EUR", "Euro (€)", "Europa"], ["GBP", "Libra esterlina (£)", "Europa"], ["CHF", "Franco suizo (CHF)", "Europa"], ["CZK", "Corona checa (Kč)", "Europa"], ["DKK", "Corona danesa (kr)", "Europa"], ["HUF", "Forinto húngaro (Ft)", "Europa"], ["NOK", "Corona noruega (kr)", "Europa"], ["PLN", "Esloti polaco (zł)", "Europa"], ["RON", "Leu rumano (lei)", "Europa"], ["SEK", "Corona sueca (kr)", "Europa"],
] as const;

const MONEY_PREFIX: Record<string, string> = { PEN: "S/", ARS: "ARS$", BOB: "Bs", BRL: "R$", CLP: "CLP$", COP: "COP$", CRC: "₡", CUP: "CUP$", DOP: "RD$", GTQ: "Q", HNL: "L", MXN: "MX$", NIO: "C$", PAB: "B/.", PYG: "₲", UYU: "UYU$", VES: "Bs.", USD: "US$", EUR: "€", GBP: "£", CHF: "CHF", CZK: "Kč", DKK: "kr", HUF: "Ft", NOK: "kr", PLN: "zł", RON: "lei", SEK: "kr" };

export function currencySymbol(currency: string) {
  return MONEY_PREFIX[currency] ?? currency;
}

/**
 * Stored receipts are returned as a signed API route. Keep that route tied to
 * the API configured by the browser instead of the backend's public-host
 * setting, which can otherwise be stale (for example, localhost in Cloud
 * Run). This also repairs URLs generated before the relative-route change.
 */
export function receiptViewUrl(receiptUrl: string) {
  if (receiptUrl.startsWith("/")) return `${API_URL}${receiptUrl}`;
  try {
    const url = new URL(receiptUrl);
    if (url.pathname.startsWith("/api/receipts/")) {
      return `${API_URL}${url.pathname}${url.search}`;
    }
  } catch {
    // Let the image element handle a malformed legacy URL gracefully.
  }
  return receiptUrl;
}

export function formatMoney(value: number, digits = 2, currency = "PEN") {
  return `${currencySymbol(currency)} ${Math.abs(value).toLocaleString("es-PE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export interface FixedExpense {
  name: string;
  day?: string | null;
  varies: boolean;
  amount?: number | null;
}

export interface FixedExpenseStatus extends FixedExpense {
  status: "pagado" | "pendiente" | "falta_comprobante";
  icon: string;
}

export interface DashboardData {
  trust_score: {
    value: number;
    max: number;
    label: string;
    breakdown: {
      comprobantes_pct: number;
      limite_diario_pct: number;
      pago_puntual_pct: number;
    };
  };
  balance: { ingresos: number; gastos: number; meta_ahorro_pct: number };
  currency: string;
  ai_insight: string;
  proactive_brief: ProactiveBrief;
  recent: Transaction[];
  missing_data: { id: number; title: string }[];
  fixed_expenses: FixedExpenseStatus[];
  safety_cushion_days: number;
  daily_budget: {
    spent: number;
    remaining: number;
    limit_pct: number;
    income_recorded: number;
    is_available: boolean;
  };
}

export interface ProactiveInsight {
  id: string;
  priority: "success" | "info" | "warning";
  icon: string;
  title: string;
  message: string;
  action: string;
}

export interface ProactiveBrief {
  summary: string;
  insights: ProactiveInsight[];
  generated_by: "nvidia-recommendations" | "fallback";
  snapshot: {
    period: string;
    projected_expenses: number;
    projected_savings: number;
    savings_target: number;
  };
}

export interface AnalyticsData {
  tranquility_trend: number[];
  score_today: number;
  currency: string;
  spend_pace: { today: number; yesterday_same_day: number };
  top_categories: { name: string; pct: number; amount: number; color: string }[];
  income_vs_expense: { ingresos: number; gastos: number };
  small_treats: { amount: number; equivalent: string };
  safety_cushion_days: number;
  daily_budget: {
    spent: number;
    remaining: number;
    limit_pct: number;
    income_recorded: number;
    is_available: boolean;
  };
  ai_advice: string;
}

export const api = {
  onboarding: (data: {
    ingreso: number;
    gastos_fijos: FixedExpense[];
    ahorro_pct: number;
    currency: string;
  }) =>
    request<{ ok: boolean; trust_score: number }>("/api/onboarding", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  profile: () =>
    request<{
      ingreso: number;
      gastos_fijos: FixedExpense[];
      ahorro_pct: number;
      currency: string;
    }>("/api/profile"),

  dashboard: () => request<DashboardData>("/api/dashboard"),

  proactiveBrief: () => request<ProactiveBrief>("/api/assistant/brief"),

  transactions: (params?: {
    category?: string;
    kind?: string;
    month?: string;
    evidence?: string;
  }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ transactions: Transaction[]; total: number; currency: string }>(
      `/api/transactions${qs ? `?${qs}` : ""}`
    );
  },

  addTransaction: (data: {
    title: string;
    category: string;
    amount: number;
    icon?: string;
    completed?: boolean;
    receipt_url?: string | null;
  }) =>
    request<Transaction>("/api/transactions", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteTransaction: (id: number) =>
    request<{ ok: boolean }>(`/api/transactions/${id}`, { method: "DELETE" }),

  updateTransaction: (
    id: number,
    data: Partial<{
      title: string;
      category: string;
      amount: number;
      date: string;
      icon: string;
      completed: boolean;
      receipt_url: string | null;
    }>
  ) =>
    request<Transaction>(`/api/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  analytics: () => request<AnalyticsData>("/api/analytics"),

  aiChat: (message: string) =>
    request<{
      reply: string;
      detected_category: string;
      detected_amount: number;
      detected_type: "income" | "expense";
    }>("/api/ai-chat", { method: "POST", body: JSON.stringify({ message }) }),

  scanReceipt: (image: string) =>
    request<{
      title: string;
      category: string;
      amount: number;
      type: "income" | "expense";
      date?: string;
    }>("/api/receipt-scan", { method: "POST", body: JSON.stringify({ image }) }),

  alerts: () =>
    request<{
      variable_expenses_missing_amount: { fixed_expense_id: number; name: string; month: string }[];
      transactions_missing_receipt: { id: number; title: string; amount: number; date: string }[];
    }>("/api/alerts"),

  analyticsHistorical: (months?: number) =>
    request<{ months: { label: string; total_gastos: number }[] }>(
      `/api/analytics/historical${months ? `?months=${months}` : ""}`
    ),

  analyticsDailyPace: (month?: string) =>
    request<{ days: { day: number; cumulative_spend: number }[] }>(
      `/api/analytics/daily-pace${month ? `?month=${month}` : ""}`
    ),

  // Downloads the filtered history as CSV. Not JSON, so it bypasses
  // `request()` and triggers a browser download directly.
  exportTransactions: async (params?: {
    category?: string;
    kind?: string;
    month?: string;
    evidence?: string;
  }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    const res = await fetch(`${API_URL}/api/transactions/export${qs ? `?${qs}` : ""}`, {
      headers: {
        "X-Session-Id": getSessionId(),
        "X-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
        "X-Language": getLanguage(),
      },
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "confia_historial.csv";
    link.click();
    URL.revokeObjectURL(url);
  },
};
