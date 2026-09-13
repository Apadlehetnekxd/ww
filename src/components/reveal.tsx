import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type RevealVariant = "up" | "down" | "left" | "right" | "scale" | "blur" | "tilt" | "rise";

interface RevealProps {
  children: ReactNode;
  variant?: RevealVariant;
  delay?: number;
  className?: string;
  once?: boolean;
  threshold?: number;
  style?: CSSProperties;
}

const variantClass: Record<RevealVariant, string> = {
  up: "reveal reveal-up",
  down: "reveal reveal-down",
  left: "reveal reveal-left",
  right: "reveal reveal-right",
  scale: "reveal reveal-scale",
  blur: "reveal",
  tilt: "reveal reveal-tilt",
  rise: "reveal reveal-rise",
};

function useInView(once = true, threshold = 0.15) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            if (once) io.unobserve(entry.target);
          } else if (!once) {
            setShown(false);
          }
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, threshold]);
  return { ref, shown };
}

export function Reveal({
  children,
  variant = "up",
  delay = 0,
  className = "",
  once = true,
  threshold = 0.15,
  style,
}: RevealProps) {
  const { ref, shown } = useInView(once, threshold);
  return (
    <div
      ref={ref}
      className={`${variantClass[variant]} ${shown ? "is-in" : ""} ${className}`.trim()}
      style={{ ...(style ?? {}), "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}

interface RevealTextProps {
  text: string;
  className?: string;
  delay?: number;
  step?: number;
  level?: 1 | 2 | 3;
}

/** Splits a string into word spans that animate in sequentially. */
export function RevealText({
  text,
  className = "",
  delay = 0,
  step = 70,
  level = 2,
}: RevealTextProps) {
  const { ref, shown } = useInView(true, 0.2);
  const words = text.split(" ");
  const inner = words.map((w, i) => (
    <span
      key={`${w}-${i}`}
      className="tf-word"
      style={
        {
          ["--i" as string]: i,
          transitionDelay: `${delay + i * step}ms`,
        } as CSSProperties
      }
    >
      {w}
      {i < words.length - 1 ? "\u00A0" : ""}
    </span>
  ));

  const cls = `reveal-text ${shown ? "is-in" : ""} ${className}`.trim();

  if (level === 1) return <h1 ref={ref} className={cls}>{inner}</h1>;
  if (level === 3) return <h3 ref={ref} className={cls}>{inner}</h3>;
  return <h2 ref={ref} className={cls}>{inner}</h2>;
}
