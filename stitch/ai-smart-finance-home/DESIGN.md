---
name: Luminous Finance
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#464554'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#767586'
  outline-variant: '#c7c4d7'
  surface-tint: '#494bd6'
  primary: '#4648d4'
  on-primary: '#ffffff'
  primary-container: '#6063ee'
  on-primary-container: '#fffbff'
  inverse-primary: '#c0c1ff'
  secondary: '#006e2f'
  on-secondary: '#ffffff'
  secondary-container: '#6bff8f'
  on-secondary-container: '#007432'
  tertiary: '#b61722'
  on-tertiary: '#ffffff'
  tertiary-container: '#da3437'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2f2ebe'
  secondary-fixed: '#6bff8f'
  secondary-fixed-dim: '#4ae176'
  on-secondary-fixed: '#002109'
  on-secondary-fixed-variant: '#005321'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ad'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930013'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
---

## Brand & Style

The design system is centered on **Modern Minimalism** with a focus on cognitive ease. Designed for a personal finance AI, the aesthetic prioritizes clarity, calm, and precision. It utilizes a "Soft-Tech" approach—combining high-tech accents (vibrant indigo) with approachable, spacious layouts.

The target audience is individuals seeking financial clarity without the stress of traditional, data-dense banking interfaces. The emotional response should be one of "controlled empowerment": the user feels the AI is doing the heavy lifting, presented through a clean, breathable interface that emphasizes high-quality typography and subtle depth.

## Colors

The palette is anchored by a high-utility neutral base to ensure the AI-driven insights remain the focal point.

- **Primary (#6366F1):** An electric indigo used for primary actions, active states, and AI-generated suggestions.
- **Success (#22C55E):** A crisp green reserved exclusively for income, positive balances, and "goal reached" states.
- **Error (#EF4444):** A soft but clear red for expenses, over-budget alerts, and critical system errors.
- **Neutral / Background (#F8F9FA):** A very light off-white used for the global page background to reduce eye strain.
- **Surface (#FFFFFF):** Pure white is reserved for cards and modals to create a clear "layer" above the background.

## Typography

This design system uses **Inter** exclusively to maintain a systematic, utilitarian, yet modern feel. 

- **Scale:** High contrast between headlines and body text is used to create a clear information hierarchy.
- **Weight:** Medium weights (500) are preferred for labels and UI elements to maintain legibility against the light background.
- **Tracking:** Headlines use slight negative letter-spacing for a tighter, more "editorial" look, while labels use expanded tracking for better scannability at small sizes.

## Layout & Spacing

The layout follows a **Fluid Grid** philosophy with generous inner padding to reinforce the minimalist brand.

- **Grid:** A 12-column grid for desktop and a 4-column grid for mobile.
- **Rhythm:** An 8px linear scale governs all spacing.
- **Container:** Elements should be grouped into cards. Vertical spacing between cards should be consistent (`md` or 24px) to create a clear "stream" of information.
- **Mobile Reflow:** On mobile devices, cards expand to full-width minus the 16px side margins. Horizontal scrolling is permitted only for "Insight Chips" or secondary data visualizations.

## Elevation & Depth

Hierarchy is established through **Ambient Shadows** and **Tonal Layers**.

- **The Base:** The #F8F9FA background acts as Level 0.
- **The Card:** The #FFFFFF card surface is Level 1. It uses an ultra-diffused shadow: `box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);`.
- **The Interaction:** When a user interacts with a card (hover/active), the shadow deepens slightly and the card may lift 2px to provide tactile feedback.
- **The Modal:** Higher-level overlays use a more aggressive shadow with a slight indigo tint to link back to the primary brand color: `box-shadow: 0 12px 40px rgba(99, 102, 241, 0.08);`.

## Shapes

The shape language is purposefully **Rounded** to evoke friendliness and safety, countering the often "cold" nature of financial data.

- **Cards:** Use `rounded-xl` (1.5rem / 24px) to create a soft, modern container.
- **Buttons & Inputs:** Use `rounded-lg` (1rem / 16px) for a comfortable, tap-friendly appearance.
- **Status Indicators:** Small indicators (like dot-badges) should be fully circular.

## Components

### Buttons
- **Primary:** Solid #6366F1 with white text. High-radius (16px).
- **Secondary:** Transparent background with #6366F1 border and text.
- **Ghost:** No border, #6366F1 text, used for less prominent actions (e.g., "View All").

### Cards
- The primary vehicle for information. Every card must have a minimum of 24px internal padding.
- AI Insights should be highlighted with a 2px left-border of the Primary color to distinguish them from standard data.

### Input Fields
- Background-colored (#F8F9FA) with no border in the default state.
- On focus, they transition to a white background with a 2px Primary border.

### Chips/Badges
- Used for categories (e.g., "Groceries", "Rent"). 
- Low-saturation backgrounds with high-saturation text of the same hue (e.g., Soft Green background with Success Green text).

### Lists
- Clean, borderless list items. Use thin 1px horizontal dividers (#F1F3F5) only when the list is extremely long; otherwise, use whitespace to separate items.

### AI Insight Component
- A specialized card with a soft gradient background (90% White to 10% Primary) to signify "intelligence" and premium value.