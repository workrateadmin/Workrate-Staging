import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useDesignSystemFonts } from '@workspace/memphis-bold/hooks/use-fonts';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ClerkProvider, ClerkLoaded } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { setBaseUrl } from '@workspace/api-client-react';

// Set API base URL at module level so every generated hook hits the right origin.
// EXPO_PUBLIC_API_BASE_URL should be the full origin of the shared Replit dev/prod domain
// (e.g. https://abc123.replit.dev). The generated hooks append /api/... paths.
const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : null);
if (apiBaseUrl) setBaseUrl(apiBaseUrl);

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="enquiry/[id]"
        options={{ headerShown: true, headerTitle: 'Enquiry', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="job/[id]"
        options={{ headerShown: true, headerTitle: 'Job', headerBackTitle: 'Back' }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const { fontsLoaded, fontError } = useDesignSystemFonts();

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <ClerkProvider
            publishableKey={publishableKey}
            tokenCache={tokenCache}
            proxyUrl={proxyUrl}
          >
            <ClerkLoaded>
              <QueryClientProvider client={queryClient}>
                <KeyboardProvider>
                  <RootLayoutNav />
                </KeyboardProvider>
              </QueryClientProvider>
            </ClerkLoaded>
          </ClerkProvider>
        </GestureHandlerRootView>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
