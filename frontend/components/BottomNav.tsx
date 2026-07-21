"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/analitica", label: "Insights", icon: "analytics" },
  { href: "/ai-hub", label: "AI Hub", icon: "auto_awesome" },
  { href: "/historial", label: "Historial", icon: "receipt_long" },
  { href: "/ajustes", label: "Ajustes", icon: "settings" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 w-full z-50 bg-surface-container-lowest shadow-[0_-4px_20px_rgba(0,0,0,0.04)] rounded-t-xl">
      <div className="max-w-[28rem] w-full mx-auto grid grid-cols-5 items-center px-1 py-3">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 mx-1 rounded-full transition-colors active:scale-90 font-semibold ${
                active
                  ? "bg-primary-container text-on-primary-container"
                  : "text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              <span className="text-label-sm text-[11px] leading-none text-center">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
