import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { AppRouter } from './router';
import { useAuthBootstrap } from './hooks/useAuth';
import { CookieBanner } from './components/common/CookieBanner';
import * as Sentry from '@sentry/react';
import './index.css';

// ─── Sentry GDPR-Compliant Initialization ─────────────────────────────────────
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    // Performance Monitoring & Session Replay
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Blindaggio GDPR: Disabilita PII predefinite e indirizzi IP
    sendDefaultPii: false,
    
    beforeSend(event: any) {
      // 1. Mascheramento esplicito dell'IP nei parametri di rete
      if (event.request && event.request.headers) {
        delete event.request.headers['X-Forwarded-For'];
        delete event.request.headers['x-forwarded-for'];
      }

      // 2. Scrubbing delle Email del payload
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      
      // 3. Scrubbing di Token sensibili o credenziali (es. pass, token, jwt, secrets)
      const tokenRegex = /(token|password|auth|jwt|secret)=([^&\s]+)/gi;

      let eventString = JSON.stringify(event);
      
      if (emailRegex.test(eventString)) {
        eventString = eventString.replace(emailRegex, '[REDACTED_EMAIL]');
      }
      if (tokenRegex.test(eventString)) {
        eventString = eventString.replace(tokenRegex, '$1=[REDACTED]');
      }

      return JSON.parse(eventString);
    }
  });
}

function FallbackComponent() {
  return (
    <div className="min-h-screen bg-[#0F0A1E] flex flex-col items-center justify-center p-4 font-sans text-[#f8fafc]">
      <div className="max-w-md w-full text-center glass-strong p-8 rounded-3xl border border-coral-500/20 shadow-2xl relative overflow-hidden">
        {/* Glow decorative effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-coral-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="w-16 h-16 bg-coral-500/10 border border-coral-500/20 text-coral-400 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg animate-fade-in-up">
          <svg className="w-8 h-8 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        
        <h1 className="text-2xl font-bold font-display text-white mb-2 tracking-tight">Si è verificato un errore</h1>
        <p className="text-slate-400 text-sm mb-6 leading-relaxed max-w-sm mx-auto">
          Si è verificato un errore inaspettato. La segreteria è già stata avvisata.
        </p>
        
        <button
          onClick={() => window.location.reload()}
          className="w-full py-3 px-5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-brand-600/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
        >
          Ricarica la pagina
        </button>
      </div>
    </div>
  );
}

function AppBootstrap() {
  useAuthBootstrap();
  return <AppRouter />;
}

const root = document.getElementById('root');
if (!root) throw new Error('[DanceFlow] Root element #root not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<FallbackComponent />}>
      <AppBootstrap />
      <CookieBanner />
      <Toaster
        position='top-right'
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1A1030',
            color: '#f8fafc',
            border: '1px solid rgba(124, 58, 237, 0.3)',
            borderRadius: '12px',
            fontFamily: "'Inter', sans-serif",
            fontSize: '14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          },
          success: {
            iconTheme: { primary: '#2dd4bf', secondary: '#0F0A1E' },
          },
          error: {
            iconTheme: { primary: '#fb7185', secondary: '#0F0A1E' },
          },
        }}
      />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
