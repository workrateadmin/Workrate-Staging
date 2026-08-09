/**
 * Memphis Bold — native theme object (TypeScript declarations only).
 * Runtime implementation: native-theme.tsx (compiled by Metro, not by tsc).
 */
import type { Colors } from '../hooks/use-colors';

export type NativeColorPalette = Colors;

export declare const nativeTheme: {
  readonly colors: {
    readonly light: NativeColorPalette;
    readonly dark: NativeColorPalette;
  };
  readonly radius: number;
  readonly spacing: number;
  readonly fontFamily: {
    readonly regular: 'Inter_400Regular';
    readonly medium: 'Inter_500Medium';
    readonly semibold: 'Inter_600SemiBold';
    readonly bold: 'Inter_700Bold';
  };
};

export type NativeTheme = typeof nativeTheme;
