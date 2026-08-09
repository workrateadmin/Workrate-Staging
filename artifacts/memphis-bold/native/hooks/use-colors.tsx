/**
 * Memphis Bold — native colour hook.
 * Lives in native/ so it is excluded from the web TypeScript build.
 * Metro resolves it at runtime for Expo apps via package.json exports.
 */
import { useColorScheme } from 'react-native';
import { nativeTheme } from '../lib/native-theme';

export function useColors() {
  const scheme = useColorScheme();
  const palette =
    scheme === 'dark' ? nativeTheme.colors.dark : nativeTheme.colors.light;
  return {
    ...palette,
    radius: nativeTheme.radius,
    spacing: nativeTheme.spacing,
  };
}

export type Colors = ReturnType<typeof useColors>;
