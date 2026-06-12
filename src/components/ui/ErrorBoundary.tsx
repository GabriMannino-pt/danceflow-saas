import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[DanceFlow ErrorBoundary]', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className='flex flex-col items-center justify-center min-h-[400px] p-8 text-center'>
          <div className='w-16 h-16 rounded-2xl bg-coral-500/20 border border-coral-500/30 flex items-center justify-center mb-4'>
            <AlertTriangle size={28} className='text-coral-400' />
          </div>
          <h2 className='text-lg font-display font-bold text-white mb-2'>
            Ops! Qualcosa è andato storto
          </h2>
          <p className='text-sm text-white/50 max-w-sm mb-6'>
            {this.state.error?.message ?? 'Si è verificato un errore imprevisto. Riprova.'}
          </p>
          <Button onClick={this.handleReset} variant='secondary' size='sm'>
            Riprova
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
