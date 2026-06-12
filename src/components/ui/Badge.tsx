import { cn } from '@/lib/utils';

type BadgeVariant = 'brand' | 'gold' | 'coral' | 'teal' | 'gray' | 'success' | 'warning' | 'danger';
type BadgeSize    = 'sm' | 'md';

const variantClasses: Record<BadgeVariant, string> = {
  brand:   'bg-brand-500/20 text-brand-300 border border-brand-500/30',
  gold:    'bg-gold-500/20 text-gold-300 border border-gold-400/30',
  coral:   'bg-coral-500/20 text-coral-300 border border-coral-500/30',
  teal:    'bg-teal-500/20 text-teal-300 border border-teal-500/30',
  gray:    'bg-white/5 text-white/50 border border-white/10',
  success: 'bg-teal-500/20 text-teal-300 border border-teal-500/30',
  warning: 'bg-gold-500/20 text-gold-300 border border-gold-400/30',
  danger:  'bg-coral-500/20 text-coral-400 border border-coral-500/30',
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
            variant === 'success' || variant === 'teal' ? 'bg-teal-400' :
            variant === 'danger'  || variant === 'coral' ? 'bg-coral-400' :
            variant === 'warning' || variant === 'gold' ? 'bg-gold-400' :
            'bg-brand-400'
          )}
          aria-hidden='true'
        />
      )}
      {children}
    </span>
  );
}
