import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { Card, Input, Button, EmptyState } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { COLLECTIONS, nowTimestamp, userConverter } from '@/lib/converters';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';
import type { AppUser } from '@/types';
import { Lock, Eye, EyeOff } from 'lucide-react';

interface InviteData {
  email: string;
  displayName: string;
  role: 'teacher' | 'admin';
  schoolId: string;
  schoolName: string;
  used: boolean;
}

export default function JoinStaffPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    async function loadInviteData() {
      setLoading(true);
      try {
        const inviteRef = doc(db, 'invites', token!);
        const snap = await getDoc(inviteRef);
        if (snap.exists()) {
          const data = snap.data() as InviteData;
          if (data.used) {
            setValidationError('Questo link di invito è già stato utilizzato.');
          } else {
            setInvite(data);
          }
        } else {
          setValidationError('Invito non valido o inesistente.');
        }
      } catch (err) {
        console.error('[JoinStaff] Error fetching invite:', err);
        setValidationError('Impossibile verificare l\'invito in questo momento.');
      } finally {
        setLoading(false);
      }
    }

    void loadInviteData();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invite || !token) return;

    if (password.length < 6) {
      toast.error('La password deve contenere almeno 6 caratteri.');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Le password non coincidono.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Crea utente in Firebase Auth
      const userCred = await createUserWithEmailAndPassword(auth, invite.email, password);
      const uid = userCred.user.uid;

      // 2. Crea / Aggiorna documento user in Firestore
      const userRef = doc(db, COLLECTIONS.users, uid).withConverter(userConverter);
      
      const newUser: AppUser = {
        id: uid,
        uid: uid,
        email: invite.email,
        displayName: invite.displayName,
        role: invite.role,
        schoolId: invite.schoolId,
        isActive: true,
        createdAt: nowTimestamp(),
        updatedAt: nowTimestamp(),
      };

      await setDoc(userRef, newUser);

      // 3. Temporary pre-registered account is automatically deleted during auth bootstrap (fetchOrCreateUser)
      // No action needed here.

      // 4. Segna l'invito come utilizzato
      const inviteRef = doc(db, 'invites', token!);
      await updateDoc(inviteRef, {
        used: true,
      });

      // 5. Aggiorna lo store Zustand
      useAuthStore.getState().setUser(newUser);
      useAuthStore.getState().setFirebaseUser({ uid, email: invite.email });

      toast.success('Registrazione completata! Benvenuto nello staff.');
      navigate('/dashboard');
    } catch (err: any) {
      console.error('[JoinStaff] Signup failed:', err);
      if (err.code === 'auth/email-already-in-use') {
        toast.error('Questa email è già registrata in Firebase Auth.');
      } else {
        toast.error(err.message || 'Errore durante la creazione dell\'account.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center p-4 bg-surface-950 text-white/50 text-sm'>
        Verifica invito in corso...
      </div>
    );
  }

  if (validationError || !invite) {
    return (
      <div className='min-h-screen flex items-center justify-center p-4 bg-surface-950'>
        <Card className='w-full max-w-md p-6 border border-white/10 text-center space-y-4'>
          <EmptyState
            icon='⚠️'
            title='Invito Non Valido'
            description={validationError || 'Il link utilizzato non è valido o è scaduto.'}
          />
          <Button onClick={() => navigate('/login')} className='w-full'>
            Torna al Login
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <ErrorBoundary>
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
            <div className='inline-flex items-center justify-center w-16 h-16 rounded-2xl btn-primary-gradient mb-3 animate-pulse-glow'>
              <span className='text-3xl'>💃</span>
            </div>
            <h1 className='text-2xl font-display font-bold gradient-text'>DanceFlow</h1>
            <p className='text-white/50 text-xs mt-1'>Unisciti allo staff di {invite.schoolName}</p>
          </div>

          <Card className='p-6 space-y-6 border border-white/5'>
            <div>
              <h2 className='text-lg font-display font-bold text-white'>Completa Registrazione</h2>
              <p className='text-xs text-white/50 mt-1'>
                Imposta la tua password di accesso come <strong>{invite.role === 'admin' ? 'Amministratore' : 'Insegnante'}</strong>.
              </p>
            </div>

            <div className='space-y-3 bg-white/5 p-4 rounded-2xl border border-white/5 text-xs text-white/70'>
              <p><strong>Nome:</strong> {invite.displayName}</p>
              <p><strong>Email:</strong> {invite.email}</p>
              <p><strong>Scuola:</strong> {invite.schoolName}</p>
            </div>

            <form onSubmit={handleSubmit} className='space-y-4' noValidate>
              <div className='relative'>
                <Input
                  label='Password'
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder='Scegli una password sicura'
                  icon={<Lock size={16} />}
                  value={password}
                  onChange={(e: any) => setPassword(e.target.value)}
                  fullWidth
                />
                <button
                  type='button'
                  onClick={() => setShowPassword(!showPassword)}
                  className='absolute right-3 top-[34px] text-white/40 hover:text-white transition'
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <div className='relative'>
                <Input
                  label='Conferma Password'
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  placeholder='Ripeti la password'
                  icon={<Lock size={16} />}
                  value={confirmPassword}
                  onChange={(e: any) => setConfirmPassword(e.target.value)}
                  fullWidth
                />
                <button
                  type='button'
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className='absolute right-3 top-[34px] text-white/40 hover:text-white transition'
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <Button type='submit' loading={submitting} className='w-full pt-2'>
                Completa Registrazione
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </ErrorBoundary>
  );
}
