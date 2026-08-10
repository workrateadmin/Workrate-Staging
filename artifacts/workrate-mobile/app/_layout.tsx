import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
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

// ── API base URL ──────────────────────────────────────────────────────────────
// PRODUCTION builds: EXPO_PUBLIC_API_BASE_URL = https://work-rate-manager.replit.app
// DEV / Expo Go:     falls back to EXPO_PUBLIC_DOMAIN (Replit dev tunnel), which points
//                    at the DEV API server. Never hardcode the dev URL here.
const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : null);
if (apiBaseUrl) setBaseUrl(apiBaseUrl);

// ── ENV guard ─────────────────────────────────────────────────────────────────
// In dev builds (Expo Go) log which API the app is using so env crossover is
// immediately visible in the Metro console.
if (__DEV__) {
  console.log(`[WorkRate] 🔧 DEV BUILD — API: ${apiBaseUrl ?? "(relative)"}`);
}

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
                  {/* DEV MODE banner — only visible in Expo Go / development builds */}
                  {__DEV__ && (
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        backgroundColor: '#ea580c',
                        paddingVertical: 4,
                        alignItems: 'center',
                        zIndex: 9999,
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 }}>
                        ⚠ DEV MODE — Not production
                      </Text>
                    </View>
                  )}
                </KeyboardProvider>
              </QueryClientProvider>
            </ClerkLoaded>
          </ClerkProvider>
        </GestureHandlerRootView>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
