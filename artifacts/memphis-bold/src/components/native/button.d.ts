/**
 * Memphis Bold — native Button component (TypeScript declarations only).
 * Runtime implementation: button.tsx (compiled by Metro, not by tsc).
 */
import type React from 'react';

export interface ButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
}

export declare function Button(props: ButtonProps): React.JSX.Element;
