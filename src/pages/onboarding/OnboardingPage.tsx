import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { useSchoolStore } from '@/stores/schoolStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardTitle, Input, Select, Button, Badge } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { courseConverter, schoolConverter, nowTimestamp } from '@/lib/converters';
import type { School, Course, CourseSchedule } from '@/types';
import toast from 'react-hot-toast';
import {
  Building2, School as SchoolIcon, Layers, Check,
  ChevronRight, ChevronLeft, Award, LogOut
} from 'lucide-react';
import { logout } from '@/hooks/useAuth';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { setActiveSchool } = useSchoolStore();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Disconnessione effettuata con successo.');
      navigate('/login');
    } catch (err) {
      toast.error('Errore durante il logout');
    }
  };

  // ── Step 1: Dati Scuola ──
  const [schoolName, setSchoolName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCity, setAddressCity] = useState('');

  // ── Step 2: Dati Accademici & Aule ──
  const [academicYear, setAcademicYear] = useState('2025-2026');
  const [rooms, setRooms] = useState<string[]>(['Sala Specchi', 'Sala Classica']);
  const [newRoomName, setNewRoomName] = useState('');

  // ── Step 3: Primo Corso ──
  const [courseName, setCourseName] = useState('');
  const [courseStyle, setCourseStyle] = useState('Hip Hop');
  const [courseLevel, setCourseLevel] = useState<'beginner' | 'intermediate' | 'advanced' | 'all'>('beginner');
  const [monthlyFee, setMonthlyFee] = useState<number>(50);
  const [registrationFee, setRegistrationFee] = useState<number>(30);

  const addRoom = () => {
    if (!newRoomName.trim()) return;
    if (rooms.includes(newRoomName.trim())) {
      toast.error('Questa sala esiste già.');
      return;
    }
    setRooms([...rooms, newRoomName.trim()]);
    setNewRoomName('');
  };

  const removeRoom = (indexToRemove: number) => {
    setRooms(rooms.filter((_, idx) => idx !== indexToRemove));
  };

  const handleNext = () => {
    if (step === 1) {
      if (!schoolName.trim() || !phone.trim() || !addressCity.trim()) {
        toast.error('Compila tutti i campi obbligatori della scuola.');
        return;
      }
    }
    if (step === 2) {
      if (rooms.length === 0) {
        toast.error('Inserisci almeno una sala della scuola.');
        return;
      }
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleComplete = async () => {
    if (!courseName.trim()) {
      toast.error('Inserisci il nome del primo corso.');
      return;
    }

    if (!user) {
      toast.error('Autenticazione mancante.');
      return;
    }

    setLoading(true);
    try {
      const generatedSchoolId = user.schoolId || doc(collection(db, 'placeholder')).id;

      // 1. Crea il documento della Scuola
      const schoolRef = doc(db, 'schools', generatedSchoolId).withConverter(schoolConverter);
      const newSchool: School = {
        id: generatedSchoolId,
        name: schoolName,
        slug: schoolName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        address: {
          street: addressStreet,
          city: addressCity,
          province: '',
          postalCode: '',
          country: 'Italy',
        },
        contact: {
          phone,
          email: user.email,
        },
        subscription: {
          plan: 'trial',
          status: 'active',
        },
        settings: {
          currency: 'EUR',
          timezone: 'Europe/Rome',
          academicYearStart: 9, // Settembre
          paymentDueDay: 10,
          allowParentPortal: true,
          notificationsEnabled: true,
          whatsappEnabled: false,
        },
        stats: {
          totalStudents: 0,
          activeStudents: 0,
          totalCourses: 1,
          monthlyRevenue: 0,
        },
        createdAt: nowTimestamp(),
        updatedAt: nowTimestamp(),
      };

      await setDoc(schoolRef, newSchool);

      const updatedUser = {
        ...user,
        schoolId: generatedSchoolId,
        isActive: true,
        updatedAt: nowTimestamp(),
      };
      // User doc is already created during registerSchoolAndAdmin with correct schoolId, role, and isActive.
      // Writing to it here is redundant and would trigger strict Firestore update rules on role/schoolId.

      // 3. Crea il Primo Corso
      const courseRef = doc(collection(db, `schools/${generatedSchoolId}/courses`)).withConverter(courseConverter);
      const schedule: CourseSchedule[] = [
        {
          dayOfWeek: 1, // Lunedì
          startTime: '17:00',
          endTime: '18:30',
        }
      ];

      const newCourse: Course = {
        id: courseRef.id,
        schoolId: generatedSchoolId,
        name: courseName,
        style: courseStyle,
        level: courseLevel,
        teacherIds: [user.uid],
        schedule,
        room: rooms[0] || 'Sala Specchi',
        maxStudents: 20,
        enrolledCount: 0,
        fee: {
          monthly: monthlyFee,
          registration: registrationFee,
          currency: 'EUR',
        },
        colorHex: '#8b5cf6',
        isActive: true,
        academicYear,
        isDeleted: false,
        createdAt: nowTimestamp(),
        updatedAt: nowTimestamp(),
      };

      await setDoc(courseRef, newCourse);

      // Aggiorna lo stato globale dell'app
      setUser(updatedUser);
      setActiveSchool(newSchool);

      toast.success('Configurazione completata con successo! Benvenuto in DanceFlow.');
      navigate('/dashboard');
    } catch (err) {
      console.error('[Onboarding] Error during wizard setup:', err);
      toast.error('Errore durante la configurazione dell\'onboarding.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ErrorBoundary>
      <div className='page-enter max-w-3xl mx-auto py-10 space-y-6 px-4'>
        {/* Wizard Progression Bar */}
        <div className='flex items-center justify-between glass p-4 rounded-2xl border border-white/5'>
          {[
            { stepNum: 1, label: 'Scuola', icon: <SchoolIcon size={18} /> },
            { stepNum: 2, label: 'Aule e Anno', icon: <Layers size={18} /> },
            { stepNum: 3, label: 'Primo Corso', icon: <Award size={18} /> },
          ].map((s) => (
            <div key={s.stepNum} className='flex items-center gap-3'>
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold transition-all ${
                  step === s.stepNum
                    ? 'bg-brand-500 text-white scale-110 shadow-lg shadow-brand-500/20'
                    : step > s.stepNum
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-white/5 text-white/40'
                }`}
              >
                {step > s.stepNum ? <Check size={18} /> : s.stepNum}
              </div>
              <span
                className={`text-xs font-semibold hidden sm:inline ${
                  step === s.stepNum ? 'text-white' : 'text-white/40'
                }`}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>

        <PageHeader
          title='Benvenuto su DanceFlow 🚀'
          subtitle='Configura i dati iniziali della tua scuola di danza in pochi istanti'
          actions={
            <Button variant='secondary' size='sm' onClick={handleLogout} icon={<LogOut size={16} />}>
              Logout
            </Button>
          }
        />

        {/* ── Step 1: Anagrafica Scuola ─────────────────────────────────── */}
        {step === 1 && (
          <Card className='page-enter space-y-4'>
            <CardTitle className='flex items-center gap-2'>
              <Building2 className='text-brand-300' size={18} />
              Dati Generali della Scuola
            </CardTitle>

            <Input
              label='Nome Scuola di Danza *'
              placeholder='Es. Accademia delle Arti'
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              required
            />

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <Input
                label='Telefono di Contatto *'
                placeholder='Es. 06 1234567'
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
              <Input
                label='Città *'
                placeholder='Es. Roma'
                value={addressCity}
                onChange={(e) => setAddressCity(e.target.value)}
                required
              />
            </div>

            <Input
              label='Indirizzo della Scuola'
              placeholder='Es. Via della Danza, 12'
              value={addressStreet}
              onChange={(e) => setAddressStreet(e.target.value)}
            />

            <div className='flex justify-end pt-4 border-t border-white/5'>
              <Button onClick={handleNext} iconRight={<ChevronRight size={16} />}>
                Avanti
              </Button>
            </div>
          </Card>
        )}

        {/* ── Step 2: Sale & Anno Scolastico ────────────────────────────── */}
        {step === 2 && (
          <Card className='page-enter space-y-5'>
            <CardTitle className='flex items-center gap-2'>
              <Layers className='text-brand-300' size={18} />
              Anno Accademico & Sale Danza
            </CardTitle>

            <Select
              label='Anno Accademico Attivo'
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              options={[
                { value: '2025-2026', label: 'Anno Accademico 2025-2026' },
                { value: '2026-2027', label: 'Anno Accademico 2026-2027' },
              ]}
            />

            {/* Gestione Sale */}
            <div className='space-y-3'>
              <label className='text-sm font-medium text-white/70 block'>Sale Fisiche della Scuola *</label>
              <div className='flex gap-2'>
                <Input
                  placeholder='Es. Sala Specchi, Sala A, Sala Teatro'
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className='flex-1'
                />
                <Button variant='outline' onClick={addRoom}>Aggiungi</Button>
              </div>

              {/* Lista Sale Inserite */}
              <div className='flex flex-wrap gap-2 pt-2'>
                {rooms.map((room, idx) => (
                  <Badge key={idx} variant='brand' size='md' className='flex items-center gap-1.5 py-1 px-3'>
                    {room}
                    <button
                      type='button'
                      onClick={() => removeRoom(idx)}
                      className='text-white/40 hover:text-white font-bold ml-1 active:scale-90'
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            <div className='flex justify-between pt-4 border-t border-white/5'>
              <Button variant='secondary' onClick={handleBack} icon={<ChevronLeft size={16} />}>
                Indietro
              </Button>
              <Button onClick={handleNext} iconRight={<ChevronRight size={16} />}>
                Avanti
              </Button>
            </div>
          </Card>
        )}

        {/* ── Step 3: Configurazione Primo Corso ────────────────────────── */}
        {step === 3 && (
          <Card className='page-enter space-y-4'>
            <CardTitle className='flex items-center gap-2'>
              <Award className='text-brand-300' size={18} />
              Configura il Primo Corso
            </CardTitle>

            <Input
              label='Nome del Corso *'
              placeholder='Es. Hip Hop Principianti Lunedì'
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              required
            />

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <Select
                label='Stile Danza'
                value={courseStyle}
                onChange={(e) => setCourseStyle(e.target.value)}
                options={[
                  { value: 'Classica', label: 'Danza Classica' },
                  { value: 'Moderna', label: 'Danza Moderna' },
                  { value: 'Hip Hop', label: 'Hip Hop' },
                  { value: 'Contemporanea', label: 'Contemporanea' },
                  { value: 'Caraibici', label: 'Caraibici' },
                ]}
              />
              <Select
                label='Livello'
                value={courseLevel}
                onChange={(e) => setCourseLevel(e.target.value as any)}
                options={[
                  { value: 'beginner', label: 'Principianti' },
                  { value: 'intermediate', label: 'Intermedio' },
                  { value: 'advanced', label: 'Avanzato' },
                  { value: 'all', label: 'Tutti i livelli' },
                ]}
              />
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <Input
                type='number'
                label='Retta Mensile (€)'
                value={monthlyFee.toString()}
                onChange={(e) => setMonthlyFee(Number(e.target.value))}
              />
               <Input
                type='number'
                label="Quota d'Iscrizione Annuale (€)"
                value={registrationFee.toString()}
                onChange={(e) => setRegistrationFee(Number(e.target.value))}
              />
            </div>

            <div className='flex justify-between pt-4 border-t border-white/5'>
              <Button variant='secondary' onClick={handleBack} icon={<ChevronLeft size={16} />} disabled={loading}>
                Indietro
              </Button>
              <Button onClick={handleComplete} loading={loading}>
                Completa Configurazione
              </Button>
            </div>
          </Card>
        )}
      </div>
    </ErrorBoundary>
  );
}
