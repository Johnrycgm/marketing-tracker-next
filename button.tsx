import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Visual variant of the button. `default` is filled, `outline` has a border, and `ghost` is plain.
   */
  variant?: 'default' | 'outline' | 'ghost';
  /**
   * Size of the button. Adjusts padding and font size.
   */
  size?: 'default' | 'sm' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', type = 'button', ...props }, ref) => {
    const variantClasses = {
      default: 'bg-blue-600 text-white hover:bg-blue-700',
      outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50',
      ghost: 'bg-transparent text-blue-600 hover:bg-blue-50',
    }[variant] as string;

    const sizeClasses = {
      default: 'px-4 py-2 text-sm',
      sm: 'px-3 py-1.5 text-xs',
      lg: 'px-5 py-3 text-base',
    }[size] as string;

    return (
      <button
        type={type}
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-offset-2',
          variantClasses,
          sizeClasses,
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';