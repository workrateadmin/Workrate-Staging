/* NATIVE THEME
 * Memphis Bold colour tokens adapted for React Native.
 * This file lives in native/ which is excluded from Memphis Bold's web
 * TypeScript compilation. Metro resolves it at runtime for Expo apps.
 */
import tokens from '../../src/generated/tokens';

function remToDp(remStr: string): number {
  const n = parseFloat(remStr);
  return Number.isNaN(n) ? 0 : n * 16;
}

type RawPalette = typeof tokens.color.light;
export type NativeColorPalette = RawPalette;

export const nativeTheme = {
  colors: {
    light: tokens.color.light as NativeColorPalette,
    dark: tokens.color.dark as unknown as NativeColorPalette,
  },
  /** Border-radius in dp. Memphis uses 0 (hard geometric corners). */
  radius: remToDp(tokens.radius),
  /** Base spacing unit in dp (4 dp). */
  spacing: remToDp(tokens.spacing),
  /** Registered Inter font family names — load with useDesignSystemFonts(). */
  fontFamily: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
} as const;

export type NativeTheme = typeof nativeTheme;
