import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Current value of the progress. Defaults to 0.
   */
  value?: number;
  /**
   * Maximum value for the progress bar. Defaults to 100.
   */
  max?: number;
}

/**
 * Simple progress bar component. Renders a container with a filled bar based on the value/max ratio.
 */
export function Progress({ value = 0, max = 100, className, ...props }: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cn('h-2 w-full rounded bg-gray-200', className)} {...props}>
      <div className="h-2 rounded bg-blue-500" style={{ width: `${percentage}%` }} />
    </div>
  );
}