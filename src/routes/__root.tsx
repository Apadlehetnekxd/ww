import { Outlet, Link, createRootRoute, useLocation } from "@tanstack/react-router";
import { Analytics } from "@vercel/analytics/react";
import { ThemeProvider } from "@/components/theme-provider";
import { NeurixPreloader } from "@/components/neurix-preloader";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootComponent() {
  const { pathname } = useLocation();
  const isVision = pathname === "/vision";
  return (
    <ThemeProvider>
      <AuthProvider>
        <div className={isVision ? "min-h-screen bg-black" : "min-h-screen"}>
          {!isVision && <NeurixPreloader />}
          <Outlet />
          <Toaster />
          <Analytics />
        </div>
      </AuthProvider>
    </ThemeProvider>
  );
}
