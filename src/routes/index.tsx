import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: PlaygroundPage,
  head: () => ({ meta: [
    { title: "Neurix — Build your workspace" },
    { name: "description", content: "A tactile app playground for the Neurix intelligence workspace." },
  ] }),
});

type App = { id: string; name: string; icon: string; color: string; url: string; description: string; x: number; y: number; scale: number; rotation: number };
type Point = { x: number; y: number };

const appCatalog = [
  ["gmail", "Gmail", "EA4335", "https://mail.google.com", "Email, reimagined for focused work."],
  ["calendar", "Calendar", "4285F4", "https://calendar.google.com", "Make space for what matters."],
  ["drive", "Drive", "0F9D58", "https://drive.google.com", "Your files, always within reach."],
  ["docs", "Docs", "4285F4", "https://docs.google.com", "Write and think together."],
  ["github", "GitHub", "181717", "https://github.com", "Ship better, with context."],
  ["slack", "Slack", "E01E5A", "https://slack.com", "The signal in the conversation."],
  ["discord", "Discord", "5865F2", "https://discord.com", "Find your people and your flow."],
  ["notion", "Notion", "000000", "https://notion.so", "One place for every thought."],
  ["spotify", "Spotify", "1DB954", "https://open.spotify.com", "Set the tone for deep work."],
  ["youtube", "YouTube", "FF0000", "https://youtube.com", "Learn, explore, make."],
  ["maps", "Maps", "34A853", "https://maps.google.com", "Get there from here."],
  ["figma", "Figma", "F24E1E", "https://figma.com", "Shape ideas into reality."],
  ["visualstudiocode", "VS Code", "007ACC", "https://code.visualstudio.com", "A sharper place to build."],
  ["googlechrome", "Chrome", "4285F4", "https://google.com/chrome", "The web, your way."],
  ["openai", "OpenAI", "111111", "https://chatgpt.com", "A thinking partner, when you need one."],
  ["lyra", "Lyra-3", "111111", "#lyra", "The next intelligence layer. Coming soon."],
] as const;

const initialPositions = [
  [7, 17, 1, -4], [24, 31, .9, 5], [43, 16, 1.08, -2], [61, 29, .88, 4], [79, 14, 1.1, -5],
  [14, 58, .9, 3], [32, 69, 1.05, -4], [51, 53, .94, 2], [71, 65, 1.12, -3], [87, 52, .9, 5],
  [5, 81, 1, -2], [24, 86, .92, 4], [44, 81, 1.08, -5], [64, 86, .9, 2], [82, 77, 1, -3], [48, 37, .95, 0],
] as const;

function makeApp(index: number): App {
  const item = appCatalog[index];
  const pos = initialPositions[index] ?? [50, 50, 1, 0];
  return { id: item[0], name: item[1], icon: item[0], color: item[2], url: item[3], description: item[4], x: pos[0], y: pos[1], scale: pos[2], rotation: pos[3] };
}

const defaultApps = appCatalog.map((_, index) => makeApp(index));
const iconUrl = (name: string, color: string) => name === "lyra" ? "" : `https://cdn.simpleicons.org/${name}/${color}`;

function PlaygroundPage() {
  const [apps, setApps] = useState<App[]>(defaultApps);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [lyraOpen, setLyraOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; offset: Point; last: Point; velocity: Point; frame: number | null }>({ id: "", offset: { x: 0, y: 0 }, last: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, frame: null });

  useEffect(() => {
    try { const saved = localStorage.getItem("neurix-playground"); if (saved) setApps(JSON.parse(saved)); } catch { /* fallback to defaults */ }
  }, []);
  useEffect(() => { try { localStorage.setItem("neurix-playground", JSON.stringify(apps)); } catch { /* persistence is best effort */ } }, [apps]);

  const reset = useCallback(() => { setApps(defaultApps); setSelected(null); }, []);
  const updatePosition = (id: string, point: Point) => setApps((current) => current.map((app) => app.id === id ? { ...app, x: Math.max(3, Math.min(97, point.x)), y: Math.max(10, Math.min(94, point.y)) } : app));
  const onPointerDown = (event: React.PointerEvent, app: App) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    dragRef.current = { id: app.id, offset: { x: x - app.x, y: y - app.y }, last: { x, y }, velocity: { x: 0, y: 0 }, frame: null };
    setDragged(app.id); setSelected(app.id); (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current; if (!drag.id || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect(); const point = { x: ((event.clientX - rect.left) / rect.width) * 100 - drag.offset.x, y: ((event.clientY - rect.top) / rect.height) * 100 - drag.offset.y };
    drag.velocity = { x: point.x - drag.last.x, y: point.y - drag.last.y }; drag.last = point; updatePosition(drag.id, point);
  };
  const onPointerUp = () => {
    const drag = dragRef.current; if (!drag.id) return;
    const id = drag.id; const velocity = drag.velocity; drag.id = ""; setDragged(null);
    if (Math.abs(velocity.x) + Math.abs(velocity.y) > .5) {
      let steps = 0; const glide = () => { if (steps++ > 12) return; velocity.x *= .82; velocity.y *= .82; setApps((current) => current.map((app) => app.id === id ? { ...app, x: Math.max(3, Math.min(97, app.x + velocity.x)), y: Math.max(10, Math.min(94, app.y + velocity.y)) } : app)); requestAnimationFrame(glide); }; requestAnimationFrame(glide);
    }
  };
  const active = apps.find((app) => app.id === selected);
  const available = useMemo(() => appCatalog.filter(([id]) => !apps.some((app) => app.id === id)), [apps]);
  const addApp = (id: string) => { const index = appCatalog.findIndex(([item]) => item === id); setApps((current) => [...current, { ...makeApp(index), x: 50 + Math.random() * 20 - 10, y: 42 + Math.random() * 18 - 9 }]); setShowAdd(false); };
  const openApp = (app: App) => { if (app.id === "lyra") setLyraOpen(true); else window.open(app.url, "_blank", "noopener,noreferrer"); };

  return <main className="playground-shell">
    <header className="playground-header"><Link to="/" className="playground-logo">Neurix<span>®</span></Link><div className="playground-status"><i /> LYRA-3 <span>/ COMING SOON</span></div><div className="playground-actions"><Link to="/auth" className="playground-signin">Sign in</Link><Link to="/auth" className="playground-account">Create account</Link><button className="playground-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">•••</button></div></header>
    {menuOpen && <div className="playground-mobile-menu"><Link to="/auth">Sign in</Link><Link to="/auth">Create account</Link></div>}
    <div ref={canvasRef} className="icon-canvas" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      {apps.map((app) => <button key={app.id} className={cn("app-brick", dragged === app.id && "is-dragging", selected === app.id && "is-selected")} style={{ left: `${app.x}%`, top: `${app.y}%`, ["--brick-scale" as string]: app.scale, ["--brick-rotation" as string]: `${app.rotation}deg`, ["--brand-color" as string]: `#${app.color}` }} onPointerDown={(event) => onPointerDown(event, app)} onClick={() => setSelected(app.id)} onDoubleClick={() => openApp(app)} aria-label={`${app.name}: ${app.description}`}>
        <span className="brick-surface" style={{ ["--brand-color" as string]: `#${app.color}` }}>{iconUrl(app.icon, app.color) ? <><span className="brand-fallback">{app.name.slice(0, 2).toUpperCase()}</span><img src={iconUrl(app.icon, app.color)} alt="" draggable={false} onError={(event) => { event.currentTarget.style.display = "none"; }} /></> : <span className="lyra-symbol">L</span>}</span><span className="brick-label">{app.name}</span>{app.id === "lyra" && <small>COMING SOON</small>}
      </button>)}
      <div className="canvas-hint">Drag it. Throw it. Build your workspace.</div>
      <button className="reset-button" onClick={reset} aria-label="Reset workspace"><RotateCcw size={13} /> Reset</button>
      <div className="canvas-tools"><button className="add-button" onClick={() => setShowAdd(!showAdd)} aria-label="Add app"><Plus size={22} /></button>{showAdd && <div className="add-popover"><strong>Add to workspace</strong>{available.length ? available.map(([id, name]) => <button key={id} onClick={() => addApp(id)}><span style={{ background: `#${appCatalog.find((item) => item[0] === id)?.[2]}` }} />{name}</button>) : <p>Everything is already here.</p>}</div>}</div>
    </div>
    {active && <aside className="app-popover"><button onClick={() => setSelected(null)} aria-label="Close details"><X size={15} /></button><p>{active.id === "lyra" ? "THE NEXT LAYER" : "SHORTCUT"}</p><h2>{active.name}</h2><span>{active.description}</span><button onClick={() => openApp(active)}>{active.id === "lyra" ? "Learn more" : "Open app"}</button></aside>}
    {lyraOpen && <div className="lyra-modal-backdrop" onClick={() => setLyraOpen(false)}><section className="lyra-modal" onClick={(event) => event.stopPropagation()}><button onClick={() => setLyraOpen(false)} aria-label="Close"><X size={17} /></button><div className="lyra-modal-mark">L</div><p>LYRA-3 / COMING SOON</p><h2>Intelligence,<br /><em>connected.</em></h2><span>Lyra-3 is the upcoming intelligence at the heart of Neurix. We&apos;re building it carefully, with you in mind.</span><Link to="/auth">Create an account</Link></section></div>}
  </main>;
}
