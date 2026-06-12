import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon, iconRight, fullWidth, className, id, ...props }, ref) => {
    const inputId = id ?? `input-${Math.random().toString(36).slice(2, 7)}`;

    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && (
          <label htmlFor={inputId} className='text-sm font-medium text-white/70'>
            {label}
            {props.required && <span className='text-coral-400 ml-1' aria-hidden='true'>*</span>}
          </label>
        )}

        <div className='relative'>
          {icon && (
            <span className='absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none' aria-hidden='true'>
              {icon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full glass rounded-xl px-4 py-2.5 text-sm text-white',
              'placeholder:text-white/30 transition-all duration-200',
              'border border-white/10 focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              icon && 'pl-10',
              iconRight && 'pr-10',
              error && 'border-coral-500/60 focus:border-coral-500 focus:ring-coral-500/30',
              className
            )}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            {...props}
          />

          {iconRight && (
            <span className='absolute right-3 top-1/2 -translate-y-1/2 text-white/40' aria-hidden='true'>
              {iconRight}
            </span>
          )}
        </div>

        {error && (
          <p id={`${inputId}-error`} role='alert' className='text-xs text-coral-400 flex items-center gap-1'>
            <span aria-hidden='true'>⚠</span> {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className='text-xs text-white/40'>{hint}</p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

// ─── Textarea ─────────────────────────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  fullWidth?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, fullWidth, className, id, ...props }, ref) => {
    const inputId = id ?? `textarea-${Math.random().toString(36).slice(2, 7)}`;

    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && (
          <label htmlFor={inputId} className='text-sm font-medium text-white/70'>
            {label}
            {props.required && <span className='text-coral-400 ml-1' aria-hidden='true'>*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={cn(
            'w-full glass rounded-xl px-4 py-2.5 text-sm text-white resize-y min-h-[100px]',
            'placeholder:text-white/30 transition-all duration-200',
            'border border-white/10 focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error && 'border-coral-500/60 focus:border-coral-500 focus:ring-coral-500/30',
            className
          )}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} role='alert' className='text-xs text-coral-400'>⚠ {error}</p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className='text-xs text-white/40'>{hint}</p>
        )}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

// ─── Select ───────────────────────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  fullWidth?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, fullWidth, className, id, ...props }, ref) => {
    const inputId = id ?? `select-${Math.random().toString(36).slice(2, 7)}`;

    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && (
          <label htmlFor={inputId} className='text-sm font-medium text-white/70'>
            {label}
            {props.required && <span className='text-coral-400 ml-1' aria-hidden='true'>*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          className={cn(
            'w-full glass rounded-xl px-4 py-2.5 text-sm text-white',
            'border border-white/10 focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40',
            'bg-surface-800 transition-all duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error && 'border-coral-500/60',
            className
          )}
          aria-invalid={error ? 'true' : undefined}
          {...props}
        >
          {placeholder && <option value=''>{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className='bg-surface-800'>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <p role='alert' className='text-xs text-coral-400'>⚠ {error}</p>
        )}
      </div>
    );
  }
);
Select.displayName = 'Select';
