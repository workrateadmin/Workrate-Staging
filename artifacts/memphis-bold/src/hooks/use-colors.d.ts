/**
 * Memphis Bold — native colour hook (TypeScript declarations only).
 * Runtime implementation: use-colors.tsx (compiled by Metro, not by tsc).
 */
export interface Colors {
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
  /** Border-radius in dp */
  radius: number;
  /** Base spacing unit in dp */
  spacing: number;
}

export declare function useColors(): Colors;
