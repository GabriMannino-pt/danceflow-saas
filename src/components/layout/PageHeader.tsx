import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  back?: boolean;
  backTo?: string;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  back,
  backTo,
  actions,
  badge,
  className,
}: PageHeaderProps) {
  const navigate = useNavigate();

  function handleBack() {
    if (backTo) navigate(backTo);
    else navigate(-1);
  }

  return (
    <header
      className={cn(
        'flex items-center justify-between gap-4 mb-6 animate-fade-in-up',
        className
      )}
    >
      <div className='flex items-center gap-3 min-w-0'>
        {back && (
          <button
            onClick={handleBack}
            className='flex items-center justify-center w-9 h-9 rounded-xl glass hover:bg-white/10 transition-all duration-200 flex-shrink-0'
            aria-label='Torna indietro'
          >
            <ChevronLeft size={20} className='text-white/70' />
          </button>
        )}
        <div className='min-w-0'>
          <div className='flex items-center gap-2'>
            <h1 className='text-xl md:text-2xl font-display font-bold text-white truncate'>
              {title}
            </h1>
            {badge}
          </div>
          {subtitle && (
            <p className='text-sm text-white/50 mt-0.5 truncate'>{subtitle}</p>
          )}
        </div>
      </div>

      {actions && (
        <div className='flex items-center gap-2 flex-shrink-0'>{actions}</div>
      )}
    </header>
  );
}
