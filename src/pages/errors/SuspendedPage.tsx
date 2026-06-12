import { useSchoolStore } from '@/stores/schoolStore';
import { logout } from '@/hooks/useAuth';
import { Button, Card } from '@/components/ui';
import { Lock, LogOut, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SuspendedPage() {
  const activeSchool = useSchoolStore((s) => s.activeSchool);

  async function handleLogout() {
    try {
      await logout();
      toast.success('Disconnesso con successo.');
    } catch (err) {
      console.error(err);
      toast.error('Errore durante la disconnessione.');
    }
  }

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4 relative overflow-hidden font-sans text-white">
      {/* Background grids and glows */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(239, 68, 68, 0.4) 1px, transparent 1px),
              linear-gradient(90deg, rgba(239, 68, 68, 0.4) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-coral-500/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-md w-full">
        <Card className="p-8 text-center glass border border-coral-500/30 bg-coral-950/10 rounded-3xl space-y-6 shadow-2xl shadow-coral-950/20">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-coral-500/20 text-coral-400 flex items-center justify-center shadow-lg shadow-coral-950/30">
            <ShieldAlert size={32} className="animate-pulse" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold font-display text-coral-300">
              Accesso Sospeso
            </h1>
            <p className="text-xs text-white/40 uppercase tracking-widest font-semibold">
              Blocco Amministrativo Tenant
            </p>
          </div>

          <p className="text-sm text-white/70 leading-relaxed">
            Spettabile Cliente, l'accesso a questa piattaforma DanceFlow per la scuola{' '}
            <strong className="text-white font-semibold">{activeSchool?.name || 'associata'}</strong> è stato temporaneamente sospeso per motivi amministrativi o mancato rinnovo del servizio.
          </p>

          <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl text-left text-xs text-white/50 leading-relaxed">
            <p className="font-semibold text-white/70 mb-1 flex items-center gap-1.5">
              <Lock size={12} className="text-coral-400" /> Cosa puoi fare?
            </p>
            Se sei l'amministratore scolastico, ti invitiamo a contattare il supporto clienti all'indirizzo{' '}
            <a href="mailto:support@danceflow.it" className="text-brand-300 hover:underline">
              support@danceflow.it
            </a>{' '}
            per verificare la tua posizione amministrativa e riattivare il servizio.
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleLogout}
              variant="outline"
              icon={<LogOut size={14} />}
              className="w-full border-white/10 hover:bg-white/5 text-white/80"
            >
              Disconnetti Account
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
