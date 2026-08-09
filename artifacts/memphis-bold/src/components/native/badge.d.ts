/**
 * Memphis Bold — native Badge component (TypeScript declarations only).
 * Runtime implementation: badge.tsx (compiled by Metro, not by tsc).
 */
import type React from 'react';

export interface BadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export declare function Badge(props: BadgeProps): React.JSX.Element;
