import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Reveal } from "@/components/reveal";
import { Loader2, Mail, Lock, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const authConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in — Neurix" },
      { name: "description", content: "Sign in to Neurix with Google or email." },
    ],
  }),
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Redirect if already signed in
  useEffect(() => {
    if (!authLoading && user) {
      navigate({ to: "/" });
    }
  }, [user, authLoading, navigate]);

  const handleGoogle = async () => {
    if (!authConfigured) {
      toast.info("Sign-in is unavailable in this preview.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: import.meta.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || window.location.origin,
      },
    });
    if (error) {
      toast.error(error.message?.includes("provider") ? "A Google bejelentkezés nincs engedélyezve a Supabase Authban." : error.message ?? "Google sign-in failed");
      setBusy(false);
      return;
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authConfigured) {
      toast.info("Sign-in is unavailable in this preview.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        // Auto sign in after signup
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        toast.success("Account created!");
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        navigate({ to: "/" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="px-4 sm:px-6 lg:px-10 py-12 sm:py-20">
        <div className="max-w-md mx-auto">
          <Reveal variant="up">
            <div className="mb-10 text-center">
              <h1 className="tf-display text-4xl sm:text-5xl font-semibold tracking-tight">
                {mode === "signin" ? "Welcome back" : "Join Neurix"}
              </h1>
              <p className="mt-3 text-sm text-ink-soft">
                {mode === "signin"
                  ? "Sign in to sync your chats and creations across devices."
                  : "Create an account to save your work."}
              </p>
            </div>
          </Reveal>

          <Reveal variant="up" delay={120}>
            <div className="space-y-4">
              <button
                onClick={handleGoogle}
                disabled={busy || !authConfigured}
                className="w-full inline-flex items-center justify-center gap-3 h-12 rounded-full border border-border bg-cream/40 hover:bg-cream transition-colors text-sm font-medium disabled:opacity-60"
              >
                <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-wider">
                  <span className="bg-background px-3 text-ink-soft">or with email</span>
                </div>
              </div>

              <form onSubmit={handleEmail} className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-ink-soft" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full h-12 pl-11 pr-4 rounded-full border border-border bg-cream/40 focus:bg-cream focus:outline-none focus:border-foreground transition-colors text-sm"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-ink-soft" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password (min 6 chars)"
                    className="w-full h-12 pl-11 pr-4 rounded-full border border-border bg-cream/40 focus:bg-cream focus:outline-none focus:border-foreground transition-colors text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || !authConfigured}
                  className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-full bg-foreground text-background hover:bg-foreground/90 transition-colors text-sm font-medium disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      {mode === "signin" ? "Sign in" : "Create account"}
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </button>
              </form>

              <p className="text-center text-sm text-ink-soft pt-2">
                {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                  className="text-foreground font-medium hover:underline"
                >
                  {mode === "signin" ? "Sign up" : "Sign in"}
                </button>
              </p>

              <p className="text-center text-xs text-ink-soft pt-4">
                <Link to="/" className="hover:text-foreground">← Back to home</Link>
              </p>
            </div>
          </Reveal>
        </div>
      </main>
    </div>
  );
}
