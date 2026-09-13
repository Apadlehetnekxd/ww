import { useEffect, useRef, useState } from "react";
import { Reveal, RevealText } from "@/components/reveal";
import { Check, X } from "lucide-react";

type Competitor = {
  name: string;
  short: string;
};

const competitors: Competitor[] = [
  { name: "Neurix", short: "Neurix" },
  { name: "ChatGPT Plus", short: "ChatGPT" },
  { name: "Claude Pro", short: "Claude" },
  { name: "Midjourney", short: "MJ" },
];

type Capability = {
  label: string;
  sub?: string;
  // values: true | false | string
  values: (boolean | string)[];
};

const capabilities: Capability[] = [
  {
    label: "Free, forever",
    sub: "No paywall, no trial",
    values: [true, "$20/mo", "$20/mo", "$10/mo"],
  },
  {
    label: "Optional sign-in",
    sub: "Use it free, or sign in to sync",
    values: [true, false, false, false],
  },
  {
    label: "AI Chat, Image & Code in one",
    sub: "Three tools, one front door",
    values: [true, false, false, false],
  },
  {
    label: "Streaming responses < 1s",
    sub: "Edge-served, 50+ regions",
    values: [true, true, true, false],
  },
  {
    label: "No data stored on accounts",
    sub: "Zero retention by default",
    values: [true, false, false, false],
  },
  {
    label: "Latest frontier models",
    sub: "GPT-4 class, FLUX, Gemini",
    values: [true, true, true, false],
  },
];

// Performance bars: tokens/second (higher = better)
const speedBars = [
  { name: "Neurix",   value: 482, pct: 100, win: true },
  { name: "ChatGPT",  value: 168, pct: 35 },
  { name: "Claude",   value: 134, pct: 28 },
  { name: "Midjourney", value: 92, pct: 19 },
];

function useInViewOnce(threshold = 0.2) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.unobserve(e.target);
          }
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, threshold]);
  return { ref, shown };
}

export function Smackdown() {
  const { ref: barsRef, shown: barsShown } = useInViewOnce(0.3);

  return (
    <section
      id="smackdown"
      className="tf-smackdown-scene relative bg-foreground text-background border-b border-border"
    >
      <div className="max-w-[1400px] w-full mx-auto px-6 lg:px-10 py-24 lg:py-32">
        {/* Header */}
        <div className="border-b border-background/15 pb-12 mb-20 flex flex-wrap items-end gap-8 justify-between">
          <div>
            <Reveal variant="left">
              <div className="flex items-center gap-3 mb-6">
                <span className="size-2 rounded-full bg-highlight tf-laser-dot" />
                <span className="text-[10px] font-mono tracking-[0.25em] uppercase text-highlight">
                  Telemetry · Competitive Matrix
                </span>
              </div>
            </Reveal>
            <RevealText
              level={2}
              text="Market annihilation."
              className="tf-display text-5xl md:text-7xl lg:text-8xl text-background max-w-[14ch]"
              step={50}
            />
          </div>
          <Reveal variant="right" delay={300}>
            <p className="font-mono text-xs tracking-widest uppercase text-background/60 max-w-[40ch] text-right leading-relaxed">
              Empirical benchmarks against bloated legacy AI suites.
              <br />
              No abstractions. No excuses.
            </p>
          </Reveal>
        </div>

        {/* HEADLINE STATS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-background/15 mb-20 border border-background/15">
          {[
            {
              label: "Cost / Month",
              value: "$0",
              compare: "vs $20",
              accent: true,
            },
            {
              label: "Signup steps",
              value: "1",
              compare: "vs 4–6",
            },
            {
              label: "Rate limits",
              value: "None",
              compare: "vs strict",
            },
          ].map((s, i) => (
            <Reveal
              key={s.label}
              variant={i % 3 === 0 ? "left" : i % 3 === 1 ? "rise" : "right"}
              delay={i * 140}
            >
              <div
                className={`bg-foreground p-8 lg:p-10 h-[260px] flex flex-col justify-between ${
                  s.accent ? "border-l-4 border-highlight" : ""
                }`}
              >
                <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-background/55">
                  {s.label}
                </div>
                <div className="flex items-baseline gap-4">
                  <span
                    className={`tf-display text-7xl md:text-8xl tabular-nums leading-none ${
                      s.accent ? "text-highlight" : "text-background"
                    }`}
                  >
                    {s.value}
                  </span>
                  <span className="text-2xl text-background/40 line-through tabular-nums">
                    {s.compare}
                  </span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* SPEED BAR CHART */}
        <div ref={barsRef} className="mb-20">
          <Reveal variant="left">
            <div className="flex items-end justify-between mb-8 border-b border-background/15 pb-4">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-highlight mb-2">
                  Tokens · per · second
                </div>
                <h3 className="tf-display text-3xl md:text-4xl">
                  Throughput, measured.
                </h3>
              </div>
              <div className="text-xs font-mono text-background/50 hidden md:block">
                Higher is better
              </div>
            </div>
          </Reveal>

          <div className="space-y-5">
            {speedBars.map((b, i) => (
              <div key={b.name} className="flex items-center gap-5">
                <div
                  className={`w-28 shrink-0 text-xs font-mono uppercase tracking-widest text-right ${
                    b.win ? "text-background" : "text-background/45"
                  }`}
                >
                  {b.name}
                </div>
                <div className="flex-1 h-7 bg-background/10 relative overflow-hidden">
                  {barsShown && (
                    <span
                      className="tf-bar-fill"
                      style={{
                        width: `${b.pct}%`,
                        backgroundColor: b.win
                          ? "var(--highlight)"
                          : "color-mix(in oklab, var(--background) 35%, transparent)",
                        ["--bar-delay" as string]: `${i * 140}ms`,
                      }}
                    />
                  )}
                </div>
                <div
                  className={`w-20 shrink-0 text-sm font-mono tabular-nums text-right ${
                    b.win ? "text-highlight font-bold" : "text-background/55"
                  }`}
                >
                  {b.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CAPABILITY MATRIX */}
        <Reveal variant="right">
          <div className="border border-background/20 bg-background/[0.03] overflow-hidden">
            {/* Header row */}
            <div className="grid grid-cols-[2.2fr_repeat(4,1fr)] border-b border-background/15 bg-background/5">
              <div className="p-5 text-[10px] font-mono uppercase tracking-[0.25em] text-background/55">
                Capability
              </div>
              {competitors.map((c, i) => (
                <div
                  key={c.name}
                  className={`p-5 text-[10px] font-mono uppercase tracking-[0.25em] border-l border-background/15 ${
                    i === 0
                      ? "text-highlight font-bold bg-highlight/10"
                      : "text-background/45"
                  }`}
                >
                  {c.short}
                </div>
              ))}
            </div>

            {/* Rows */}
            {capabilities.map((cap, idx) => (
              <div
                key={cap.label}
                className={`grid grid-cols-[2.2fr_repeat(4,1fr)] border-b border-background/10 last:border-b-0 transition-colors hover:bg-background/[0.04] ${
                  idx % 2 === 1 ? "bg-background/[0.02]" : ""
                }`}
              >
                <div className="p-5 lg:p-6 flex flex-col justify-center">
                  <span className="text-base md:text-lg font-medium text-background">
                    {cap.label}
                  </span>
                  {cap.sub && (
                    <span className="text-xs text-background/45 mt-1">
                      {cap.sub}
                    </span>
                  )}
                </div>
                {cap.values.map((v, i) => (
                  <div
                    key={i}
                    className={`p-5 lg:p-6 flex items-center border-l border-background/10 ${
                      i === 0 ? "bg-highlight/[0.06]" : ""
                    }`}
                  >
                    {v === true ? (
                      <Check
                        className={`size-5 ${
                          i === 0 ? "text-highlight" : "text-background/70"
                        }`}
                        strokeWidth={2.5}
                      />
                    ) : v === false ? (
                      <X
                        className="size-5 text-background/30"
                        strokeWidth={2.5}
                      />
                    ) : (
                      <span
                        className={`text-sm font-mono ${
                          i === 0
                            ? "text-highlight font-bold"
                            : "text-background/40 line-through"
                        }`}
                      >
                        {v}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Reveal>

        {/* Footer kicker */}
        <Reveal variant="left" delay={200}>
          <div className="mt-12 flex items-center gap-4 text-xs font-mono uppercase tracking-[0.2em] text-background/45">
            <span className="size-1.5 rounded-full bg-highlight" />
            Benchmarks · self-reported public pricing as of 2026 · subject to vendor changes
          </div>
        </Reveal>
      </div>
    </section>
  );
}
