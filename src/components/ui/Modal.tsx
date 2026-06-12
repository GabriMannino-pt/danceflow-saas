import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
}

const sizeClasses = {
  sm:   'max-w-sm',
  md:   'max-w-md',
  lg:   'max-w-lg',
  xl:   'max-w-2xl',
  full: 'max-w-4xl',
};

export function Modal({ isOpen, onClose, title, description, children, size = 'md', className }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className='fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4'
      role='dialog'
      aria-modal='true'
      aria-labelledby={title ? 'modal-title' : undefined}
      aria-describedby={description ? 'modal-desc' : undefined}
    >
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className='absolute inset-0 bg-black/70 backdrop-blur-sm'
        onClick={onClose}
        aria-hidden='true'
      />

      {/* Panel */}
      <div
        className={cn(
          'relative w-full glass-strong rounded-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden',
          'animate-fade-in-up',
          sizeClasses[size],
          className
        )}
        style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.2)' }}
      >
        {/* Header */}
        {(title ?? description) && (
          <div className='flex items-start justify-between gap-4 p-5 border-b border-white/8'>
            <div>
              {title && (
                <h2 id='modal-title' className='text-lg font-display font-bold text-white'>
                  {title}
                </h2>
              )}
              {description && (
                <p id='modal-desc' className='text-sm text-white/50 mt-0.5'>{description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className='w-8 h-8 flex items-center justify-center rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-all duration-200 flex-shrink-0'
              aria-label='Chiudi modal'
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Content */}
        <div className='p-5 overflow-y-auto flex-1'>{children}</div>
      </div>
    </div>
  );
}

// ─── Modal Footer ──────────────────────────────────────────────────────────────
export function ModalFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-end gap-3 pt-4 border-t border-white/8', className)}>
      {children}
    </div>
  );
}
