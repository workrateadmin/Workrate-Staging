/**
 * Memphis Bold — native font hook.
 * Lives in native/ so it is excluded from the web TypeScript build.
 * Peer deps required in the consuming Expo app: @expo-google-fonts/inter, expo-font.
 */
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';

export function useDesignSystemFonts(): { fontsLoaded: boolean; fontError: Error | null } {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  return { fontsLoaded: Boolean(fontsLoaded), fontError: fontError ?? null };
}

export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;
