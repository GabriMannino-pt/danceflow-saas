import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, getDoc, doc, setDoc } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { db, auth, firebaseConfig } from '@/lib/firebase';
import { Card, CardTitle, Input, Select, Button, EmptyState } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { COLLECTIONS, nowTimestamp } from '@/lib/converters';
import { useAuthStore } from '@/stores/authStore';
import type { School, Course } from '@/types';
import toast from 'react-hot-toast';
import { SignaturePad, SignaturePadRef } from '@/components/registration/SignaturePad';
import { generateRegistrationPdf } from '@/services/pdf/RegistrationPdfBuilder';
import { uploadRegistrationForm } from '@/services/api/storageService';
import { submitRegistrationRequest } from '@/services/api/registrationService';
import { 
  User, Shield, MapPin, ChevronRight, ChevronLeft, CheckCircle 
} from 'lucide-react';

function calculateAge(birthDateString: string): number | null {
  if (!birthDateString) return null;
  const birth = new Date(birthDateString);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export default function RegistrationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const sigPadRef = useRef<SignaturePadRef>(null);

  const currentUser = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState<School | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  // --- WIZARD FORM STATES ---
  // Student Info (always entered first)
  const [studentFirstName, setStudentFirstName] = useState('');
  const [studentLastName, setStudentLastName] = useState('');
  const [studentBirthDate, setStudentBirthDate] = useState('');
  const [studentGender, setStudentGender] = useState('F');
  const [studentFiscalCode, setStudentFiscalCode] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [studentEmail, setStudentEmail] = useState('');

  // Parent/Referent Info (auto-expanded only if student is minor)
  const isExistingParentUser = currentUser && currentUser.role === 'parent';
  const [parentName, setParentName] = useState(isExistingParentUser ? currentUser?.displayName || '' : '');
  const [parentEmail, setParentEmail] = useState(isExistingParentUser ? currentUser?.email || '' : '');
  const [parentPassword, setParentPassword] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentRelation, setParentRelation] = useState('madre');

  // Address & Courses
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressProvince, setAddressProvince] = useState('');
  const [addressPostalCode, setAddressPostalCode] = useState('');
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [privacyCommon, setPrivacyCommon] = useState(false);
  const [privacySanitary, setPrivacySanitary] = useState(false);

  // Automatic age calculation & minor detection directly from date of birth
  const calculatedAge = calculateAge(studentBirthDate);
  const isMinor = calculatedAge !== null && calculatedAge < 18;

  // Prefill if currentUser arrives after mount
  useEffect(() => {
    if (currentUser) {
      if (currentUser.displayName && !parentName) setParentName(currentUser.displayName);
      if (currentUser.email && !parentEmail) setParentEmail(currentUser.email);
      if (currentUser.email && !studentEmail) setStudentEmail(currentUser.email);
      if (currentUser.displayName && !studentFirstName && !studentLastName) {
        const parts = currentUser.displayName.trim().split(' ');
        if (parts.length > 1) {
          setStudentFirstName(parts[0]);
          setStudentLastName(parts.slice(1).join(' '));
        } else {
          setStudentFirstName(currentUser.displayName);
        }
      }
    }
  }, [currentUser]);

  // 1. Fetch School & Course Details
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

        const coursesSnap = await getDocs(
          collection(db, COLLECTIONS.courses(schoolData.id))
        );
        const fetchedCourses = coursesSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Course))
          .filter((c) => c.isDeleted !== true && c.isActive !== false);
        setCourses(fetchedCourses);
      } catch (err) {
        console.error('[RegistrationPage] Fetch school data error:', err);
      } finally {
        setLoading(false);
      }
    }

    void loadSchoolData();
  }, [token]);

  const [checkingCF, setCheckingCF] = useState(false);

  const handleNext = async () => {
    if (step === 1) {
      if (!studentFirstName.trim() || !studentLastName.trim() || !studentBirthDate.trim() || !studentFiscalCode.trim()) {
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        toast.error("Compila tutti i campi anagrafici dell'allievo.");
        return;
      }
      const cleanCF = studentFiscalCode.trim().toUpperCase();
      if (cleanCF.length !== 16) {
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        toast.error('Il Codice Fiscale deve contenere esattamente 16 caratteri.');
        return;
      }

      // Controllo anti-doppione Codice Fiscale
      if (school) {
        try {
          setCheckingCF(true);
          const cfDocRef = doc(db, 'schools', school.id, 'fiscalCodesIndex', cleanCF);
          const cfSnap = await getDoc(cfDocRef);
          if (cfSnap.exists()) {
            window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
            toast.error(
              'Questo Codice Fiscale risulta già registrato o in attesa di approvazione presso la nostra scuola. Per variazioni contatta la segreteria.',
              { duration: 7000 }
            );
            return;
          }
        } catch (cfErr) {
          console.warn('[RegistrationPage] Error checking duplicate CF:', cfErr);
        } finally {
          setCheckingCF(false);
        }
      }

      if (isMinor) {
        if (!parentName.trim() || !parentEmail.trim() || !parentPhone.trim()) {
          window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
          toast.error('Compila tutti i campi obbligatori del genitore o tutore legale.');
          return;
        }
        if (!currentUser && (!parentPassword.trim() || parentPassword.length < 6)) {
          toast.error('La password del portale genitore deve contenere almeno 6 caratteri.');
          return;
        }
      } else {
        // Adult student
        if (!studentPhone.trim() || !studentEmail.trim()) {
          toast.error("Inserisci il tuo cellulare e la tua email per l'account allievo.");
          return;
        }
        if (!currentUser && (!parentPassword.trim() || parentPassword.length < 6)) {
          toast.error('La password per il tuo account allievo deve contenere almeno 6 caratteri.');
          return;
        }
        // Auto-assign parent fields to ensure system & PDF compatibility
        setParentName(`${studentFirstName.trim()} ${studentLastName.trim()}`);
        setParentEmail(studentEmail.trim());
        setParentPhone(studentPhone.trim());
        setParentRelation('allievo');
      }
    }
    if (step === 2) {
      if (!addressStreet.trim() || !addressCity.trim() || !addressProvince.trim() || !addressPostalCode.trim() || selectedCourseIds.length === 0) {
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        toast.error('Compila tutti i campi di residenza (Via, Città, Prov, CAP) e seleziona almeno un corso di interesse.');
        return;
      }
    }
    setStep((prev) => prev + 1);
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setStep((prev) => Math.max(1, prev - 1));
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  };

  // Submit flow
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) return;

    if (sigPadRef.current?.isEmpty()) {
      toast.error('La firma autografa è obbligatoria per completare l\'iscrizione.');
      return;
    }

    if (!privacyCommon || !privacySanitary) {
      toast.error('È necessario accettare tutti i consensi obbligatori per procedere.');
      return;
    }

    setSubmitting(true);
    try {
      const isAdult = !isMinor;
      const effectiveParentName = isAdult ? `${studentFirstName.trim()} ${studentLastName.trim()}` : parentName.trim();
      const effectiveParentEmail = isAdult ? studentEmail.trim().toLowerCase() : parentEmail.trim().toLowerCase();
      const effectiveParentPhone = isAdult ? studentPhone.trim() : parentPhone.trim();
      const effectiveParentRelation = isAdult ? 'allievo' : parentRelation;

      // 1. Fetch Client IP from ipify
      let ipAddress = '127.0.0.1';
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        ipAddress = ipData.ip || '127.0.0.1';
      } catch (ipErr) {
        console.warn('Could not fetch client IP:', ipErr);
      }

      // 2. Extract Signature Image
      const signatureBase64 = sigPadRef.current?.getSignatureData();
      if (!signatureBase64) {
        throw new Error('Firma non valida o vuota.');
      }

      // 3. Create FES Metadata
      const timestamp = Date.now();
      const userAgent = navigator.userAgent;
      const sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

      const fesMetadata = {
        ipAddress,
        timestamp,
        userAgent,
        sessionId,
      };

      // 4. Resolve Account in Firebase Auth
      let parentUid: string;

      if (currentUser && currentUser.role === 'parent') {
        parentUid = currentUser.uid;
      } else if (currentUser && currentUser.role !== 'parent') {
        // Admin or staff testing the form while logged in:
        // Use secondary auth app instance to avoid hijacking or logging out active admin session.
        // Because the admin is logged in on the default app, isAdminOfSchool in Firestore allows creating users/{parentUid}.
        const registrationApp = getApps().find(a => a.name === 'RegistrationAuth') || initializeApp(firebaseConfig, 'RegistrationAuth');
        const regAuth = getAuth(registrationApp);

        try {
          const userCred = await createUserWithEmailAndPassword(regAuth, effectiveParentEmail, parentPassword);
          parentUid = userCred.user.uid;
          await signOut(regAuth);
        } catch (authErr: any) {
          if (authErr.code === 'auth/email-already-in-use') {
            try {
              const cred = await signInWithEmailAndPassword(regAuth, effectiveParentEmail, parentPassword);
              parentUid = cred.user.uid;
              await signOut(regAuth);
            } catch (signInErr: any) {
              console.error('[RegistrationPage] Existing user sign-in failed:', signInErr);
              throw new Error(
                'Questo indirizzo email risulta già registrato. Inserisci la password corretta del tuo account per completare la registrazione.'
              );
            }
          } else {
            throw authErr;
          }
        }
      } else {
        // Normal visitor / anonymous self-registration:
        // Create and authenticate directly on default auth instance so request.auth.uid == parentUid in Firestore rules
        try {
          const userCred = await createUserWithEmailAndPassword(auth, effectiveParentEmail, parentPassword);
          parentUid = userCred.user.uid;
        } catch (authErr: any) {
          if (authErr.code === 'auth/email-already-in-use') {
            try {
              const cred = await signInWithEmailAndPassword(auth, effectiveParentEmail, parentPassword);
              parentUid = cred.user.uid;
            } catch (signInErr: any) {
              console.error('[RegistrationPage] Existing user sign-in failed:', signInErr);
              throw new Error(
                'Questo indirizzo email risulta già registrato. Inserisci la password corretta del tuo account per completare la registrazione.'
              );
            }
          } else {
            throw authErr;
          }
        }
      }

      // 5. Save/update user record in Firestore 'users'
      const userRef = doc(db, 'users', parentUid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: parentUid,
          email: effectiveParentEmail,
          displayName: effectiveParentName,
          role: 'parent',
          schoolId: school.id,
          isActive: false, // Pending admin approval of the registration request
          createdAt: nowTimestamp(),
          updatedAt: nowTimestamp(),
        });
      } else {
        // If user document already exists, don't overwrite role, schoolId or deactivate an active parent account
        await setDoc(userRef, {
          displayName: effectiveParentName,
          updatedAt: nowTimestamp(),
        }, { merge: true });
      }

      // 6. Generate the signed registration PDF locally
      const studentData = {
        firstName: studentFirstName.trim(),
        lastName: studentLastName.trim(),
        gender: studentGender,
        dateOfBirth: studentBirthDate,
        fiscalCode: studentFiscalCode.trim().toUpperCase(),
        address: {
          street: addressStreet.trim(),
          city: addressCity.trim(),
          province: addressProvince.trim().toUpperCase(),
          postalCode: addressPostalCode.trim(),
        },
        contact: {
          studentPhone: studentPhone.trim() || undefined,
          studentEmail: studentEmail.trim() || undefined,
          parentName: isAdult ? undefined : parentName.trim(),
          parentRelation: effectiveParentRelation,
          parentPhone: effectiveParentPhone,
          parentEmail: effectiveParentEmail,
        }
      };

      const { blob: pdfBlob, hash: sha256Hash } = await generateRegistrationPdf(
        studentData,
        school,
        signatureBase64,
        fesMetadata,
        '2025/2026'
      );

      // 7. Upload PDF to Supabase Storage (Private Bucket)
      const mockStudentId = Math.random().toString(36).substring(2, 15);
      const pdfUrl = await uploadRegistrationForm(mockStudentId, pdfBlob);

      // Course interest names from selected course IDs
      const selectedCoursesList = courses.filter((c) => selectedCourseIds.includes(c.id));
      const courseInterestNames = selectedCoursesList.map((c) => c.name).join(', ');

      // 8. Create the registration request in Firestore using the service
      await submitRegistrationRequest(school.id, {
        parentName: effectiveParentName,
        parentEmail: effectiveParentEmail,
        parentPhone: effectiveParentPhone,
        parentRelation: effectiveParentRelation,
        parentUid,
        studentFirstName: studentFirstName.trim(),
        studentLastName: studentLastName.trim(),
        studentBirthDate,
        studentGender,
        studentFiscalCode: studentFiscalCode.trim().toUpperCase(),
        studentPhone: studentPhone.trim() || undefined,
        studentEmail: studentEmail.trim() || undefined,
        addressStreet,
        addressCity,
        addressProvince,
        addressPostalCode,
        courseInterest: courseInterestNames,
        courseIds: selectedCourseIds,
        signatureBase64,
        pdfUrl,
        sha256Hash,
        signatureMetadata: {
          ipAddress,
          timestamp,
          userAgent,
          sessionId,
          consents: {
            privacyCommon,
            privacySanitary,
          }
        }
      });

      // Indicizza il Codice Fiscale per bloccare doppioni immediati
      try {
        const cfDocRef = doc(db, 'schools', school.id, 'fiscalCodesIndex', studentFiscalCode.trim().toUpperCase());
        await setDoc(cfDocRef, {
          fiscalCode: studentFiscalCode.trim().toUpperCase(),
          status: 'pending',
          studentName: `${studentFirstName.trim()} ${studentLastName.trim()}`,
          createdAt: nowTimestamp(),
        });
      } catch (cfIdxErr) {
        console.warn('[RegistrationPage] Error indexing CF:', cfIdxErr);
      }

      setRequestSent(true);
      toast.success('Registrazione inviata con successo!');
    } catch (err: any) {
      console.error('[RegistrationPage] Error during self-registration submission:', err);
      toast.error(err.message || 'Errore durante la registrazione. Riprova più tardi.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-surface-950">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-white/50">Caricamento portale di iscrizione...</p>
        </div>
      </div>
    );
  }

  if (!school) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-surface-950">
        <EmptyState
          icon="⚠️"
          title="Link di iscrizione scaduto o non valido"
          description="Questo QR code di registrazione self-service non è attivo o è stato disabilitato dalla scuola."
          action={{
            label: "Accedi al Gestore",
            onClick: () => navigate('/login'),
          }}
        />
      </div>
    );
  }

  const privacyUrl = school?.customPrivacyUrl || `/privacy?schoolId=${school?.id || ''}`;
  const termsUrl = school?.customTermsUrl || `/terms?schoolId=${school?.id || ''}`;

  const stepsList = [
    { s: 1, label: 'Dati Anagrafici', icon: <User size={14} /> },
    { s: 2, label: 'Indirizzo & Corsi', icon: <MapPin size={14} /> },
    { s: 3, label: 'Firma Digitale', icon: <Shield size={14} /> },
  ];

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex items-center justify-center p-6 bg-surface-950 overflow-y-auto">
        <div className="max-w-xl w-full py-8 space-y-6">
          
          {/* Header */}
          <div className="text-center space-y-2">
            {school.logoURL ? (
              <img src={school.logoURL} alt={school.name} className="w-20 h-20 rounded-3xl mx-auto object-cover border border-white/10" />
            ) : (
              <div className="w-16 h-16 rounded-3xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-3xl mx-auto mb-2">
                💃
              </div>
            )}
            <h1 className="text-2xl font-bold font-display text-white">{school.name}</h1>
            <p className="text-sm text-white/50">Modulo di Registrazione Online</p>
          </div>

          {/* Progress bar (always 3 clean steps) */}
          {!requestSent && (
            <div className="flex items-center justify-between bg-black/20 p-4 rounded-2xl border border-white/5">
              {stepsList.map((item) => (
                <div key={item.s} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                    step === item.s 
                      ? 'bg-brand-500 text-white font-semibold shadow-lg shadow-brand-500/20' 
                      : step > item.s 
                        ? 'bg-teal-500/20 text-teal-400' 
                        : 'bg-white/5 text-white/40'
                  }`}>
                    {step > item.s ? '✓' : item.s}
                  </div>
                  <span className={`text-[11px] hidden sm:inline ${step === item.s ? 'text-white font-medium' : 'text-white/35'}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {requestSent ? (
            <Card className="text-center p-8 border border-teal-500/20 bg-teal-500/5 page-enter space-y-4">
              <div className="w-16 h-16 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center mx-auto mb-2">
                <CheckCircle size={36} />
              </div>
              <h2 className="text-xl font-bold text-white">Iscrizione Ricevuta! 🎉</h2>
              <p className="text-sm text-white/60 leading-relaxed max-w-md mx-auto">
                Il modulo firmato è stato inviato alla segreteria di Tropical Style Caribbean School.
                Riceverai conferma all'approvazione.
              </p>

              {currentUser?.role === 'parent' ? (
                <div className="pt-2 flex flex-col gap-3 max-w-sm mx-auto">
                  <p className="text-xs text-white/40">
                    Vuoi visualizzare il tuo profilo o iscrivere un altro allievo? Trovi tutto nel Portale.
                  </p>
                  <Button onClick={() => navigate('/parent')} className="w-full">
                    Vai al Portale Personale
                  </Button>
                </div>
              ) : currentUser ? (
                <div className="pt-2 flex flex-col gap-3 max-w-sm mx-auto">
                  <p className="text-xs text-white/40">
                    Iscrizione completata con successo. Torna al pannello di gestione della scuola.
                  </p>
                  <Button onClick={() => navigate('/settings')} className="w-full">
                    Torna alle Impostazioni
                  </Button>
                </div>
              ) : (
                <div className="pt-2 flex flex-col gap-3 max-w-sm mx-auto">
                  <p className="text-xs text-white/40">
                    Accedi con l'email e la password appena scelte per consultare pagamenti, orari e comunicazioni.
                  </p>
                  <Button onClick={() => navigate('/login')} className="w-full">
                    Vai all'Accesso
                  </Button>
                </div>
              )}
            </Card>
          ) : (
            <Card className="p-6 border border-white/5">
              <form onSubmit={handleSubmit} className="space-y-5">

                {/* ========================================================== */}
                {/* STEP 1: DATI ANAGRAFICI ALLIEVO (+ GENITORE SE MINORENNE) */}
                {/* ========================================================== */}
                {step === 1 && (
                  <div className="space-y-4 page-enter">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-brand-300 border-b border-white/5 pb-1 flex items-center gap-2">
                      <User size={15} /> 1. Dati Anagrafici Allievo
                    </CardTitle>

                    {currentUser && (
                      <div className="p-3 bg-brand-500/10 border border-brand-500/20 rounded-xl flex items-center gap-3">
                        <span className="text-lg">👋</span>
                        <div className="text-xs">
                          <p className="font-semibold text-white">Accesso rilevato: {currentUser.displayName}</p>
                          <p className="text-white/60">I tuoi dati sono stati precompilati per questa iscrizione.</p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="Nome Allievo *"
                        placeholder="Es. Mario"
                        value={studentFirstName}
                        onChange={(e) => setStudentFirstName(e.target.value)}
                        required
                      />
                      <Input
                        label="Cognome Allievo *"
                        placeholder="Es. Rossi"
                        value={studentLastName}
                        onChange={(e) => setStudentLastName(e.target.value)}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <Input
                          type="date"
                          label="Data di Nascita Allievo *"
                          value={studentBirthDate}
                          onChange={(e) => setStudentBirthDate(e.target.value)}
                          required
                        />
                      </div>
                      <Select
                        label="Sesso *"
                        value={studentGender}
                        onChange={(e) => setStudentGender(e.target.value)}
                        options={[
                          { value: 'F', label: 'Femmina' },
                          { value: 'M', label: 'Maschio' },
                          { value: 'Other', label: 'Altro' },
                        ]}
                      />
                    </div>

                    {/* Automatic age status feedback */}
                    {calculatedAge !== null && (
                      <div className="pt-0.5">
                        {!isMinor ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-semibold">
                            <span>✓</span> Data verificata: {calculatedAge} anni (Maggiorenne)
                          </div>
                        ) : (
                          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1">
                            <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                              <span>🧒</span> Allievo Minorenne rilevato: {calculatedAge} anni
                            </div>
                            <p className="text-[11px] text-amber-200/80 leading-relaxed">
                              In base alla data di nascita, l'iscrizione e la firma devono essere convalidate da un genitore o tutore legale. Compila i dati del referente qui sotto.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <Input
                      label="Codice Fiscale Allievo *"
                      placeholder="Codice Fiscale di 16 caratteri"
                      value={studentFiscalCode}
                      onChange={(e) => setStudentFiscalCode(e.target.value.toUpperCase())}
                      maxLength={16}
                      required
                    />

                    {/* SCENARIO 1: ALLIEVO MAGGIORENNE (nessun dato genitore richiesto) */}
                    {!isMinor && (
                      <div className="space-y-4 pt-2 border-t border-white/5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input
                            label="Cellulare Allievo *"
                            placeholder="Es. 347 1234567"
                            value={studentPhone}
                            onChange={(e) => setStudentPhone(e.target.value)}
                            required
                          />
                          <Input
                            type="email"
                            label="Email Allievo (Username Portale) *"
                            placeholder="mario.rossi@email.com"
                            value={studentEmail}
                            onChange={(e) => setStudentEmail(e.target.value)}
                            required
                            autoComplete="username"
                            disabled={!!currentUser}
                          />
                        </div>

                        {!currentUser ? (
                          <div>
                            <Input
                              type="password"
                              label="Crea Password Portale *"
                              placeholder="••••••••"
                              value={parentPassword}
                              onChange={(e) => setParentPassword(e.target.value)}
                              required
                              autoComplete="new-password"
                            />
                            <p className="text-[10px] text-white/40 mt-1">
                              Con questa password potrai accedere all'area riservata per consultare orari, pagamenti e ricevute. Minimo 6 caratteri.
                            </p>
                          </div>
                        ) : (
                          <div className="flex items-center text-xs text-brand-300 bg-black/20 p-3 rounded-xl border border-white/5">
                            ✓ Autenticato con account esistente ({currentUser.email}).
                          </div>
                        )}
                      </div>
                    )}

                    {/* SCENARIO 2: ALLIEVO MINORENNE (Espansione automatica Dati Genitore) */}
                    {isMinor && (
                      <div className="space-y-4 pt-3 border-t border-amber-500/20">
                        <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wider">
                          <User size={14} /> Dati Genitore o Tutore Legale
                        </div>

                        <Input
                          label="Nome e Cognome Genitore/Tutore *"
                          placeholder="Es. Maria Rossi"
                          value={parentName}
                          onChange={(e) => setParentName(e.target.value)}
                          required
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input
                            label="Telefono Genitore *"
                            placeholder="Es. 347 1234567"
                            value={parentPhone}
                            onChange={(e) => setParentPhone(e.target.value)}
                            required
                          />
                          <Select
                            label="Relazione con l'Allievo *"
                            value={parentRelation}
                            onChange={(e) => setParentRelation(e.target.value)}
                            options={[
                              { value: 'madre', label: 'Madre' },
                              { value: 'padre', label: 'Padre' },
                              { value: 'tutore', label: 'Tutore Legale' },
                            ]}
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input
                            type="email"
                            label="Email Genitore (Username Portale) *"
                            placeholder="genitore@email.com"
                            value={parentEmail}
                            onChange={(e) => setParentEmail(e.target.value)}
                            required
                            autoComplete="username"
                            disabled={!!currentUser}
                          />
                          {!currentUser ? (
                            <div>
                              <Input
                                type="password"
                                label="Password Portale Genitori *"
                                placeholder="••••••••"
                                value={parentPassword}
                                onChange={(e) => setParentPassword(e.target.value)}
                                required
                                autoComplete="new-password"
                              />
                              <p className="text-[10px] text-white/40 mt-1">
                                Se hai già iscritto un altro allievo con questa email, inserisci la stessa password.
                              </p>
                            </div>
                          ) : (
                            <div className="flex items-center text-xs text-brand-300 bg-black/20 p-3 rounded-xl border border-white/5">
                              ✓ Autenticato con account esistente.
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-white/5">
                          <p className="text-[11px] text-white/40 mb-2">Recapiti personali dell'allievo (facoltativi se minorenne):</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                              label="Telefono Allievo (Opzionale)"
                              placeholder="Es. 347 1234567"
                              value={studentPhone}
                              onChange={(e) => setStudentPhone(e.target.value)}
                            />
                            <Input
                              type="email"
                              label="Email Allievo (Opzionale)"
                              placeholder="allievo@email.com"
                              value={studentEmail}
                              onChange={(e) => setStudentEmail(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end pt-4 border-t border-white/5">
                      <Button type="button" onClick={handleNext} loading={checkingCF} iconRight={<ChevronRight size={16} />}>
                        Avanti (Residenza & Corsi)
                      </Button>
                    </div>
                  </div>
                )}

                {/* ========================================================== */}
                {/* STEP 2: RESIDENZA & SCELTA CORSI                           */}
                {/* ========================================================== */}
                {step === 2 && (
                  <div className="space-y-4 page-enter">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-brand-300 border-b border-white/5 pb-1 flex items-center gap-2">
                      <MapPin size={15} /> 2. Indirizzo di Residenza & Corsi
                    </CardTitle>

                    <Input
                      label="Indirizzo (Via/Piazza e Civico) *"
                      placeholder="Es. Via Roma 15"
                      value={addressStreet}
                      onChange={(e) => setAddressStreet(e.target.value)}
                      required
                    />

                    <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
                      <div className="col-span-2 md:col-span-2">
                        <Input
                          label="Città *"
                          placeholder="Es. Palermo"
                          value={addressCity}
                          onChange={(e) => setAddressCity(e.target.value)}
                          required
                        />
                      </div>
                      <div className="col-span-1 md:col-span-1">
                        <Input
                          label="Prov. *"
                          placeholder="PA"
                          maxLength={2}
                          value={addressProvince}
                          onChange={(e) => setAddressProvince(e.target.value.toUpperCase())}
                          required
                        />
                      </div>
                      <div className="col-span-3 md:col-span-1">
                        <Input
                          label="CAP *"
                          placeholder="90100"
                          maxLength={5}
                          value={addressPostalCode}
                          onChange={(e) => setAddressPostalCode(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-white/70 block">
                        Seleziona Corso/i di Interesse *
                      </label>
                      <p className="text-[11px] text-white/40">
                        Seleziona i corsi a cui {!isMinor ? 'desideri iscriverti' : "iscrivere l'allievo"}:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                        {courses.map((c) => {
                          const isSelected = selectedCourseIds.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedCourseIds(selectedCourseIds.filter((id) => id !== c.id));
                                } else {
                                  setSelectedCourseIds([...selectedCourseIds, c.id]);
                                }
                              }}
                              className={`text-left p-3 rounded-xl border transition-all flex items-start justify-between gap-2 cursor-pointer ${
                                isSelected
                                  ? 'bg-brand-500/20 border-brand-500/50 text-white shadow-md shadow-brand-500/10'
                                  : 'bg-black/20 border-white/10 text-white/70 hover:border-white/20'
                              }`}
                            >
                              <div>
                                <p className="text-xs font-bold text-white">{c.name}</p>
                                <p className="text-[10px] text-white/50">{c.style} · {c.fee?.monthly ? `€${c.fee.monthly}/mese` : 'Tariffa scuola'}</p>
                              </div>
                              <div className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                                isSelected ? 'bg-brand-500 text-white' : 'border border-white/20'
                              }`}>
                                {isSelected ? '✓' : ''}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {selectedCourseIds.length > 0 ? (
                        <p className="text-xs text-brand-300 font-medium pt-1">
                          ✓ {selectedCourseIds.length} {selectedCourseIds.length === 1 ? 'corso selezionato' : 'corsi selezionati'}:{' '}
                          {courses.filter((c) => selectedCourseIds.includes(c.id)).map((c) => c.name).join(', ')}
                        </p>
                      ) : (
                        <p className="text-xs text-amber-400/80 font-medium pt-1">
                          ⚠️ Seleziona almeno un corso per proseguire
                        </p>
                      )}
                    </div>

                    <div className="flex justify-between pt-4 border-t border-white/5">
                      <Button type="button" variant="secondary" onClick={handleBack} icon={<ChevronLeft size={16} />}>
                        Indietro
                      </Button>
                      <Button type="button" onClick={handleNext} iconRight={<ChevronRight size={16} />}>
                        Avanti (Consensi & Firma)
                      </Button>
                    </div>
                  </div>
                )}

                {/* ========================================================== */}
                {/* STEP 3: CONSENSI GDPR & FIRMA DIGITALE                    */}
                {/* ========================================================== */}
                {step === 3 && (
                  <div className="space-y-4 page-enter">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-brand-300 border-b border-white/5 pb-1 flex items-center gap-2">
                      <Shield size={15} /> 3. Consensi GDPR & Firma Digitale
                    </CardTitle>

                    {/* GDPR legal info preview box */}
                    <div className="p-4 bg-black/30 border border-white/5 rounded-2xl max-h-48 overflow-y-auto text-xs text-white/50 space-y-2 leading-relaxed scrollbar-thin">
                      <p className="font-semibold text-white/70">CONSENSO TRATTAMENTO DATI PERSONALI & LIBERATORIA FOTO/VIDEO</p>
                      <p>
                        In conformità al Regolamento UE 2016/679 (GDPR), si autorizza la scuola di danza al trattamento dei dati personali forniti
                        per le sole finalità istituzionali relative all'organizzazione e svolgimento dei corsi e delle attività didattiche.
                      </p>
                      <p>
                        Si presta il consenso alla pubblicazione di riprese video ed immagini fotografiche effettuate durante le attività e gli spettacoli della scuola 
                        al fine di promuovere le attività stesse tramite canali web, social o brochure informative.
                      </p>
                      <p>
                        Ci si assume l'impegno di presentare un certificato medico per attività sportiva non agonistica/agonistica avente data di validità coerente 
                        con l'intero anno accademico.
                      </p>
                    </div>

                    <div className="space-y-3 p-3.5 bg-brand-500/5 border border-brand-500/10 rounded-2xl text-xs text-brand-300">
                      <div className="flex items-start gap-2.5">
                        <input 
                          type="checkbox" 
                          id="privacyCommon" 
                          checked={privacyCommon}
                          onChange={(e) => setPrivacyCommon(e.target.checked)}
                          required 
                          className="mt-0.5 rounded border-white/10 text-brand-500 bg-black/40 focus:ring-brand-500 cursor-pointer" 
                        />
                        <label htmlFor="privacyCommon" className="cursor-pointer font-medium leading-tight select-none">
                          Dichiaro di aver letto e accettato l'
                          <a href={privacyUrl} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline font-semibold inline">Informativa Privacy</a>
                          {' '}e i{' '}
                          <a href={termsUrl} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline font-semibold inline">Termini di Servizio</a>
                          , acconsentendo al trattamento dei miei dati personali comuni e alla liberatoria per foto/video. *
                        </label>
                      </div>

                      <div className="flex items-start gap-2.5 border-t border-white/5 pt-3">
                        <input 
                          type="checkbox" 
                          id="privacySanitary" 
                          checked={privacySanitary}
                          onChange={(e) => setPrivacySanitary(e.target.checked)}
                          required 
                          className="mt-0.5 rounded border-white/10 text-brand-500 bg-black/40 focus:ring-brand-500 cursor-pointer" 
                        />
                        <label htmlFor="privacySanitary" className="cursor-pointer font-medium leading-tight select-none">
                          Acconsento al trattamento dei miei dati particolari e sanitari relativi all'idoneità fisica e sportiva (certificato medico) per le finalità organizzative. *
                        </label>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-white/70 block">
                        Firma Autografa {isMinor 
                          ? `del Genitore/Tutore (${parentName || 'Genitore'})` 
                          : `dell'Allievo (${studentFirstName} ${studentLastName})`} *
                      </label>
                      <SignaturePad ref={sigPadRef} />
                    </div>

                    <div className="flex justify-between pt-4 border-t border-white/5">
                      <Button type="button" variant="secondary" onClick={handleBack} icon={<ChevronLeft size={16} />} disabled={submitting}>
                        Indietro
                      </Button>
                      <Button type="submit" loading={submitting} className="btn-primary-gradient">
                        Invia Iscrizione Firmata
                      </Button>
                    </div>
                  </div>
                )}

              </form>
            </Card>
          )}

          <p className="text-center text-xs text-white/20">
            Tropical Style Caribbean School · © 2026 All rights reserved
          </p>
        </div>
      </div>
    </ErrorBoundary>
  );
}

