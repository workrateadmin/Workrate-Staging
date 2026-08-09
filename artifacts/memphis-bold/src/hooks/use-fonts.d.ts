/**
 * Memphis Bold — native font hook (TypeScript declarations only).
 * Runtime implementation: use-fonts.tsx (compiled by Metro, not by tsc).
 */
export declare function useDesignSystemFonts(): {
  fontsLoaded: boolean;
  fontError: Error | null;
};

export declare const fontFamily: {
  readonly regular: 'Inter_400Regular';
  readonly medium: 'Inter_500Medium';
  readonly semibold: 'Inter_600SemiBold';
  readonly bold: 'Inter_700Bold';
};
