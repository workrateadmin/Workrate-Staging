import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
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
import Settings from "./pages/settings";
import ChatDemo from "./pages/chat";
import NotFound from "./pages/not-found";

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

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect href="/dashboard" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: any }) {
  return (
    <>
      <Show when="signed-in">
        <AppLayout>
          <Component />
        </AppLayout>
      </Show>
      <Show when="signed-out">
        <Redirect href="/" />
      </Show>
    </>
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
      localization={{
        signIn: {
          start: {
            title: "Welcome to WorkRate",
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
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/chat" component={ChatDemo} />
          
          {/* Protected Routes */}
          <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
          <Route path="/enquiries"><ProtectedRoute component={Enquiries} /></Route>
          <Route path="/enquiries/:id"><ProtectedRoute component={EnquiryDetail} /></Route>
          <Route path="/quotes/:id"><ProtectedRoute component={QuoteEditor} /></Route>
          <Route path="/settings"><ProtectedRoute component={Settings} /></Route>
          
          <Route><NotFound /></Route>
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
      <Toaster />
    </WouterRouter>
  );
}
