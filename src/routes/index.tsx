import { useState, type ComponentType } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, BrainCircuit, CalendarDays, CheckCircle2, Code2, Database, FileText, Github, Globe2, ListChecks, Mail, Menu, Search, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({ meta: [
    { title: "Neurix — Intelligence, connected." },
    { name: "description", content: "Meet Lyra-3, a multi-agent intelligence designed to work with you. Coming soon." },
  ] }),
});

type Icon = ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
type Agent = { name: string; description: string; icon: Icon; status: string };

const agents: Agent[] = [
  { name: "Research", description: "Find, compare, and synthesize what matters.", icon: Search, status: "Planned" },
  { name: "Coding", description: "Build with context, verification, and precision.", icon: Code2, status: "Planned" },
  { name: "Memory", description: "A private context layer that grows with you.", icon: Database, status: "Coming soon" },
  { name: "Documents", description: "Turn scattered files into useful understanding.", icon: FileText, status: "Planned" },
  { name: "Web", description: "Navigate the open web with a clear point of view.", icon: Globe2, status: "Planned" },
  { name: "Tasks", description: "Move from intention to a finished next step.", icon: ListChecks, status: "Planned" },
  { name: "Security", description: "Actions designed around trust and control.", icon: ShieldCheck, status: "Planned" },
  { name: "Verification", description: "Check the work before it reaches you.", icon: CheckCircle2, status: "Coming soon" },
  { name: "Gmail", description: "A planned connection for your inbox.", icon: Mail, status: "Planned" },
  { name: "Calendar", description: "A planned connection for your time.", icon: CalendarDays, status: "Planned" },
  { name: "GitHub", description: "A planned connection for your codebase.", icon: Github, status: "Planned" },
];

function AgentTile({ agent, selected, onSelect, index }: { agent: Agent; selected: boolean; onSelect: () => void; index: number }) {
  const Icon = agent.icon;
  return <button type="button" aria-pressed={selected} onClick={onSelect} className={cn("nx-agent-tile", selected && "is-selected")} style={{ ["--tile-delay" as string]: `${index * 120}ms` }}>
    <Icon className="size-5" strokeWidth={1.5} aria-hidden={true} />
    <span className="nx-agent-name">{agent.name}</span>
    <span className="nx-agent-status">{agent.status}</span>
  </button>;
}

function Constellation() {
  const [selected, setSelected] = useState("Research");
  const active = agents.find((agent) => agent.name === selected) ?? agents[0];
  return <section id="agents" className="nx-section nx-constellation-section">
    <div className="nx-section-intro"><p className="nx-eyebrow">A system, not a silo</p><h2>Many minds.<br /><span>One direction.</span></h2><p className="nx-muted">Lyra-3 coordinates specialized agents so the right intelligence can meet the moment. Every connection below is planned, not implied.</p></div>
    <div className="nx-constellation" aria-label="Planned Lyra-3 agent connections">
      <div className="nx-orbit nx-orbit-one" aria-hidden="true" /><div className="nx-orbit nx-orbit-two" aria-hidden="true" />
      <div className="nx-agent-grid">{agents.map((agent, index) => <AgentTile key={agent.name} agent={agent} selected={selected === agent.name} onSelect={() => setSelected(agent.name)} index={index} />)}</div>
      <div className="nx-core"><BrainCircuit className="size-7" strokeWidth={1.4} /><span>Lyra-3</span><small>Coming soon</small></div>
    </div>
    <div className="nx-agent-detail" aria-live="polite"><div><p className="nx-eyebrow">Selected intelligence</p><h3>{active.name}</h3></div><p>{active.description}</p><span>{active.status}</span></div>
  </section>;
}

function EarlyAccess() {
  return <section id="access" className="nx-access nx-section"><div><p className="nx-eyebrow">The first signal</p><h2>Be there when<br /><span>Lyra-3 wakes.</span></h2><p className="nx-muted">Create your Neurix account now. We&apos;ll keep the door open and let you know when the next layer is ready.</p></div><div className="nx-access-card"><p className="nx-card-label">EARLY ACCESS</p><h3>Reserve your place.</h3><p className="nx-muted">Email registration is handled securely by Neurix authentication.</p><Link to="/auth" className="nx-button">Create account <ArrowUpRight className="size-4" /></Link><p className="nx-legal">By continuing, you agree to our planned Terms and Privacy policy.</p></div></section>;
}

function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  return <main className="nx-new-landing">
    <header className="nx-new-nav"><Link to="/" className="nx-wordmark" aria-label="Neurix home">Neurix<span>®</span></Link><nav className={cn(menuOpen && "is-open")}><a href="#agents" onClick={() => setMenuOpen(false)}>Agents</a><a href="#about" onClick={() => setMenuOpen(false)}>About</a><Link to="/auth" onClick={() => setMenuOpen(false)}>Sign in</Link><Link to="/auth" className="nx-nav-button" onClick={() => setMenuOpen(false)}>Get early access</Link></nav><button type="button" className="nx-menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen}>{menuOpen ? <X /> : <Menu />}</button></header>
    <section className="nx-new-hero"><div className="nx-hero-glow" aria-hidden="true" /><div className="nx-hero-content"><p className="nx-eyebrow"><span className="nx-status-dot" /> THE NEXT EVOLUTION OF NEURIX</p><h1>Intelligence,<br /><em>connected.</em></h1><p className="nx-hero-copy">A new kind of AI experience is coming. Meet Lyra-3, a multi-agent intelligence designed to work with you.</p><div className="nx-hero-actions"><Link to="/auth" className="nx-button">Get early access <ArrowUpRight className="size-4" /></Link><a href="#agents" className="nx-text-button">Explore the agents <ArrowUpRight className="size-4" /></a></div><div className="nx-launch-note"><span>LYRA-3 · COMING SOON</span><span>No release date announced. We&apos;re building carefully.</span></div></div><div className="nx-hero-mark" aria-hidden="true"><BrainCircuit /></div></section>
    <Constellation />
    <section id="about" className="nx-section nx-architecture"><div className="nx-section-intro"><p className="nx-eyebrow">One platform. Multiple intelligences.</p><h2>Designed to<br /><span>reason together.</span></h2></div><div className="nx-feature-grid">{[["01", "Contextual Memory", "A private continuity layer that lets useful context travel with you. Planned for Lyra-3."], ["02", "Multi-Agent Reasoning", "Specialists collaborate behind one calm interface, choosing the right path for the work."], ["03", "Verified Actions", "Every action should be inspectable, reversible, and clear before it happens."]].map(([number, title, body]) => <article key={number} className="nx-feature-card"><span>{number}</span><h3>{title}</h3><p>{body}</p><b>PLANNED</b></article>)}</div></section>
    <EarlyAccess />
    <footer className="nx-new-footer"><Link to="/" className="nx-wordmark">Neurix<span>®</span></Link><nav><a href="#about">About</a><a href="#agents">Agents</a><Link to="/auth">Sign in</Link></nav><span>Powered by Neurix · 2026</span></footer>
  </main>;
}
