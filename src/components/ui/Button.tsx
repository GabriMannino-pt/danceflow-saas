import React from 'react';
import { cn } from '@/lib/utils';

// ─── Variants ─────────────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
type ButtonSize    = 'xs' | 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary:   'btn-primary-gradient text-white font-semibold',
  secondary: 'glass text-white/80 hover:text-white hover:bg-white/10 border border-white/10',
  ghost:     'text-white/60 hover:text-white hover:bg-white/5',
  danger:    'bg-coral-600/20 text-coral-400 border border-coral-500/30 hover:bg-coral-600/30',
  success:   'bg-teal-500/20 text-teal-400 border border-teal-500/30 hover:bg-teal-500/30',
  outline:   'border border-brand-500/50 text-brand-300 hover:bg-brand-500/10',
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'px-2.5 py-1 text-xs rounded-lg gap-1.5',
  sm: 'px-3.5 py-1.5 text-sm rounded-xl gap-2',
  md: 'px-5 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-6 py-3 text-base rounded-2xl gap-2.5',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  fullWidth,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-200',
        'focus-visible:outline-2 focus-visible:outline-brand-400 focus-visible:outline-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled ?? loading}
      aria-disabled={disabled ?? loading}
      {...props}
    >
      {loading ? (
        <span className='w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin' aria-hidden='true' />
      ) : icon ? (
        <span className='flex-shrink-0' aria-hidden='true'>{icon}</span>
      ) : null}
      {children && <span>{children}</span>}
      {iconRight && !loading && (
        <span className='flex-shrink-0' aria-hidden='true'>{iconRight}</span>
      )}
    </button>
  );
}
