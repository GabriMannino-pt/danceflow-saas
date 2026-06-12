import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Button, Card, Badge } from '@/components/ui';
import {
  Check,
  ArrowRight,
  Shield,
  MessageSquare,
  Sparkles,
  Zap
} from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [isYearly, setIsYearly] = useState(true);

  // Pricing Data
  const plans = [
    {
      name: 'Free',
      description: 'Per iniziare senza pensieri',
      priceMonthly: 0,
      priceYearly: 0,
      features: [
        'Max 20 Allievi',
        'Solo funzioni core, senza automazioni'
      ],
      cta: 'Inizia Gratis',
      popular: false,
      variant: 'gray' as const
    },
    {
      name: 'Light',
      description: 'Per scuole in crescita',
      priceMonthly: 19,
      priceYearly: 15,
      features: [
        'Max 80 Allievi',
        'Firma FES + Portale Genitori'
      ],
      cta: 'Scegli Light',
      popular: false,
      variant: 'brand' as const
    },
    {
      name: 'Growth',
      description: 'L\'esperienza automatizzata',
      priceMonthly: 49,
      priceYearly: 39,
      features: [
        'Max 200 Allievi',
        '+ Hub WhatsApp + Automazioni scadenze'
      ],
      cta: 'Scegli Growth',
      popular: true,
      variant: 'teal' as const
    },
    {
      name: 'Unlimited',
      description: 'Nessun limite al tuo successo',
      priceMonthly: 84,
      priceYearly: 69,
      features: [
        'Allievi Illimitati',
        '+ Multi-sede + AI Chatbot'
      ],
      cta: 'Scegli Unlimited',
      popular: false,
      variant: 'gold' as const
    }
  ];

  return (
    <div className="min-h-screen bg-surface-950 text-white font-sans selection:bg-brand-500/30 selection:text-brand-300">
      {/* Background patterns */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(124, 58, 237, 0.4) 1px, transparent 1px),
              linear-gradient(90deg, rgba(124, 58, 237, 0.4) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brand-600/10 blur-[130px] rounded-full" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-teal-600/5 blur-[150px] rounded-full" />
      </div>

      {/* NAVBAR */}
      <header className="sticky top-0 z-50 glass border-b border-white/5 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl btn-primary-gradient flex items-center justify-center font-bold text-md shadow-lg shadow-brand-500/20">
              💃
            </div>
            <span className="font-display font-bold text-lg tracking-tight gradient-text">DanceFlow</span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-white/70">
            <a href="#features" className="hover:text-white transition-colors">Funzionalità</a>
            <a href="#pricing" className="hover:text-white transition-colors">Prezzi</a>
          </nav>

          <div className="flex items-center gap-4">
            {user ? (
              <Button
                onClick={() => navigate('/dashboard')}
                className="shadow-lg shadow-brand-500/10 text-xs font-semibold"
                variant="primary"
                icon={<Sparkles size={14} />}
              >
                Console
              </Button>
            ) : (
              <Button
                onClick={() => navigate('/login')}
                variant="secondary"
                className="text-xs font-semibold"
              >
                Accedi
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative z-10 max-w-5xl mx-auto px-4 pt-20 pb-24 text-center space-y-8">
        <Badge variant="brand" size="md" className="mx-auto" dot>
          Piattaforma Gestionale Dance SaaS
        </Badge>

        <h1 className="text-4xl sm:text-6xl font-display font-extrabold tracking-tight leading-[1.1] text-white">
          Il primo gestionale per scuole di danza <br />
          <span className="gradient-text">automatizzato al 100%</span>
        </h1>

        <p className="max-w-2xl mx-auto text-base sm:text-lg text-white/60 leading-relaxed font-body">
          Gestisci iscrizioni con firma digitale FES, monitora i certificati medici in tempo reale ed invia avvisi automatici su WhatsApp. Tutto in un'unica piattaforma sicura e conforme al GDPR.
        </p>

        <div className="flex justify-center gap-4 pt-4">
          <Button
            onClick={() => navigate(user ? '/dashboard' : '/register')}
            className="px-8 py-3 text-sm font-semibold shadow-xl shadow-brand-500/20"
            variant="primary"
            icon={<ArrowRight size={16} />}
          >
            Inizia Gratis
          </Button>
          <a href="#pricing">
            <Button
              variant="secondary"
              className="px-8 py-3 text-sm font-semibold text-white"
            >
              Vedi Prezzi
            </Button>
          </a>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 border-t border-white/5">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <Badge variant="teal" size="sm" className="mx-auto">Perché scegliere DanceFlow</Badge>
          <h2 className="text-3xl font-display font-bold">Rivoluziona la gestione della tua scuola</h2>
          <p className="text-sm text-white/50">Elimina le scartoffie ed i solleciti manuali con la nostra tecnologia intelligente.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="p-6 border border-white/8 bg-white/[0.01] hover:border-brand-500/20 transition-all duration-300 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-brand-500/15 text-brand-300 flex items-center justify-center">
              <Shield size={20} />
            </div>
            <h3 className="text-md font-bold text-white">Firma Digitale FES & GDPR</h3>
            <p className="text-xs text-white/50 leading-relaxed">
              Consenti l'iscrizione online ai genitori con firma touch-first. DanceFlow raccoglie automaticamente metadati forensi (IP, sessione, timestamp) e genera un hash crittografico a tutela legale del tuo business.
            </p>
          </Card>

          <Card className="p-6 border border-white/8 bg-white/[0.01] hover:border-teal-500/20 transition-all duration-300 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-teal-500/15 text-teal-300 flex items-center justify-center">
              <Zap size={20} />
            </div>
            <h3 className="text-md font-bold text-white">Scadenze Automatiche</h3>
            <p className="text-xs text-white/50 leading-relaxed">
              Il nostro engine esegue scansioni notturne automatiche. Se un certificato medico scade, disabilita il flag di accesso e avvisa allievo, genitori e segreteria sollevandoti da ogni responsabilità assicurativa.
            </p>
          </Card>

          <Card className="p-6 border border-white/8 bg-white/[0.01] hover:border-gold-500/20 transition-all duration-300 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-gold-500/15 text-gold-300 flex items-center justify-center">
              <MessageSquare size={20} />
            </div>
            <h3 className="text-md font-bold text-white">WhatsApp Hub & Notifiche</h3>
            <p className="text-xs text-white/50 leading-relaxed">
              Invia messaggi automatici su WhatsApp per i certificati in scadenza a -30 giorni, rette insolute o comunicazioni importanti, garantendo la massima efficacia di ricezione rispetto alle classiche email.
            </p>
          </Card>
        </div>
      </section>

      {/* PRICING SECTION */}
      <section id="pricing" className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 border-t border-white/5">
        <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
          <Badge variant="gold" size="sm" className="mx-auto">Listino Prezzi</Badge>
          <h2 className="text-3xl font-display font-bold">Un piano per ogni dimensione</h2>
          <p className="text-sm text-white/50">Nessun costo nascosto. Scegli la flessibilità mensile o risparmia con la fatturazione annuale.</p>

          {/* Pricing Toggle Switch */}
          <div className="flex items-center justify-center gap-3 pt-6">
            <span className={`text-xs font-semibold transition-colors ${!isYearly ? 'text-white' : 'text-white/40'}`}>Fatturazione Mensile</span>
            <button
              onClick={() => setIsYearly(!isYearly)}
              className="relative inline-flex h-6 w-11 items-center rounded-full bg-brand-600/30 border border-brand-500/50 cursor-pointer outline-none transition-colors"
              aria-label="Toggle billing interval"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-brand-300 transition-transform duration-200 ${
                  isYearly ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-xs font-semibold transition-colors flex items-center gap-1.5 ${isYearly ? 'text-brand-300' : 'text-white/40'}`}>
              Fatturazione Annuale
              <Badge variant="teal" size="sm" className="px-1.5 py-0">Risparmia il 20%</Badge>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-stretch">
          {plans.map((plan) => {
            const price = isYearly ? plan.priceYearly : plan.priceMonthly;

            return (
              <Card
                key={plan.name}
                className={`p-6 border relative flex flex-col justify-between transition-all duration-300 ${
                  plan.popular
                    ? 'border-brand-500/40 bg-brand-950/10 shadow-lg shadow-brand-950/50 scale-[1.03] md:z-10'
                    : 'border-white/8 bg-white/[0.01] hover:border-white/15'
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-600 text-white text-[9px] uppercase tracking-wider font-extrabold px-3 py-1 rounded-full border border-brand-400">
                    Più Popolare 🔥
                  </span>
                )}

                <div className="space-y-5">
                  <div>
                    <h3 className="text-lg font-bold font-display">{plan.name}</h3>
                    <p className="text-[11px] text-white/50 mt-1 min-h-[32px]">{plan.description}</p>
                  </div>

                  <div className="flex items-baseline gap-1 text-white">
                    <span className="text-3xl font-extrabold font-display">€{price}</span>
                    <span className="text-xs text-white/40">/mese</span>
                  </div>

                  <ul className="space-y-3 pt-2 text-left">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-white/70">
                        <Check className="text-teal-400 flex-shrink-0 mt-0.5" size={14} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-6">
                  <Button
                    onClick={() => navigate(user ? '/dashboard' : '/register')}
                    className={`w-full py-2.5 text-xs font-semibold flex justify-center items-center gap-1 ${
                      plan.popular ? 'shadow-lg shadow-brand-500/20' : ''
                    }`}
                    variant={plan.popular ? 'primary' : 'secondary'}
                    icon={<ArrowRight size={12} />}
                  >
                    {plan.cta}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-white/5 bg-surface-950/50 py-12 text-center text-xs text-white/30">
        <div className="max-w-7xl mx-auto px-4 space-y-4">
          <div className="flex items-center justify-center gap-2">
            <div className="w-6 h-6 rounded-lg btn-primary-gradient flex items-center justify-center font-bold text-xs">
              💃
            </div>
            <span className="font-display font-semibold text-white/80">DanceFlow SaaS</span>
          </div>
          <p>© {new Date().getFullYear()} DanceFlow. Tutti i diritti riservati. P.IVA 01234567890</p>
          <div className="flex justify-center gap-6">
            <a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="/terms" className="hover:text-white transition-colors">Termini di Servizio</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
