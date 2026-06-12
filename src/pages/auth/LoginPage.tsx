import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, LogIn } from 'lucide-react';
import { loginWithEmail, loginWithGoogle } from '@/hooks/useAuth';
import { Button, Input, Card } from '@/components/ui';

const loginSchema = z.object({
  email:    z.string().email('Email non valida'),
  password: z.string().min(6, 'La password deve essere almeno 6 caratteri'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

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
          <div className='inline-flex items-center justify-center w-20 h-20 rounded-3xl btn-primary-gradient mb-4 animate-pulse-glow'>
            <span className='text-4xl'>💃</span>
          </div>
          <h1 className='text-3xl font-display font-bold gradient-text'>DanceFlow</h1>
          <p className='text-white/50 text-sm mt-1'>Gestionale per Scuole di Danza</p>
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
              autoComplete='email'
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
                  className='text-xs text-brand-400 hover:text-brand-300 transition-colors'
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
              <Link
                to='/register'
                className='text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium hover:underline'
              >
                Non hai un account? Inizia la prova gratuita
              </Link>
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
          DanceFlow v1.0 · © 2024 All rights reserved
        </p>
      </div>
    </div>
  );
}
