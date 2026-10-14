import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, Eye, EyeOff, LogIn, CheckCircle2 } from 'lucide-react';
import { loginWithEmail, loginWithGoogle, sendResetEmail } from '@/hooks/useAuth';
import { Button, Input, Card, Modal } from '@/components/ui';

const loginSchema = z.object({
  email:    z.string().email('Email non valida'),
  password: z.string().min(6, 'La password deve essere almeno 6 caratteri'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const currentEmail = watch('email');

  function openResetModal() {
    setResetEmail(currentEmail || '');
    setResetSuccess(false);
    setResetError(null);
    setResetModalOpen(true);
  }

  async function handleSendReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetEmail || !resetEmail.includes('@')) {
      setResetError('Inserisci un indirizzo email valido');
      return;
    }
    setResetLoading(true);
    setResetError(null);
    try {
      await sendResetEmail(resetEmail.trim());
      setResetSuccess(true);
    } catch (err: unknown) {
      console.error('[LoginPage] Reset error:', err);
      const code = (err as { code?: string }).code;
      if (code === 'auth/user-not-found') {
        setResetError('Nessun account associato a questa email.');
      } else {
        setResetError('Impossibile inviare l\'email di ripristino. Riprova più tardi.');
      }
    } finally {
      setResetLoading(false);
    }
  }

  async function onSubmit(data: LoginForm) {
    setAuthError(null);
    try {
      await loginWithEmail(data.email, data.password);
    } catch (err: unknown) {
      console.error('[LoginPage] Login error:', err);
      const code = (err as { code?: string }).code;
      setAuthError(
        code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential'
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

      {/* Password Reset Modal */}
      <Modal
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        title="Recupero Password"
        description="Inserisci l'indirizzo email del tuo account per ricevere il link di ripristino."
      >
        {resetSuccess ? (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 size={24} />
            </div>
            <h4 className="text-sm font-semibold text-white">Email Inviata!</h4>
            <p className="text-xs text-white/60 leading-relaxed max-w-sm mx-auto">
              Abbiamo inviato un link di reimpostazione password a <strong className="text-white">{resetEmail}</strong>. Controlla anche la cartella spam.
            </p>
            <div className="pt-2">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setResetModalOpen(false)}
              >
                Chiudi
              </Button>
            </div>
          </div>
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
                Invia Link di Ripristino
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
