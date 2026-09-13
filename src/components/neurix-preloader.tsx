import { useEffect, useState } from "react";

export function NeurixPreloader() {
  const [hidden, setHidden] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Hard scroll lock: html + body, plus prevent wheel/touch/keys
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const block = (e: Event) => e.preventDefault();
    const blockKeys = (e: KeyboardEvent) => {
      const keys = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "];
      if (keys.includes(e.key)) e.preventDefault();
    };
    window.addEventListener("wheel", block, { passive: false });
    window.addEventListener("touchmove", block, { passive: false });
    window.addEventListener("keydown", blockKeys);
    // Snap to top so user starts at hero
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    const releaseScroll = () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      window.removeEventListener("wheel", block);
      window.removeEventListener("touchmove", block);
      window.removeEventListener("keydown", blockKeys);
    };

    // Keep the intro intentionally quiet: only the progress line is visible.
    const exitTimer = window.setTimeout(() => setExiting(true), 1500);
    const hideTimer = window.setTimeout(() => {
      setHidden(true);
      releaseScroll();
      document.documentElement.classList.add("nx-app-entering");
      window.setTimeout(() => {
        document.documentElement.classList.remove("nx-app-entering");
        document.documentElement.classList.add("nx-app-entered");
      }, 1400);
    }, 2400); // = 1500 (visible) + 900 (exit transition)

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(hideTimer);
      releaseScroll();
    };
  }, []);

  if (hidden) return null;

  return (
    <div
      className={`neurix-preloader ${exiting ? "is-exiting" : ""}`}
      aria-hidden={exiting}
    >
      <div className="neurix-preloader__inner">
        <div className="neurix-preloader__bar" aria-hidden="true">
          <span className="neurix-preloader__bar-fill" />
        </div>
      </div>

      <div className="neurix-preloader__curtain" />
    </div>
  );
}
