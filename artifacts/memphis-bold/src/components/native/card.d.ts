/**
 * Memphis Bold — native Card component (TypeScript declarations only).
 * Runtime implementation: native/components/card.tsx (compiled by Metro).
 * Note: StyleProp is approximated as object to avoid importing react-native
 * in the web-side declaration file; consuming Expo screens use the real types.
 */
import type React from 'react';

export interface CardProps {
  children: React.ReactNode;
  style?: object;
}

export interface CardTitleProps {
  children: React.ReactNode;
  style?: object;
}

export declare function Card(props: CardProps): React.JSX.Element;
export declare function CardHeader(props: CardProps): React.JSX.Element;
export declare function CardContent(props: CardProps): React.JSX.Element;
export declare function CardFooter(props: CardProps): React.JSX.Element;
export declare function CardTitle(props: CardTitleProps): React.JSX.Element;
