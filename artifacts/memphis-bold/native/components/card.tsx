/**
 * Memphis Bold — native Card component.
 * Lives in native/ — excluded from the web build, resolved by Metro.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ViewStyle, StyleProp, TextStyle } from 'react-native';
import { useColors } from '../hooks/use-colors';

export interface CardProps { children: React.ReactNode; style?: StyleProp<ViewStyle>; }
export interface CardTitleProps { children: React.ReactNode; style?: StyleProp<TextStyle>; }

export function Card({ children, style }: CardProps) {
  const colors = useColors();
  return (
    <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }, style]}>
      {children}
    </View>
  );
}

export function CardHeader({ children, style }: CardProps) { return <View style={[st.header, style]}>{children}</View>; }
export function CardContent({ children, style }: CardProps) { return <View style={[st.content, style]}>{children}</View>; }
export function CardFooter({ children, style }: CardProps) { return <View style={[st.footer, style]}>{children}</View>; }

export function CardTitle({ children, style }: CardTitleProps) {
  const colors = useColors();
  return <Text style={[st.title, { color: colors.cardForeground }, style]}>{children}</Text>;
}

const st = StyleSheet.create({
  card:    { borderWidth: 1, overflow: 'hidden' as const },
  header:  { padding: 16, paddingBottom: 8 },
  content: { padding: 16, paddingTop: 8 },
  footer:  { padding: 16, paddingTop: 0 },
  title:   { fontSize: 16, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
});
