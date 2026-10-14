import { cn } from '@/lib/utils';

type BadgeVariant = 'brand' | 'gold' | 'coral' | 'teal' | 'gray' | 'success' | 'warning' | 'danger';
type BadgeSize    = 'sm' | 'md';

const variantClasses: Record<BadgeVariant, string> = {
  brand:   'bg-brand-500/10 text-brand-400 border border-brand-500/30',
  gold:    'bg-amber-500/10 text-amber-400 border border-amber-500/30',
  coral:   'bg-red-500/10 text-red-400 border border-red-500/30',
  teal:    'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
  gray:    'bg-white/5 text-white/60 border border-white/10',
  success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
  warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
  danger:  'bg-red-500/10 text-red-400 border border-red-500/30',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-xs',
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  className?: string;
}

export function Badge({ children, variant = 'brand', size = 'md', dot, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium font-body',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            variant === 'success' || variant === 'teal' ? 'bg-emerald-400' :
            variant === 'danger'  || variant === 'coral' ? 'bg-red-400' :
            variant === 'warning' || variant === 'gold' ? 'bg-amber-400' :
            'bg-brand-400'
          )}
          aria-hidden='true'
        />
      )}
      {children}
    </span>
  );
}
