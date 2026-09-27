import { createId } from "@/lib/create-id";
import { useEffect, useState } from "react";
import { createFileRoute, useSearch, useNavigate, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Reveal } from "@/components/reveal";
import {
  Sparkles,
  Download,
  Loader2,
  Lock,
  X,
  ArrowUp,
  ArrowRight,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HistoryDrawer } from "@/components/history-drawer";
import { imageHistory } from "@/lib/history";
import { generateImage } from "@/lib/ai-services";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/image")({
  component: ImagePage,
  validateSearch: (search: Record<string, unknown>): { session?: string } => ({
    session: typeof search.session === "string" ? search.session : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Neurix Image Gen — Free AI image generator" },
      {
        name: "description",
        content:
          "Turn text into stunning images. Free AI image generation by Neurix.",
      },
    ],
  }),
});

const aspectRatios = [
  { id: "1:1",  label: "Square",     ratio: 1 / 1 },
  { id: "16:9", label: "Wide",       ratio: 16 / 9 },
  { id: "9:16", label: "Vertical",   ratio: 9 / 16 },
  { id: "4:3",  label: "Landscape",  ratio: 4 / 3 },
  { id: "3:4",  label: "Portrait",   ratio: 3 / 4 },
] as const;
type AspectId = typeof aspectRatios[number]["id"];

type Generated = { id: string; image: string; prompt: string; aspect: AspectId };

const renderMessages = [
  "Reading the mood",
  "Building the composition",
  "Tuning the details",
  "Adding the final light",
];
const renderStepCount = 10;

const showcaseCards = [
  { title: 'Photo Edit', image: '/image-showcase/photo-edit.png', tone: 'dark' },
  { title: 'Reimagine', image: '/image-showcase/reimagine.png', tone: 'dark' },
  { title: 'Smart Resize', image: '/image-showcase/smart-resize.png', tone: 'light' },
  { title: 'BG Removal & Change', image: '/image-showcase/background-change.png', tone: 'light' },
  { title: 'Product Design', image: '/image-showcase/product-design.png', tone: 'light' },
  { title: 'Collage', image: '/image-showcase/collage.png', tone: 'warm' },
] as const;

function ImagePage() {
  const search = useSearch({ from: "/image" });
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<AspectId>("1:1");
  const [wordIndex, setWordIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [renderMessageIndex, setRenderMessageIndex] = useState(0);
  const [images, setImages] = useState<Generated[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<Generated | null>(null);
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>(() => createId());
  const rotatingWords = ["image", "portrait", "landscape", "scene"];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWordIndex((current) => (current + 1) % rotatingWords.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [rotatingWords.length]);

  // Hydrate from saved session
  useEffect(() => {
    if (!search.session) return;
    const found = imageHistory.list().find((s) => s.id === search.session);
    if (found) {
      setSessionId(found.id);
      setImages(found.images as Generated[]);
      setFeaturedId(found.images[0]?.id ?? null);
    }
  }, [search.session]);

  // Persist on change
  useEffect(() => {
    if (images.length === 0) return;
    const t = window.setTimeout(() => {
      imageHistory.upsert(imageHistory.fromImages(sessionId, images));
    }, 250);
    return () => window.clearTimeout(t);
  }, [images, sessionId]);

  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightbox]);

  useEffect(() => {
    if (!isGenerating) {
      setRenderMessageIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setRenderMessageIndex((current) => {
        if (current >= renderStepCount - 1) {
          window.clearInterval(timer);
          return renderStepCount - 1;
        }
        return current + 1;
      });
    }, 1400);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  const newSession = () => {
    setImages([]);
    setFeaturedId(null);
    setLightbox(null);
    setError(null);
    setSessionId(createId());
    navigate({ to: "/image", search: {} });
  };

  const generate = async (rawPrompt?: string) => {
    const seed = (rawPrompt ?? prompt).trim();
    if (!seed || isGenerating) return;
    setError(null);
    setIsGenerating(true);
    const full = seed;
    try {
      const result = await generateImage(full, aspect);
      if ("error" in result) {
        throw new Error(result.error);
      }
      const newImg: Generated = { id: createId(), image: result.image, prompt: full, aspect };
      setImages((p) => [newImg, ...p]);
      setFeaturedId(newImg.id);
      setPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const download = (img: Generated) => {
    const a = document.createElement("a");
    a.href = img.image;
    a.download = `neurix-${img.id}.png`;
    a.click();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      generate();
    }
  };

  const isEmpty = images.length === 0 && !isGenerating;

  // Gate: require sign-in to use the image generator at all
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen w-full bg-background text-foreground flex flex-col">
        <SiteHeader />
        <main className="flex-1 flex items-center justify-center px-5 sm:px-6 lg:px-10 py-16">
          <div className="max-w-xl w-full text-center">
            <Reveal variant="up">
              <div className="inline-flex items-center gap-2 px-3.5 h-9 rounded-full border border-foreground/30 text-xs mb-7">
                <Lock className="size-3.5" />
                <span className="tf-eyebrow !tracking-[0.18em] !text-foreground !text-[0.68rem]">
                  Sign in required
                </span>
              </div>
            </Reveal>
            <Reveal variant="up" delay={80}>
              <h1 className="tf-display text-[clamp(2.5rem,8vw,5.5rem)] leading-[0.95] mb-5">
                Members only<span className="text-highlight">.</span>
              </h1>
            </Reveal>
            <Reveal variant="up" delay={160}>
              <p className="text-base sm:text-lg text-ink-soft leading-relaxed mb-9 max-w-md mx-auto">
                Image generation is reserved for signed-in users. Create a free
                account in seconds — no credit card, no friction.
              </p>
            </Reveal>
            <Reveal variant="up" delay={240}>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  to="/auth"
                  className="tf-cta inline-flex items-center justify-center gap-2 px-6 h-12 rounded-full bg-foreground text-background text-sm font-medium"
                >
                  Sign in to continue
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  to="/chat"
                  search={{}}
                  className="inline-flex items-center justify-center gap-2 px-6 h-12 rounded-full border border-border hover:border-foreground transition-colors text-sm font-medium"
                >
                  Try chat instead
                </Link>
              </div>
            </Reveal>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div
      className="image-generator min-h-screen w-full bg-background text-foreground flex flex-col"
      data-image-state={isGenerating ? "generating" : images.length ? "ready" : "idle"}
    >
      <SiteHeader />

      <main className="flex-1 flex flex-col relative">
        {/* Gallery / Empty state */}
        <div className="flex-1">
          <div className="max-w-4xl mx-auto w-full px-5 sm:px-6 lg:px-10 py-6 sm:py-8 pb-44 sm:pb-40">
            {images.length === 0 && !isGenerating ? (
              <div className="image-generator__showcase" aria-label="AI image tools">
                <div className="image-showcase__intro">
                  <p className="tf-eyebrow !tracking-[0.18em]">AI IMAGE STUDIO</p>
                  <h1 className="image-showcase__title">Imagine <em>anything.</em></h1>
                  <p>Start with an idea, a mood, or one of the ready-made AI canvases below.</p>
                </div>
                <div className="image-showcase__grid">
                  {showcaseCards.map((card, index) => (
                    <button type="button" key={card.title} className={`image-showcase__card image-showcase__card--${card.tone}`} style={{ animationDelay: `${index * 70}ms` }} onClick={() => setPrompt(card.title === 'Photo Edit' ? 'A cinematic portrait with natural light' : card.title === 'Reimagine' ? 'Reimagine this as a surreal editorial scene' : `Create a premium ${card.title.toLowerCase()} concept`)}>
                      <img src={card.image} alt="" />
                      <span>{card.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="sticky top-0 z-20 -mx-5 sm:-mx-6 lg:-mx-10 mb-5 sm:mb-6 flex items-center justify-between gap-3 px-5 sm:px-6 lg:px-10 py-2 sm:py-2.5 bg-background/85 backdrop-blur-xl border-b border-border animate-in fade-in slide-in-from-top-2 duration-300 ease-out">
                  <span className="tf-eyebrow !tracking-[0.18em]">
                    Session · {images.length} {images.length === 1 ? "image" : "images"}
                  </span>
                  <button
                    type="button"
                    onClick={newSession}
                    className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full border border-foreground tf-invert-hover text-xs font-medium transition-all duration-200 ease-out hover:scale-[1.03] active:scale-95"
                    aria-label="New session"
                  >
                    <Trash2 className="size-3.5" />
                    <span>New session</span>
                  </button>
                </div>
                <FeaturedGallery
                  images={images}
                  isGenerating={isGenerating}
                  pendingAspect={aspect}
                  renderMessage={renderMessages[renderMessageIndex % renderMessages.length]}
                  renderStep={renderMessageIndex + 1}
                  featuredId={featuredId}
                  setFeaturedId={setFeaturedId}
                  onOpen={setLightbox}
                  onDownload={download}
                />
              </>
            )}
          </div>
        </div>

        {/* Sticky command bar */}
        <div
          className={cn(
            "image-generator__dock bg-gradient-to-t from-background via-background/95 to-background/0 backdrop-blur-xl pt-3 transition-[top,transform] duration-500 ease-out",
            isEmpty
              ? "absolute inset-x-0 top-[58%] -translate-y-1/2"
              : "sticky bottom-0"
          )}
        >
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-10 py-3 sm:py-5">
            {/* Prompt input */}
            <div className="image-generator__composer tf-composer-field flex items-center gap-2 rounded-full bg-cream/60 border border-border focus-within:border-foreground focus-within:shadow-[0_0_0_4px_rgba(0,0,0,0.04)] transition-all duration-300 ease-out pl-3 pr-2.5 py-2">
              <Sparkles className="size-4 shrink-0 text-foreground/70 transition-transform duration-300" />
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={onKey}
                rows={1}
                placeholder="Describe an image…  (Enter to render)"
                className="flex-1 resize-none bg-transparent border-0 px-0 py-1.5 text-foreground placeholder:text-foreground/50 focus:outline-none text-base leading-relaxed max-h-32"
              />
              <button
                onClick={() => generate()}
                disabled={!prompt.trim() || isGenerating}
                className="tf-cta inline-flex items-center justify-center rounded-full bg-foreground text-background size-9 shrink-0 transition-all duration-200 ease-out enabled:hover:scale-110 enabled:active:scale-90 disabled:opacity-30"
                aria-label="Render"
              >
                {isGenerating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowUp className="size-4" />
                )}
              </button>
            </div>

            {error && (
              <div className="mt-3 text-sm border border-destructive/40 bg-destructive/10 text-destructive px-4 py-2 rounded-lg">
                {error}
              </div>
            )}
          </div>
        </div>
        <HistoryDrawer kind="image" />
      </main>

      {/* LIGHTBOX */}
      {lightbox && (
        <div
          className="image-generator__lightbox fixed inset-0 z-[60] bg-foreground/95 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300 ease-out"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-6 right-6 size-10 rounded-full border border-background/50 text-background hover:bg-background hover:text-foreground transition-all duration-200 ease-out hover:scale-105 active:scale-95 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
          <div
            className="image-generator__lightbox-content max-w-6xl max-h-[90vh] flex flex-col gap-4 animate-in fade-in zoom-in-[0.98] duration-300 ease-out"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightbox.image}
              alt={lightbox.prompt}
              className="max-h-[80vh] w-auto mx-auto border border-background/30 rounded-lg"
            />
            <div className="flex items-center justify-between gap-6 text-background">
              <p className="text-sm opacity-80 truncate flex-1">{lightbox.prompt}</p>
              <button
                onClick={() => download(lightbox)}
                className="inline-flex items-center gap-2 px-4 h-10 rounded-full border border-background hover:bg-background hover:text-foreground transition-all duration-200 ease-out hover:scale-[1.03] active:scale-95 text-sm font-medium"
              >
                <Download className="size-4" /> Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FeaturedGallery({
  images,
  isGenerating,
  pendingAspect,
  renderMessage,
  renderStep,
  featuredId,
  setFeaturedId,
  onOpen,
  onDownload,
}: {
  images: Generated[];
  isGenerating: boolean;
  pendingAspect: AspectId;
  renderMessage: string;
  renderStep: number;
  featuredId: string | null;
  setFeaturedId: (id: string) => void;
  onOpen: (img: Generated) => void;
  onDownload: (img: Generated) => void;
}) {
  const featured =
    images.find((i) => i.id === featuredId) ?? images[0] ?? null;

  // CSS aspect-ratio value for the loader skeleton
  const pendingRatio =
    aspectRatios.find((a) => a.id === pendingAspect)?.id.replace(":", " / ") ??
    "1 / 1";

  // Featured ratio — derived from the chosen aspect on the image itself
  const featuredRatio = featured
    ? (aspectRatios.find((a) => a.id === featured.aspect)?.id.replace(":", " / ") ?? "1 / 1")
    : "1 / 1";

  return (
    <div className="image-generator__gallery space-y-6">
      {/* HERO — currently selected (or generating) */}
      <div className="relative flex justify-center">
        {isGenerating ? (
          <div
            className="image-generator__pending rounded-2xl border border-border bg-cream/40 flex flex-col items-center justify-center gap-4 relative overflow-hidden mx-auto animate-in fade-in duration-500 ease-out"
            style={{
              aspectRatio: pendingRatio,
              maxHeight: "65vh",
              width: "auto",
              height: "min(65vh, 80vh)",
              maxWidth: "100%",
            }}
          >
            <div className="relative z-10 flex flex-col items-center gap-3">
              <div className="image-generator__render-mark" aria-hidden="true">
                <span>{String(renderStep).padStart(2, "0")}</span>
                <span className="image-generator__render-total">/ 10</span>
              </div>
              <span key={`${renderMessage}-${renderStep}`} className="image-generator__render-message">
                {renderMessage}
              </span>
            </div>
          </div>
        ) : featured ? (
          <figure
            key={featured.id}
            className="image-generator__featured group relative rounded-2xl overflow-hidden border border-border bg-background cursor-zoom-in mx-auto animate-in fade-in zoom-in-[0.98] duration-500 ease-out"
            style={{
              aspectRatio: featuredRatio,
              maxHeight: "65vh",
              height: "min(65vh, 80vh)",
              width: "auto",
              maxWidth: "100%",
            }}
            onClick={() => onOpen(featured)}
          >
            <img
              src={featured.image}
              alt={featured.prompt}
              className="w-full h-full object-cover block transition-transform duration-[900ms] ease-out group-hover:scale-[1.015]"
            />
            <figcaption className="absolute inset-x-0 bottom-0 p-4 lg:p-5 bg-gradient-to-t from-foreground/90 via-foreground/40 to-transparent text-background flex items-end justify-between gap-5 translate-y-1.5 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-400 ease-out">
              <p className="text-xs lg:text-sm line-clamp-2 max-w-3xl leading-relaxed">
                {featured.prompt}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload(featured);
                }}
                className="shrink-0 inline-flex items-center gap-2 px-3.5 h-9 rounded-full border border-background/60 text-xs font-medium hover:bg-background hover:text-foreground transition-all duration-200 ease-out hover:scale-[1.03] active:scale-95"
              >
                <Download className="size-3.5" /> Save
              </button>
            </figcaption>
          </figure>
        ) : null}
      </div>

      {/* THUMBNAILS — older images */}
      {images.length > 1 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="tf-eyebrow !text-[0.68rem]">
              History · {images.length}
            </div>
            <div className="text-xs text-ink-soft">Click to view larger</div>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2.5">
            {images.map((img, i) => {
              const active = (featured?.id ?? null) === img.id;
              return (
                <button
                  key={img.id}
                  onClick={() => setFeaturedId(img.id)}
                  aria-pressed={active}
                  style={{ animationDelay: `${Math.min(i * 25, 300)}ms`, animationFillMode: "backwards" }}
                  className={cn(
                    "group relative aspect-square rounded-md overflow-hidden border animate-in fade-in duration-300 ease-out transition-all hover:-translate-y-0.5",
                    active
                      ? "border-foreground ring-1 ring-foreground/30 scale-[1.02]"
                      : "border-border hover:border-foreground opacity-70 hover:opacity-100"
                  )}
                  title={img.prompt}
                >
                  <img
                    src={img.image}
                    alt={img.prompt}
                    className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
