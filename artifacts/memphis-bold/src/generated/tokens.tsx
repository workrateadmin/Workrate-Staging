/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#FFF6E9",
      "foreground": "#000000",
      "border": "#000000",
      "card": "#FFFFFF",
      "cardForeground": "#000000",
      "popover": "#FFFFFF",
      "popoverForeground": "#000000",
      "primary": "#FF4D8D",
      "primaryForeground": "#FFFFFF",
      "secondary": "#2EC4B6",
      "secondaryForeground": "#000000",
      "muted": "#F5EBD8",
      "mutedForeground": "#7A6A55",
      "accent": "#FFC700",
      "accentForeground": "#000000",
      "destructive": "#FF2D55",
      "destructiveForeground": "#FFFFFF",
      "input": "#000000",
      "ring": "#FF4D8D",
      "chart1": "#FF4D8D",
      "chart2": "#2EC4B6",
      "chart3": "#FFC700",
      "chart4": "#3A36E0",
      "chart5": "#FF6B35",
      "sidebar": "#1A1208",
      "sidebarForeground": "#FFF6E9",
      "sidebarBorder": "#000000",
      "sidebarPrimary": "#FF4D8D",
      "sidebarPrimaryForeground": "#FFFFFF",
      "sidebarAccent": "#2EC4B6",
      "sidebarAccentForeground": "#000000",
      "sidebarRing": "#FFC700"
    },
    "dark": {
      "background": "#1A0F05",
      "foreground": "#FFF6E9",
      "border": "#000000",
      "card": "#2A1A08",
      "cardForeground": "#FFF6E9",
      "popover": "#2A1A08",
      "popoverForeground": "#FFF6E9",
      "primary": "#FF4D8D",
      "primaryForeground": "#FFFFFF",
      "secondary": "#2EC4B6",
      "secondaryForeground": "#000000",
      "muted": "#2A1A0A",
      "mutedForeground": "#A08060",
      "accent": "#FFC700",
      "accentForeground": "#000000",
      "destructive": "#FF2D55",
      "destructiveForeground": "#FFFFFF",
      "input": "#3A2A10",
      "ring": "#FF4D8D",
      "chart1": "#FF4D8D",
      "chart2": "#2EC4B6",
      "chart3": "#FFC700",
      "chart4": "#3A36E0",
      "chart5": "#FF6B35",
      "sidebar": "#0F0805",
      "sidebarForeground": "#FFF6E9",
      "sidebarBorder": "#2A1A08",
      "sidebarPrimary": "#FF4D8D",
      "sidebarPrimaryForeground": "#FFFFFF",
      "sidebarAccent": "#2EC4B6",
      "sidebarAccentForeground": "#000000",
      "sidebarRing": "#FFC700"
    }
  },
  "fontFamily": {
    "sans": [
      "Space Grotesk",
      "sans-serif"
    ],
    "serif": [
      "Archivo Black",
      "sans-serif"
    ],
    "mono": [
      "JetBrains Mono",
      "monospace"
    ]
  },
  "radius": "0rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
