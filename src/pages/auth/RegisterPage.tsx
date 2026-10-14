import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Building, User, UserPlus } from 'lucide-react';
import { registerSchoolAndAdmin } from '@/hooks/useAuth';
import { Button, Input, Card } from '@/components/ui';
import toast from 'react-hot-toast';

const registerSchema = z
  .object({
    schoolName: z.string().min(3, 'Il nome della scuola deve essere di almeno 3 caratteri'),
    referentName: z.string().min(3, 'Il nome del referente deve essere di almeno 3 caratteri'),
    email: z.string().email('Email non valida'),
    password: z.string().min(6, 'La password deve essere di almeno 6 caratteri'),
    confirmPassword: z.string().min(6, 'La password deve essere di almeno 6 caratteri'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Le password non coincidono',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(data: RegisterForm) {
    setAuthError(null);
    try {
      await registerSchoolAndAdmin(
        data.schoolName,
        data.referentName,
        data.email,
        data.password
      );
      toast.success('Registrazione completata con successo!');
      navigate('/onboarding');
    } catch (err: unknown) {
      console.error('[Register] Error:', err);
      const code = (err as { code?: string }).code;
      if (code === 'auth/email-already-in-use') {
        setAuthError('Questa email è già in uso. Prova ad accedere.');
      } else {
        setAuthError('Impossibile completare la registrazione. Riprova più tardi.');
      }
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

      <div className='relative w-full max-w-md animate-fade-in-up py-8'>
        {/* Logo */}
        <div className='text-center mb-6'>
          <div className='mb-3 inline-flex items-center justify-center px-5 py-3 rounded-2xl bg-white shadow-xl'>
            <img
              src='/tropical_logo.png'
              alt='Tropical Style'
              className='h-12 w-auto max-w-[200px] object-contain'
            />
          </div>
          <h1 className='text-2xl font-display font-bold text-white'>Tropical Style</h1>
          <p className='text-brand-400 text-xs mt-0.5 font-semibold uppercase tracking-wider'>Caribbean School</p>
        </div>

        <Card>
          <h2 className='text-lg font-display font-bold text-white mb-4'>Inizia la prova gratuita di 30 giorni</h2>

          {authError && (
            <div
              className='mb-4 p-3 rounded-xl bg-coral-500/10 border border-coral-500/30 text-coral-400 text-xs flex items-center gap-2'
              role='alert'
            >
              <span aria-hidden='true'>⚠️</span> {authError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className='space-y-3.5' noValidate>
            <Input
              label='Nome Scuola'
              type='text'
              placeholder='La tua scuola di danza'
              icon={<Building size={16} />}
              fullWidth
              error={errors.schoolName?.message}
              {...register('schoolName')}
            />

            <Input
              label='Nome Referente'
              type='text'
              placeholder='Nome e Cognome'
              icon={<User size={16} />}
              fullWidth
              error={errors.referentName?.message}
              {...register('referentName')}
            />

            <Input
              label='Email'
              type='email'
              placeholder='direzione@scuola.it'
              icon={<Mail size={16} />}
              fullWidth
              autoComplete='username'
              error={errors.email?.message}
              {...register('email')}
            />

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
              autoComplete='new-password'
              error={errors.password?.message}
              {...register('password')}
            />

            <Input
              label='Conferma Password'
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder='••••••••'
              icon={<Lock size={16} />}
              iconRight={
                <button
                  type='button'
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className='text-white/40 hover:text-white/70 transition-colors'
                  aria-label={showConfirmPassword ? 'Nascondi password' : 'Mostra password'}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
              fullWidth
              autoComplete='new-password'
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            <Button
              type='submit'
              fullWidth
              size='lg'
              loading={isSubmitting}
              icon={!isSubmitting ? <UserPlus size={18} /> : undefined}
              className='mt-4'
            >
              Registrati
            </Button>
          </form>

          {/* Back to Login Link */}
          <div className='text-center mt-5 pt-3 border-t border-white/5'>
            <span className='text-xs text-white/40'>Hai già un account? </span>
            <Link
              to='/login'
              className='text-xs text-brand-400 hover:text-brand-300 font-semibold hover:underline'
            >
              Accedi
            </Link>
          </div>
        </Card>

        <p className='text-center text-xs text-white/20 mt-4'>
          Tropical Style Caribbean School · © 2026 All rights reserved
        </p>
      </div>
    </div>
  );
}
