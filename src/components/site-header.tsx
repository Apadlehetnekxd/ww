import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/theme-toggle";
import { MessageSquare, Camera, ImageIcon, Menu, X, LogIn, LogOut, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const navItems = [
  { to: "/chat", label: "AI Chat", badge: undefined, icon: MessageSquare },
  { to: "/vision", label: "Neurix Vision", badge: "BETA", icon: Camera },
  { to: "/image", label: "Image Gen", badge: undefined, icon: ImageIcon },
] as const;

export function SiteHeader() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const { user, signOut, loading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const avatarUrl = user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture ?? null;

  // Lock body scroll when menu open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleClose = () => {
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 280);
  };

  const toggle = () => {
    if (open) handleClose();
    else setOpen(true);
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/70">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 h-14 sm:h-16 flex items-center justify-between gap-3 sm:gap-6">
        <Link to="/" className="font-semibold tracking-tight text-base sm:text-lg shrink-0">
          Neurix<span className="text-ink-soft">®</span>
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2 px-4 h-10 rounded-full text-sm font-medium transition-colors",
                  active
                    ? "bg-foreground text-background"
                    : "text-ink-soft hover:text-foreground hover:bg-cream"
                )}
              >
                <Icon className="size-4" />
                <span>{item.label}</span>
                {item.badge && <span className="text-[9px] font-semibold tracking-[0.12em] opacity-60">{item.badge}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <a
            href="https://www.instagram.com/ad4mkhhkhhkhh/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            title="Instagram"
            className="hidden sm:inline-flex items-center justify-center size-9 rounded-full border border-border tf-invert-hover"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
            </svg>
          </a>
          <ThemeToggle />
          {!loading && (
            user ? (
              <div className="relative hidden sm:block">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="inline-flex items-center justify-center size-9 rounded-full border border-border overflow-hidden hover:bg-cream transition-colors"
                  aria-label="Account"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <UserIcon className="size-4" />
                  )}
                </button>
                {menuOpen && (
                  <div
                    className="absolute right-0 mt-2 w-56 rounded-2xl border border-border bg-background shadow-lg p-2 z-50"
                    onMouseLeave={() => setMenuOpen(false)}
                  >
                    <div className="px-3 py-2 text-xs text-ink-soft truncate border-b border-border mb-1">
                      {user.email}
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        setMenuOpen(false);
                        await signOut();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-cream transition-colors"
                    >
                      <LogOut className="size-4" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/auth"
                className="hidden sm:inline-flex items-center gap-2 px-4 h-9 rounded-full border border-border hover:bg-cream transition-colors text-sm font-medium"
              >
                <LogIn className="size-4" />
                Sign in
              </Link>
            )
          )}
          <button
            type="button"
            onClick={toggle}
            className="md:hidden relative inline-flex items-center justify-center size-9 rounded-full border border-border overflow-hidden transition-colors hover:bg-cream"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            <Menu
              className={cn(
                "size-4 absolute transition-all duration-300",
                open ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"
              )}
            />
            <X
              className={cn(
                "size-4 absolute transition-all duration-300",
                open ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"
              )}
            />
          </button>
        </div>
      </div>

      {/* Full-screen mobile menu — portaled to body so it covers the entire viewport */}
      {open && typeof document !== "undefined" &&
        createPortal(
          <div
            className="md:hidden fixed inset-0 z-[100] tf-menu-overlay"
            data-state={closing ? "closing" : "open"}
            aria-modal="true"
            role="dialog"
          >
            {/* Solid black background */}
            <div className="absolute inset-0 bg-black" />

            {/* Subtle animated glow accents */}
            <div
              className="absolute -top-32 -left-32 size-[70vw] max-w-[520px] aspect-square rounded-full blur-3xl opacity-[0.18] tf-menu-blob"
              style={{ background: "radial-gradient(circle, #ffffff, transparent 70%)" }}
            />
            <div
              className="absolute -bottom-32 -right-32 size-[60vw] max-w-[460px] aspect-square rounded-full blur-3xl opacity-[0.12] tf-menu-blob"
              style={{ background: "radial-gradient(circle, #ffffff, transparent 70%)", animationDelay: "3s" }}
            />

            {/* Content */}
            <div className="relative h-full w-full flex flex-col text-white">
              <div className="flex-1 overflow-y-auto px-8 pt-24 pb-10 flex flex-col">
                <nav className="flex flex-col gap-10 sm:gap-12">
                  {navItems.map((item, i) => {
                    const Icon = item.icon;
                    const active = pathname === item.to;
                    const delay = 120 + i * 100;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={handleClose}
                        className={cn(
                          "tf-menu-item group flex items-center gap-6 transition-opacity",
                          active ? "opacity-100" : "opacity-90 hover:opacity-100"
                        )}
                        style={{ ["--menu-delay" as never]: `${delay}ms` }}
                      >
                        <Icon
                          className="size-9 sm:size-10 shrink-0 transition-transform duration-300 group-hover:scale-110"
                          strokeWidth={1.6}
                        />
                        <span className="text-4xl sm:text-5xl font-semibold tracking-tight inline-flex items-baseline gap-3">
                          {item.label}
                          {item.badge && <span className="text-[10px] font-semibold tracking-[0.14em] opacity-60">{item.badge}</span>}
                        </span>
                      </Link>
                    );
                  })}
                </nav>

                <div
                  className="tf-menu-item mt-auto pt-14 flex items-center justify-between text-white/60"
                  style={{ ["--menu-delay" as never]: `${120 + navItems.length * 100 + 80}ms` }}
                >
                  <p className="text-xs uppercase tracking-[0.25em]">Neurix® · 2026</p>
                  <a
                    href="https://www.instagram.com/ad4mkhhkhhm._16/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram"
                    className="inline-flex items-center justify-center size-11 rounded-full border border-white/20 text-white hover:bg-white hover:text-black hover:border-white transition-colors"
                  >
                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>

            {/* White close button on top */}
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close menu"
              className="absolute top-3 right-4 sm:top-4 sm:right-6 inline-flex items-center justify-center size-10 rounded-full border border-white/20 text-white hover:bg-white hover:text-black hover:border-white transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>,
          document.body
        )}
    </header>
  );
}
