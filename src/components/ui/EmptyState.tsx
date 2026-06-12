import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  className?: string;
}

export function EmptyState({ icon = '📭', title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-16 px-6',
        className
      )}
    >
      <div className='w-20 h-20 rounded-3xl glass flex items-center justify-center mb-5 text-4xl'>
        {icon}
      </div>
      <h3 className='text-lg font-display font-semibold text-white mb-2'>{title}</h3>
      {description && (
        <p className='text-sm text-white/50 max-w-sm mb-6'>{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} icon={action.icon} size='sm'>
          {action.label}
        </Button>
      )}
    </div>
  );
}
