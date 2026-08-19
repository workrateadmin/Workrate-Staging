import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { PwaUpdatePrompt } from "@/components/pwa-update-prompt";
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AppLayout } from "@/components/layout";

import LandingPage from "./pages/landing";
import Dashboard from "./pages/dashboard";
import Enquiries from "./pages/enquiries";
import EnquiryDetail from "./pages/enquiry-detail";
import QuoteEditor from "./pages/quote-editor";
import Jobs from "./pages/jobs";
import JobDetail from "./pages/job-detail";
import Schedule from "./pages/schedule";
import AiReceptionist from "./pages/ai-receptionist";
import Settings from "./pages/settings";
import WidgetPage from "./pages/widget";
import IntegrationsPage from "./pages/integrations";
import ProposalPage from "./pages/proposal";
import NotFound from "./pages/not-found";
import DiagnosticsPage from "./pages/diagnostics";
import InvoicesPage from "./pages/invoices";
import InvoiceEditor from "./pages/invoice-editor";
import { DevBanner } from "@/components/dev-banner";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const queryClient = new QueryClient();

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(24 95% 53%)",
    colorForeground: "hsl(224 47% 11%)",
    colorMutedForeground: "hsl(215 16% 47%)",
    colorDanger: "hsl(0 84% 60%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(214 32% 91%)",
    colorInputForeground: "hsl(224 47% 11%)",
    colorNeutral: "hsl(214 32% 91%)",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl border border-gray-100",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-2xl font-bold tracking-tight text-gray-900",
    headerSubtitle: "text-sm text-gray-500",
    socialButtonsBlockButtonText: "font-medium",
    formFieldLabel: "font-medium text-gray-700",
    footerActionLink: "font-semibold text-orange-600 hover:text-orange-700",
    footerActionText: "text-gray-500",
    dividerText: "text-gray-400 text-xs font-medium uppercase",
    identityPreviewEditButton: "text-orange-600 hover:bg-orange-50",
    formFieldSuccessText: "text-green-600",
    alertText: "text-red-600",
    logoBox: "h-12 w-12 mx-auto bg-orange-100 rounded-xl flex items-center justify-center p-2 mb-2",
    logoImage: "w-full h-full object-contain",
    socialButtonsBlockButton: "border-gray-200 hover:bg-gray-50 transition-colors",
    formButtonPrimary: "bg-orange-600 hover:bg-orange-700 shadow-sm transition-all",
    formFieldInput: "h-10 border-gray-200 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent",
    footerAction: "bg-gray-50 border-t border-gray-100 py-4",
    dividerLine: "bg-gray-200",
    alert: "bg-red-50 border-red-100",
    otpCodeFieldInput: "border-gray-200 focus:ring-orange-500",
    formFieldRow: "mb-4",
    main: "p-8",
  },
};

/**
 * Business sign-in page.
 * Shown when a business owner navigates to /sign-in.
 */
function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <span className="font-black text-2xl tracking-tight text-slate-900">WorkRate</span>
          </div>
          <p className="text-sm text-slate-500 font-medium">Business Dashboard · Sign In</p>
        </div>
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <span className="font-black text-2xl tracking-tight text-slate-900">WorkRate</span>
          </div>
          <p className="text-sm text-slate-500 font-medium">Business Dashboard · Create Account</p>
        </div>
        <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
      </div>
    </div>
  );
}

/**
 * Home route:
 * - Always renders the public landing page immediately (no blank-page flash).
 * - Once Clerk resolves, signed-in business owners are redirected to /dashboard.
 *
 * Rendering unconditionally means buttons are interactive from the first paint,
 * even while Clerk is still initialising in the background.
 */
function HomeRedirect() {
  const { isSignedIn, isLoaded } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate("/dashboard");
    }
  }, [isLoaded, isSignedIn, navigate]);

  // Always show the landing page. Signed-in users are redirected by the effect above.
  return <LandingPage />;
}

function ProtectedRoute({ component: Component }: { component: any }) {
  const { isSignedIn, isLoaded } = useAuth();
  const [, navigate] = useLocation();
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Cancel any pending redirect first
    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }

    if (isLoaded && !isSignedIn) {
      // Brief grace period before redirecting — Clerk calls routerReplace()
      // before its isSignedIn state has propagated through the React context,
      // so a synchronous redirect here fires too early and ejects an
      // already-authenticated user back to the sign-in page.
      redirectTimerRef.current = setTimeout(() => navigate("/sign-in"), 300);
    }

    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, [isLoaded, isSignedIn, navigate]);

  if (!isLoaded) return null;
  if (!isSignedIn) return null;

  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      localization={{
        signIn: {
          start: {
            title: "Business Dashboard",
            subtitle: "Sign in to manage your pipeline",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          {/* ── Customer experience (public) ── */}
          <Route path="/" component={HomeRedirect} />
          <Route path="/widget" component={WidgetPage} />
          <Route path="/proposal/:token" component={ProposalPage} />

          {/* ── Business authentication ── */}
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />

          {/* ── Business dashboard (protected) ── */}
          <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
          <Route path="/enquiries"><ProtectedRoute component={Enquiries} /></Route>
          <Route path="/enquiries/:id"><ProtectedRoute component={EnquiryDetail} /></Route>
          <Route path="/quotes/:id"><ProtectedRoute component={QuoteEditor} /></Route>
          <Route path="/jobs"><ProtectedRoute component={Jobs} /></Route>
          <Route path="/jobs/:id"><ProtectedRoute component={JobDetail} /></Route>
          <Route path="/schedule"><ProtectedRoute component={Schedule} /></Route>
          <Route path="/ai-receptionist"><ProtectedRoute component={AiReceptionist} /></Route>
          <Route path="/integrations"><ProtectedRoute component={IntegrationsPage} /></Route>
          <Route path="/settings"><ProtectedRoute component={Settings} /></Route>
          <Route path="/diagnostics"><ProtectedRoute component={DiagnosticsPage} /></Route>
          <Route path="/invoices"><ProtectedRoute component={InvoicesPage} /></Route>
          <Route path="/invoices/:id"><ProtectedRoute component={InvoiceEditor} /></Route>

          <Route><NotFound /></Route>
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

/**
 * Invalidates all React Query caches when the home-screen PWA is foregrounded.
 * This ensures stale enquiry data from a backgrounded session is always
 * refreshed when the user returns to the app — satisfying requirement F.
 */
function VisibilityRefresher() {
  const qc = useQueryClient();
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        qc.invalidateQueries();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [qc]);
  return null;
}

export default function App() {
  return (
    <>
      <DevBanner />
      <PwaUpdatePrompt />
      <WouterRouter base={basePath}>
        <QueryClientProvider client={queryClient}>
          <VisibilityRefresher />
        </QueryClientProvider>
        <ClerkProviderWithRoutes />
        <Toaster />
      </WouterRouter>
    </>
  );
}
