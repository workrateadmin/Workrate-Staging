/**
 * Ambient type declarations for Memphis Bold's native (React Native) modules.
 *
 * These stubs allow workrate-mobile's TypeScript compiler to type-check
 * imports from @workspace/memphis-bold native paths without needing to
 * compile the Memphis Bold source files directly (which depend on react-native
 * being resolvable from the Memphis Bold package directory — a constraint pnpm's
 * strict node_modules layout doesn't satisfy for cross-package peer deps).
 */

// ────────────────────────────────────────────────────────────────────────────
// Token-derived colour keys (from src/generated/tokens.tsx light palette)
// ────────────────────────────────────────────────────────────────────────────
interface MemphisPalette {
  background: string;
  foreground: string;
  border: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  input: string;
  ring: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarBorder: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarRing: string;
  // dp values added by useColors()
  radius: number;
  spacing: number;
}

// ────────────────────────────────────────────────────────────────────────────
// @workspace/memphis-bold/hooks/use-colors
// ────────────────────────────────────────────────────────────────────────────
declare module '@workspace/memphis-bold/hooks/use-colors' {
  export type Colors = MemphisPalette;
  export function useColors(): Colors;
}

// ────────────────────────────────────────────────────────────────────────────
// @workspace/memphis-bold/hooks/use-fonts
// ────────────────────────────────────────────────────────────────────────────
declare module '@workspace/memphis-bold/hooks/use-fonts' {
  export function useDesignSystemFonts(): {
    fontsLoaded: boolean;
    fontError: Error | null;
  };
  export const fontFamily: {
    readonly regular: 'Inter_400Regular';
    readonly medium: 'Inter_500Medium';
    readonly semibold: 'Inter_600SemiBold';
    readonly bold: 'Inter_700Bold';
  };
}

// ────────────────────────────────────────────────────────────────────────────
// @workspace/memphis-bold/components/native/badge
// ────────────────────────────────────────────────────────────────────────────
declare module '@workspace/memphis-bold/components/native/badge' {
  import type React from 'react';
  export interface BadgeProps {
    status: string;
    size?: 'sm' | 'md';
  }
  export function Badge(props: BadgeProps): React.JSX.Element;
}

// ────────────────────────────────────────────────────────────────────────────
// @workspace/memphis-bold/components/native/button
// ────────────────────────────────────────────────────────────────────────────
declare module '@workspace/memphis-bold/components/native/button' {
  import type React from 'react';
  export interface ButtonProps {
    children: React.ReactNode;
    onPress?: () => void;
    variant?: 'default' | 'outline' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    loading?: boolean;
  }
  export function Button(props: ButtonProps): React.JSX.Element;
}

// ────────────────────────────────────────────────────────────────────────────
// @workspace/memphis-bold/components/native/card
// ────────────────────────────────────────────────────────────────────────────
declare module '@workspace/memphis-bold/components/native/card' {
  import type React from 'react';
  import type { StyleProp, ViewStyle, TextStyle } from 'react-native';
  export interface CardProps {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
  }
  export interface CardTitleProps {
    children: React.ReactNode;
    style?: StyleProp<TextStyle>;
  }
  export function Card(props: CardProps): React.JSX.Element;
  export function CardHeader(props: CardProps): React.JSX.Element;
  export function CardContent(props: CardProps): React.JSX.Element;
  export function CardFooter(props: CardProps): React.JSX.Element;
  export function CardTitle(props: CardTitleProps): React.JSX.Element;
}

// ────────────────────────────────────────────────────────────────────────────
// @workspace/memphis-bold/lib/native-theme
// ────────────────────────────────────────────────────────────────────────────
declare module '@workspace/memphis-bold/lib/native-theme' {
  export type NativeColorPalette = MemphisPalette;
  export const nativeTheme: {
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
}
