import { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';

export function CookieBanner() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('danceflow-cookie-consent');
    if (!consent) {
      setIsOpen(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('danceflow-cookie-consent', 'accepted');
    setIsOpen(false);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 left-4 md:left-auto md:max-w-md z-50 animate-fade-in-up">
      <div className="glass-strong p-5 rounded-2xl border border-brand-500/20 bg-surface-900/95 text-white shadow-2xl flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 flex-shrink-0 mt-0.5 animate-pulse-glow">
            <Shield size={20} />
          </div>
          <div className="space-y-1">
            <h4 className="font-semibold text-sm">Informativa sui Cookie</h4>
            <p className="text-xs text-white/60 leading-relaxed">
              Utilizziamo cookie tecnici ed essenziali per garantire il funzionamento sicuro del servizio, la gestione delle sessioni e l'integrazione dei pagamenti. Cliccando su "Accetta" acconsenti al loro utilizzo.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end text-xs font-semibold">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-white/70 transition-all cursor-pointer"
          >
            Chiudi
          </button>
          <button
            onClick={handleAccept}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white transition-all shadow-md shadow-brand-600/10 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            Accetta
          </button>
        </div>
      </div>
    </div>
  );
}
