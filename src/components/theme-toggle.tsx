import { useTheme } from "@/components/theme-provider";
import type { MouseEvent } from "react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    toggle({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={isDark}
      className={`relative inline-flex h-9 w-[68px] items-center rounded-full border border-border bg-cream px-1 transition-colors hover:bg-background ${className}`}
    >
      {/* Track icons */}
      <span
        className="absolute left-2 top-1/2 -translate-y-1/2 transition-opacity duration-500"
        style={{ opacity: isDark ? 0.35 : 1 }}
        aria-hidden
      >
        <SunIcon />
      </span>
      <span
        className="absolute right-2 top-1/2 -translate-y-1/2 transition-opacity duration-500"
        style={{ opacity: isDark ? 1 : 0.35 }}
        aria-hidden
      >
        <MoonIcon />
      </span>

      {/* Knob */}
      <span
        className="relative z-10 inline-block size-7 rounded-full bg-foreground shadow-sm transition-transform duration-500"
        style={{
          transform: isDark ? "translateX(32px)" : "translateX(0)",
          transitionTimingFunction: "cubic-bezier(0.7, 0, 0.3, 1)",
        }}
      />
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-foreground"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-foreground"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
