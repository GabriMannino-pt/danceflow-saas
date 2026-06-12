import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

const paddingClasses = {
  none: '',
  sm:   'p-3',
  md:   'p-4 md:p-5',
  lg:   'p-5 md:p-6',
};

export function Card({ children, className, hover, padding = 'md', onClick }: CardProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'glass rounded-2xl',
        paddingClasses[padding],
        hover && 'card-hover cursor-pointer',
        onClick && 'w-full text-left focus-visible:outline-2 focus-visible:outline-brand-400',
        className
      )}
    >
      {children}
    </Tag>
  );
}

// ─── Card sub-components ──────────────────────────────────────────────────────
export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mb-4', className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn('text-base font-display font-semibold text-white', className)}>
      {children}
    </h2>
  );
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('text-white/70', className)}>{children}</div>;
}
