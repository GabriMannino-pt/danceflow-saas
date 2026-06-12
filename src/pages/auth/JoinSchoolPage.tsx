import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, setDoc, Timestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { Card, CardTitle, Input, Select, Button, EmptyState } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { COLLECTIONS, nowTimestamp } from '@/lib/converters';
import type { School, Course } from '@/types';
import toast from 'react-hot-toast';

export default function JoinSchoolPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState<School | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [requestSent, setRequestSent] = useState(false);

  // Form states per la registrazione genitore
  const [parentName, setParentName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentPassword, setParentPassword] = useState('');
  const [studentFirstName, setStudentFirstName] = useState('');
  const [studentLastName, setStudentLastName] = useState('');
  const [studentBirthDate, setStudentBirthDate] = useState('');
  const [courseInterest, setCourseInterest] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 1. Carica i dettagli della scuola in base al token QR permanente
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    async function loadSchoolData() {
      setLoading(true);
      try {
        const schoolsQuery = query(
          collection(db, 'schools'),
          where('settings.registrationQR.token', '==', token),
          where('settings.registrationQR.enabled', '==', true)
        );

        const snap = await getDocs(schoolsQuery);
        if (snap.empty) {
          setSchool(null);
          setLoading(false);
          return;
        }

        const schoolData = { id: snap.docs[0].id, ...snap.docs[0].data() } as School;
        setSchool(schoolData);

        // Carica i corsi disponibili presso la scuola per la dropdown
        const coursesSnap = await getDocs(
          collection(db, COLLECTIONS.courses(schoolData.id))
        );
        const fetchedCourses = coursesSnap.docs
          .map((d) => d.data() as Course)
          .filter((c) => c.isDeleted !== true);
        setCourses(fetchedCourses);
      } catch (err) {
        console.error('[JoinSchool] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    void loadSchoolData();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school || !parentName || !parentEmail || !parentPassword || !studentFirstName || !studentLastName || !studentBirthDate) {
      toast.error('Compila tutti i campi obbligatori.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Crea l'account genitore in Firebase Auth
      const userCred = await createUserWithEmailAndPassword(auth, parentEmail, parentPassword);
      const uid = userCred.user.uid;

      // 2. Registra l'utente nel database 'users' con ruolo 'parent'
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, {
        uid,
        email: parentEmail,
        displayName: parentName,
        role: 'parent',
        schoolId: school.id,
        isActive: false, // in attesa dell'approvazione del saggio/allievo
        createdAt: nowTimestamp(),
        updatedAt: nowTimestamp(),
      });

      // 3. Salva la richiesta di iscrizione in Firestore in schools/{schoolId}/registrationRequests/{requestId}
      const requestRef = doc(collection(db, `schools/${school.id}/registrationRequests`));
      await setDoc(requestRef, {
        id: requestRef.id,
        parentName,
        parentEmail,
        parentUid: uid,
        studentName: `${studentFirstName} ${studentLastName}`,
        studentFirstName,
        studentLastName,
        studentBirthDate: Timestamp.fromDate(new Date(studentBirthDate)),
        courseInterest: courseInterest || null,
        status: 'pending',
        createdAt: nowTimestamp(),
      });

      setRequestSent(true);
      toast.success('Richiesta inviata con successo!');
    } catch (err: any) {
      console.error('[JoinSchool] Submission failed:', err);
      toast.error(err.message || 'Errore durante l\'invio della richiesta.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center p-6 bg-surface-900'>
        <div className='text-center space-y-4'>
          <div className='w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto' />
          <p className='text-sm text-white/50'>Caricamento scuola...</p>
        </div>
      </div>
    );
  }

  if (!school) {
    return (
      <div className='min-h-screen flex items-center justify-center p-6 bg-surface-900'>
        <EmptyState
          icon='⚠️'
          title='Link di iscrizione non valido'
          description='Il QR Code o il codice di registrazione utilizzato non è valido o è stato disattivato dalla scuola.'
          action={{
            label: 'Accedi',
            onClick: () => navigate('/login'),
          }}
        />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className='min-h-screen flex items-center justify-center p-6 bg-surface-900 overflow-y-auto'>
        <div className='max-w-xl w-full py-8 space-y-6'>
          <div className='text-center space-y-2'>
            {school.logoURL && (
              <img src={school.logoURL} alt={school.name} className='w-20 h-20 rounded-3xl mx-auto object-cover border border-white/10' />
            )}
            <h1 className='text-2xl font-bold font-display text-white'>{school.name}</h1>
            <p className='text-sm text-white/50'>Portale di Registrazione Self-Service per Genitori ed Allievi</p>
          </div>

          {requestSent ? (
            <Card className='text-center p-8 border border-teal-500/20 bg-teal-500/5 page-enter'>
              <div className='w-16 h-16 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center text-3xl mx-auto mb-4'>
                ✓
              </div>
              <h2 className='text-lg font-bold text-white mb-2'>Richiesta di Iscrizione Inviata!</h2>
              <p className='text-sm text-white/60 mb-6 leading-relaxed'>
                Grazie! La tua richiesta è stata registrata. La scuola verificherà i dettagli dell'iscrizione del figlio e ti confermerà l'attivazione a breve tramite email.
              </p>
              <Button onClick={() => navigate('/login')} className='w-full'>
                Accedi al Portale
              </Button>
            </Card>
          ) : (
            <Card className='p-6 border border-white/5'>
              <CardTitle className='mb-4'>Modulo di Iscrizione</CardTitle>

              <form onSubmit={handleSubmit} className='space-y-4'>
                <h3 className='text-xs font-semibold uppercase tracking-wider text-brand-300 border-b border-white/5 pb-1'>
                  1. Dati Genitore / Referente
                </h3>
                
                <Input
                  label='Nome e Cognome Genitore *'
                  placeholder='Es. Maria Rossi'
                  value={parentName}
                  onChange={(e: any) => setParentName(e.target.value)}
                  required
                />

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <Input
                    type='email'
                    label='Indirizzo Email *'
                    placeholder='genitore@email.com'
                    value={parentEmail}
                    onChange={(e: any) => setParentEmail(e.target.value)}
                    required
                  />
                  <Input
                    type='password'
                    label='Password *'
                    placeholder='Minimo 6 caratteri'
                    value={parentPassword}
                    onChange={(e: any) => setParentPassword(e.target.value)}
                    required
                  />
                </div>

                <h3 className='text-xs font-semibold uppercase tracking-wider text-brand-300 border-b border-white/5 pb-1 pt-2'>
                  2. Dati Allievo / Figlio
                </h3>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <Input
                    label='Nome Figlio *'
                    placeholder='Es. Sofia'
                    value={studentFirstName}
                    onChange={(e: any) => setStudentFirstName(e.target.value)}
                    required
                  />
                  <Input
                    label='Cognome Figlio *'
                    placeholder='Es. Rossi'
                    value={studentLastName}
                    onChange={(e: any) => setStudentLastName(e.target.value)}
                    required
                  />
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <Input
                    type='date'
                    label='Data di Nascita Figlio *'
                    value={studentBirthDate}
                    onChange={(e: any) => setStudentBirthDate(e.target.value)}
                    required
                  />
                  <Select
                    label='Corso di Interesse (Opzionale)'
                    value={courseInterest}
                    onChange={(e: any) => setCourseInterest(e.target.value)}
                    options={[
                      { value: '', label: 'Seleziona un corso...' },
                      ...courses.map((c) => ({ value: c.id, label: c.name }))
                    ]}
                  />
                </div>

                <Button
                  type='submit'
                  loading={submitting}
                  className='w-full mt-4'
                >
                  Invia Richiesta di Iscrizione
                </Button>
              </form>
            </Card>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
