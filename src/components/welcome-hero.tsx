import { useMemo } from "react";
import { Reveal } from "@/components/reveal";

/**
 * Short greeting openers. One is picked at random every time the empty state
 * is shown, then the user's name (or "Guest") is appended.
 */
const OPENERS = ["Hi", "Hey", "Hello", "Welcome"];

/**
 * Personalised greeting shown when the chat is empty. Picks a random short
 * opener on each mount and greets by name — falling back to "Guest" when no
 * signed-in user is present.
 */
export function WelcomeHero({ name }: { name: string | null }) {
  const greeting = useMemo(() => {
    const opener = OPENERS[Math.floor(Math.random() * OPENERS.length)];
    return `${opener}, ${name ?? "Guest"}`;
  }, [name]);

  return (
    <div className="relative z-10 w-full max-w-2xl mx-auto flex flex-col items-center text-center px-5">
      <Reveal variant="up" delay={80}>
        <h1 className="font-sans font-medium text-foreground text-3xl sm:text-5xl lg:text-6xl leading-[1.1] tracking-tight text-balance">
          {greeting}
        </h1>
      </Reveal>
    </div>
  );
}
