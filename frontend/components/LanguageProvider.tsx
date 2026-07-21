"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Language = "en" | "es";

const LANGUAGE_KEY = "confia_language";

// The app was originally written in Spanish. This keeps its existing routes
// and API contracts intact while translating every rendered interface string
// from one central, maintainable place. New strings can be added here without
// threading a translation prop through each screen.
const english: Record<string, string> = {
  "Ajustes": "Settings", "Historial": "History", "Todos los Movimientos": "All transactions",
  "Todos": "All", "Ingresos": "Income", "Gastos": "Expenses", "Ingreso": "Income", "Gasto": "Expense",
  "Cargando...": "Loading...", "Guardando...": "Saving...", "Eliminar": "Delete", "Editar": "Edit",
  "Guardar cambios": "Save changes", "Guardar Cambios": "Save changes", "Guardar movimiento": "Save transaction",
  "Registro rápido": "Quick entry", "Registrar manualmente": "Add manually", "Registrar ingreso": "Add income",
  "Registrar egreso / ingreso con IA": "Add income or expense with AI", "Confirmar transacción": "Confirm transaction",
  "Adjuntar comprobante y registrar": "Attach receipt and save", "Comprobante": "Receipt", "Comprobante adjunto": "Receipt attached",
  "Comprobante obligatorio": "Receipt required", "Adjuntar comprobante": "Attach receipt", "Reemplazar comprobante": "Replace receipt",
  "Analizando con IA...": "Analyzing with AI...", "Analizando boleta con IA...": "Analyzing receipt with AI...",
  "Monto": "Amount", "Fecha": "Date", "Categoría": "Category", "Título": "Title", "Nombre del comercio": "Merchant name",
  "Sin título": "Untitled", "Vista Previa": "Preview", "Cerrar": "Close", "Eliminar Movimiento": "Delete transaction",
  "Ingresos del mes": "Monthly income", "Gastos totales": "Total expenses", "Meta de ahorro": "Savings goal",
  "Colchón Seguridad": "Safety cushion", "Disponible para gastar hoy": "Available to spend today",
  "Actividad Reciente": "Recent activity", "Ver todo": "View all", "Compromisos del Mes": "Monthly commitments",
  "Pagado": "Paid", "Pendiente": "Pending", "Falta Comprobante": "Receipt missing", "Sin fecha de cobro": "No billing day",
  "Gastos con datos faltantes": "Expenses with missing details", "Gastos variables sin monto este mes": "Variable expenses without an amount this month",
  "Ingresar monto": "Enter amount", "Cargando historial...": "Loading history...", "Ritmo de Gasto Diario": "Daily spending pace",
  "Comparativa Histórica": "Historical comparison", "Pequeños antojos": "Small treats", "Colchón de Seguridad": "Safety cushion",
  "Tu Analítica": "Your insights", "Tus finanzas, fáciles de entender": "Your finances, made easy",
  "Evolución de tu Tranquilidad": "Your financial confidence", "Ingresos vs Gastos": "Income vs expenses",
  "Hoy": "Today", "Ayer": "Yesterday", "Hace 30 días": "30 days ago", "No hay movimientos para este filtro.": "No transactions match this filter.",
  "Toda categoría": "All categories", "Toda evidencia": "Any receipt status", "Con comprobante": "With receipt", "Sin comprobante": "Without receipt",
  "Gastos Fijos": "Fixed expenses", "Añadir": "Add", "No has agregado gastos fijos todavía.": "You have not added any fixed expenses yet.",
  "Día de cobro": "Billing day", "Se repite cada mes": "Repeats every month", "Importe variable": "Variable amount",
  "Configura tu perfil financiero": "Set up your financial profile", "Configuremos tu perfil financiero": "Let’s set up your financial profile",
  "Moneda para tus registros": "Currency for your records", "Ingreso Fijo Estimado": "Estimated monthly income", "Meta de Ahorro (%)": "Savings goal (%)",
  "Nivel de meta": "Goal level", "Comenzar a optimizar": "Start optimizing", "Optimización perfil...": "Optimizing profile...",
  "Preferencias": "Preferences", "Notificaciones": "Notifications", "Mi perfil financiero": "My financial profile",
  "Moneda de visualización": "Display currency", "Ingreso fijo estimado": "Estimated monthly income",
  "Perfil actualizado correctamente.": "Profile updated successfully.", "Cuenta personal · Plan gratuito": "Personal account · Free plan",
  "En línea": "Online", "Escribe un mensaje...": "Write a message...", "Ingreso detectado": "Income detected", "Gasto detectado": "Expense detected",
  "Alimentación": "Food", "Transporte": "Transport", "Ocio": "Leisure", "Servicios": "Services", "Salario": "Salary", "Otros": "Other",
  "Idioma": "Language", "Inglés": "English", "Español": "Spanish", "English": "English", "Spanish": "Spanish",
  // Onboarding
  "Ayúdanos a entender tu situación para que nuestra IA pueda optimizar tu flujo de caja de manera personalizada.": "Help us understand your situation so our AI can optimize your cash flow for you.",
  "No convierte importes: define cómo se mostrarán tus montos.": "This doesn't convert amounts: it just defines how your amounts are displayed.",
  "Lo que recibes mensualmente de forma segura.": "What you reliably receive every month.",
  "Agrega tus suscripciones o pagos recurrentes.": "Add your subscriptions or recurring payments.",
  "Ej. Netflix, Luz": "E.g. Netflix, Electricity", "Ej. 27": "E.g. 27",
  "El porcentaje de tus ingresos que deseas guardar.": "The percentage of your income you want to save.",
  "Al continuar, aceptas nuestros términos de servicio y privacidad de datos de confIA.": "By continuing, you accept confIA's terms of service and data privacy policy.",
  "Ingresa un monto mensual mayor a 0 para continuar.": "Enter a monthly amount greater than 0 to continue.",
  "Elige una meta de ahorro entre 0% y 60%.": "Choose a savings goal between 0% and 60%.",
  "Error inesperado": "Unexpected error", "0% · Prudente": "0% · Cautious", "30% · Equilibrada": "30% · Balanced", "60% · Ambiciosa": "60% · Ambitious",
  "Conservadora": "Cautious", "Equilibrada": "Balanced", "Ambiciosa": "Ambitious",
  // Home
  "Buenos días": "Good morning", "Buenas tardes": "Good afternoon", "Buenas noches": "Good evening", "Usuario": "User",
  "Tu Trust Score actual": "Your current Trust Score", "Tu salud financiera está en el top 10% este mes.": "Your financial health is in the top 10% this month.",
  "Ver cómo se calcula": "See how it's calculated",
  "La eliges al crear tu perfil. Es el porcentaje de tus ingresos mensuales que quieres separar antes de gastar.": "You choose this when setting up your profile. It's the percentage of your monthly income you want to set aside before spending.",
  "días": "days", "Respaldo actual": "Current cushion", "Registra un ingreso para calcular tu presupuesto real.": "Log an income to calculate your real budget.",
  "Ir a Ajustes": "Go to Settings", "Avatar de usuario": "User avatar",
  "falta comprobante": "receipt missing",
  "falta ingresar el monto de": "still needs an amount entered for",
  "Vence:": "Due:",
  "Movimiento registrado correctamente.": "Transaction saved successfully.",
  "No se pudo conectar con la API": "Could not connect to the API",
  "Verifica que el backend esté corriendo en http://localhost:8000": "Check that the backend is running at http://localhost:8000",
  // Historial
  "Encuentra cualquier movimiento": "Find any transaction",
  "Exportar CSV": "Export CSV",
  "Editar movimiento": "Edit transaction", "Eliminar movimiento": "Delete transaction",
  // Analítica
  "Mira cómo ha cambiado tu puntaje en los últimos 30 días.": "See how your score has changed over the last 30 days.",
  "Así se reparte tu dinero este mes, de un vistazo.": "Here's how your money is split this month, at a glance.",
  "Balance": "Balance", "Tu ritmo de gasto": "Your Spending Pace", "Compara lo que has gastado hoy con el mismo día del mes pasado.": "Compare what you've spent today with the same day last month.",
  "Mes pasado": "Last month", "¿En qué se va más rápido?": "Where does it go fastest?", "Tus categorías de gasto más grandes del mes.": "Your biggest spending categories this month.",
  "Aún no tienes gastos registrados este mes.": "You haven't logged any expenses this month yet.",
  "Total gastado en los últimos 5 meses.": "Total spent over the last 5 months.",
  "Gasto acumulado del mes, día a día.": "Cumulative spend this month, day by day.",
  "Cargando ritmo diario...": "Loading daily pace...", "Esos gastos diarios que parecen poco, pero se acumulan.": "Those small daily expenses that add up.",
  "este mes": "this month", "Equivale a": "That's like", "Días que podrías cubrir tus gastos básicos sin ingresos.": "Days you could cover your basic expenses without income.",
  "Nivel: Estable": "Level: Stable", "Mantente dentro de tu presupuesto mensual.": "Stay within your monthly budget.",
  "libres": "left", "Límite diario sugerido": "Suggested daily limit", "Registra un ingreso para activarlo": "Log an income to activate it",
  "Gastado:": "Spent:", "Restante:": "Remaining:", "Sin ingresos registrados este mes": "No income logged this month",
  "Consejo de confIA": "confIA's advice",
  // AI Hub
  "IA Financiera": "AI Financial Assistant", "Escanear boleta": "Scan receipt", "Escanear": "Scan",
  "Describe un movimiento...": "Describe a transaction...", "Boleta procesada": "Receipt processed",
  "JSON estructurado · listo para auditar": "Structured JSON · ready to audit",
  "Concepto extraído": "Extracted merchant", "Foto de la boleta": "Receipt photo",
  "Aceptar y guardar": "Accept and save", "Registro guardado exitosamente": "Transaction saved successfully",
  "Ej. Supermercado, Taxi, Nómina...": "E.g. Supermarket, Taxi, Payroll...",
  // Ajustes
  "confIA — Yo confío, tú confIA": "confIA — I trust, you confIA",
  "Alertas de gastos y consejos de la IA": "Spending alerts and AI advice", "Choose how confIA is displayed.": "Choose how confIA is displayed.",
  "confIA v1.0 · Hecho con IA para tu tranquilidad financiera": "confIA v1.0 · Made with AI for your financial peace of mind",
  // ProactiveBrief (Home's "Tu asistente financiero" panel)
  "Tu asistente financiero": "Your financial assistant", "Al día": "Up to date",
  "Ahorro al cierre": "Projected savings", "Meta del mes": "Monthly goal",
  "Tu plan se actualiza automáticamente al registrar un movimiento.": "Your plan updates automatically whenever you log a transaction.",
  "Mostrando": "Showing", "movimiento(s)": "transaction(s)",
  "Insight de IA: confIA": "confIA AI Insight",
  "Tus gastos en \"Ocio\" han disminuido un 12% este mes en comparación con el anterior. Mantén este ritmo para alcanzar tu meta de ahorro de fin de año.": "Your \"Leisure\" spending has dropped 12% this month compared to last month. Keep this pace to hit your year-end savings goal.",
};

const spanish = Object.fromEntries(Object.entries(english).map(([source, translated]) => [translated, source]));

function translate(value: string, language: Language) {
  // Text nodes often carry surrounding whitespace/newlines from JSX
  // formatting (e.g. an icon followed by " Some Label"), which would never
  // exact-match the dictionary. Match on the trimmed text and splice the
  // translation back in with the original padding preserved.
  const trimmed = value.trim();
  if (!trimmed) return value;
  const table = language === "en" ? english : spanish;
  const translated = table[trimmed];
  if (!translated) return value;
  const leading = value.slice(0, value.indexOf(trimmed));
  const trailing = value.slice(value.indexOf(trimmed) + trimmed.length);
  return `${leading}${translated}${trailing}`;
}

const LanguageContext = createContext<{ language: Language; setLanguage: (language: Language) => void }>({
  language: "en",
  setLanguage: () => undefined,
});

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // English is the default/primary language for first-time visitors with no
  // saved preference. Users can still switch to Spanish (the app's original
  // authoring language) from Ajustes; that choice is persisted below.
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window === "undefined") return "en";
    const stored = window.localStorage.getItem(LANGUAGE_KEY);
    return stored === "es" || stored === "en" ? stored : "en";
  });

  useEffect(() => {
    document.documentElement.lang = language;
    window.localStorage.setItem(LANGUAGE_KEY, language);
    const apply = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE && node.parentElement?.closest("script, style" ) === null) {
        const original = node.nodeValue ?? "";
        const localized = translate(original, language);
        if (localized !== original) node.nodeValue = localized;
      }
      node.childNodes.forEach(apply);
    };
    apply(document.body);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach(apply);
        if (mutation.type === "characterData") apply(mutation.target);
      });
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage: setLanguageState }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
