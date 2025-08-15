import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Visual variant of the badge. Default is neutral, secondary has a colored background.
   */
  variant?: 'default' | 'secondary';
}

/**
 * A small badge for labeling or highlighting. Wraps children in a styled div.
 */
export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variantClasses = {
    default: 'bg-gray-100 text-gray-800',
    secondary: 'bg-blue-100 text-blue-800',
  }[variant] as string;

  return (
    <div
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium',
        variantClasses,
        className,
      )}
      {...props}
    />
  );
}