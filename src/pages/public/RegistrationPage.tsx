import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { Card, CardTitle, Input, Select, Button, EmptyState } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { COLLECTIONS, nowTimestamp } from '@/lib/converters';
import type { School, Course } from '@/types';
import toast from 'react-hot-toast';
import { SignaturePad, SignaturePadRef } from '@/components/registration/SignaturePad';
import { generateRegistrationPdf } from '@/services/pdf/RegistrationPdfBuilder';
import { uploadRegistrationForm } from '@/services/api/storageService';
import { submitRegistrationRequest } from '@/services/api/registrationService';
import { 
  User, Shield, MapPin, Clipboard, ChevronRight, ChevronLeft, CheckCircle 
} from 'lucide-react';

export default function RegistrationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const sigPadRef = useRef<SignaturePadRef>(null);

  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState<School | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  // --- WIZARD FORM STATES ---
  // Step 1: Parent Account (Registrant)
  const [parentName, setParentName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentPassword, setParentPassword] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentRelation, setParentRelation] = useState('madre'); // madre, padre, tutore, allievo (se maggiorenne)

  // Step 2: Student Info
  const [studentFirstName, setStudentFirstName] = useState('');
  const [studentLastName, setStudentLastName] = useState('');
  const [studentBirthDate, setStudentBirthDate] = useState('');
  const [studentGender, setStudentGender] = useState('F');
  const [studentFiscalCode, setStudentFiscalCode] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [studentEmail, setStudentEmail] = useState('');

  // Step 3: Address & Course
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressProvince, setAddressProvince] = useState('');
  const [addressPostalCode, setAddressPostalCode] = useState('');
  const [courseInterest, setCourseInterest] = useState('');
  const [privacyCommon, setPrivacyCommon] = useState(false);
  const [privacySanitary, setPrivacySanitary] = useState(false);

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
          .map((d) => d.data() as Course)
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



  const handleNext = () => {
    if (step === 1) {
      if (!parentName.trim() || !parentEmail.trim() || !parentPassword.trim() || !parentPhone.trim()) {
        toast.error('Compila tutti i campi obbligatori del referente.');
        return;
      }
      if (parentPassword.length < 6) {
        toast.error('La password deve essere di almeno 6 caratteri.');
        return;
      }
    }
    if (step === 2) {
      if (!studentFirstName.trim() || !studentLastName.trim() || !studentBirthDate.trim() || !studentFiscalCode.trim()) {
        toast.error("Compila tutti i campi obbligatori dell'allievo.");
        return;
      }
      if (studentFiscalCode.length !== 16) {
        toast.error('Il Codice Fiscale deve contenere 16 caratteri.');
        return;
      }
    }
    if (step === 3) {
      if (!addressStreet.trim() || !addressCity.trim() || !addressProvince.trim() || !addressPostalCode.trim() || !courseInterest) {
        toast.error('Compila tutti i campi di residenza e seleziona un corso.');
        return;
      }
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
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

      // 4. Create Parent account in Firebase Auth
      const userCred = await createUserWithEmailAndPassword(auth, parentEmail, parentPassword);
      const parentUid = userCred.user.uid;

      // 5. Save parent record to Firestore 'users'
      const userRef = doc(db, 'users', parentUid);
      await setDoc(userRef, {
        uid: parentUid,
        email: parentEmail,
        displayName: parentName,
        role: 'parent',
        schoolId: school.id,
        isActive: false, // Pending admin approval of the registration request
        createdAt: nowTimestamp(),
        updatedAt: nowTimestamp(),
      });

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
          parentName: parentName.trim(),
          parentRelation: parentRelation,
          parentPhone: parentPhone.trim(),
          parentEmail: parentEmail.trim(),
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

      // 8. Create the registration request in Firestore using the service
      await submitRegistrationRequest(school.id, {
        parentName,
        parentEmail,
        parentPhone,
        parentRelation,
        parentUid,
        studentFirstName,
        studentLastName,
        studentBirthDate,
        studentGender,
        studentFiscalCode,
        studentPhone: studentPhone || undefined,
        studentEmail: studentEmail || undefined,
        addressStreet,
        addressCity,
        addressProvince,
        addressPostalCode,
        courseInterest,
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

          {/* Progress bar */}
          {!requestSent && (
            <div className="flex items-center justify-between bg-black/20 p-4 rounded-2xl border border-white/5">
              {[
                { s: 1, label: 'Genitore', icon: <User size={14} /> },
                { s: 2, label: 'Allievo', icon: <Clipboard size={14} /> },
                { s: 3, label: 'Indirizzo', icon: <MapPin size={14} /> },
                { s: 4, label: 'Firma', icon: <Shield size={14} /> },
              ].map((item) => (
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
            <Card className="text-center p-8 border border-teal-500/20 bg-teal-500/5 page-enter">
              <div className="w-16 h-16 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={36} />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Iscrizione Ricevuta!</h2>
              <p className="text-sm text-white/60 mb-6 leading-relaxed">
                Il modulo firmato e i dati dell'allievo sono stati inviati alla segreteria della scuola.
                La segreteria verificherà la richiesta e ti invierà una mail di conferma ad iscrizione approvata.
              </p>
              <Button onClick={() => navigate('/login')} className="w-full">
                Vai all'Accesso
              </Button>
            </Card>
          ) : (
            <Card className="p-6 border border-white/5">
              <form onSubmit={handleSubmit} className="space-y-4">

                {/* STEP 1: REFERENTE ACCOUNT */}
                {step === 1 && (
                  <div className="space-y-4 page-enter">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-brand-300 border-b border-white/5 pb-1 flex items-center gap-2">
                      <User size={15} /> 1. Dati Genitore o Referente
                    </CardTitle>

                    <Input
                      label="Nome e Cognome Genitore/Referente *"
                      placeholder="Es. Maria Rossi"
                      value={parentName}
                      onChange={(e) => setParentName(e.target.value)}
                      required
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        type="email"
                        label="Email Referente (Username) *"
                        placeholder="genitore@email.com"
                        value={parentEmail}
                        onChange={(e) => setParentEmail(e.target.value)}
                        required
                      />
                      <Input
                        type="password"
                        label="Scegli Password (min. 6 car.) *"
                        placeholder="••••••••"
                        value={parentPassword}
                        onChange={(e) => setParentPassword(e.target.value)}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="Telefono Referente *"
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
                          { value: 'allievo', label: 'Se stesso (Allievo Maggiorenne)' },
                        ]}
                      />
                    </div>

                    <div className="flex justify-end pt-4 border-t border-white/5">
                      <Button type="button" onClick={handleNext} iconRight={<ChevronRight size={16} />}>
                        Avanti
                      </Button>
                    </div>
                  </div>
                )}

                {/* STEP 2: DATI ALLIEVO */}
                {step === 2 && (
                  <div className="space-y-4 page-enter">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-brand-300 border-b border-white/5 pb-1 flex items-center gap-2">
                      <Clipboard size={15} /> 2. Anagrafica dell'Allievo
                    </CardTitle>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="Nome Figlio/Allievo *"
                        placeholder="Es. Sofia"
                        value={studentFirstName}
                        onChange={(e) => setStudentFirstName(e.target.value)}
                        required
                      />
                      <Input
                        label="Cognome Figlio/Allievo *"
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
                        label="Sesso Allievo *"
                        value={studentGender}
                        onChange={(e) => setStudentGender(e.target.value)}
                        options={[
                          { value: 'F', label: 'Femmina' },
                          { value: 'M', label: 'Maschio' },
                          { value: 'Other', label: 'Altro' },
                        ]}
                      />
                    </div>

                    <Input
                      label="Codice Fiscale Allievo *"
                      placeholder="Codice Fiscale di 16 caratteri"
                      value={studentFiscalCode}
                      onChange={(e) => setStudentFiscalCode(e.target.value.toUpperCase())}
                      maxLength={16}
                      required
                    />

                    <p className="text-xs text-white/40 italic">
                      Se l'allievo è minorenne, inserisci i contatti del genitore nei recapiti sottostanti se non ne possiede di propri.
                    </p>

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

                    <div className="flex justify-between pt-4 border-t border-white/5">
                      <Button type="button" variant="secondary" onClick={handleBack} icon={<ChevronLeft size={16} />}>
                        Indietro
                      </Button>
                      <Button type="button" onClick={handleNext} iconRight={<ChevronRight size={16} />}>
                        Avanti
                      </Button>
                    </div>
                  </div>
                )}

                {/* STEP 3: RESIDENZA E CORSO */}
                {step === 3 && (
                  <div className="space-y-4 page-enter">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-brand-300 border-b border-white/5 pb-1 flex items-center gap-2">
                      <MapPin size={15} /> 3. Indirizzo di Residenza & Corso
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
                          placeholder="Es. Milano"
                          value={addressCity}
                          onChange={(e) => setAddressCity(e.target.value)}
                          required
                        />
                      </div>
                      <div className="col-span-1 md:col-span-1">
                        <Input
                          label="Prov. *"
                          placeholder="MI"
                          maxLength={2}
                          value={addressProvince}
                          onChange={(e) => setAddressProvince(e.target.value.toUpperCase())}
                          required
                        />
                      </div>
                      <div className="col-span-3 md:col-span-1">
                        <Input
                          label="CAP *"
                          placeholder="20100"
                          maxLength={5}
                          value={addressPostalCode}
                          onChange={(e) => setAddressPostalCode(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <Select
                      label="Seleziona Corso di Interesse *"
                      value={courseInterest}
                      onChange={(e) => setCourseInterest(e.target.value)}
                      required
                      options={[
                        { value: '', label: 'Seleziona il corso...' },
                        ...courses.map((c) => ({ value: c.id, label: `${c.name} (${c.style} · €${c.fee.monthly}/mese)` }))
                      ]}
                    />

                    <div className="flex justify-between pt-4 border-t border-white/5">
                      <Button type="button" variant="secondary" onClick={handleBack} icon={<ChevronLeft size={16} />}>
                        Indietro
                      </Button>
                      <Button type="button" onClick={handleNext} iconRight={<ChevronRight size={16} />}>
                        Avanti
                      </Button>
                    </div>
                  </div>
                )}

                {/* STEP 4: PRIVACY E SIGNATURE CANVAS */}
                {step === 4 && (
                  <div className="space-y-4 page-enter">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-brand-300 border-b border-white/5 pb-1 flex items-center gap-2">
                      <Shield size={15} /> 4. Consensi GDPR & Firma Digitale
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
                        Firma Autografa del Referente ({parentName || 'Genitore'}) *
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
            DanceFlow FES Security Node · © 2026 All rights reserved
          </p>
        </div>
      </div>
    </ErrorBoundary>
  );
}
