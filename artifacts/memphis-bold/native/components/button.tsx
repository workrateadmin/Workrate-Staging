/**
 * Memphis Bold — native Button component.
 * Lives in native/ — excluded from the web build, resolved by Metro.
 */
import React from 'react';
import { TouchableOpacity, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useColors } from '../hooks/use-colors';

export interface ButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
}

export function Button({ children, onPress, variant = 'default', size = 'md', disabled = false, loading = false }: ButtonProps) {
  const colors = useColors();
  const heights: Record<string, number> = { sm: 36, md: 46, lg: 54 };
  const fontSizes: Record<string, number> = { sm: 13, md: 15, lg: 17 };

  const containerStyle = [
    st.base,
    { height: heights[size], borderRadius: colors.radius },
    variant === 'default' && { backgroundColor: colors.primary },
    variant === 'outline' && { backgroundColor: 'transparent' as const, borderWidth: 1.5, borderColor: colors.primary },
    variant === 'ghost' && { backgroundColor: 'transparent' as const },
    (disabled || loading) && st.disabled,
  ];

  const textColor = variant === 'default' ? colors.primaryForeground : colors.primary;

  return (
    <TouchableOpacity style={containerStyle} onPress={onPress} disabled={disabled || loading} activeOpacity={0.75}>
      {loading
        ? <ActivityIndicator color={textColor} />
        : <Text style={[st.label, { color: textColor, fontSize: fontSizes[size] }]}>{children}</Text>
      }
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  base:     { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  label:    { fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  disabled: { opacity: 0.45 },
});
