import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
}

function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false;
  const msg = error.message || '';
  return (
    msg.includes('dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('Failed to fetch') ||
    error.name === 'ChunkLoadError'
  );
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, isChunkError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const isChunk = isChunkLoadError(error);
    return { hasError: true, error, isChunkError: isChunk };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[DanceFlow ErrorBoundary]', error, info);

    // Auto-recovery for stale chunks post-deployment
    if (isChunkLoadError(error)) {
      const lastReload = sessionStorage.getItem('danceflow_chunk_reload');
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
        sessionStorage.setItem('danceflow_chunk_reload', now.toString());
        console.warn('[ErrorBoundary] Detected stale chunk after deploy. Triggering auto-reload...');
        window.location.reload();
      }
    }
  }

  handleReset = () => {
    if (this.state.isChunkError) {
      window.location.reload();
    } else {
      this.setState({ hasError: false, error: null, isChunkError: false });
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const isChunk = this.state.isChunkError;

      return (
        <div className='flex flex-col items-center justify-center min-h-[400px] p-8 text-center'>
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${
              isChunk
                ? 'bg-brand-500/20 border border-brand-500/30'
                : 'bg-coral-500/20 border border-coral-500/30'
            }`}
          >
            {isChunk ? (
              <RefreshCw size={28} className='text-brand-400 animate-spin-slow' />
            ) : (
              <AlertTriangle size={28} className='text-coral-400' />
            )}
          </div>
          <h2 className='text-lg font-display font-bold text-white mb-2'>
            {isChunk ? 'Aggiornamento del gestionale disponibile' : 'Ops! Qualcosa è andato storto'}
          </h2>
          <p className='text-sm text-white/50 max-w-sm mb-6'>
            {isChunk
              ? 'È stata pubblicata una nuova versione di DanceFlow. Clicca qui sotto per caricare la versione aggiornata.'
              : (this.state.error?.message ?? 'Si è verificato un errore imprevisto. Riprova.')}
          </p>
          <Button
            onClick={this.handleReset}
            variant={isChunk ? 'primary' : 'secondary'}
            size='sm'
            icon={isChunk ? <RefreshCw size={14} /> : undefined}
          >
            {isChunk ? 'Aggiorna Ora' : 'Riprova'}
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
