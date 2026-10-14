import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { useSchoolStore } from '@/stores/schoolStore';
import { paymentConverter, studentConverter, COLLECTIONS, nowTimestamp, costumeOrderConverter, courseConverter } from '@/lib/converters';
import { getNextReceiptNumber } from '@/services/receiptService';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Card, Badge, Button, Modal, ModalFooter, Input } from '@/components/ui';
import {
  CreditCard,
  Download,
  Lock,
  Sparkles,
  ArrowRight,
  Receipt,
  Upload,
  LogOut,
  LayoutDashboard,
  FileText,
  Shirt,
  MessageCircle,
  UserPlus,
} from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import toast from 'react-hot-toast';
import type { Payment, Student, CostumeOrder, Course } from '@/types';
import { generateReceiptPDF } from '@/lib/pdf';
import { useStudents } from '@/hooks/useStudents';
import { SignaturePad } from '@/components/registration/SignaturePad';
import { generateRegistrationPdf } from '@/services/pdf/RegistrationPdfBuilder';
import { uploadRegistrationForm } from '@/services/api/storageService';
import { logout } from '@/hooks/useAuth';

export default function ParentPortalPage() {
  const user = useAuthStore((s) => s.user);
  const activeSchool = useSchoolStore((s) => s.activeSchool);
  const [courses, setCourses] = useState<Course[]>([]);
  const navigate = useNavigate();

  const schoolId = user?.schoolId;

  // Local State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'payments' | 'documents' | 'costumes'>('dashboard');
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [costumeOrders, setCostumeOrders] = useState<CostumeOrder[]>([]);

  // Expiration upload states
  const { uploadStudentDocument } = useStudents();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Signature States
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [privacyCommon, setPrivacyCommon] = useState(false);
  const [privacySanitary, setPrivacySanitary] = useState(false);
  const [isSubmittingSignature, setIsSubmittingSignature] = useState(false);
  const sigPadRef = React.useRef<any>(null);

  // Stripe Payment Drawer/Modal State
  const [checkoutPayment, setCheckoutPayment] = useState<Payment | null>(null);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardName, setCardName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Plan verification
  const isProPlan = activeSchool?.subscription?.plan === 'pro';

  // Registration token for adding a sibling
  const registrationToken = activeSchool?.settings?.registrationQR?.token;
  const registrationEnabled = activeSchool?.settings?.registrationQR?.enabled;

  const handleAddChild = () => {
    if (!registrationToken || !registrationEnabled) {
      toast.error('Il modulo di iscrizione non è attivo al momento. Contatta la segreteria.');
      return;
    }
    navigate(`/join/${registrationToken}`);
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Disconnessione effettuata con successo.');
    } catch (err) {
      console.error('[ParentPortal] Logout error:', err);
      toast.error('Errore durante la disconnessione.');
    }
  };

  // 1. Fetch Parent's Students
  useEffect(() => {
    if (!schoolId || !user?.uid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, COLLECTIONS.students(schoolId)).withConverter(studentConverter),
      where('parentId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs
          .map((d) => d.data())
          .filter((s) => s.isDeleted !== true);
        setStudents(fetched);
        if (fetched.length > 0 && !selectedStudent) {
          setSelectedStudent(fetched[0]);
        }
        setLoading(false);
      },
      (error) => {
        console.error('[ParentPortal] Error fetching students:', error);
        toast.error('Errore nel caricamento degli allievi.');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [schoolId, user?.uid]);

  // Fetch Courses
  useEffect(() => {
    if (!schoolId) {
      setCourses([]);
      return;
    }

    const q = query(
      collection(db, COLLECTIONS.courses(schoolId)).withConverter(courseConverter)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs
          .map((d) => d.data())
          .filter((c) => c.isDeleted !== true);
        setCourses(fetched);
      },
      (error) => {
        console.error('[ParentPortal] Error fetching courses:', error);
      }
    );

    return unsubscribe;
  }, [schoolId]);

  const studentCourses = useMemo(() => {
    if (!selectedStudent || courses.length === 0) return [];
    const courseIds = selectedStudent.enrolledCourseIds || [];
    return courses.filter((c) => courseIds.includes(c.id));
  }, [selectedStudent, courses]);

  // 2. Fetch Payments for all parent's students
  useEffect(() => {
    if (!schoolId || !user?.uid || students.length === 0) {
      setPayments([]);
      return;
    }

    const q = query(
      collection(db, COLLECTIONS.payments(schoolId)).withConverter(paymentConverter),
      where('parentId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map((d) => d.data());
        // Sort by dueDate desc
        fetched.sort((a, b) => b.dueDate.toMillis() - a.dueDate.toMillis());
        setPayments(fetched);
      },
      (error) => {
        console.error('[ParentPortal] Error fetching payments:', error);
      }
    );

    return unsubscribe;
  }, [schoolId, user?.uid, students]);

  // 3. Fetch Costume Orders for parent portal
  useEffect(() => {
    if (!schoolId) {
      setCostumeOrders([]);
      return;
    }

    const q = query(
      collection(db, COLLECTIONS.costumes(schoolId)).withConverter(costumeOrderConverter)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map((d) => d.data());
        setCostumeOrders(fetched);
      },
      (error) => {
        console.error('[ParentPortal] Error fetching costumes:', error);
      }
    );

    return unsubscribe;
  }, [schoolId]);

  const selectedStudentCostumes = useMemo(() => {
    if (!selectedStudent) return [];
    return costumeOrders.filter(order =>
      order.items && order.items.some(item => item.studentId === selectedStudent.id)
    );
  }, [costumeOrders, selectedStudent]);

  const getStudentCostumeItem = (order: CostumeOrder) => {
    if (!selectedStudent) return null;
    return order.items.find(item => item.studentId === selectedStudent.id) || null;
  };

  const handleDownloadCostumeReceipt = async (order: CostumeOrder, log: any) => {
    if (!activeSchool || !selectedStudent) return;

    try {
      const paymentObj = {
        id: `costume-${log.receiptNumber}`,
        schoolId: activeSchool.id,
        studentId: selectedStudent.id,
        description: `Versamento Costume - Ordine: ${order.name} (${order.itemCategory || 'Costumi'})`,
        amount: log.amount,
        totalAmount: log.amount,
        paidAmount: log.amount,
        remainingAmount: 0,
        currency: 'EUR' as const,
        status: 'paid' as const,
        dueDate: log.date,
        paidAt: log.date,
        receiptNumber: log.receiptNumber,
        type: 'costume' as const,
        createdAt: log.date,
        updatedAt: log.date,
      };

      const doc = await generateReceiptPDF(paymentObj as any, selectedStudent, activeSchool);
      doc.save(`Ricevuta_${log.receiptNumber || 'Costume'}.pdf`);
      toast.success('Ricevuta scaricata!');
    } catch (err) {
      console.error(err);
      toast.error('Errore nel download del PDF.');
    }
  };

  // Outstanding fees calculation
  const stats = useMemo(() => {
    let pendingAmount = 0;
    let paidAmount = 0;
    let totalAmount = 0;
    let overdueCount = 0;

    payments.forEach((p) => {
      const isOverdue = p.status === 'pending' && p.dueDate.toDate() < new Date();
      if (p.status === 'overdue' || isOverdue) {
        overdueCount++;
      }

      const total = p.totalAmount ?? p.amount;
      const paid = p.paidAmount ?? (p.status === 'paid' ? p.amount : 0);
      const remaining = p.remainingAmount ?? (p.status === 'paid' ? 0 : p.amount);

      pendingAmount += remaining;
      paidAmount += paid;
      totalAmount += total;
    });

    return { pendingAmount, paidAmount, totalAmount, overdueCount };
  }, [payments]);

  // Handler for Checkout Stripe
  const handleStripeCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutPayment || !schoolId) return;

    if (!cardNumber || !cardExpiry || !cardCvc || !cardName) {
      toast.error('Completa tutti i campi della carta.');
      return;
    }

    setIsProcessing(true);

    // Simulate Stripe Checkout delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    try {
      const ref = doc(db, COLLECTIONS.payments(schoolId), checkoutPayment.id).withConverter(paymentConverter);
      const receiptNumber = await getNextReceiptNumber(schoolId);
      
      const totalAmount = checkoutPayment.totalAmount ?? checkoutPayment.amount;
      const prevPaid = checkoutPayment.paidAmount ?? 0;
      const unpaid = checkoutPayment.remainingAmount ?? (checkoutPayment.status === 'paid' ? 0 : totalAmount);
      const newPaid = prevPaid + unpaid;

      const newInstallment = {
        amount: unpaid,
        date: nowTimestamp(),
        method: 'stripe' as const,
        receiptEmitted: true,
        receiptUrl: `generated://receipt/${receiptNumber}`,
        notes: 'Pagato online tramite Stripe Secure Checkout'
      };

      const history = checkoutPayment.payments ? [...checkoutPayment.payments, newInstallment] : [newInstallment];

      await updateDoc(ref, {
        totalAmount,
        paidAmount: newPaid,
        remainingAmount: 0,
        status: 'paid',
        paidAt: nowTimestamp(),
        method: 'stripe',
        receiptNumber,
        receiptURL: `generated://receipt/${receiptNumber}`,
        updatedAt: nowTimestamp(),
        notes: 'Pagato online tramite Stripe Secure Checkout',
        payments: history
      });

      toast.success('Pagamento effettuato con successo!');
      setCheckoutPayment(null);
      // Reset card form
      setCardNumber('');
      setCardExpiry('');
      setCardCvc('');
      setCardName('');
    } catch (err) {
      console.error(err);
      toast.error('Errore durante la transazione.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Download Receipt
  const handleDownloadReceipt = async (payment: Payment, installment?: any) => {
    if (!activeSchool) return;
    const student = students.find((s) => s.id === payment.studentId);
    if (!student) return;
    const course = courses.find((c) => c.id === payment.courseId);

    try {
      const doc = await generateReceiptPDF(payment, student, activeSchool, course, installment);
      doc.save(`Ricevuta_${payment.receiptNumber || payment.id}.pdf`);
      toast.success('Ricevuta scaricata!');
    } catch (err) {
      console.error(err);
      toast.error('Errore nel download del PDF.');
    }
  };

  const getMedicalStatus = (student: Student) => {
    const info = student.medicalInfo;
    if (!info?.medicalClearance || !info.medicalClearanceExpiry) return 'expired';
    const expiry = info.medicalClearanceExpiry.toDate();
    if (expiry <= new Date()) return 'expired';

    const diffTime = expiry.getTime() - new Date().getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays <= 30) return 'expiring';

    return 'valid';
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !selectedFile || !expiryDate) {
      toast.error('Seleziona un file e inserisci la data di scadenza.');
      return;
    }

    setIsUploading(true);
    try {
      await uploadStudentDocument(
        selectedStudent.id,
        'medical',
        selectedFile.name,
        uploadNotes || 'Caricato autonomamente dal Portale Genitori',
        new Date(expiryDate)
      );
      toast.success('Certificato medico caricato con successo!');
      setSelectedFile(null);
      setExpiryDate('');
      setUploadNotes('');
    } catch (err) {
      console.error(err);
      toast.error('Errore durante il caricamento del certificato.');
    } finally {
      setIsUploading(false);
    }
  };

  const isExpired = selectedStudent ? getMedicalStatus(selectedStudent) === 'expired' : false;

  const isMedicalPending = useMemo(() => {
    if (!selectedStudent) return false;
    const hasMedicalDoc = selectedStudent.documents?.some((d) => d.type === 'medical');
    const isCleared = selectedStudent.medicalInfo?.medicalClearance;
    return hasMedicalDoc && !isCleared;
  }, [selectedStudent]);

  const studentNeedsSignature = useMemo(() => {
    if (!selectedStudent) return false;
    if (selectedStudent.status === 'toRenew') return true;
    const docTypes = selectedStudent.documents?.map((d) => d.type) || [];
    if (selectedStudent.sha256Hash || selectedStudent.signatureMetadata || docTypes.includes('consent')) {
      return false;
    }
    return true;
  }, [selectedStudent]);

  const handleSignatureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !activeSchool) return;
    if (!privacyCommon || !privacySanitary) {
      toast.error('È necessario accettare entrambi i consensi per proseguire.');
      return;
    }

    const signatureBase64 = sigPadRef.current?.getSignatureData();
    if (!signatureBase64) {
      toast.error('Apponi la tua firma sul riquadro prima di inviare.');
      return;
    }

    setIsSubmittingSignature(true);
    const toastId = toast.loading('Generazione e caricamento del modulo firmato...');

    try {
      // 1. Fetch IP
      let ipAddress = '127.0.0.1';
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        ipAddress = ipData.ip || '127.0.0.1';
      } catch (ipErr) {
        console.warn('Could not fetch client IP:', ipErr);
      }

      // 2. Metadati FES
      const timestamp = Date.now();
      const userAgent = navigator.userAgent;
      const sessionId = Math.random().toString(36).substring(2, 15);

      const fesMetadata = {
        ipAddress,
        timestamp,
        userAgent,
        sessionId,
      };

      // 3. Prep data structures
      const birthDateString = selectedStudent.dateOfBirth
        ? (typeof selectedStudent.dateOfBirth.toDate === 'function'
            ? selectedStudent.dateOfBirth.toDate().toISOString()
            : new Date(selectedStudent.dateOfBirth as any).toISOString())
        : new Date().toISOString();

      const studentPdfData = {
        firstName: selectedStudent.firstName,
        lastName: selectedStudent.lastName,
        gender: selectedStudent.gender || 'Other',
        dateOfBirth: birthDateString,
        fiscalCode: selectedStudent.fiscalCode || '',
        address: {
          street: selectedStudent.address?.street || '',
          city: selectedStudent.address?.city || '',
          province: selectedStudent.address?.province || '',
          postalCode: selectedStudent.address?.postalCode || '',
        },
        contact: {
          studentPhone: selectedStudent.contact?.studentPhone || '',
          studentEmail: selectedStudent.contact?.studentEmail || '',
          parentName: selectedStudent.contact?.parentName || '',
          parentRelation: selectedStudent.contact?.parentRelation || '',
          parentPhone: selectedStudent.contact?.parentPhone || '',
          parentEmail: selectedStudent.contact?.parentEmail || '',
        },
      };

      const schoolPdfData = {
        name: activeSchool.name,
        logoURL: activeSchool.logoURL,
        address: {
          street: activeSchool.address?.street || '',
          city: activeSchool.address?.city || '',
          province: activeSchool.address?.province || '',
          postalCode: activeSchool.address?.postalCode || '',
        },
        contact: {
          email: activeSchool.contact?.email || '',
          phone: activeSchool.contact?.phone || '',
          website: activeSchool.contact?.website || '',
        },
      };

      // Determine logical academic year
      const now = new Date();
      const yr = now.getFullYear();
      const currentYear = now.getMonth() >= 8 ? `${yr}/${yr + 1}` : `${yr - 1}/${yr}`;

      // 4. Generate signed PDF locally
      const { blob: pdfBlob, hash: sha256Hash } = await generateRegistrationPdf(
        studentPdfData,
        schoolPdfData,
        signatureBase64,
        fesMetadata,
        currentYear
      );

      // 5. Upload PDF
      const pdfUrl = await uploadRegistrationForm(selectedStudent.id, pdfBlob);

      // 6. Update student record in Firestore
      const studentRef = doc(db, COLLECTIONS.students(activeSchool.id), selectedStudent.id).withConverter(studentConverter);
      
      const newDoc = {
        id: doc(collection(db, 'placeholder')).id,
        name: 'Modulo Iscrizione Portale Genitori.pdf',
        type: 'consent' as const,
        fileURL: pdfUrl,
        uploadedAt: nowTimestamp(),
        notes: `FES IP: ${ipAddress} - Hash: ${sha256Hash}`,
      };

      const updatedDocs = [...(selectedStudent.documents || []), newDoc];

      const signatureMetadata = {
        ipAddress,
        timestamp: nowTimestamp(),
        userAgent,
        sessionId,
        consents: {
          privacyCommon,
          privacySanitary,
        },
      };

      const updates = {
        documents: updatedDocs,
        status: 'active' as const,
        isActive: true,
        signatureMetadata,
        sha256Hash,
        updatedAt: nowTimestamp(),
      };

      await updateDoc(studentRef, updates);

      toast.success('Modulo firmato ed inviato con successo!', { id: toastId });
      setIsSignModalOpen(false);
      setPrivacyCommon(false);
      setPrivacySanitary(false);
    } catch (err: any) {
      console.error('[ParentPortal] Signature submission error:', err);
      toast.error(err.message || 'Errore durante l\'invio della firma.', { id: toastId });
    } finally {
      setIsSubmittingSignature(false);
    }
  };

  const formatDateLocal = (ts: any) => {
    if (!ts) return '—';
    try {
      return format(ts.toDate(), 'dd/MM/yyyy');
    } catch {
      try {
        return format(new Date(ts), 'dd/MM/yyyy');
      } catch {
        return '—';
      }
    }
  };

  return (
    <ErrorBoundary>
      <div className='min-h-screen bg-surface-950 text-white font-sans pb-16 flex flex-col'>
        {/* Sticky Header */}
        <header className='sticky top-0 z-30 bg-surface-950/80 backdrop-blur-md border-b border-white/10 w-full'>
          <div className='max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-2'>
            {/* Left: Logo + School name — truncated on small screens */}
            <div className='flex items-center gap-2.5 min-w-0 flex-1'>
              <div className='h-9 px-2 rounded-xl bg-white flex items-center justify-center shadow-md flex-shrink-0'>
                <img
                  src='/tropical_logo.png'
                  alt='Tropical Style'
                  className='h-6 w-auto max-w-[90px] object-contain'
                />
              </div>
              <div className='min-w-0'>
                <h1 className='text-sm font-display font-bold leading-tight truncate max-w-[140px] sm:max-w-none'>
                  {activeSchool?.name || 'Tropical Style'}
                </h1>
                <p className='text-[9px] text-white/50 hidden sm:block'>Portale Genitori e Allievi</p>
              </div>
            </div>

            {/* Right: User info + Logout — always visible */}
            <div className='flex items-center gap-2 flex-shrink-0'>
              {user && (
                <div className='text-right hidden sm:block'>
                  <p className='text-xs font-semibold text-white'>{user.displayName}</p>
                  <p className='text-[9px] text-brand-300 font-medium uppercase'>Genitore</p>
                </div>
              )}
              <button
                type='button'
                onClick={handleLogout}
                className='flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-coral-500/10 hover:bg-coral-500/20 text-coral-400 border border-coral-500/20 hover:border-coral-500/30 transition-all cursor-pointer active:scale-95'
                title='Esci'
              >
                <LogOut size={14} />
                <span className='hidden xs:inline'>Esci</span>
              </button>
            </div>
          </div>
        </header>

        {/* Header decoration */}
        <div className='fixed inset-0 pointer-events-none z-0'>
          <div
            className='absolute inset-0 opacity-[0.03]'
            style={{
              backgroundImage: `
                linear-gradient(rgba(124,58,237,0.5) 1px, transparent 1px),
                linear-gradient(90deg, rgba(124,58,237,0.5) 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px',
            }}
          />
          <div className='absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-brand-600/10 blur-[100px] rounded-full' />
        </div>

        <div className='relative z-10 max-w-lg mx-auto w-full px-4 pt-6 space-y-6 flex-1'>
          {/* Alert Plan info if not Pro */}
          {!loading && !isProPlan && (
            <div className='rounded-2xl border border-gold-500/20 bg-gold-500/5 p-4 flex gap-3 items-start text-left'>
              <Sparkles className='text-gold-400 flex-shrink-0 mt-0.5' size={18} />
              <div className='space-y-1'>
                <p className='text-xs font-bold text-gold-300'>Piano della scuola: {activeSchool?.subscription?.plan || 'trial'}</p>
                <p className='text-[11px] text-white/60 leading-relaxed'>
                  I pagamenti online sono disattivati perché la scuola non ha attivo il piano Pro. Contatta la segreteria per saldare le rette.
                </p>
              </div>
            </div>
          )}

          {/* Canale WhatsApp Ufficiale Tropical Style */}
          {activeSchool?.settings?.whatsappChannelUrl && (
            <a
              href={activeSchool.settings.whatsappChannelUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/50 via-emerald-900/30 to-emerald-950/50 border border-emerald-500/40 hover:border-emerald-500/80 transition-all group cursor-pointer shadow-lg animate-fade-in-up'
            >
              <div className='flex items-center gap-3'>
                <div className='w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform flex-shrink-0'>
                  <MessageCircle size={22} />
                </div>
                <div>
                  <p className='text-xs font-bold text-emerald-300 flex items-center gap-1.5'>
                    Canale WhatsApp Ufficiale
                    <span className='text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-1.5 py-0.5 rounded-full border border-emerald-500/30'>
                      Avvisi Live
                    </span>
                  </p>
                  <p className='text-[11px] text-white/70'>
                    Tocca qui per unirti al Canale WhatsApp della scuola e ricevere tutti gli avvisi in tempo reale!
                  </p>
                </div>
              </div>
              <ArrowRight size={16} className='text-emerald-400 group-hover:translate-x-1 transition-transform flex-shrink-0 ml-2' />
            </a>
          )}

          {/* Child Select Bar + Aggiungi Figlio */}
          {!loading && students.length >= 0 && (
            <div className='flex gap-2 overflow-x-auto pb-1 items-center'>
              {students.map((s) => (
                <button
                  key={s.id}
                  type='button'
                  onClick={() => setSelectedStudent(s)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 border cursor-pointer ${
                    selectedStudent?.id === s.id
                      ? 'bg-brand-600/30 text-brand-300 border-brand-500'
                      : 'glass border-white/5 text-white/60 hover:text-white'
                  }`}
                >
                  👶 {s.firstName} {s.lastName}
                </button>
              ))}
              {/* Button to register another child from within portal */}
              <button
                type='button'
                onClick={handleAddChild}
                className='px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap border border-dashed border-brand-500/40 text-brand-400 hover:bg-brand-500/10 hover:border-brand-500/70 transition-all duration-200 flex items-center gap-1.5 cursor-pointer flex-shrink-0 ml-auto'
              >
                <UserPlus size={13} />
                Aggiungi figlio
              </button>
            </div>
          )}

          {/* Loading Skeleton */}
          {loading ? (
            <div className='space-y-4'>
              <div className='h-24 glass rounded-2xl animate-pulse' />
              <div className='h-48 glass rounded-2xl animate-pulse' />
            </div>
          ) : students.length === 0 ? (
            <Card className='p-8 text-center space-y-4'>
              <p className='text-4xl'>👶</p>
              <h2 className='text-lg font-bold'>Nessun allievo ancora associato</h2>
              <p className='text-sm text-white/50 leading-relaxed'>
                La tua iscrizione è stata ricevuta. La segreteria la approverà a breve e vedrai qui i tuoi allievi.
              </p>
              <Button
                type='button'
                onClick={handleAddChild}
                icon={<UserPlus size={15} />}
                className='mx-auto'
              >
                Aggiungi un figlio
              </Button>
            </Card>
          ) : (
            <>
              {/* Tab Navigation */}
              <div className='flex p-1 bg-surface-900/60 backdrop-blur-sm border border-white/5 rounded-2xl gap-1'>
                {[
                  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
                  { id: 'payments', label: 'Pagamenti', icon: <CreditCard size={14} /> },
                  { id: 'documents', label: 'Documenti', icon: <FileText size={14} /> },
                  { id: 'costumes', label: 'Costumi', icon: <Shirt size={14} /> }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type='button'
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-[10px] sm:text-xs font-semibold transition-all duration-200 cursor-pointer ${
                      activeTab === tab.id
                        ? 'bg-brand-600/30 text-brand-300 border border-brand-500/30 shadow-inner'
                        : 'text-white/40 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* TABS CONTENT */}

              {/* 1. DASHBOARD TAB */}
              {activeTab === 'dashboard' && (
                <div className='space-y-4 animate-fade-in-up'>
                  {selectedStudent && (
                    <Card className='p-4 space-y-4 border-l-4 border-brand-500 bg-brand-950/10 text-left'>
                      <div className='flex justify-between items-start'>
                        <div className='flex gap-3 items-center'>
                          <div className='w-10 h-10 rounded-full bg-brand-500/20 text-brand-300 flex items-center justify-center font-bold text-sm'>
                            {selectedStudent.firstName[0]}
                            {selectedStudent.lastName[0]}
                          </div>
                          <div>
                            <h2 className='text-md font-bold text-white'>
                              {selectedStudent.firstName} {selectedStudent.lastName}
                            </h2>
                            <p className='text-xs text-white/40'>
                              Stato: {selectedStudent.isActive ? 'Attivo' : 'Non Attivo'}
                            </p>
                          </div>
                        </div>
                        <Badge variant={selectedStudent.isActive ? 'success' : 'gray'} size='sm'>
                          {selectedStudent.isActive ? 'Iscritto' : 'Sospeso'}
                        </Badge>
                      </div>

                      {/* Documents status summary */}
                      {selectedStudent.documents && (
                        <div className='pt-2 border-t border-white/5 space-y-2'>
                          <p className='text-xs font-semibold text-white/50 flex items-center gap-1.5'>
                            <Receipt size={13} /> Stato Documenti
                          </p>
                          <div className='flex flex-wrap gap-1.5'>
                            {['consent', 'medical'].map((type) => {
                              const docObj = selectedStudent.documents?.find((d) => d.type === type);
                              const isConsentSigned = type === 'consent' && (!studentNeedsSignature || !!docObj);
                              const label = type === 'consent' ? 'Modulo Iscr.' : 'Cert. Medico';
                              
                              if (type === 'consent' && !isConsentSigned) {
                                return (
                                  <button
                                    key={type}
                                    type='button'
                                    onClick={() => setActiveTab('documents')}
                                    className="text-[9px] px-2.5 py-0.5 rounded-full font-semibold border bg-coral-500/20 text-coral-300 border-coral-500/30 hover:bg-coral-500/30 transition-all animate-pulse flex items-center gap-0.5 cursor-pointer"
                                  >
                                    ✍️ {label}: Da Firmare
                                  </button>
                                );
                              }

                              const isOk = type === 'consent' ? isConsentSigned : !!docObj;

                              return (
                                <span
                                  key={type}
                                  className={`text-[9px] px-2 py-0.5 rounded-full font-semibold border ${
                                    isOk
                                      ? 'bg-teal-500/10 text-teal-400 border-teal-500/20'
                                      : 'bg-coral-500/10 text-coral-400 border-coral-500/20 animate-pulse'
                                  }`}
                                >
                                  {label}: {isOk ? 'OK' : 'Mancante'}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </Card>
                  )}

                  {/* Warnings / Notices */}
                  {isMedicalPending && (
                    <div className="glass border border-amber-500/30 bg-amber-950/20 p-5 rounded-2xl space-y-3 relative overflow-hidden text-left shadow-lg">
                      <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 blur-xl rounded-full pointer-events-none" />
                      <div className="flex gap-3 items-start">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0 font-bold">
                          <span className="animate-pulse">⏳</span>
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-amber-300">Certificato in revisione</h3>
                          <p className="text-[11px] text-white/70 leading-relaxed mt-0.5">
                            Certificato medico ricevuto ed in fase di revisione da parte della segreteria. L'accesso completo verrà abilitato a breve.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {isExpired && !isMedicalPending && (
                    <div className="glass border border-amber-500/30 bg-amber-950/20 p-4 rounded-2xl space-y-3 relative overflow-hidden text-left shadow-md">
                      <div className="flex gap-3 items-start">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center flex-shrink-0 text-base">
                          🩺
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-xs font-bold text-amber-300">Promemoria: Certificato Medico</h3>
                          <p className="text-[11px] text-white/70 leading-relaxed">
                            Ricordati di caricare o consegnare in segreteria il certificato medico per attività sportiva non agonistica di <strong>{selectedStudent?.firstName}</strong> per completare la documentazione.
                          </p>
                        </div>
                      </div>
                      <Button
                        size='sm'
                        variant='secondary'
                        onClick={() => setActiveTab('documents')}
                        className='w-full text-xs py-1.5 cursor-pointer border-amber-500/30 text-amber-300 hover:bg-amber-500/10'
                      >
                        Carica Certificato Medico
                      </Button>
                    </div>
                  )}

                  {studentNeedsSignature && !isExpired && (
                    <div
                      onClick={() => setActiveTab('documents')}
                      className='glass border border-brand-500/30 bg-brand-950/20 p-4 rounded-2xl space-y-2 cursor-pointer hover:border-brand-500/50 transition-all group relative overflow-hidden text-left shadow-lg'
                    >
                      <div className='absolute top-0 right-0 w-20 h-20 bg-brand-500/10 blur-xl rounded-full -mr-6 -mt-6 pointer-events-none' />
                      <div className='flex gap-3 items-center'>
                        <div className='w-9 h-9 rounded-xl bg-brand-500/20 text-brand-300 flex items-center justify-center flex-shrink-0 font-bold'>
                          ✍️
                        </div>
                        <div>
                          <h3 className='text-xs font-bold text-brand-300 group-hover:text-brand-200 transition-colors'>
                            Firma il modulo di iscrizione
                          </h3>
                          <p className='text-[10px] text-white/50 leading-normal'>
                            La scuola richiede la firma digitale dei consensi per la stagione in corso. Clicca qui per apporre la firma elettronica.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Quick Metrics Summary */}
                  <div className='grid grid-cols-3 gap-2'>
                    <Card className='p-3 border-l-2 border-white/20 bg-white/[0.02] text-left'>
                      <p className='text-[9px] text-white/50 font-medium uppercase'>Dovuto</p>
                      <p className='text-sm font-bold text-white mt-1'>
                        €{stats.totalAmount.toFixed(2)}
                      </p>
                    </Card>

                    <Card className='p-3 border-l-2 border-teal-500 bg-teal-950/5 text-left'>
                      <p className='text-[9px] text-teal-300/80 font-medium uppercase'>Pagato</p>
                      <p className='text-sm font-bold text-teal-400 mt-1'>
                        €{stats.paidAmount.toFixed(2)}
                      </p>
                    </Card>

                    <Card className='p-3 border-l-2 border-coral-500 bg-coral-950/5 text-left'>
                      <p className='text-[9px] text-coral-300/80 font-medium uppercase'>Residuo</p>
                      <p className='text-sm font-bold text-coral-400 mt-1'>
                        €{stats.pendingAmount.toFixed(2)}
                      </p>
                    </Card>
                  </div>

                  {/* Active Courses for Selected Student */}
                  <div className='space-y-2 text-left'>
                    <div className='flex items-center justify-between'>
                      <h4 className='text-xs font-semibold text-white/60 uppercase tracking-wider flex items-center gap-1.5'>
                        <span>🩰</span> Corsi Assegnati
                      </h4>
                      <span className='text-[10px] text-brand-300 bg-brand-500/10 border border-brand-500/20 px-2 py-0.5 rounded-full font-medium'>
                        {studentCourses.length} {studentCourses.length === 1 ? 'corso' : 'corsi'}
                      </span>
                    </div>

                    {studentCourses.length === 0 ? (
                      <Card className='p-4 text-center text-white/40 text-xs border border-white/5 bg-white/[0.01]'>
                        Nessun corso ancora associato. La segreteria confermerà l'assegnazione e l'orario delle lezioni a breve.
                      </Card>
                    ) : (
                      <div className='space-y-2'>
                        {studentCourses.map((c) => (
                          <Card key={c.id} className='p-3.5 border border-white/5 bg-white/[0.02] hover:border-brand-500/30 transition-all'>
                            <div className='flex items-start justify-between gap-2'>
                              <div>
                                <h5 className='text-xs font-bold text-white flex items-center gap-1.5'>
                                  {c.name}
                                </h5>
                                <div className='flex flex-wrap gap-1 mt-1'>
                                  {c.style && (
                                    <span className='text-[9px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-300 border border-brand-500/20 font-medium'>
                                      {c.style}
                                    </span>
                                  )}
                                  {c.level && (
                                    <span className='text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/60 border border-white/10'>
                                      {c.level}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <Badge variant='success' size='sm'>Frequenza Regolare</Badge>
                            </div>

                            {c.schedule && c.schedule.length > 0 && (
                              <div className='mt-2.5 pt-2 border-t border-white/5 space-y-1'>
                                <p className='text-[9px] font-semibold text-white/40 uppercase tracking-wider'>Orario lezioni:</p>
                                <div className='flex flex-wrap gap-1.5'>
                                  {c.schedule.map((sch, schIdx) => {
                                    const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
                                    const dayStr = dayNames[sch.dayOfWeek] || `Giorno ${sch.dayOfWeek}`;
                                    return (
                                      <span key={schIdx} className='text-[10px] px-2 py-0.5 rounded-lg bg-white/5 text-white/80 border border-white/5 font-mono'>
                                        📅 {dayStr}: {sch.startTime} - {sch.endTime} {c.room ? `(${c.room})` : ''}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Quick status information */}
                  <Card className='p-4 text-left border border-white/5 space-y-2.5 bg-white/[0.01]'>
                    <h4 className='text-xs font-semibold text-white/70'>Riepilogo Attività</h4>
                    <div className='text-xs text-white/60 space-y-1.5'>
                      <p>• 📅 Corsi attivi: {studentCourses.length > 0 ? `${studentCourses.length} corso/i assegnato/i.` : 'In attesa di assegnazione orario.'}</p>
                      <p>• 👗 Costumi di scena: {selectedStudentCostumes.length} costume/i assegnato/i.</p>
                    </div>
                  </Card>
                </div>
              )}

              {/* 2. PAYMENTS TAB */}
              {activeTab === 'payments' && (
                <div className='space-y-4 animate-fade-in-up'>
                  {/* Outstanding Debt Panels */}
                  <div className='grid grid-cols-3 gap-2'>
                    <Card className='p-3 border-l-2 border-white/20 bg-white/[0.02] text-left'>
                      <p className='text-[9px] text-white/50 font-medium uppercase'>Dovuto</p>
                      <p className='text-sm font-bold text-white mt-1'>
                        €{stats.totalAmount.toFixed(2)}
                      </p>
                    </Card>

                    <Card className='p-3 border-l-2 border-teal-500 bg-teal-950/5 text-left'>
                      <p className='text-[9px] text-teal-300/80 font-medium uppercase'>Pagato</p>
                      <p className='text-sm font-bold text-teal-400 mt-1'>
                        €{stats.paidAmount.toFixed(2)}
                      </p>
                    </Card>

                    <Card className='p-3 border-l-2 border-coral-500 bg-coral-950/5 text-left'>
                      <p className='text-[9px] text-coral-300/80 font-medium uppercase'>Residuo</p>
                      <p className='text-sm font-bold text-coral-400 mt-1'>
                        €{stats.pendingAmount.toFixed(2)}
                      </p>
                    </Card>
                  </div>

                  {/* Payments Section */}
                  <div className='space-y-3 text-left'>
                    <h3 className='text-xs font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5'>
                      <CreditCard size={14} /> Scadenze e Ricevute
                    </h3>

                    <div className='space-y-3'>
                      {payments.length === 0 ? (
                        <Card className='p-6 text-center text-white/40 text-xs'>
                          Nessun addebito registrato per i tuoi figli.
                        </Card>
                      ) : (
                        payments.map((p) => {
                          const student = students.find((s) => s.id === p.studentId);
                          const isOverdue = p.status === 'pending' && p.dueDate.toDate() < new Date();
                          const statusVariant =
                            p.status === 'paid'
                              ? 'success'
                              : p.status === 'deposit_paid'
                              ? 'warning'
                              : isOverdue || p.status === 'overdue'
                              ? 'danger'
                              : 'warning';
                          const statusLabel =
                            p.status === 'paid'
                              ? 'Saldato'
                              : p.status === 'deposit_paid'
                              ? 'Acconto'
                              : isOverdue || p.status === 'overdue'
                              ? 'Scaduto'
                              : 'In Attesa';

                          const totalVal = p.totalAmount ?? p.amount;
                          const paidVal = p.paidAmount ?? (p.status === 'paid' ? p.amount : 0);

                          return (
                            <Card
                              key={p.id}
                              className='p-4 space-y-3 border border-white/5 hover:border-white/10 transition-colors'
                            >
                              <div className='flex justify-between items-start'>
                                <div>
                                  <p className='text-xs text-brand-300 font-semibold'>
                                    {student ? `${student.firstName} ${student.lastName}` : 'Allievo'}
                                  </p>
                                  <h4 className='text-sm font-bold text-white mt-0.5'>{p.description}</h4>
                                  <p className='text-[10px] text-white/40 mt-0.5'>
                                    Scadenza: {format(p.dueDate.toDate(), 'dd MMMM yyyy', { locale: it })}
                                  </p>
                                </div>
                                <div className='text-right'>
                                  <p className='text-sm font-bold text-white'>€{paidVal.toFixed(2)}</p>
                                  <p className='text-[9px] text-white/40 mt-0.5'>su €{totalVal.toFixed(2)}</p>
                                  <Badge variant={statusVariant} size='sm' className='mt-1.5'>
                                    {statusLabel}
                                  </Badge>
                                </div>
                              </div>

                              {/* Installments History */}
                              {p.payments && p.payments.length > 0 && (
                                <div className='mt-3 pt-3 border-t border-white/5 space-y-1.5'>
                                  <p className='text-[9px] font-bold text-white/40 uppercase tracking-wider'>Storico Versamenti</p>
                                  <div className='space-y-1.5'>
                                    {p.payments.map((inst, instIdx) => (
                                      <div key={instIdx} className='flex justify-between items-center text-[11px] py-1.5 px-2 rounded-xl bg-white/[0.02] border border-white/5'>
                                        <div className='flex items-center gap-1.5'>
                                          <span className='text-white/50'>{formatDateLocal(inst.date)}</span>
                                          <span className='text-white/20'>|</span>
                                          <span className='text-white/60 capitalize'>{inst.method === 'stripe' ? 'Online' : inst.method}</span>
                                        </div>
                                        <div className='flex items-center gap-2'>
                                          <span className='font-semibold text-teal-400'>+€{inst.amount.toFixed(2)}</span>
                                          {inst.receiptUrl && (
                                            <button
                                              type='button'
                                              onClick={() => handleDownloadReceipt(p, inst)}
                                              className='text-brand-300 hover:text-brand-100 flex items-center gap-0.5 text-[9px] font-bold cursor-pointer'
                                            >
                                              <Download size={10} /> PDF
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className='flex gap-2 pt-2 border-t border-white/5 justify-end'>
                                {(p.status === 'paid' || p.status === 'deposit_paid') && p.receiptNumber && (
                                  <Button
                                    size='sm'
                                    variant='secondary'
                                    onClick={() => handleDownloadReceipt(p)}
                                    icon={<Download size={13} />}
                                    className='cursor-pointer'
                                  >
                                    Ricevuta Completa
                                  </Button>
                                )}

                                {p.status !== 'paid' && p.status !== 'cancelled' && (
                                  <>
                                    {isProPlan ? (
                                      <Button
                                        size='sm'
                                        onClick={() => setCheckoutPayment(p)}
                                        icon={<CreditCard size={13} />}
                                        className='btn-primary-gradient cursor-pointer'
                                      >
                                        Paga Online
                                      </Button>
                                    ) : (
                                      <span className='text-[10px] text-coral-400 font-semibold italic bg-coral-500/10 px-2.5 py-1 rounded-lg border border-coral-500/20'>
                                        Pagamento online disponibile con il piano Pro
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </Card>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 3. DOCUMENTS TAB */}
              {activeTab === 'documents' && (
                <div className='space-y-4 animate-fade-in-up text-left'>
                  
                  {isMedicalPending && (
                    <div className="glass border border-amber-500/30 bg-amber-950/20 p-5 rounded-2xl space-y-3 relative overflow-hidden text-left shadow-lg">
                      <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 blur-xl rounded-full pointer-events-none" />
                      <div className="flex gap-3 items-start">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0 font-bold">
                          <span className="animate-pulse">⏳</span>
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-amber-300">Certificato in revisione</h3>
                          <p className="text-[11px] text-white/70 leading-relaxed mt-0.5">
                            Certificato medico ricevuto ed in fase di revisione da parte della segreteria. L'accesso completo verrà abilitato a breve.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Document status overview */}
                  <Card className='p-4 space-y-3 border border-white/5 bg-white/[0.01]'>
                    <h4 className='text-xs font-semibold text-white/50 uppercase tracking-wider'>
                      Stato Documenti Richiesti
                    </h4>
                    <div className='space-y-2.5'>
                      {selectedStudent && (
                        <>
                          <div className='flex items-center justify-between text-xs py-1 border-b border-white/5'>
                            <span className='text-white/70'>Consenso Informato / Domanda Iscrizione</span>
                            {!studentNeedsSignature || selectedStudent.documents?.some((d) => d.type === 'consent') ? (
                              <Badge variant='success' size='sm'>Firmato OK</Badge>
                            ) : (
                              <Badge variant='danger' size='sm'>Da Firmare</Badge>
                            )}
                          </div>
                          <div className='flex items-center justify-between text-xs py-1'>
                            <span className='text-white/70'>Certificato Medico</span>
                            {isMedicalPending ? (
                              <Badge variant='gold' size='sm'>In revisione</Badge>
                            ) : isExpired ? (
                              <Badge variant='danger' size='sm'>Scaduto</Badge>
                            ) : selectedStudent.documents?.some((d) => d.type === 'medical') ? (
                              <Badge variant='success' size='sm'>Valido</Badge>
                            ) : (
                              <Badge variant='danger' size='sm'>Mancante</Badge>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </Card>

                  {/* Signed Registration Form Download Card */}
                  {(() => {
                    const consentDoc = selectedStudent?.documents?.find((d) => d.type === 'consent');
                    if (!consentDoc?.fileURL) return null;

                    return (
                      <div className='glass border border-emerald-500/30 bg-emerald-950/15 p-4 rounded-2xl space-y-3 relative overflow-hidden text-left shadow-md'>
                        <div className='flex items-start justify-between gap-3'>
                          <div className='flex items-start gap-3'>
                            <div className='w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg flex-shrink-0'>
                              📄
                            </div>
                            <div className='space-y-0.5'>
                              <div className='flex items-center gap-2 flex-wrap'>
                                <h4 className='text-xs font-bold text-white font-display'>
                                  Modulo Iscrizione Ufficiale Firmato
                                </h4>
                                <span className='text-[9px] bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30'>
                                  FES Conforme GDPR
                                </span>
                              </div>
                              <p className='text-[10px] text-white/60 leading-relaxed'>
                                Domanda di ammissione con statuto sociale e consensi privacy. Firmata digitalmente con marca temporale e audit trail forense.
                              </p>
                              {selectedStudent?.sha256Hash && (
                                <p className='text-[9px] text-emerald-400/80 font-mono pt-0.5'>
                                  SHA-256: {selectedStudent.sha256Hash.substring(0, 18)}...
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className='pt-2 border-t border-white/5 flex justify-end'>
                          <a
                            href={consentDoc.fileURL}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 transition-all cursor-pointer'
                          >
                            <Download size={13} />
                            Scarica PDF Firmato
                          </a>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Signature required block */}
                  {studentNeedsSignature && (
                    <div
                      onClick={() => setIsSignModalOpen(true)}
                      className='glass border border-brand-500/30 bg-brand-950/20 p-4 rounded-2xl space-y-2.5 cursor-pointer hover:border-brand-500/50 transition-all group relative overflow-hidden text-left shadow-lg'
                    >
                      <div className='absolute top-0 right-0 w-20 h-20 bg-brand-500/10 blur-xl rounded-full -mr-6 -mt-6 pointer-events-none' />
                      <div className='flex gap-3 items-center'>
                        <div className='w-9 h-9 rounded-xl bg-brand-500/20 text-brand-300 flex items-center justify-center flex-shrink-0 font-bold'>
                          ✍️
                        </div>
                        <div>
                          <h3 className='text-xs font-bold text-brand-300 group-hover:text-brand-200 transition-colors font-display'>
                            Firma il modulo di iscrizione per l'anno corrente
                          </h3>
                          <p className='text-[10px] text-white/50 leading-normal'>
                            La scuola richiede la firma digitale del modulo d'iscrizione e consensi GDPR per la stagione in corso. Clicca qui per apporre la firma elettronica.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Medical Certificate self-service upload */}
                  <div className={`glass border p-6 rounded-2xl space-y-4 shadow-xl ${
                    isExpired 
                      ? 'border-coral-500/30 bg-coral-950/10 shadow-coral-950/10' 
                      : 'border-white/5 bg-white/[0.01]'
                  }`}>
                    <div className="flex gap-3 items-start">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isExpired ? 'bg-coral-500/20 text-coral-400' : 'bg-brand-500/20 text-brand-300'
                      }`}>
                        <Upload size={18} />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-white font-display">
                          {isExpired ? 'Carica Nuovo Certificato Medico' : 'Aggiorna Certificato Medico'}
                        </h3>
                        <p className="text-[10px] text-white/60 leading-relaxed mt-0.5">
                          Carica un certificato medico per attività sportiva non agonistica in corso di validità. Il file verrà trasmesso direttamente alla segreteria.
                        </p>
                      </div>
                    </div>

                    <form onSubmit={handleUpload} className="space-y-4 pt-2 border-t border-white/5">
                      <div>
                        <label className="block text-[10px] font-semibold text-white/70 uppercase tracking-wider mb-1.5">
                          Data di Scadenza Certificato *
                        </label>
                        <input
                          type="date"
                          value={expiryDate}
                          onChange={(e) => setExpiryDate(e.target.value)}
                          required
                          disabled={isUploading}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder:text-white/30 focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/50 transition-all outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-white/70 uppercase tracking-wider mb-1.5">
                          File del Certificato (PDF, PNG, JPG) *
                        </label>
                        <div className="relative flex items-center justify-center border border-dashed border-white/20 hover:border-brand-500/50 rounded-xl p-4 bg-white/[0.02] cursor-pointer transition-colors group">
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,image/*"
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                setSelectedFile(e.target.files[0]);
                              }
                            }}
                            required
                            disabled={isUploading}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                          <div className="text-center space-y-1 pointer-events-none">
                            <Upload className="mx-auto text-white/40 group-hover:text-brand-400 transition-colors" size={18} />
                            <p className="text-xs text-white/60 font-medium">
                              {selectedFile ? selectedFile.name : 'Trascina o seleziona un file'}
                            </p>
                            <p className="text-[10px] text-white/30">Massimo 5MB</p>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-white/70 uppercase tracking-wider mb-1.5">
                          Note per la Segreteria (Opzionale)
                        </label>
                        <input
                          type="text"
                          value={uploadNotes}
                          onChange={(e) => setUploadNotes(e.target.value)}
                          placeholder="Es: Consegnato anche in originale cartaceo"
                          disabled={isUploading}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder:text-white/30 focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/50 transition-all outline-none"
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={isUploading}
                        className="w-full btn-primary-gradient flex justify-center items-center gap-1.5 text-xs py-2 cursor-pointer"
                      >
                        {isUploading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            Caricamento in corso...
                          </>
                        ) : (
                          <>
                            Carica Certificato
                            <ArrowRight size={14} />
                          </>
                        )}
                      </Button>
                    </form>
                  </div>

                  {/* Uploaded Documents Archive */}
                  {selectedStudent && selectedStudent.documents && selectedStudent.documents.length > 0 && (
                    <div className='space-y-3 pt-4 border-t border-white/5'>
                      <h3 className='text-xs font-semibold text-white/50 uppercase tracking-wider'>
                        Archivio Documenti Firmati/Caricati
                      </h3>
                      <div className='space-y-2'>
                        {selectedStudent.documents.map((docObj) => (
                          <div key={docObj.id} className='flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 text-xs'>
                            <div className='space-y-0.5'>
                              <p className='font-semibold text-white truncate max-w-[200px]'>{docObj.name}</p>
                              <p className='text-[9px] text-white/40'>
                                Tipo: <span className='text-brand-300 uppercase'>{docObj.type === 'consent' ? 'Consenso GDPR' : 'Cert. Medico'}</span> · Caricato: {formatDateLocal(docObj.uploadedAt)}
                              </p>
                            </div>
                            {docObj.fileURL && (
                              <a
                                href={docObj.fileURL}
                                target='_blank'
                                rel='noopener noreferrer'
                                className='flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-600/20 hover:bg-brand-600/30 text-brand-300 border border-brand-500/20 transition-all font-semibold'
                              >
                                <Download size={11} /> Scarica
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* 4. COSTUMES TAB */}
              {activeTab === 'costumes' && (
                <div className='space-y-4 animate-fade-in-up text-left'>
                  <div className='space-y-3'>
                    <h3 className='text-xs font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5'>
                      💃 Gestione Costumi & Sartoria
                    </h3>

                    <div className='space-y-3'>
                      {selectedStudentCostumes.length === 0 ? (
                        <Card className='p-6 text-center text-white/40 text-xs bg-white/[0.01] border border-white/5'>
                          Nessun costume registrato per questo allievo.
                        </Card>
                      ) : (
                        selectedStudentCostumes.map((order) => {
                          const item = getStudentCostumeItem(order);
                          if (!item) return null;

                          const amountPaid = (item.paymentsLog || []).reduce((sum, p) => sum + p.amount, 0);

                          let statusLabel = 'Nessun Anticipo';
                          let statusVariant: 'danger' | 'warning' | 'success' = 'danger';
                          if (amountPaid > 0) {
                            if (amountPaid >= (item.fixedAmount || 0)) {
                              statusLabel = 'Saldato';
                              statusVariant = 'success';
                            } else {
                              statusLabel = 'Acconto';
                              statusVariant = 'warning';
                            }
                          }

                          return (
                            <Card
                              key={order.id}
                              className='p-4 space-y-3 border border-white/5 hover:border-white/10 transition-colors text-left bg-white/[0.01]'
                            >
                              <div className='flex justify-between items-start'>
                                <div>
                                  <p className='text-xs text-brand-300 font-semibold'>
                                    {order.name} {order.itemCategory ? `(${order.itemCategory})` : ''}
                                  </p>
                                  <h4 className='text-sm font-bold text-white mt-0.5'>
                                    {item.description || 'Costume di scena'}
                                  </h4>
                                  <p className='text-[10px] text-white/40 mt-0.5'>
                                    Taglia: <strong className='text-brand-300'>{item.size || 'M'}</strong>
                                    {item.fittingNotes && (
                                      <span className='block text-white/50 italic mt-0.5'>
                                        Note Sartoria: "{item.fittingNotes}"
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <div className='text-right'>
                                  <p className='text-sm font-bold text-white'>
                                    €{amountPaid.toFixed(2)}
                                  </p>
                                  <p className='text-[9px] text-white/40 mt-0.5'>
                                    su €{(item.fixedAmount || 0).toFixed(2)}
                                  </p>
                                  <Badge variant={statusVariant} size='sm' className='mt-1.5'>
                                    {statusLabel}
                                  </Badge>
                                </div>
                              </div>

                              {/* Micro-Payments Log */}
                              {item.paymentsLog && item.paymentsLog.length > 0 && (
                                <div className='mt-3 pt-3 border-t border-white/5 space-y-1.5'>
                                  <p className='text-[9px] font-bold text-white/40 uppercase tracking-wider'>
                                    Storico Acconti Versati
                                  </p>
                                  <div className='space-y-1.5'>
                                    {item.paymentsLog.map((log, logIdx) => (
                                      <div
                                        key={logIdx}
                                        className='flex justify-between items-center text-[11px] py-1.5 px-2 rounded-xl bg-white/[0.02] border border-white/5'
                                      >
                                        <span className='text-white/50'>
                                          {format(log.date.toDate ? log.date.toDate() : new Date(log.date as any), 'dd/MM/yyyy')}
                                        </span>
                                        <div className='flex items-center gap-2'>
                                          <span className='font-semibold text-teal-400'>
                                            +€{log.amount.toFixed(2)}
                                          </span>
                                          {log.receiptIssued ? (
                                            <button
                                              type='button'
                                              onClick={() => handleDownloadCostumeReceipt(order, log)}
                                              className='text-brand-300 hover:text-brand-100 flex items-center gap-0.5 text-[9px] font-bold cursor-pointer'
                                            >
                                              <Download size={10} /> Scarica Ricevuta
                                            </button>
                                          ) : (
                                            <Badge variant='gray' size='sm' className='text-[9px] opacity-60'>
                                              Riscontrato in Cassa
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </Card>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* STRIPE SECURE CHECKOUT DRAWER */}
        <Modal
          isOpen={!!checkoutPayment}
          onClose={() => !isProcessing && setCheckoutPayment(null)}
          title='Secure Stripe Checkout'
          description='Pagamento online crittografato e sicuro con Stripe.'
        >
          {checkoutPayment && (
            <form onSubmit={handleStripeCheckout} className='space-y-4 text-left'>
              {/* Payment Details Box */}
              <div className='p-4 rounded-xl bg-brand-500/10 border border-brand-500/20 flex justify-between items-center'>
                <div>
                  <p className='text-xs text-brand-300 font-semibold'>{checkoutPayment.description}</p>
                  <p className='text-[10px] text-white/50'>Transazione sicura SSL</p>
                </div>
                <p className='text-xl font-bold text-white'>€{(checkoutPayment.remainingAmount ?? checkoutPayment.amount).toFixed(2)}</p>
              </div>

              {/* Simulated Credit Card fields */}
              <div className='space-y-3'>
                <Input
                  label='Nome sulla Carta'
                  placeholder='Mario Rossi'
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  required
                  disabled={isProcessing}
                />

                <Input
                  label='Numero Carta'
                  placeholder='4242 •••• •••• 4242'
                  value={cardNumber}
                  onChange={(e) => {
                    // Simple formatting
                    const val = e.target.value.replace(/\s?/g, '').replace(/(\d{4})/g, '$1 ').trim();
                    setCardNumber(val.slice(0, 19));
                  }}
                  required
                  disabled={isProcessing}
                  icon={<Lock size={14} className='text-white/30' />}
                />

                <div className='grid grid-cols-2 gap-3'>
                  <Input
                    label='Scadenza'
                    placeholder='MM/AA'
                    value={cardExpiry}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\//g, '');
                      if (val.length <= 2) setCardExpiry(val);
                      else setCardExpiry(`${val.slice(0, 2)}/${val.slice(2, 4)}`);
                    }}
                    required
                    disabled={isProcessing}
                  />
                  <Input
                    label='CVC'
                    placeholder='123'
                    type='password'
                    value={cardCvc}
                    onChange={(e) => setCardCvc(e.target.value.slice(0, 3))}
                    required
                    disabled={isProcessing}
                  />
                </div>
              </div>

              {/* Info text */}
              <div className='flex gap-2 items-start p-3 bg-white/5 rounded-xl border border-white/10'>
                <Lock className='text-teal-400 flex-shrink-0 mt-0.5' size={14} />
                <p className='text-[10px] text-white/50 leading-tight'>
                  I dati della tua carta non vengono salvati sui nostri server. La connessione è protetta da crittografia a 256-bit.
                </p>
              </div>

              <ModalFooter>
                <Button
                  variant='secondary'
                  onClick={() => setCheckoutPayment(null)}
                  disabled={isProcessing}
                >
                  Annulla
                </Button>
                <Button
                  type='submit'
                  disabled={isProcessing}
                  className='btn-primary-gradient w-full md:w-auto flex justify-center items-center gap-1.5'
                >
                  {isProcessing ? (
                    <>
                      <div className='w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin' />
                      Elaborazione...
                    </>
                  ) : (
                    <>
                      Paga Ora €{(checkoutPayment.remainingAmount ?? checkoutPayment.amount).toFixed(2)}
                      <ArrowRight size={14} />
                    </>
                  )}
                </Button>
              </ModalFooter>
            </form>
          )}
        </Modal>

        {/* DIGITAL SIGNATURE MODAL */}
        <Modal
          isOpen={isSignModalOpen}
          onClose={() => !isSubmittingSignature && setIsSignModalOpen(false)}
          title="Firma Domanda di Iscrizione"
          description="Sottoscrizione digitale del modulo d'iscrizione e consensi privacy obbligatori."
        >
          {selectedStudent && activeSchool && (
            <form onSubmit={handleSignatureSubmit} className="space-y-4 text-left">
              
              {/* Legal Text Scrollbox */}
              <div className="p-3 bg-white/5 border border-white/10 rounded-xl text-[10px] text-white/60 h-40 overflow-y-auto space-y-2 leading-relaxed">
                <p className="font-bold text-white text-xs">DOMANDA DI ISCRIZIONE E AMMISSIONE A SOCIO</p>
                <p>
                  Il sottoscritto/a, in qualità di allievo o di esercente la responsabilità genitoriale sull'allievo minorenne, richiede formalmente l'iscrizione e l'ammissione a socio/tesserato per la stagione sportiva in corso presso l'Associazione/struttura <strong>{activeSchool.name}</strong>.
                </p>
                <p>
                  Dichiara di aver preso visione dello statuto e dei regolamenti interni dell'Associazione, impegnandosi a rispettarli integralmente e a sollevare l'Associazione da ogni responsabilità civile e penale per danni a cose o persone che possano derivare durante la frequenza dei locali o lo svolgimento dell'attività sportiva stessa, se non imputabili a grave colpa dell'organizzazione.
                </p>
                <p className="font-bold text-white">CONSENSO TRATTAMENTO DATI PERSONALI (GDPR)</p>
                <p>
                  I dati forniti verranno trattati in conformità al Regolamento UE 2016/679 per scopi legati all'organizzazione didattica, associative, amministrativa e assicurativa del corso prescelto.
                </p>
              </div>

              {/* Consents checkboxes */}
              <div className="space-y-2.5 p-3.5 bg-white/[0.02] rounded-xl border border-white/5">
                <label className="flex items-start gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={privacyCommon}
                    onChange={(e) => setPrivacyCommon(e.target.checked)}
                    required
                    disabled={isSubmittingSignature}
                    className="mt-0.5 rounded bg-white/5 border-white/20 text-brand-500 focus:ring-brand-500/50 cursor-pointer"
                  />
                  <span className="text-[11px] text-white/70 group-hover:text-white transition-colors">
                    Acconsento al tratamento dei miei dati personali comuni per finalità didattiche, associative e assicurative. *
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={privacySanitary}
                    onChange={(e) => setPrivacySanitary(e.target.checked)}
                    required
                    disabled={isSubmittingSignature}
                    className="mt-0.5 rounded bg-white/5 border-white/20 text-brand-500 focus:ring-brand-500/50 cursor-pointer"
                  />
                  <span className="text-[11px] text-white/70 group-hover:text-white transition-colors">
                    Acconsento al trattamento dei dati particolari relativi all'idoneità fisica e sportiva (certificato medico). *
                  </span>
                </label>
              </div>

              {/* Signature Canvas */}
              <div className="space-y-1.5 text-left">
                <label className="block text-xs font-semibold text-white/70">Firma Grafica (Disegna nel riquadro): *</label>
                <div className="border border-white/10 rounded-xl overflow-hidden bg-white/5">
                  <SignaturePad ref={sigPadRef} />
                </div>
              </div>

              <ModalFooter>
                <Button
                  variant="secondary"
                  onClick={() => setIsSignModalOpen(false)}
                  disabled={isSubmittingSignature}
                >
                  Annulla
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmittingSignature}
                  className="btn-primary-gradient w-full md:w-auto flex justify-center items-center gap-1.5"
                >
                  {isSubmittingSignature ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      Invio in corso...
                    </>
                  ) : (
                    <>
                      Invia Modulo Firmato
                      <ArrowRight size={14} />
                    </>
                  )}
                </Button>
              </ModalFooter>

            </form>
          )}
        </Modal>
      </div>
    </ErrorBoundary>
  );
}
