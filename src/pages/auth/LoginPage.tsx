import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Mail, Lock, Eye, EyeOff, LogIn, CheckCircle2, KeyRound } from 'lucide-react';
import { signInWithEmailAndPassword, updatePassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { loginWithEmail, loginWithGoogle, sendResetEmail } from '@/hooks/useAuth';
import { DEFAULT_PORTAL_INITIAL_PASSWORD } from '@/services/portalInviteService';
import { Button, Input, Card, Modal } from '@/components/ui';

const loginSchema = z.object({
  email:    z.string().email('Email non valida'),
  password: z.string().min(6, 'La password deve essere almeno 6 caratteri'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const paramEmail = searchParams.get('email') || '';
  const isFirstAccess = searchParams.get('firstAccess') === 'true' || searchParams.get('reset') === 'true';
  const paramInitPwd = searchParams.get('initPwd') || DEFAULT_PORTAL_INITIAL_PASSWORD;

  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState(paramEmail);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [useEmailFallback, setUseEmailFallback] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const resetLockRef = useRef(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: paramEmail,
      password: '',
    },
  });

  useEffect(() => {
    if (paramEmail) {
      setValue('email', paramEmail);
      setResetEmail(paramEmail);
    }
    if (isFirstAccess) {
      if (paramEmail) {
        setResetEmail(paramEmail);
      }
      setResetModalOpen(true);
    }
  }, [paramEmail, isFirstAccess, setValue]);

  const currentEmail = watch('email');

  function openResetModal() {
    setResetEmail(currentEmail || paramEmail || '');
    setResetSuccess(false);
    setResetError(null);
    setUseEmailFallback(false);
    setResetModalOpen(true);
  }

  async function handleDirectFirstAccessSetup(e: React.FormEvent) {
    e.preventDefault();
    if (resetLoading || resetLockRef.current) return;

    const cleanEmail = resetEmail.trim().toLowerCase();
    const cleanNewPwd = newPassword.trim();
    const cleanConfirmPwd = confirmPassword.trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setResetError('Inserisci un indirizzo email valido.');
      return;
    }
    if (cleanNewPwd.length < 6) {
      setResetError('La password deve contenere almeno 6 caratteri (senza soli spazi).');
      return;
    }
    if (cleanNewPwd !== cleanConfirmPwd) {
      setResetError('Le due password inserite non coincidono.');
      return;
    }

    resetLockRef.current = true;
    setResetLoading(true);
    setResetError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, paramInitPwd);
      await updatePassword(cred.user, cleanNewPwd);
      toast.success('Password impostata con successo! Accesso al portale in corso...');
      setResetModalOpen(false);
    } catch (err: unknown) {
      console.error('[LoginPage] Direct first access setup error:', err);
      const code = (err as { code?: string }).code;
      if (code === 'auth/network-request-failed') {
        setResetError('Connessione internet assente o instabile. Verifica la rete dello smartphone e riprova.');
      } else if (code === 'auth/too-many-requests') {
        setResetError('Troppi tentativi ravvicinati. Attendi qualche istante e riprova.');
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setResetError('Questo account ha già una password personalizzata. Inseriscila nella schermata di accesso oppure clicca sotto per riceverne il ripristino via email.');
      } else {
        setResetError('Non è stato possibile completare l\'attivazione diretta. Puoi richiedere il link via email cliccando qui sotto.');
      }
    } finally {
      resetLockRef.current = false;
      setResetLoading(false);
    }
  }

  async function handleSendReset(e: React.FormEvent) {
    e.preventDefault();
    if (resetLoading || resetLockRef.current) return;

    const cleanEmail = resetEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setResetError('Inserisci un indirizzo email valido');
      return;
    }
    resetLockRef.current = true;
    setResetLoading(true);
    setResetError(null);
    try {
      await sendResetEmail(cleanEmail);
      toast.success(`Email di attivazione inviata a ${cleanEmail}`);
      setResetSuccess(true);
    } catch (err: unknown) {
      console.error('[LoginPage] Reset error:', err);
      const code = (err as { code?: string }).code;
      if (code === 'auth/network-request-failed') {
        setResetError('Connessione internet assente o instabile. Verifica la rete e riprova.');
      } else if (code === 'auth/too-many-requests') {
        setResetError('Troppi invii ravvicinati. Attendi qualche minuto e riprova.');
      } else if (code === 'auth/user-not-found') {
        setResetError('Nessun account associato a questa email.');
      } else {
        setResetError('Impossibile inviare l\'email di ripristino. Riprova più tardi.');
      }
    } finally {
      resetLockRef.current = false;
      setResetLoading(false);
    }
  }

  async function onSubmit(data: LoginForm) {
    setAuthError(null);
    try {
      await loginWithEmail(data.email.trim().toLowerCase(), data.password);
    } catch (err: unknown) {
      console.error('[LoginPage] Login error:', err);
      const code = (err as { code?: string }).code;
      setAuthError(
        code === 'auth/network-request-failed'
          ? 'Connessione internet assente o instabile. Verifica la rete e riprova.'
          : code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential'
            ? 'Email o password errati. Riprova.'
            : 'Errore di accesso. Riprova più tardi.'
      );
    }
  }

  async function handleGoogle() {
    setAuthError(null);
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch {
      setAuthError('Accesso con Google non riuscito. Riprova.');
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className='min-h-screen flex items-center justify-center p-4 relative overflow-hidden'>
      {/* Background blobs */}
      <div className='absolute inset-0 bg-surface-950'>
        <div className='absolute top-1/4 left-1/4 w-96 h-96 bg-brand-600/20 rounded-full blur-[120px]' />
        <div className='absolute bottom-1/4 right-1/4 w-80 h-80 bg-coral-500/10 rounded-full blur-[100px]' />
      </div>
      {/* Grid overlay */}
      <div
        className='absolute inset-0 opacity-[0.03] pointer-events-none'
        style={{
          backgroundImage: `linear-gradient(rgba(124,58,237,0.5) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(124,58,237,0.5) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      <div className='relative w-full max-w-md animate-fade-in-up'>
        {/* Logo */}
        <div className='text-center mb-8'>
          <div className='mb-4 inline-flex items-center justify-center px-6 py-4 rounded-3xl bg-white shadow-2xl'>
            <img
              src='/tropical_logo.png'
              alt='Tropical Style Caribbean School'
              className='h-16 w-auto max-w-[240px] object-contain'
            />
          </div>
          <h1 className='text-2xl font-display font-bold text-white'>Tropical Style</h1>
          <p className='text-brand-400 text-xs mt-1 font-semibold uppercase tracking-wider'>Caribbean School · Portale Gestionale</p>
        </div>

        <Card>
          <h2 className='text-xl font-display font-bold text-white mb-6'>Accedi al tuo account</h2>

          {isFirstAccess && (
            <div className='mb-5 p-4 rounded-2xl bg-brand-500/10 border border-brand-500/30 text-white space-y-2'>
              <div className='flex items-center gap-2 text-brand-300 font-semibold text-sm'>
                <span>✨</span>
                <span>Benvenuto nel Portale Genitori & Allievi!</span>
              </div>
              <p className='text-xs text-white/70 leading-relaxed'>
                Per completare l'attivazione e accedere alla scheda allievo e alle ricevute fiscali, imposta la tua password personale riservata.
              </p>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                onClick={openResetModal}
                className='w-full mt-1 border-brand-500/30 text-brand-200 hover:bg-brand-500/20'
              >
                🔑 Imposta Password di Accesso
              </Button>
            </div>
          )}

          {authError && (
            <div
              className='mb-4 p-3 rounded-xl bg-coral-500/10 border border-coral-500/30 text-coral-400 text-sm flex items-center gap-2'
              role='alert'
            >
              <span aria-hidden='true'>⚠️</span> {authError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className='space-y-4' noValidate>
            <Input
              label='Email'
              type='email'
              placeholder='nome@scuola.it'
              icon={<Mail size={16} />}
              fullWidth
              autoComplete='username'
              error={errors.email?.message}
              {...register('email')}
            />

            <div className='space-y-1.5'>
              <Input
                label='Password'
                type={showPassword ? 'text' : 'password'}
                placeholder='••••••••'
                icon={<Lock size={16} />}
                iconRight={
                  <button
                    type='button'
                    onClick={() => setShowPassword((v) => !v)}
                    className='text-white/40 hover:text-white/70 transition-colors'
                    aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
                fullWidth
                autoComplete='current-password'
                error={errors.password?.message}
                {...register('password')}
              />
              <div className='flex justify-end'>
                <button
                  type='button'
                  onClick={openResetModal}
                  className='text-xs text-brand-400 hover:text-brand-300 transition-colors cursor-pointer'
                >
                  Password dimenticata?
                </button>
              </div>
            </div>

            <Button
              type='submit'
              fullWidth
              size='lg'
              loading={isSubmitting}
              icon={!isSubmitting ? <LogIn size={18} /> : undefined}
              className='mt-2'
            >
              Accedi
            </Button>

            <div className='text-center mt-4'>
              <p className='text-xs text-white/40'>
                Sei un genitore o un allievo e non hai un account?{' '}
                <span className='text-brand-400 font-medium block mt-0.5'>
                  Scansiona il QR Code o richiedi il link di iscrizione alla segreteria
                </span>
              </p>
            </div>
          </form>

          {/* Divider */}
          <div className='relative my-5'>
            <div className='absolute inset-0 flex items-center'>
              <div className='w-full border-t border-white/8' />
            </div>
            <div className='relative flex justify-center'>
              <span className='bg-surface-800 px-3 text-xs text-white/40 rounded-full'>oppure</span>
            </div>
          </div>

          <Button
            variant='secondary'
            fullWidth
            size='lg'
            loading={googleLoading}
            onClick={handleGoogle}
          >
            {!googleLoading && <span className='text-lg mr-1'>G</span>}
            Accedi con Google
          </Button>

          <p className='text-center text-xs text-white/30 mt-6'>
            Accedendo accetti i{' '}
            <a href='#' className='text-brand-400 hover:underline'>Termini di Servizio</a>
            {' '}e la{' '}
            <a href='#' className='text-brand-400 hover:underline'>Privacy Policy</a>
          </p>
        </Card>

        <p className='text-center text-xs text-white/20 mt-4'>
          Tropical Style Caribbean School · © 2026 All rights reserved
        </p>
      </div>

      {/* Password Reset / First-Access Activation Modal */}
      <Modal
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        title={isFirstAccess ? "Benvenuto! Imposta la tua password" : "Recupero Password"}
        description={
          isFirstAccess && !useEmailFallback
            ? "Scegli subito la tua password personale per accedere immediatamente al Portale Genitori & Allievi (senza attendere alcuna email)."
            : isFirstAccess
              ? "Inserisci o conferma l'indirizzo email del tuo account per ricevere il link di attivazione e impostare la password del Portale."
              : "Inserisci l'indirizzo email del tuo account per ricevere il link di ripristino."
        }
      >
        {resetSuccess ? (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 size={24} />
            </div>
            <h4 className="text-sm font-semibold text-white">
              {isFirstAccess ? "Link di Attivazione Inviato!" : "Email Inviata!"}
            </h4>
            <p className="text-xs text-white/60 leading-relaxed max-w-sm mx-auto">
              Abbiamo inviato un link per impostare la password a <strong className="text-white">{resetEmail}</strong>. Controlla anche la cartella spam. Clicca sul link ricevuto per impostare la password, poi torna qui per accedere.
            </p>
            <div className="pt-2">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setResetModalOpen(false)}
              >
                Ho capito, chiudi
              </Button>
            </div>
          </div>
        ) : isFirstAccess && !useEmailFallback ? (
          <form onSubmit={handleDirectFirstAccessSetup} className="space-y-4 pt-2">
            {resetError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 space-y-2">
                <p>{resetError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setResetError(null);
                    setUseEmailFallback(true);
                  }}
                  className="text-brand-300 underline font-medium cursor-pointer"
                >
                  Ricevi link di cambio password via Email →
                </button>
              </div>
            )}
            <Input
              label="Indirizzo Email"
              type="email"
              placeholder="es. genitore@email.it"
              icon={<Mail size={16} />}
              fullWidth
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              required
            />
            <Input
              label="Scegli la tua nuova password personale"
              type="password"
              placeholder="Minimo 6 caratteri"
              icon={<KeyRound size={16} />}
              fullWidth
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoFocus
            />
            <Input
              label="Conferma nuova password"
              type="password"
              placeholder="Ripeti la password scelta"
              icon={<Lock size={16} />}
              fullWidth
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            <div className="flex gap-2 justify-end pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setResetModalOpen(false)}
                disabled={resetLoading}
              >
                Annulla
              </Button>
              <Button
                type="submit"
                loading={resetLoading}
                className="btn-primary-gradient"
              >
                ✨ Attiva Account ed Entra nel Portale
              </Button>
            </div>
            <div className="pt-2 border-t border-white/8 text-center">
              <button
                type="button"
                onClick={() => {
                  setResetError(null);
                  setUseEmailFallback(true);
                }}
                className="text-xs text-white/50 hover:text-brand-300 underline cursor-pointer"
              >
                Preferisci ricevere il link via email? Clicca qui
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSendReset} className="space-y-4 pt-2">
            {resetError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                {resetError}
              </div>
            )}
            <Input
              label="Indirizzo Email"
              type="email"
              placeholder="es. direzione@tropicalstyle.it"
              icon={<Mail size={16} />}
              fullWidth
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              required
              autoFocus
            />
            <div className="flex gap-2 justify-end pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setResetModalOpen(false)}
                disabled={resetLoading}
              >
                Annulla
              </Button>
              <Button
                type="submit"
                loading={resetLoading}
                className="btn-primary-gradient"
              >
                {isFirstAccess ? "Invia Link di Attivazione" : "Invia Link di Ripristino"}
              </Button>
            </div>
            {isFirstAccess && (
              <div className="pt-2 border-t border-white/8 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setResetError(null);
                    setUseEmailFallback(false);
                  }}
                  className="text-xs text-brand-300 hover:underline cursor-pointer"
                >
                  ← Torna all'attivazione diretta con nuova password
                </button>
              </div>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
