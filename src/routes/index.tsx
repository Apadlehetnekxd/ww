import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Reveal, RevealText } from "@/components/reveal";
import { Smackdown } from "@/components/smackdown";
import { Banknote3D } from "@/components/banknote-3d";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Neurix AI — Chat, Image Generation & Vision" },
      {
        name: "description",
        content:
          "Chat with AI, create images, and explore your world with Neurix Vision. Three creative tools in one place.",
      },
      { property: "og:title", content: "Neurix AI — Chat, Image Generation & Vision" },
      {
        property: "og:description",
        content:
          "Enterprise-grade AI with unlimited access. No limits, no credit card required.",
      },
    ],
  }),
});

const HERO_FLIP_WORDS = ["Chat", "Image", "Vision", "Free"] as const;

function HeroFlipWords() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentIndex((prev) => {
        setPreviousIndex(prev);
        return (prev + 1) % HERO_FLIP_WORDS.length;
      });
    }, 2000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (previousIndex === null) return;
    const timer = window.setTimeout(() => setPreviousIndex(null), 720);
    return () => window.clearTimeout(timer);
  }, [previousIndex]);

  return (
    <span className="tf-flip-slot" aria-live="polite" aria-atomic="true">
      <span className="tf-flip-sizer" aria-hidden>
        No limits
      </span>
      <span
        className={cn(
          "tf-flip-word tf-flip-word--current",
          previousIndex !== null && "is-entering",
        )}
      >
        {HERO_FLIP_WORDS[currentIndex]}
        {HERO_FLIP_WORDS[currentIndex] === "Free" && <span className="text-highlight">.</span>}
      </span>
      {previousIndex !== null && (
        <span className="tf-flip-word tf-flip-word--prev is-leaving">
          {HERO_FLIP_WORDS[previousIndex]}
        </span>
      )}
    </span>
  );
}

function Hero() {
  return (
    <section className="relative min-h-[100svh] sm:min-h-screen flex flex-col">
      <div className="flex-1 max-w-[1400px] w-full mx-auto px-5 sm:px-6 lg:px-10 pt-12 sm:pt-16 lg:pt-24 pb-6 sm:pb-10 flex flex-col justify-between sm:justify-center">
        {/* Main hero content */}
        <div className="flex flex-col gap-14 sm:gap-6 lg:gap-8 flex-1 sm:flex-initial">
          {/* Flip words title - centered vertically on mobile */}
          <div className="flex-1 flex items-center sm:block">
            <h1 className="tf-display text-foreground text-[clamp(5rem,22vw,13rem)] min-w-0 break-words text-center sm:text-left leading-[0.85] w-full">
              <Reveal variant="up" delay={0}>
                <HeroFlipWords />
              </Reveal>
            </h1>
          </div>

          {/* CTA and description row - at bottom on mobile */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-end sm:justify-between gap-6 sm:gap-12 mt-auto sm:mt-0">
            {/* Left: Description */}
            <Reveal variant="up" delay={500} className="flex-1 max-w-2xl">
              <p className="text-base sm:text-base leading-relaxed text-foreground/60 text-center sm:text-left">
                Chat, create visuals, and explore your world with Vision.
              </p>
              <div className="mt-4 sm:mt-8 flex flex-wrap justify-center sm:justify-start items-center gap-x-4 sm:gap-x-6 gap-y-2 text-foreground/50 text-xs sm:text-sm">
                <span>Available now</span>
                <span className="h-1 w-1 rounded-full bg-foreground/40" />
                <span>50+ edge regions</span>
                <span className="h-1 w-1 rounded-full bg-foreground/40" />
                <span>Latest AI models</span>
              </div>
            </Reveal>

            {/* Right: CTA */}
            <Reveal
              variant="up"
              delay={420}
              className="flex flex-col items-center sm:items-end gap-2 sm:gap-3 shrink-0"
            >
              <Link
                to="/chat"
                search={{}}
                className="tf-cta inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-7 sm:px-8 h-14 sm:h-16 text-base sm:text-lg font-medium"
              >
                Get started
              </Link>
              <div className="text-sm sm:text-sm text-foreground/50">Always free</div>
            </Reveal>
          </div>
        </div>
      </div>

      {/* Bottom rule */}
      <div className="tf-rule border-t border-border shrink-0" />
    </section>
  );
}

function About() {
  const stats = [
    { value: "$0", label: "while they charge $20/mo" },
    { value: "<1s", label: "ChatGPT could never" },
    { value: "1", label: "click to sign in" },
    { value: "∞", label: "main character energy" },
  ];
  const principles = [
    {
      n: "I.",
      title: "Open by default",
      body: "No accounts. No paywalls. No tracking pixels. You arrive, you create — that's the whole contract.",
    },
    {
      n: "II.",
      title: "Quietly powerful",
      body: "Frontier models, served from the edge. The interface stays out of the way so the work can be loud.",
    },
    {
      n: "III.",
      title: "Built to last",
      body: "A studio, not a funnel. We optimize for craft, taste, and the people who use it daily.",
    },
  ];
  return (
    <section id="about" className="border-b border-border lg:min-h-screen flex items-center">
      <div className="max-w-[1400px] w-full mx-auto px-5 sm:px-6 lg:px-10 py-16 sm:py-24 lg:py-32">
        <div className="grid lg:grid-cols-12 gap-8 sm:gap-10 mb-12 sm:mb-20">
          <div className="lg:col-span-3">
            <Reveal variant="left">
              <div className="tf-eyebrow">About — 2026</div>
            </Reveal>
            <Reveal variant="left" delay={120}>
              <p className="mt-6 text-ink-soft text-sm leading-relaxed max-w-[28ch]">
                A small studio shipping AI tools that feel like good software — fast, generous, and
                a little opinionated.
              </p>
            </Reveal>
          </div>
          <div className="lg:col-span-9">
            <RevealText
              level={2}
              step={45}
              text="We believe great AI shouldn't gate-keep itself. So we made it free, made it fast, and made it beautiful."
              className="tf-display text-3xl md:text-5xl lg:text-6xl text-foreground max-w-[22ch]"
            />
            <Reveal variant="right" delay={400}>
              <p className="mt-10 text-lg md:text-xl text-ink-soft leading-relaxed max-w-2xl">
                Neurix is a single front door to the best generative models on the planet — chat,
                image, and real-time vision — wrapped in an interface that respects your time and attention. No
                funnels, no upsells, no dashboards full of usage meters. Just tools you'll actually
                want to open tomorrow.
              </p>
            </Reveal>
          </div>
        </div>

        {/* Principles */}
        <div className="grid md:grid-cols-3 gap-px bg-foreground border-y border-foreground">
          {principles.map((p, i) => (
            <Reveal key={p.title} variant="up" delay={i * 120} className="bg-foreground">
              <div className="p-6 sm:p-8 lg:p-10 h-full bg-background">
                <Reveal variant="up" delay={i * 120 + 80}>
                  <div className="tf-display text-2xl text-ink-soft mb-6">{p.n}</div>
                </Reveal>
                <RevealText
                  level={3}
                  text={p.title}
                  delay={i * 120 + 160}
                  step={40}
                  className="tf-display text-2xl md:text-3xl mb-4"
                />
                <Reveal variant="up" delay={i * 120 + 280}>
                  <p className="text-ink-soft leading-relaxed">{p.body}</p>
                </Reveal>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-12 sm:mt-20 grid grid-cols-2 lg:grid-cols-4 border-t border-border">
          {stats.map((s, i) => (
            <Reveal
              key={s.label}
              variant="up"
              delay={i * 100}
              className={cn(
                "border-border py-8 sm:py-10 px-2",
                "border-r [&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:last:border-r-0",
                i < 2 ? "border-b lg:border-b-0" : "",
              )}
            >
              <div className="tf-display text-4xl sm:text-5xl md:text-7xl">{s.value}</div>
              <div className="mt-3 sm:mt-4 text-[11px] sm:text-xs uppercase tracking-[0.2em] text-ink-soft lowercase">
                {s.label}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Tools() {
  const features = [
    {
      n: "01",
      title: "AI Chat",
      description:
        "Natural conversations with advanced AI. Get help with writing, analysis, brainstorming, and creative tasks.",
      to: "/chat" as const,
      tone: "bg-background text-foreground",
    },
    {
      n: "02",
      title: "Image Generation",
      description:
        "Create stunning visuals from text. Generate art, photos, illustrations, and designs in seconds.",
      to: "/image" as const,
      tone: "bg-cream text-foreground",
    },
    {
      n: "03",
      title: "Neurix Vision",
      description:
        "See your world with AI. Open your camera, ask a question, and explore objects around you in real time.",
      to: "/vision" as const,
      tone: "bg-background text-foreground",
      status: "PRIVATE BETA · MEMBER ONLY",
    },
  ];
  return (
    <section id="tools" className="border-b border-border">
      <div className="max-w-[1400px] w-full mx-auto px-5 sm:px-6 lg:px-10 pt-16 sm:pt-24 lg:pt-32 pb-10 sm:pb-16">
        <div className="flex items-end justify-between flex-wrap gap-6 mb-10 sm:mb-12">
          <div>
            <Reveal variant="up">
              <div className="tf-eyebrow mb-4 sm:mb-6">What's on</div>
            </Reveal>
            <RevealText
              level={2}
              text="Three powerful tools"
              className="tf-display text-4xl sm:text-5xl md:text-7xl max-w-[14ch]"
            />
          </div>
          <Reveal variant="up" delay={200}>
            <p className="max-w-md text-ink-soft text-base sm:text-lg">
              Everything you need to create, explore, and communicate with AI.
            </p>
          </Reveal>
        </div>
      </div>

      {/* Sticky scroll-stack on lg+, simple stack on mobile */}
      <div className="relative">
        {features.map((f, i) => (
          <div
            key={f.title}
            className="tf-stack-card lg:sticky lg:top-0 lg:h-screen flex items-center"
            style={{ zIndex: i + 1 }}
          >
            <Reveal
              variant="rise"
              threshold={0.2}
              className={`group w-full lg:h-full flex items-center border-t border-border tf-slide-shadow tf-tool-card ${f.tone}`}
            >
              <div className="w-full lg:h-full flex items-center">
                <div className="max-w-[1400px] w-full mx-auto px-5 sm:px-6 lg:px-10 py-12 sm:py-16 lg:py-24 grid lg:grid-cols-12 gap-6 sm:gap-10 items-center">
                  <div className="lg:col-span-8">
                    <div className="flex flex-wrap items-center gap-3 mb-5 sm:mb-8">
                      <h3 className="tf-display text-4xl sm:text-5xl md:text-7xl lg:text-8xl leading-[0.95] transition-transform duration-500 ease-out group-hover:-translate-y-1">
                        {f.title}
                      </h3>
                      {f.status && <span className="inline-flex items-center min-h-6 px-2.5 border border-current/30 rounded-full text-[9px] font-semibold tracking-[0.14em] opacity-65">{f.status}</span>}
                    </div>
                    <p className="text-base sm:text-lg md:text-xl leading-relaxed max-w-xl opacity-80">
                      {f.description}
                    </p>
                  </div>
                  <div className="lg:col-span-4 flex lg:justify-end">
                    <Link
                      to={f.to}
                      className="tf-cta group/btn relative inline-flex items-center justify-center gap-3 rounded-full px-7 sm:px-9 h-12 sm:h-14 text-sm sm:text-base font-medium overflow-hidden border border-current/40 backdrop-blur-sm transition-colors duration-300"
                    >
                      <span
                        aria-hidden
                        className="absolute inset-0 -z-10 translate-y-full bg-current transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/btn:translate-y-0"
                      />
                      <span className="relative transition-colors duration-300 group-hover/btn:[color:var(--background)]">
                        Try it now
                      </span>
                      <span
                        aria-hidden
                        className="relative inline-block transition-transform duration-300 group-hover/btn:translate-x-1 group-hover/btn:[color:var(--background)]"
                      >
                        →
                      </span>
                    </Link>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        ))}
      </div>
    </section>
  );
}

function WhyNeurix() {
  const items = [
    {
      title: "Instant Access",
      description:
        "Jump in instantly. Sign in only when you want to save and sync your work across devices.",
    },
    {
      title: "Global Edge Network",
      description:
        "Powered by distributed infrastructure across 50+ regions for lightning-fast responses worldwide.",
    },
    {
      title: "Latest AI Models",
      description:
        "Access cutting-edge AI models including GPT-4, FLUX, and custom fine-tuned models for specific tasks.",
    },
    {
      title: "Community Driven",
      description:
        "Built for creators, explorers, and innovators. Join thousands of users creating with AI daily.",
    },
  ];
  return (
    <section
      id="why"
      className="border-b border-border bg-background lg:min-h-screen flex items-center"
    >
      <div className="max-w-[1400px] w-full mx-auto px-5 sm:px-6 lg:px-10 py-16 sm:py-24 lg:py-32">
        <Reveal variant="up">
          <div className="tf-eyebrow mb-4 sm:mb-6">Why choose us</div>
        </Reveal>
        <div className="flex items-end justify-between flex-wrap gap-6 mb-10 sm:mb-16">
          <RevealText
            level={2}
            text="Built for everyone"
            className="tf-display text-4xl sm:text-5xl md:text-7xl max-w-[16ch]"
          />
          <Reveal variant="up" delay={200}>
            <p className="text-ink-soft text-base sm:text-lg max-w-md">
              Powerful AI tools accessible to all, without barriers or limitations.
            </p>
          </Reveal>
        </div>

        <div className="grid md:grid-cols-2 gap-px bg-foreground">
          {items.map((item, i) => (
            <Reveal key={item.title} variant="up" delay={i * 100} className="bg-foreground">
              <div className="tf-card group p-6 sm:p-10 lg:p-14 flex gap-5 sm:gap-8 items-start h-full cursor-default overflow-hidden bg-background hover:bg-cream/40 transition-colors duration-500">
                <span className="tf-display text-xl sm:text-2xl text-ink-soft shrink-0 pt-1 transition-all duration-500 ease-out group-hover:text-highlight group-hover:-translate-y-1">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <RevealText
                    level={3}
                    text={item.title}
                    delay={i * 100 + 120}
                    step={35}
                    className="tf-display text-2xl sm:text-3xl md:text-4xl mb-3 sm:mb-4 transition-transform duration-500 ease-out group-hover:translate-x-1"
                  />
                  <Reveal variant="up" delay={i * 100 + 260}>
                    <p className="text-ink-soft text-base sm:text-lg leading-relaxed max-w-md transition-all duration-500 ease-out group-hover:text-foreground group-hover:translate-x-2">
                      {item.description}
                    </p>
                  </Reveal>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function UseCases() {
  const useCases = [
    {
      title: "Content Creators",
      description:
        "Generate blog posts, social media content, scripts, and marketing copy with AI assistance.",
      icon: "✍︎",
    },
    {
      title: "Explorers",
      description:
        "Point your camera at everyday objects and ask Neurix Vision about the world around you.",
      icon: "◎",
    },
    {
      title: "Designers",
      description:
        "Create concept art, illustrations, mockups, and visual content for any project.",
      icon: "✦",
    },
    {
      title: "Students",
      description:
        "Get help with research, explanations, study guides, and learning complex topics.",
      icon: "✱",
    },
    {
      title: "Entrepreneurs",
      description:
        "Explore business ideas, create plans, and generate marketing materials with AI.",
      icon: "▲",
    },
    {
      title: "Researchers",
      description:
        "Analyze data, summarize papers, explore ideas, and accelerate your research workflow.",
      icon: "◐",
    },
  ];
  return (
    <section id="use-cases" className="border-b border-border lg:min-h-screen flex items-center">
      <div className="max-w-[1400px] w-full mx-auto px-5 sm:px-6 lg:px-10 py-16 sm:py-24 lg:py-32">
        <Reveal variant="up">
          <div className="tf-eyebrow mb-4 sm:mb-6">Use cases</div>
        </Reveal>
        <div className="flex items-end justify-between flex-wrap gap-6 mb-10 sm:mb-16">
          <RevealText
            level={2}
            text="Made for creators"
            className="tf-display text-4xl sm:text-5xl md:text-7xl max-w-[14ch]"
          />
          <Reveal variant="up" delay={200}>
            <p className="text-ink-soft text-base sm:text-lg max-w-md">
              From students to professionals, Neurix AI empowers everyone.
            </p>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-foreground border border-foreground">
          {useCases.map((u, i) => (
            <Reveal key={u.title} variant="up" delay={i * 90} className="bg-foreground">
              <div className="tf-card group p-6 sm:p-8 lg:p-10 bg-background hover:bg-cream h-full cursor-default overflow-hidden">
                <Reveal variant="scale" delay={i * 90 + 80}>
                  <div className="text-2xl sm:text-3xl mb-5 sm:mb-8 text-foreground transition-transform duration-500 ease-out group-hover:-translate-y-1 group-hover:scale-110 group-hover:text-highlight">
                    {u.icon}
                  </div>
                </Reveal>
                <RevealText
                  level={3}
                  text={u.title}
                  delay={i * 90 + 160}
                  step={30}
                  className="tf-display text-xl sm:text-2xl md:text-3xl mb-2 sm:mb-3 transition-transform duration-500 ease-out group-hover:-translate-y-0.5"
                />
                <Reveal variant="up" delay={i * 90 + 280}>
                  <p className="text-ink-soft text-sm sm:text-base leading-relaxed transition-all duration-500 ease-out group-hover:text-foreground group-hover:translate-x-1">
                    {u.description}
                  </p>
                </Reveal>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section
      id="how"
      className="border-b border-border bg-foreground text-background lg:min-h-screen flex items-center"
    >
      <div className="max-w-[1400px] w-full mx-auto px-5 sm:px-6 lg:px-10 py-16 sm:py-24 lg:py-32">
        <div className="text-center mb-10 sm:mb-16">
          <Reveal variant="up">
            <div
              className="tf-eyebrow mb-4 sm:mb-6"
              style={{ color: "color-mix(in oklab, var(--background) 65%, transparent)" }}
            >
              How it works
            </div>
          </Reveal>
          <RevealText
            level={2}
            text="Simple. Powerful. Free."
            className="tf-display text-6xl sm:text-7xl md:text-9xl lg:text-[12rem] leading-[0.95]"
          />
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section id="start" className="border-b border-border lg:min-h-screen flex items-center">
      <div className="max-w-[1400px] w-full mx-auto px-5 sm:px-6 lg:px-10 py-20 sm:py-28 lg:py-40 text-center">
        <RevealText
          level={2}
          text="Start Creating"
          className="tf-display text-5xl sm:text-6xl md:text-8xl lg:text-9xl"
        />
        <RevealText
          level={3}
          text="Right Now"
          delay={120}
          className="tf-display text-5xl sm:text-6xl md:text-8xl lg:text-9xl text-ink-soft"
        />
        <Reveal variant="up" delay={400}>
          <p className="mt-8 sm:mt-10 text-base sm:text-lg text-ink-soft max-w-xl mx-auto">
            Sign in or just start creating. Your work syncs across devices when you do.
          </p>
        </Reveal>
        <Reveal
          variant="up"
          delay={520}
          className="mt-10 sm:mt-12 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center"
        >
          <Link
            to="/chat"
            className="tf-cta inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-6 sm:px-8 h-12 sm:h-14 text-sm sm:text-base font-medium"
          >
            Get Started Free →
          </Link>
          <Link
            to="/image"
            className="tf-cta inline-flex items-center justify-center rounded-full border border-border bg-background text-foreground px-6 sm:px-8 h-12 sm:h-14 text-sm sm:text-base font-medium hover:bg-cream"
          >
            Generate Images
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-background">
      <div className="max-w-[1400px] mx-auto px-5 sm:px-6 lg:px-10 py-10 sm:py-12">
        <div className="flex items-center justify-between gap-4 sm:gap-6 flex-wrap">
          <Reveal variant="left">
            <Link to="/" className="font-semibold tracking-tight text-lg">
              Neurix<span className="text-ink-soft">®</span>
            </Link>
          </Reveal>
          <Reveal variant="up" delay={120}>
            <nav className="flex gap-5 sm:gap-8 text-sm text-ink-soft items-center">
              <Link to="/chat" search={{}} className="tf-link hover:text-foreground transition">
                Chat
              </Link>
              <Link to="/image" search={{}} className="tf-link hover:text-foreground transition">
                Image
              </Link>
              <Link to="/vision" className="tf-link hover:text-foreground transition">
                Vision
              </Link>
              <a
                href="https://www.instagram.com/ad4mkhhkhhkhh/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition inline-flex items-center"
                aria-label="Instagram"
                title="Instagram"
              >
                <svg
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
                </svg>
              </a>
            </nav>
          </Reveal>
          <Reveal variant="right" delay={240}>
            <p className="text-xs sm:text-sm text-ink-soft w-full sm:w-auto">
              Free AI for everyone. No limits.
            </p>
          </Reveal>
        </div>
      </div>
    </footer>
  );
}

function Index() {
  useEffect(() => {
    if (window.location.hash !== "#start") return;

    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", cleanUrl);

    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, []);

  return (
    <div className="tf-home-animated min-h-screen bg-background text-foreground">
      <Hero />
      <About />
      <Tools />
      <Banknote3D />
      <WhyNeurix />
      <Smackdown />
      <UseCases />
      <HowItWorks />
      <CTA />
      <Footer />
    </div>
  );
}
