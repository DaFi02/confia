# DESIGN.md — confIA

> Sistema de diseño + guía técnica para construir y conectar la app **confIA**
> ("Yo confío, tú confIA") de forma fácil y sencilla, pantalla por pantalla.

Este documento sirve para que cualquier persona (o un agente como Codex)
pueda reconstruir o completar la interfaz y conectarla al backend sin
necesidad de adivinar nombres de clases, colores o rutas de API.

---

## 1. Identidad de marca

| | |
|---|---|
| Nombre | **confIA** |
| Eslogan | Yo confío, tú confIA |
| Tono | Cercano, claro, confiable — un copiloto financiero con IA |
| Ícono de marca | Varía por pantalla dentro de un cuadrado `bg-primary-container` redondeado: `shield_with_heart` (Onboarding), `smart_toy` (AI Hub), `settings` (Ajustes). No hay un único ícono de marca fijo todavía |
| Logo | Aún no integrado como archivo (`frontend/public/logo.*`). Concepto definido: escudo (confianza) + nodo neuronal/chispa (IA), paleta `#4648D4` primario / verde secundario, wordmark "conf" + "IA" resaltada en verde |

---

## 2. Sistema de diseño (Tailwind CSS v4, tema en `frontend/app/globals.css`)

### 2.1 Colores

Todos los colores se definen como variables `--color-*` dentro de `@theme` y
se usan como clases normales de Tailwind (`bg-primary`, `text-on-surface`, etc.):

```
surface               #f8f9fa   on-surface            #191c1d
surface-container-lowest #ffffff   on-surface-variant    #464554
surface-container-low  #f3f4f5   outline               #767586
surface-container       #edeeef   outline-variant        #c7c4d7
surface-container-high  #e7e8e9
surface-container-highest #e1e3e4

primary               #4648d4   on-primary            #ffffff
primary-container      #6063ee   on-primary-container   #fffbff
secondary              #006e2f   on-secondary           #ffffff
secondary-container     #6bff8f   on-secondary-container #007432
tertiary               #b61722   on-tertiary            #ffffff
tertiary-container      #da3437
error                  #ba1a1a   on-error               #ffffff
error-container         #ffdad6   on-error-container     #93000a
```

Uso típico:
- Fondo general: `bg-background` / `bg-surface`
- Tarjetas: `bg-surface-container-lowest` + `shadow-[0_4px_20px_rgba(0,0,0,0.04)]`
- Botón principal: `bg-primary text-on-primary`
- Positivo (ingresos): `text-secondary`
- Negativo (gastos): `text-error`

### 2.2 Tipografía

Fuente: **Inter** (cargada vía `<link>` en `app/layout.tsx`, NUNCA con
`@import url(...)` en el CSS — ver nota de la sección 5).

| Clase | Tamaño | Uso |
|---|---|---|
| `text-headline-xl` | 40px / 700 | Títulos hero (poco usado en móvil) |
| `text-headline-lg` | 32px / 600 | Títulos grandes (desktop) |
| `text-headline-lg-mobile` | 24px / 600 | Títulos grandes (móvil) |
| `text-headline-md` | 24px / 600 | Títulos de sección |
| `text-body-lg` | 18px | Texto destacado |
| `text-body-md` | 16px | Texto normal |
| `text-label-md` | 14px | Labels, botones |
| `text-label-sm` | 12px | Texto secundario, fechas |

Siempre acompañar `text-*` con `font-*` del mismo nombre (ej.
`font-headline-md text-headline-md`) para que aplique también el peso/línea
correctos.

### 2.3 Espaciado

Escala de spacing con nombres (`p-md`, `gap-lg`, `px-margin-mobile`, etc.):

```
xs = 4px     md = 24px     gutter = 24px
sm = 12px    lg = 40px     margin-mobile = 16px
base = 8px   xl = 64px     margin-desktop = 48px
```

> ⚠️ **Regla crítica**: `xs/sm/md/lg/xl` chocan con las utilidades nativas de
> Tailwind `max-w-*`, `w-*`, `h-*` (que usan esos mismos nombres para otro
> propósito). **Nunca uses `max-w-md`, `max-w-xl`, `w-lg`, etc. en este
> proyecto** — usa valores explícitos entre corchetes, ej. `max-w-[28rem]`,
> `max-w-[36rem]`. Antes de dar por terminada cualquier pantalla nueva, corre:
> `grep -rn "max-w-\(xs\|sm\|md\|lg\|xl\)\b" frontend/app frontend/components`
> y confirma que no haya resultados.

### 2.4 Iconografía

Material Symbols Outlined, clase `.material-symbols-outlined` + nombre del
ícono como texto, ej. `<span className="material-symbols-outlined">home</span>`.

### 2.5 Bordes y sombras

- Radios: `rounded-xl` (tarjetas), `rounded-full` (botones/avatares/pills)
- Sombra estándar de tarjeta: `shadow-[0_4px_20px_rgba(0,0,0,0.04)]`

---

## 3. Patrones de layout reutilizables

Estos patrones se repiten en las 6 pantallas — cópialos tal cual para que
todo se vea idéntico y no salte al navegar:

### 3.1 Header (idéntico en las 5 pantallas con navegación)

```tsx
<header className="sticky top-0 z-40 w-full bg-surface flex justify-between items-center px-margin-mobile h-16 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
  {/* contenido del header, siempre 64px de alto (h-16) y sticky (no fixed) */}
</header>
```

### 3.2 Contenido centrado

```tsx
<main className="px-margin-mobile py-md flex flex-col gap-md max-w-2xl mx-auto pb-24 w-full">
  {/* pb-24 para no quedar tapado por el BottomNav */}
</main>
```

Usa `max-w-2xl` para pantallas tipo chat/formulario, `max-w-5xl` para listas
tipo tabla (Historial, Analítica).

### 3.3 Navegación inferior (`components/BottomNav.tsx`)

Grid de 5 columnas iguales, envuelta en un contenedor centrado con ancho
máximo — así nunca se estira ni se desalinea al cambiar de pantalla:

```tsx
<nav className="fixed bottom-0 left-0 w-full z-50 bg-surface-container-lowest shadow-[0_-4px_20px_rgba(0,0,0,0.04)] rounded-t-xl">
  <div className="max-w-[28rem] w-full mx-auto grid grid-cols-5 items-center px-1 py-3">
    {/* 5 <Link> con font-semibold constante (nunca cambiar a font-bold en el activo) */}
  </div>
</nav>
```

Rutas: `/home`, `/analitica`, `/ai-hub`, `/historial`, `/ajustes`.

### 3.4 Fila de lista (transacciones, actividad reciente)

Una sola fila flexible — evita grids de 12 columnas para listas en móvil:

```tsx
<div className="flex items-center gap-3 px-md py-sm hover:bg-surface-container">
  <div className="w-11 h-11 rounded-xl bg-surface-container-high flex items-center justify-center">
    <span className="material-symbols-outlined">{icon}</span>
  </div>
  <div className="flex-1 min-w-0">
    <p className="font-label-md text-label-md truncate">{titulo}</p>
    <p className="font-label-sm text-label-sm text-outline truncate">{categoria} · {fecha}</p>
  </div>
  <div className="flex items-center gap-1 shrink-0">
    <span className={monto < 0 ? "text-error" : "text-secondary"}>{signo}${monto}</span>
    <button aria-label="Eliminar movimiento">...</button>
  </div>
</div>
```

---

## 4. Pantallas — qué construir en cada una

| # | Pantalla | Ruta | Componentes clave |
|---|---|---|---|
| 1 | Onboarding | `/` | Header con ícono `shield_with_heart` + "confIA", título "Configuremos tu perfil financiero". Formulario: **Ingreso Fijo Estimado** ($), **Gastos Fijos** (lista dinámica editable vía `FixedExpensesEditor` — nombre, fecha de cobro, toggle "¿Monto varía?" que deshabilita el campo de monto, botones Añadir/Eliminar), **Meta de Ahorro (%)** con labels "Prudente"/"Agresivo". Botón primario "Comenzar a optimizar" + ícono `rocket_launch` |
| 2 | Home | `/home` | Header con saludo dinámico según hora del día ("Buenos días/tardes/noches, Usuario") + fecha formateada, avatar (link a Ajustes). Gauge **semicircular** (SVG `path` tipo velocímetro, no círculo completo) de Trust Score con label dinámico (Excelente/Saludable/Regular/Necesita atención). Botón "Registrar egreso/ingreso con IA". Grid de métricas 2×2 + fila completa: Ingresos del mes, Gastos totales, Meta de ahorro, **Colchón de Seguridad**, **Disponible para gastar hoy** (barra de progreso). Banner de insight de IA. Sección condicional **"Gastos con datos faltantes"** (alerta roja, solo si hay transacciones con `completed: false`). Sección condicional **"Compromisos del Mes"** (solo si el perfil tiene `gastos_fijos`; cada gasto fijo se cruza contra las transacciones por nombre para mostrar pill de estado: Pagado / Pendiente / Falta Comprobante). Lista de actividad reciente con botón "Ver todo" → Historial |
| 3 | AI Hub | `/ai-hub` | Header con ícono `smart_toy`, feed de chat (burbujas IA a la izquierda, usuario a la derecha), tarjeta de "Gasto/Ingreso detectado" con botón Confirmar, input + botón enviar fijo sobre el BottomNav. Además: botón `+` (abre formulario manual de ingreso/gasto) y botón `photo_camera` (adjunta foto de boleta; un LLM de visión real la analiza vía `POST /api/receipt-scan` y prellena el formulario manual con título, categoría y monto detectados para que el usuario confirme) |
| 4 | Historial | `/historial` | Header con "Historial" + subtítulo (ya no muestra genéricamente "confIA"). Título de sección "Todos los Movimientos". Filtros Todos/Ingresos/Gastos como **control segmentado de ancho completo** (`grid grid-cols-3` dentro de un contenedor `rounded-full`, NUNCA `flex flex-wrap` — ver sección 5.6). Lista de filas (patrón 3.4): tocar la fila (o el ícono lápiz) abre `EditTransactionModal`; el ícono de basurero elimina directo. Insight de IA al final |
| 5 | Analítica | `/analitica` | Header "Tu Analítica" + subtítulo "Tus finanzas, fáciles de entender". Gráfico de tendencia (SVG path). Dos **donuts** (`DonutChart`/`DonutLegend`, ver sección 4.1): "Ingresos vs Gastos" (2 segmentos, centro = balance neto) y "¿En qué se va más rápido?" (categorías de gasto, centro = categoría top). Barras comparativas, tarjetas de "pequeños antojos" / "colchón de seguridad", barra de presupuesto diario, consejo de IA |
| 6 | Ajustes | `/ajustes` | Header con ícono settings, tarjeta de usuario (avatar), toggle de notificaciones, formulario de perfil financiero: **mismos campos que Onboarding** (Ingreso fijo + `FixedExpensesEditor` + Meta de ahorro), precargados desde `GET /api/profile` |

### 4.1 Componentes reutilizables de features (no solo layout)

| Componente | Archivo | Uso |
|---|---|---|
| `DonutChart` / `DonutLegend` | `frontend/components/DonutChart.tsx` | Gráfico circular SVG (técnica `viewBox="0 0 36 36"`, `r="15.9"`, circunferencia ≈100 para que `strokeDasharray` mapee directo a porcentaje) + leyenda con puntos de color, porcentaje y valor formateado. Usado en Analítica |
| `EditTransactionModal` | `frontend/components/EditTransactionModal.tsx` | Modal tipo bottom-sheet para editar una transacción existente: vista previa, campos (comercio, monto, fecha, categoría), botón "Reemplazar imagen" que reescanea con IA (`api.scanReceipt`), toggle Completado/Pendiente evidencia, botones Guardar Cambios / Eliminar Movimiento. Usado en Historial |
| `FixedExpensesEditor` / `newFixedExpense` / `fixedExpenseFromApi` / `fixedExpensesToApi` | `frontend/components/FixedExpensesEditor.tsx` | Editor de lista dinámica de gastos fijos (nombre, fecha de cobro, toggle "¿Monto varía?", monto). Compartido entre Onboarding y Ajustes para que ambos formularios queden idénticos |

---

## 5. Errores comunes ya resueltos (no los repitas)

1. **`max-w-md` / `max-w-xl` rotos** → usar `max-w-[28rem]` / `max-w-[36rem]`
   (ver sección 2.3). Ocurrió en Onboarding y en BottomNav — revisa TODO el
   proyecto con grep antes de dar por cerrada una tarea.
2. **Fuentes con `@import url()` en CSS después de `@import "tailwindcss"`**
   se pierden silenciosamente en el build de Turbopack. Cargar fuentes
   externas siempre con `<link rel="stylesheet">` en `app/layout.tsx`.
3. **Headers mezclando `fixed` y `sticky`** entre pantallas causa saltos
   visuales al navegar. Todas las pantallas deben usar el mismo patrón
   `sticky top-0 z-40 h-16` (sección 3.1).
4. **`justify-around` + peso de fuente variable en el nav activo** desalinea
   los íconos. Usar `grid grid-cols-5` con `font-semibold` fijo (sección 3.3).
5. **Grids de 12 columnas sin prefijo `md:`** en los hijos rompen el layout
   en móvil. Para listas, usar el patrón de fila flexible (sección 3.4) en
   vez de adaptar un grid pensado para escritorio.
6. **`flex flex-wrap` junto con `overflow-x-auto` en el mismo contenedor**
   es contradictorio: `flex-wrap` gana y los elementos saltan a una segunda
   línea en vez de desbordar horizontalmente. Para filtros tipo pill que
   deben quedar en una sola línea, usar `flex-nowrap` + `overflow-x-auto`
   (con scroll), o mejor aún, si son pocas opciones (2-4), usar un
   **control segmentado de ancho completo** (`grid grid-cols-N` dentro de
   un contenedor `rounded-full bg-surface-container-highest/60 p-1`, cada
   botón con `justify-center` y el activo con `bg-primary text-on-primary`)
   — se ve más prolijo que un scroll horizontal y nunca se corta a la mitad.

---

## 6. Guía técnica: cómo conectar con el backend

### 6.1 Arquitectura

```
frontend (Next.js, :3000)  ──fetch──>  backend (FastAPI, :8000)
        │
        └── frontend/lib/api.ts   ← ÚNICO punto de contacto con la API
```

Ninguna pantalla debe usar `fetch()` directamente: siempre importar y usar
las funciones de `lib/api.ts`. Esto permite cambiar de backend sin tocar
ninguna pantalla.

### 6.2 Variables de entorno

```
NEXT_PUBLIC_API_URL=http://localhost:8000   # default si no se define
```

### 6.3 Contrato de la API (debe cumplirse exactamente)

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| `GET` | `/api/health` | — | `{status, time}` |
| `POST` | `/api/onboarding` | `{ingreso: float, gastos_fijos: FixedExpense[], ahorro_pct: float}` | `{ok, trust_score}` |
| `GET` | `/api/profile` | — | `{ingreso, gastos_fijos: FixedExpense[], ahorro_pct}` |
| `GET` | `/api/dashboard` | — | `{trust_score:{value,max,label}, balance:{ingresos,gastos,meta_ahorro_pct}, ai_insight, recent: Transaction[], missing_data:{id,title}[], fixed_expenses: FixedExpenseStatus[], safety_cushion_days, daily_budget:{spent,remaining,limit_pct}}` |
| `GET` | `/api/transactions?category=&kind=` | — | `{transactions: Transaction[], total}` |
| `POST` | `/api/transactions` | `{title, category, amount, icon?}` | `Transaction` (nueva, `date="Hoy"`) |
| `PATCH` | `/api/transactions/{id}` | `Partial<{title, category, amount, date, icon, completed}>` | `Transaction` actualizada (404 si no existe) |
| `DELETE` | `/api/transactions/{id}` | — | `{ok}` (404 si no existe) |
| `GET` | `/api/analytics` | — | `{tranquility_trend, score_today, spend_pace, top_categories:{name,pct,amount,color}[], income_vs_expense:{ingresos,gastos}, small_treats, safety_cushion_days, daily_budget, ai_advice}` |
| `POST` | `/api/ai-chat` | `{message}` | `{reply, detected_category, detected_amount, detected_type: "income"\|"expense"}` |
| `POST` | `/api/receipt-scan` | `{image}` (data URL base64) | `{title, category, amount, type}` — usa un LLM de visión real (OpenAI `gpt-4o-mini`); requiere `OPENAI_API_KEY` |

```
Transaction     = {id, title, category, amount, date, icon, completed: bool}
FixedExpense    = {name, day?: string|null, varies: bool, amount?: number|null}
FixedExpenseStatus = FixedExpense & {status: "pagado"|"pendiente"|"falta_comprobante", icon}
```

`amount` negativo = gasto, positivo = ingreso. `completed: false` en una
`Transaction` significa "falta comprobante/evidencia" y alimenta la sección
`missing_data` del dashboard y el estado `falta_comprobante` de
`fixed_expenses` (cruce por nombre, case-insensitive, contra el título de
la transacción).

> ⚠️ El perfil YA NO tiene `capital` ni `gastos` como campos sueltos (se
> eliminaron en el rediseño de Onboarding/Ajustes). Los gastos recurrentes
> ahora viven como una lista `gastos_fijos: FixedExpense[]`.

### 6.4 Checklist para conectar un backend nuevo

1. Habilitar CORS para el origen del frontend (`http://localhost:3000` en
   dev). Sin esto, todas las llamadas fallan silenciosamente con error de
   red en consola.
2. Servir en el puerto que apunte `NEXT_PUBLIC_API_URL` (por defecto 8000).
3. Implementar los 11 endpoints de la tabla 6.3 con exactamente esos nombres
   de campo (case-sensitive, `snake_case`).
4. Levantar el backend:
   ```bash
   uv run uvicorn main:app --reload --port 8000
   ```
5. Levantar el frontend:
   ```bash
   cd frontend && npm run dev
   ```
6. Verificar el flujo completo en el navegador:
   Onboarding (con al menos un gasto fijo) → Home (datos reales, incluida la
   sección "Compromisos del Mes" si hay gastos fijos) → AI Hub (detectar y
   confirmar un gasto y un ingreso) → Historial (filtrar, editar vía
   `EditTransactionModal` y eliminar) → Analítica (donuts con datos reales)
   → Ajustes (guardar perfil y ver el cambio reflejado en Home).
7. Revisar la consola del navegador: cero errores de CORS, cero 404, cero
   `undefined` en los datos mostrados.

### 6.6 Análisis de boletas con IA (visión real)

El endpoint `POST /api/receipt-scan` usa el SDK oficial de OpenAI
(`openai>=1.50`) para leer la imagen de una boleta con el modelo
`gpt-4o-mini` y devolver `{title, category, amount, type}` en JSON.

Para habilitarlo:

1. Crea un archivo `.env` en la raíz del proyecto (ya está en `.gitignore`,
   nunca lo subas al repositorio):
   ```
   OPENAI_API_KEY=sk-...
   ```
2. Reinicia el backend (`uv run uvicorn main:app --reload --port 8000`).
3. Si la key no está configurada, el endpoint responde `503` con un mensaje
   claro y el frontend abre igualmente el formulario manual para que el
   usuario complete los datos a mano — la app nunca se bloquea por esto.

> ⚠️ Importante: el nombre del proyecto Python en `pyproject.toml` es
> `confia-backend` (no `openai`) precisamente para evitar que `uv add openai`
> choque con el propio nombre del proyecto.

### 6.7 Estado actual (referencia)

El backend de referencia (`main.py`, raíz del proyecto) implementa todo el
contrato anterior con datos **en memoria** (se reinician al reiniciar el
servidor). Para producción, reemplazar el almacenamiento en memoria por una
base de datos manteniendo exactamente las mismas rutas y formas de
respuesta — así el frontend no requiere ningún cambio.

Estado funcional confirmado (verificado en navegador, mobile 390px y
desktop, sin errores de consola):

- Las 6 pantallas completas y conectadas al backend real.
- Onboarding/Ajustes con lista dinámica de Gastos Fijos (`FixedExpensesEditor`),
  sin los campos legacy `capital`/`gastos`.
- Home rediseñado: gauge semicircular, métricas ampliadas (colchón de
  seguridad, disponible para gastar hoy), alertas de datos faltantes y
  "Compromisos del Mes" cruzando `gastos_fijos` contra transacciones reales.
- Historial con filtro segmentado de ancho completo, edición de
  transacciones vía `EditTransactionModal` (incluye reescaneo de comprobante
  con IA) y eliminación directa.
- Analítica con dos gráficos de dona reales (`DonutChart`/`DonutLegend`):
  Ingresos vs Gastos y distribución de categorías de gasto.
- Registro manual y por foto de boleta con IA de visión real (OpenAI
  `gpt-4o-mini`) en AI Hub, con fallback manual si no hay `OPENAI_API_KEY`.
- Título de marca "confIA" consistente en todos los headers; saludo
  dinámico según hora del día en Home.

Pendiente / fuera de alcance de este MVP (no implementado a propósito):
- Persistencia real (base de datos) — todo vive en memoria del proceso.
- Autenticación / multi-usuario — la app asume un único "Usuario".
- Un archivo de logo real (`frontend/public/logo.*`) — existe un prompt de
  diseño de logo documentado en la conversación del proyecto, pero el
  archivo final aún no se integró a `app/layout.tsx` / favicon.
