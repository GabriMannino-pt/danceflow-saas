import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { useSchoolStore } from '@/stores/schoolStore';
import { paymentConverter, studentConverter, COLLECTIONS, nowTimestamp } from '@/lib/converters';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Card, Badge, Button, Modal, ModalFooter, Input } from '@/components/ui';
import {
  CreditCard,
  Download,
  Lock,
  Sparkles,
  ArrowRight,
  Receipt,
  Upload
} from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import toast from 'react-hot-toast';
import type { Payment, Student } from '@/types';
import { generateReceiptPDF } from '@/lib/pdf';
import { useStudents } from '@/hooks/useStudents';

export default function ParentPortalPage() {
  const user = useAuthStore((s) => s.user);
  const activeSchool = useSchoolStore((s) => s.activeSchool);
  const courses = useSchoolStore((s) => s.courses);

  const schoolId = user?.schoolId;

  // Local State
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  // Expiration upload states
  const { uploadStudentDocument } = useStudents();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Stripe Payment Drawer/Modal State
  const [checkoutPayment, setCheckoutPayment] = useState<Payment | null>(null);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardName, setCardName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Plan verification
  const isProPlan = activeSchool?.subscription?.plan === 'pro';

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

  // 2. Fetch Payments for all parent's students
  useEffect(() => {
    if (!schoolId || students.length === 0) {
      setPayments([]);
      return;
    }

    const q = query(
      collection(db, COLLECTIONS.payments(schoolId)).withConverter(paymentConverter)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map((d) => d.data());
        // Filter in-memory to match parent's student IDs
        const parentStudentIds = students.map((s) => s.id);
        const filtered = fetched.filter((p) => parentStudentIds.includes(p.studentId));
        // Sort by dueDate desc
        filtered.sort((a, b) => b.dueDate.toMillis() - a.dueDate.toMillis());
        setPayments(filtered);
      },
      (error) => {
        console.error('[ParentPortal] Error fetching payments:', error);
      }
    );

    return unsubscribe;
  }, [schoolId, students]);

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
      const receiptNumber = `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      
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

  return (
    <ErrorBoundary>
      <div className='min-h-screen bg-surface-950 text-white font-sans pb-16'>
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

        <div className='relative z-10 max-w-lg mx-auto px-4 pt-6 space-y-6'>
          {/* Header */}
          <div className='flex items-center justify-between glass p-4 rounded-2xl border border-white/10'>
            <div className='flex items-center gap-3'>
              <div className='w-10 h-10 rounded-xl btn-primary-gradient flex items-center justify-center font-bold text-lg shadow-lg'>
                💃
              </div>
              <div>
                <h1 className='text-md font-display font-bold leading-tight'>
                  {activeSchool?.name || 'DanceFlow'}
                </h1>
                <p className='text-xs text-white/50'>Portale Genitori</p>
              </div>
            </div>
            {user && (
              <div className='text-right'>
                <p className='text-sm font-semibold text-white'>{user.displayName}</p>
                <p className='text-[10px] text-brand-300 font-medium uppercase tracking-wider'>Genitore</p>
              </div>
            )}
          </div>

          {/* Alert Plan info if not Pro */}
          {!loading && !isProPlan && (
            <div className='rounded-2xl border border-gold-500/20 bg-gold-500/5 p-4 flex gap-3 items-start'>
              <Sparkles className='text-gold-400 flex-shrink-0 mt-0.5' size={18} />
              <div className='space-y-1'>
                <p className='text-xs font-bold text-gold-300'>Piano della scuola: {activeSchool?.subscription?.plan || 'trial'}</p>
                <p className='text-[11px] text-white/60 leading-relaxed'>
                  I pagamenti online sono disattivati perché la scuola non ha attivo il piano Pro. Contatta la segreteria per saldare le rette.
                </p>
              </div>
            </div>
          )}

          {/* Child Select Bar */}
          {students.length > 1 && (
            <div className='flex gap-2 overflow-x-auto pb-1'>
              {students.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStudent(s)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 border ${
                    selectedStudent?.id === s.id
                      ? 'bg-brand-600/30 text-brand-300 border-brand-500'
                      : 'glass border-white/5 text-white/60 hover:text-white'
                  }`}
                >
                  👶 {s.firstName} {s.lastName}
                </button>
              ))}
            </div>
          )}

          {/* Loading Skeleton */}
          {loading ? (
            <div className='space-y-4'>
              <div className='h-24 glass rounded-2xl animate-pulse' />
              <div className='h-48 glass rounded-2xl animate-pulse' />
            </div>
          ) : students.length === 0 ? (
            <Card className='p-8 text-center space-y-3'>
              <p className='text-4xl'>🤷‍♂️</p>
              <h2 className='text-lg font-bold'>Nessun allievo associato</h2>
              <p className='text-sm text-white/50'>
                Non risulta alcun allievo associato a questo account. Contatta la scuola per registrare il tuo indirizzo email ({user?.email}) come genitore.
              </p>
            </Card>
          ) : (
            <>
              {/* Children Quick Info Card */}
              {selectedStudent && (
                <Card className='p-4 space-y-4 border-l-4 border-brand-500 bg-brand-950/10'>
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

                  {/* Documents Alert inside child card */}
                  {selectedStudent.documents && (
                    <div className='pt-2 border-t border-white/5 space-y-2'>
                      <p className='text-xs font-semibold text-white/50 flex items-center gap-1.5'>
                        <Receipt size={13} /> Stato Documenti
                      </p>
                      <div className='flex flex-wrap gap-1.5'>
                        {['consent', 'medical'].map((type) => {
                          const docObj = selectedStudent.documents.find((d) => d.type === type);
                          const label = type === 'consent' ? 'Modulo Iscr.' : 'Cert. Medico';
                          return (
                            <span
                              key={type}
                              className={`text-[9px] px-2 py-0.5 rounded-full font-semibold border ${
                                docObj
                                  ? 'bg-teal-500/10 text-teal-400 border-teal-500/20'
                                  : 'bg-coral-500/10 text-coral-400 border-coral-500/20 animate-pulse'
                              }`}
                            >
                              {label}: {docObj ? 'OK' : 'Mancante'}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </Card>
              )}

              {isExpired ? (
                <div className="glass border border-coral-500/30 bg-coral-950/20 p-6 rounded-2xl space-y-4 shadow-xl shadow-coral-950/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-coral-500/10 blur-xl rounded-full -mr-8 -mt-8 pointer-events-none" />
                  
                  <div className="flex gap-3 items-start">
                    <div className="w-10 h-10 rounded-xl bg-coral-500/20 text-coral-400 flex items-center justify-center flex-shrink-0">
                      <Lock size={20} className="animate-pulse" />
                    </div>
                    <div className="space-y-1 text-left">
                      <h3 className="text-sm font-bold text-coral-300 font-display">Accesso Sospeso per Sicurezza</h3>
                      <p className="text-xs text-white/70 leading-relaxed">
                        Il certificato medico di <strong>{selectedStudent?.firstName}</strong> risulta scaduto o non registrato.
                        Per motivi legali e tutela assicurativa, non è possibile frequentare i corsi o accedere ai dettagli fino al caricamento di un certificato in corso di validità.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleUpload} className="mt-4 pt-4 border-t border-white/5 space-y-4 text-left">
                    <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Self-Service Upload Certificato</h4>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1.5">Data di Scadenza del Nuovo Certificato</label>
                        <input
                          type="date"
                          value={expiryDate}
                          onChange={(e) => setExpiryDate(e.target.value)}
                          required
                          disabled={isUploading}
                          className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder:text-white/30 focus:border-coral-500/50 focus:ring-1 focus:ring-coral-500/50 transition-all outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1.5">File del Certificato (PDF, PNG, JPG)</label>
                        <div className="relative flex items-center justify-center border border-dashed border-white/20 hover:border-coral-500/50 rounded-xl p-4 bg-white/[0.02] cursor-pointer transition-colors group">
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg"
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
                            <Upload className="mx-auto text-white/40 group-hover:text-coral-400 transition-colors" size={20} />
                            <p className="text-xs text-white/60 font-medium">
                              {selectedFile ? selectedFile.name : 'Trascina o clicca per caricare'}
                            </p>
                            <p className="text-[10px] text-white/30">PDF, PNG o JPG fino a 5MB</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={isUploading}
                      className="w-full btn-primary-gradient flex justify-center items-center gap-1.5"
                    >
                      {isUploading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                          Caricamento in corso...
                        </>
                      ) : (
                        <>
                          Carica Nuovo Certificato
                          <ArrowRight size={14} />
                        </>
                      )}
                    </Button>
                  </form>
                </div>
              ) : (
                <>
                  {/* Outstanding Debt Panels */}
                  <div className='grid grid-cols-3 gap-2'>
                    <Card className='p-3 border-l-2 border-white/20 bg-white/[0.02]'>
                      <p className='text-[9px] text-white/50 font-medium uppercase'>Dovuto</p>
                      <p className='text-sm font-bold text-white mt-1'>
                        €{stats.totalAmount.toFixed(2)}
                      </p>
                    </Card>

                    <Card className='p-3 border-l-2 border-teal-500 bg-teal-950/5'>
                      <p className='text-[9px] text-teal-300/80 font-medium uppercase'>Pagato</p>
                      <p className='text-sm font-bold text-teal-400 mt-1'>
                        €{stats.paidAmount.toFixed(2)}
                      </p>
                    </Card>

                    <Card className='p-3 border-l-2 border-coral-500 bg-coral-950/5'>
                      <p className='text-[9px] text-coral-300/80 font-medium uppercase'>Residuo</p>
                      <p className='text-sm font-bold text-coral-400 mt-1'>
                        €{stats.pendingAmount.toFixed(2)}
                      </p>
                    </Card>
                  </div>

                  {/* Payments Section */}
                  <div className='space-y-3'>
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

                          const formatDateLocal = (ts: any) => {
                            if (!ts) return '—';
                            try {
                              return format(ts.toDate(), 'dd/MM/yyyy');
                            } catch {
                              return '—';
                            }
                          };

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
                                              onClick={() => handleDownloadReceipt(p, inst)}
                                              className='text-brand-300 hover:text-brand-100 flex items-center gap-0.5 text-[9px] font-bold'
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
                                        className='btn-primary-gradient'
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
                </>
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
      </div>
    </ErrorBoundary>
  );
}
