import { useState, useMemo, useEffect } from 'react';
import { usePayments } from '@/hooks/usePayments';
import { useSchoolStore } from '@/stores/schoolStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Badge, Button, Input, Select, Modal, ModalFooter, EmptyState } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { PaymentForm } from '@/components/payments/PaymentForm';
import { generateReceiptPDF, generateAnnualPaymentsReportPDF, generateFilteredPaymentsPDF } from '@/lib/pdf';
import { exportToCSV } from '@/lib/excel';
import type { Payment, PaymentMethod } from '@/types';
import {
  CreditCard,
  Search,
  Plus,
  AlertTriangle,
  TrendingUp,
  Clock,
  Download,
  CheckCircle,
  BellRing,
  Edit,
  Trash2,
  XCircle
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';

export default function PaymentsPage() {
  usePayments(); // active listener
  const { payments, students, courses, activeSchool } = useSchoolStore();
  const { 
    registerInstallment, 
    generateMonthlyFees,
    updateInstallment,
    deleteInstallment,
    emitInstallmentReceipt,
    cancelPayment,
    deletePayment
  } = usePayments();

  const [activeTab, setActiveTab] = useState<'all' | 'overdue'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState(new Date().getMonth() + 1);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportYear, setExportYear] = useState(new Date().getFullYear());
  const [exportType, setExportType] = useState<'filtered' | 'annual'>('filtered');
  const [exportFormat, setExportFormat] = useState<'pdf' | 'csv'>('pdf');

  // Manage modal states
  const [selectedManagePayment, setSelectedManagePayment] = useState<Payment | null>(null);
  const [editingInstallmentIndex, setEditingInstallmentIndex] = useState<number | null>(null);
  const [editInstallmentAmount, setEditInstallmentAmount] = useState<number>(0);
  const [editInstallmentDate, setEditInstallmentDate] = useState<string>('');
  const [editInstallmentMethod, setEditInstallmentMethod] = useState<PaymentMethod>('cash');
  const [editInstallmentNotes, setEditInstallmentNotes] = useState<string>('');
  
  const [isCancellingPayment, setIsCancellingPayment] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  
  // Mark as paid modal
  const [payingPayment, setPayingPayment] = useState<Payment | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState<string>('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [payEmitReceipt, setPayEmitReceipt] = useState(false);

  // Initialize values when opening payment modal
  useEffect(() => {
    if (payingPayment) {
      setPayAmount(payingPayment.remainingAmount ?? payingPayment.amount);
      setPayDate(new Date().toISOString().split('T')[0]);
      setPayNotes('');
      setPayEmitReceipt(false);
    }
  }, [payingPayment]);

  const handleDeletePayment = async (paymentId: string) => {
    if (confirm('Sei sicuro di voler eliminare definitivamente questo addebito/pagamento? L\'azione è irreversibile.')) {
      try {
        await deletePayment(paymentId);
      } catch (err) {
        console.error('[PaymentsPage] handleDeletePayment error:', err);
      }
    }
  };

  // Generazione Massiva State
  const [genCourseId, setGenCourseId] = useState('');
  const [genMonth, setGenMonth] = useState(new Date().getMonth() + 1);
  const [genYear, setGenYear] = useState(new Date().getFullYear());
  const [genDueDate, setGenDueDate] = useState(new Date().toISOString().split('T')[0]);

  const resolvedPayments = useMemo(() => {
    return payments.map((p) => {
      const student = students.find((s) => s.id === p.studentId);
      const course = courses.find((c) => c.id === p.courseId);
      
      const isMonthly = p.type === 'monthly';
      const hasCustomFee = student && student.customMonthlyFee !== undefined && student.customMonthlyFee !== null;
      
      const total = (isMonthly && hasCustomFee)
        ? student.customMonthlyFee!
        : (p.type === 'registration' && student && student.customRegistrationFee !== undefined && student.customRegistrationFee !== null)
          ? student.customRegistrationFee
          : (p.type === 'event' && student && student.customShowFee !== undefined && student.customShowFee !== null)
            ? student.customShowFee
            : (isMonthly && course?.fee?.monthly)
              ? course.fee.monthly
              : (p.totalAmount ?? p.amount);
      
      const paid = p.paidAmount ?? (p.status === 'paid' ? p.amount : 0);
      const remaining = Math.max(0, total - paid);
      
      let status = p.status;
      if (status !== 'cancelled' && status !== 'paid') {
        if (paid >= total) {
          status = 'paid';
        } else if (paid > 0) {
          status = 'deposit_paid';
        } else {
          const isOverdue = p.dueDate.toDate() < new Date();
          status = isOverdue ? 'overdue' : 'pending';
        }
      }
      
      return {
        ...p,
        totalAmount: total,
        amount: total,
        paidAmount: paid,
        remainingAmount: remaining,
        status,
      };
    });
  }, [payments, students, courses]);

  // ─── Computations & Stats ───────────────────────────────────────────────────
  const stats = useMemo(() => {
    let incassatoMese = 0;
    let morositaTotale = 0;
    let quoteAttesa = 0;

    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    resolvedPayments.forEach((p) => {
      if (p.status === 'paid' && p.paidAt) {
        const pd = p.paidAt.toDate();
        if (pd.getMonth() + 1 === currentMonth && pd.getFullYear() === currentYear) {
          incassatoMese += p.amount;
        }
      }
      if (p.status === 'overdue') {
        morositaTotale += p.amount;
      }
      if (p.status === 'pending') {
        quoteAttesa++;
      }
    });

    return { incassatoMese, morositaTotale, quoteAttesa };
  }, [resolvedPayments]);

  const filteredPayments = useMemo(() => {
    return resolvedPayments.filter((p) => {
      const student = students.find(s => s.id === p.studentId);
      const studentName = student ? `${student.firstName} ${student.lastName}`.toLowerCase() : '';
      
      const matchesSearch = studentName.includes(searchQuery.toLowerCase()) || 
                            p.description.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' ? true : p.status === statusFilter;
      const matchesCourse = courseFilter === 'all' ? true : p.courseId === courseFilter;
      const matchesMonth = monthFilter === 0 ? true : p.month === monthFilter;

      return matchesSearch && matchesStatus && matchesCourse && matchesMonth;
    });
  }, [resolvedPayments, searchQuery, statusFilter, courseFilter, monthFilter, students]);

  const overdueList = useMemo(() => {
    const map = new Map<string, { studentName: string; totalAmount: number; daysLate: number; paymentIds: string[] }>();
    resolvedPayments.forEach(p => {
      if (p.status !== 'cancelled' && (p.status === 'overdue' || (p.status === 'pending' && p.dueDate.toDate() < new Date()))) {
        const student = students.find(s => s.id === p.studentId);
        const name = student ? `${student.lastName} ${student.firstName}` : 'Sconosciuto';
        const days = differenceInDays(new Date(), p.dueDate.toDate());
        
        if (!map.has(p.studentId)) {
          map.set(p.studentId, { studentName: name, totalAmount: 0, daysLate: days, paymentIds: [] });
        }
        
        const entry = map.get(p.studentId)!;
        entry.totalAmount += p.amount;
        entry.paymentIds.push(p.id);
        if (days > entry.daysLate) entry.daysLate = days;
      }
    });
    return Array.from(map.values()).sort((a, b) => b.daysLate - a.daysLate);
  }, [resolvedPayments, students]);

  const handleConfirmPayment = async () => {
    if (!payingPayment) return;
    if (payAmount <= 0) {
      toast.error('Inserisci un importo valido.');
      return;
    }
    const maxAllowed = payingPayment.remainingAmount ?? payingPayment.amount;
    if (payAmount > maxAllowed) {
      toast.error(`L'importo inserito (€${payAmount}) supera il debito residuo (€${maxAllowed}).`);
      return;
    }

    try {
      const res = await registerInstallment(
        payingPayment.id,
        payAmount,
        payMethod,
        new Date(payDate),
        payNotes,
        payEmitReceipt
      );
      
      if (payEmitReceipt && res) {
        const student = students.find(s => s.id === payingPayment.studentId);
        const course = courses.find(c => c.id === payingPayment.courseId);
        if (student) {
          const doc = await generateReceiptPDF(res.updates, student, activeSchool!, course, res.newInstallment);
          doc.save(`Ricevuta_${res.updates.receiptNumber || res.updates.id}.pdf`);
        }
      }

      setPayingPayment(null);
      setPayMethod('cash');
      setPayEmitReceipt(false);
      setPayNotes('');
    } catch (err) {
      console.error(err);
    }
  }

  const handleGenerateFees = async () => {
    if (!genCourseId) {
      toast.error('Seleziona un corso');
      return;
    }
    try {
      await generateMonthlyFees(genCourseId, genMonth, genYear, new Date(genDueDate));
      setIsGenerateModalOpen(false);
    } catch (err) {
      console.error(err);
    }
  }

  const handleDeleteInstallmentClick = async (paymentId: string, index: number) => {
    if (!window.confirm('Sei sicuro di voler eliminare questo versamento? Residuo e stato verranno ricalcolati.')) return;
    try {
      await deleteInstallment(paymentId, index);
    } catch (err) {
      console.error(err);
    }
  };

  const handleEmitReceiptClick = async (paymentId: string, index: number) => {
    try {
      const res = await emitInstallmentReceipt(paymentId, index);
      if (res) {
        const student = students.find(s => s.id === res.updates.studentId);
        const course = courses.find(c => c.id === res.updates.courseId);
        if (student) {
          const docPDF = await generateReceiptPDF(res.updates, student, activeSchool!, course, res.newInstallment);
          docPDF.save(`Ricevuta_${res.updates.receiptNumber || res.updates.id}.pdf`);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveInstallmentEdit = async (paymentId: string, index: number) => {
    if (editInstallmentAmount <= 0) {
      toast.error('Inserisci un importo valido.');
      return;
    }
    try {
      await updateInstallment(paymentId, index, {
        amount: editInstallmentAmount,
        date: new Date(editInstallmentDate),
        method: editInstallmentMethod,
        notes: editInstallmentNotes,
      });
      setEditingInstallmentIndex(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfirmCancelPayment = async (paymentId: string) => {
    if (!cancelReason.trim()) return;
    try {
      await cancelPayment(paymentId, cancelReason.trim());
      setIsCancellingPayment(false);
      setCancelReason('');
      setSelectedManagePayment(null);
    } catch (err) {
      console.error(err);
    }
  };

  const managedPayment = useMemo(() => {
    if (!selectedManagePayment) return null;
    return resolvedPayments.find(p => p.id === selectedManagePayment.id) || null;
  }, [selectedManagePayment, resolvedPayments]);

  const handleDownloadReceipt = async (payment: Payment, installment?: any) => {
    if (!activeSchool) return;
    const student = students.find(s => s.id === payment.studentId);
    if (!student) {
      toast.error('Allievo non trovato');
      return;
    }
    const course = courses.find(c => c.id === payment.courseId);
    
    try {
      const doc = await generateReceiptPDF(payment, student, activeSchool, course, installment);
      doc.save(`Ricevuta_${payment.receiptNumber || payment.id}.pdf`);
      toast.success('Ricevuta scaricata!');
    } catch (err) {
      console.error(err);
      toast.error('Errore durante la generazione del PDF');
    }
  }

  const handleExecuteExport = async () => {
    if (!activeSchool) {
      toast.error('Scuola non selezionata.');
      return;
    }

    try {
      if (exportType === 'annual') {
        if (exportFormat === 'pdf') {
          const doc = await generateAnnualPaymentsReportPDF(courses, students, resolvedPayments, activeSchool, exportYear);
          doc.save(`Prospetto_Quote_${exportYear}.pdf`);
          toast.success('Prospetto annuale PDF scaricato!');
        } else {
          const headers = ['Allievo', 'Corso', 'Mese', 'Anno', 'Dovuto', 'Versato', 'Residuo', 'Stato'];
          const rows: string[][] = [];
          
          courses.forEach(course => {
            const courseStudents = students.filter(s => {
              const isEnrolled = s.enrolledCourseIds?.includes(course.id);
              const hasPayment = resolvedPayments.some(
                p => p.studentId === s.id && p.courseId === course.id && p.year === exportYear && p.type === 'monthly' && p.status !== 'cancelled'
              );
              return isEnrolled || hasPayment;
            });

            courseStudents.forEach(student => {
              for (let m = 1; m <= 12; m++) {
                const p = resolvedPayments.find(
                  pay => pay.studentId === student.id &&
                         pay.courseId === course.id &&
                         pay.type === 'monthly' &&
                         pay.month === m &&
                         pay.year === exportYear &&
                         pay.status !== 'cancelled'
                );

                if (p) {
                  const dovuto = p.totalAmount ?? p.amount;
                  const versato = p.paidAmount ?? 0;
                  const residuo = p.remainingAmount ?? (dovuto - versato);
                  rows.push([
                    `${student.lastName} ${student.firstName}`,
                    course.name,
                    `Mese ${m}`,
                    String(exportYear),
                    dovuto.toFixed(2),
                    versato.toFixed(2),
                    residuo.toFixed(2),
                    p.status.toUpperCase()
                  ]);
                }
              }
            });
          });

          exportToCSV(`Prospetto_Quote_${exportYear}.csv`, headers, rows);
          toast.success('Prospetto annuale CSV scaricato!');
        }
      } else {
        if (exportFormat === 'pdf') {
          const doc = await generateFilteredPaymentsPDF(
            filteredPayments,
            activeSchool,
            { month: monthFilter, courseId: courseFilter, status: statusFilter },
            students,
            courses
          );
          doc.save(`Report_Pagamenti_Filtrato.pdf`);
          toast.success('Report filtrato PDF scaricato!');
        } else {
          const headers = ['Allievo', 'Descrizione', 'Corso', 'Importo Dovuto', 'Importo Versato', 'Residuo', 'Stato', 'Storico Versamenti'];
          const rows = filteredPayments.map(p => {
            const studentObj = students.find(s => s.id === p.studentId);
            const studentName = studentObj ? `${studentObj.lastName} ${studentObj.firstName}` : 'N/D';
            const courseObj = courses.find(c => c.id === p.courseId);
            
            const dovuto = p.totalAmount ?? p.amount;
            const versato = p.paidAmount ?? 0;
            const residuo = p.remainingAmount ?? (dovuto - versato);
            
            let storicoStr = '-';
            if (p.payments && p.payments.length > 0) {
              storicoStr = p.payments.map(inst => `€${inst.amount.toFixed(0)} (${format(inst.date.toDate(), 'dd/MM/yyyy')})`).join(', ');
            }

            return [
              studentName,
              p.description,
              courseObj?.name || 'N/D',
              dovuto.toFixed(2),
              versato.toFixed(2),
              residuo.toFixed(2),
              p.status.toUpperCase(),
              storicoStr
            ];
          });

          exportToCSV(`Report_Pagamenti_Filtrato.csv`, headers, rows);
          toast.success('Report filtrato CSV scaricato!');
        }
      }
      setIsExportModalOpen(false);
    } catch (err) {
      console.error('[PaymentsPage] Export error:', err);
      toast.error('Errore durante l\'esportazione.');
    }
  };

  function handleSendReminder(studentName: string) {
    toast.success(`Sollecito inviato a ${studentName} via In-App e Email (Simulato)`);
  }

  return (
    <ErrorBoundary>
      <div className='page-enter space-y-6 pb-12'>
        <PageHeader
          title='Pagamenti e Rette'
          subtitle='Gestisci le rette mensili, incassi manuali e morosità.'
          actions={
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsExportModalOpen(true)}
                icon={<Download size={18} />}
              >
                Esporta Dati
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsGenerateModalOpen(true)}
                icon={<Clock size={18} />}
              >
                Genera Quote
              </Button>
              <Button
                onClick={() => setIsFormOpen(true)}
                icon={<Plus size={18} />}
              >
                Nuovo Addebito
              </Button>
            </div>
          }
        />

        {/* Stats Panel */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          <Card className='p-4 border-l-4 border-teal-500'>
            <div className='flex items-center gap-3'>
              <div className='w-9 h-9 rounded-xl bg-teal-500/15 text-teal-300 flex items-center justify-center'>
                <TrendingUp size={18} />
              </div>
              <div>
                <p className='text-xs text-white/50'>Incassato Mese Corrente</p>
                <p className='text-xl font-display font-bold text-teal-400'>
                  €{stats.incassatoMese.toFixed(2)}
                </p>
              </div>
            </div>
          </Card>

          <Card className='p-4 border-l-4 border-coral-500'>
            <div className='flex items-center gap-3'>
              <div className='w-9 h-9 rounded-xl bg-coral-500/15 text-coral-300 flex items-center justify-center'>
                <AlertTriangle size={18} />
              </div>
              <div>
                <p className='text-xs text-white/50'>Morosità Totale</p>
                <p className='text-xl font-display font-bold text-coral-400'>
                  €{stats.morositaTotale.toFixed(2)}
                </p>
              </div>
            </div>
          </Card>

          <Card className='p-4 border-l-4 border-gold-500'>
            <div className='flex items-center gap-3'>
              <div className='w-9 h-9 rounded-xl bg-gold-500/15 text-gold-300 flex items-center justify-center'>
                <CreditCard size={18} />
              </div>
              <div>
                <p className='text-xs text-white/50'>Quote in Attesa</p>
                <p className='text-xl font-display font-bold text-gold-400'>{stats.quoteAttesa}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-white/10 pb-2">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors border-b-2 ${
              activeTab === 'all' ? 'border-brand-500 text-white' : 'border-transparent text-white/50 hover:text-white/80'
            }`}
          >
            Tutti i Pagamenti
          </button>
          <button
            onClick={() => setActiveTab('overdue')}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'overdue' ? 'border-coral-500 text-coral-400' : 'border-transparent text-white/50 hover:text-coral-300'
            }`}
          >
            <AlertTriangle size={14} />
            Dashboard Morosità
          </button>
        </div>

        {/* Content: ALL PAYMENTS */}
        {activeTab === 'all' && (
          <div className="space-y-4">
            <Card className='p-4'>
              <div className='grid grid-cols-1 md:grid-cols-4 gap-3'>
                <Input
                  placeholder='Cerca allievo...'
                  icon={<Search size={16} />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Select
                  options={[
                    { value: '0', label: 'Tutti i mesi' },
                    ...Array.from({ length: 12 }).map((_, i) => ({ value: String(i + 1), label: `Mese ${i + 1}` }))
                  ]}
                  value={String(monthFilter)}
                  onChange={(e) => setMonthFilter(Number(e.target.value))}
                />
                <Select
                  options={[
                    { value: 'all', label: 'Tutti gli stati' },
                    { value: 'pending', label: 'In Attesa' },
                    { value: 'paid', label: 'Pagato' },
                    { value: 'overdue', label: 'Scaduto' },
                    { value: 'cancelled', label: 'Annullato' },
                  ]}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                />
                <Select
                  options={[
                    { value: 'all', label: 'Tutti i corsi' },
                    ...courses.map(c => ({ value: c.id, label: c.name }))
                  ]}
                  value={courseFilter}
                  onChange={(e) => setCourseFilter(e.target.value)}
                />
              </div>
            </Card>

            <Card className='p-0 overflow-hidden border border-white/5'>
              <div className="overflow-x-auto">
                <table className='w-full text-left border-collapse min-w-[800px]'>
                  <thead>
                    <tr className='border-b border-white/8 bg-white/[0.02] text-xs font-semibold text-white/50 tracking-wider'>
                      <th className='py-4 px-5'>Allievo</th>
                      <th className='py-4 px-5'>Descrizione</th>
                      <th className='py-4 px-5'>Importo Versato</th>
                      <th className='py-4 px-5'>Scadenza</th>
                      <th className='py-4 px-5'>Stato</th>
                      <th className='py-4 px-5 text-right'>Azioni</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-white/5 text-sm text-white/80'>
                    {filteredPayments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-white/40">Nessun pagamento trovato</td>
                      </tr>
                    ) : filteredPayments.map((p) => {
                      const student = students.find(s => s.id === p.studentId);
                      const isOverdue = p.status === 'pending' && p.dueDate.toDate() < new Date();
                      const statusVariant = 
                        p.status === 'paid' ? 'success' : 
                        p.status === 'deposit_paid' ? 'warning' :
                        isOverdue || p.status === 'overdue' ? 'danger' : 
                        p.status === 'cancelled' ? 'gray' : 'brand';
                      const statusLabel = 
                        p.status === 'paid' ? 'Saldato' : 
                        p.status === 'deposit_paid' ? 'Acconto' :
                        isOverdue || p.status === 'overdue' ? 'Scaduto' : 
                        p.status === 'cancelled' ? 'Annullato' : 'In Attesa';

                      return (
                        <tr key={p.id} className='hover:bg-white/[0.03] transition-colors group'>
                          <td className='py-3.5 px-5'>
                            <p className="font-semibold text-white">{student ? `${student.lastName} ${student.firstName}` : 'N/D'}</p>
                          </td>
                          <td className='py-3.5 px-5'>
                            <p className="text-white/90">{p.description}</p>
                            {p.courseId && <p className="text-xs text-white/40">{courses.find(c => c.id === p.courseId)?.name}</p>}
                          </td>
                          <td className='py-3.5 px-5 font-bold text-white'>
                            <div>
                              €{(p.paidAmount ?? 0).toFixed(2)}
                              <span className="text-xs text-white/40 font-normal block mt-0.5">
                                su €{(p.totalAmount ?? 0).toFixed(2)}
                              </span>
                            </div>
                          </td>
                          <td className='py-3.5 px-5 text-white/60'>
                            {format(p.dueDate.toDate(), 'dd/MM/yyyy')}
                          </td>
                          <td className='py-3.5 px-5'>
                            <Badge variant={statusVariant} size='sm'>{statusLabel}</Badge>
                          </td>
                          <td className='py-3.5 px-5 text-right'>
                            <div className='flex justify-end items-center gap-2'>
                              {(p.status === 'pending' || p.status === 'deposit_paid' || p.status === 'overdue') && (
                                <Button
                                  size="sm"
                                  onClick={() => setPayingPayment(p)}
                                  icon={<CheckCircle size={14} />}
                                >
                                  Incassa
                                </Button>
                              )}
                              {(p.status === 'paid' || p.status === 'deposit_paid') && p.receiptURL && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleDownloadReceipt(p)}
                                  icon={<Download size={14} />}
                                >
                                  PDF
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedManagePayment(p)}
                                icon={<Clock size={14} />}
                              >
                                Storico
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDeletePayment(p.id)}
                                icon={<Trash2 size={14} />}
                                title="Elimina pagamento"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* Content: DASHBOARD MOROSITÀ */}
        {activeTab === 'overdue' && (
          <Card className='p-0 overflow-hidden border border-coral-500/20'>
            <div className="p-4 bg-coral-500/10 border-b border-coral-500/20 flex items-center gap-3">
              <AlertTriangle className="text-coral-400" />
              <div>
                <h3 className="font-bold text-coral-400">Allievi in Ritardo</h3>
                <p className="text-xs text-coral-300/70">Questa lista mostra gli allievi che hanno quote mensili o addebiti oltre la data di scadenza.</p>
              </div>
            </div>
            
            {overdueList.length === 0 ? (
              <EmptyState
                icon="🎉"
                title="Tutto Regolare!"
                description="Nessun allievo risulta avere pagamenti in ritardo."
              />
            ) : (
              <table className='w-full text-left border-collapse min-w-[700px]'>
                <thead>
                  <tr className='border-b border-white/8 text-xs font-semibold text-white/50 tracking-wider'>
                    <th className='py-4 px-5'>Allievo</th>
                    <th className='py-4 px-5'>Importo Dovuto</th>
                    <th className='py-4 px-5'>Giorni di Ritardo</th>
                    <th className='py-4 px-5 text-right'>Azioni</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-white/5 text-sm'>
                  {overdueList.map((item, idx) => (
                    <tr key={idx} className='hover:bg-white/[0.03]'>
                      <td className='py-3.5 px-5 font-semibold text-white'>
                        {item.studentName}
                      </td>
                      <td className='py-3.5 px-5 font-bold text-coral-400'>
                        €{item.totalAmount.toFixed(2)}
                        <span className="ml-2 text-xs text-white/40 font-normal">({item.paymentIds.length} quote)</span>
                      </td>
                      <td className='py-3.5 px-5'>
                        <Badge variant="danger" size="sm">{item.daysLate} giorni</Badge>
                      </td>
                      <td className='py-3.5 px-5 text-right'>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-coral-500/30 text-coral-300 hover:bg-coral-500/20"
                          icon={<BellRing size={14} />}
                          onClick={() => handleSendReminder(item.studentName)}
                        >
                          Sollecito
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}

        {/* MODAL: INCASSA PAGAMENTO */}
        <Modal
          isOpen={!!payingPayment}
          onClose={() => setPayingPayment(null)}
          title="Registra Versamento"
          description={`Inserisci i dettagli del pagamento per: ${payingPayment?.description}`}
        >
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-black/20 border border-white/5 flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-sm">
                <span className="text-white/60">Importo Totale Dovuto:</span>
                <span className="text-white font-semibold">€{(payingPayment?.totalAmount ?? payingPayment?.amount ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-white/60">Importo Già Pagato:</span>
                <span className="text-teal-400 font-semibold">€{(payingPayment?.paidAmount ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-t border-white/8 pt-1.5 mt-1 font-bold">
                <span className="text-white/85">Debito Residuo:</span>
                <span className="text-white">€{(payingPayment?.remainingAmount ?? payingPayment?.amount ?? 0).toFixed(2)}</span>
              </div>
            </div>

            <Input
              label="Importo Versato"
              type="number"
              step="0.01"
              value={payAmount}
              onChange={(e) => setPayAmount(Number(e.target.value))}
            />

            <Select
              label="Metodo di Pagamento"
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
              options={[
                { value: 'cash', label: 'Contanti' },
                { value: 'bank_transfer', label: 'Bonifico Bancario' },
                { value: 'card', label: 'Carta / POS' },
                { value: 'other', label: 'Altro' },
              ]}
            />

            <Input
              label="Data Versamento"
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
            />

            <Input
              label="Note Versamento"
              placeholder="es. Acconto quota o saldo"
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
            />

            <div className='flex items-center justify-between p-4 rounded-xl border border-white/10 glass-strong'>
              <div>
                <p className="font-semibold text-white text-sm">Emetti ricevuta PDF?</p>
                <p className="text-xs text-white/50 mt-0.5">Genera una ricevuta per questo versamento.</p>
              </div>
              <input
                type='checkbox'
                className='w-5 h-5 rounded border-white/20 text-brand-600 bg-black/30 focus:ring-brand-500 cursor-pointer'
                checked={payEmitReceipt}
                onChange={(e) => setPayEmitReceipt(e.target.checked)}
              />
            </div>

            <ModalFooter>
              <Button variant="secondary" onClick={() => setPayingPayment(null)}>Annulla</Button>
              <Button onClick={handleConfirmPayment}>Conferma Incasso</Button>
            </ModalFooter>
          </div>
        </Modal>

        {/* MODAL: GESTIONE STORICO E DETTAGLIO PAGAMENTO */}
        <Modal
          isOpen={!!managedPayment}
          onClose={() => {
            setSelectedManagePayment(null);
            setEditingInstallmentIndex(null);
          }}
          title="Gestione Storico Pagamento"
          description={managedPayment ? `${managedPayment.description} - Totale Dovuto: €${(managedPayment.totalAmount ?? 0).toFixed(2)}` : ''}
        >
          {managedPayment && (
            <div className="space-y-6">
              {/* Payment Summary */}
              <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                <div>
                  <p className="text-[10px] text-white/40 uppercase font-semibold">Incassato</p>
                  <p className="text-lg font-bold text-teal-400">€{(managedPayment.paidAmount ?? 0).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/40 uppercase font-semibold">Residuo</p>
                  <p className="text-lg font-bold text-white">€{(managedPayment.remainingAmount ?? 0).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/40 uppercase font-semibold">Stato</p>
                  <div className="mt-1">
                    <Badge variant={
                      managedPayment.status === 'paid' ? 'success' :
                      managedPayment.status === 'deposit_paid' ? 'warning' :
                      managedPayment.status === 'cancelled' ? 'gray' :
                      managedPayment.status === 'overdue' ? 'danger' : 'brand'
                    } size="sm">
                      {managedPayment.status === 'paid' ? 'Saldato' :
                       managedPayment.status === 'deposit_paid' ? 'Acconto' :
                       managedPayment.status === 'cancelled' ? 'Annullato' :
                       managedPayment.status === 'overdue' ? 'Scaduto' : 'In Attesa'}
                    </Badge>
                  </div>
                </div>
              </div>

              {(managedPayment.status === 'pending' || managedPayment.status === 'deposit_paid' || managedPayment.status === 'overdue') && (
                <Button
                  className="w-full"
                  onClick={() => {
                    setPayingPayment(managedPayment);
                    setSelectedManagePayment(null);
                  }}
                  icon={<CheckCircle size={16} />}
                >
                  Registra Versamento / Incassa
                </Button>
              )}

              {/* Installments History */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40">Storico Versamenti</h4>
                {!managedPayment.payments || managedPayment.payments.length === 0 ? (
                  <p className="text-sm text-white/30 italic">Nessun versamento registrato per questa quota.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {managedPayment.payments.map((inst, idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-black/20 border border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">€{inst.amount.toFixed(2)}</span>
                            <span className="text-[10px] text-white/50 bg-white/5 px-2 py-0.5 rounded-full uppercase">
                              {inst.method === 'cash' ? 'Contanti' :
                               inst.method === 'bank_transfer' ? 'Bonifico' :
                               inst.method === 'card' ? 'Carta / POS' : 'Altro'}
                            </span>
                          </div>
                          <p className="text-xs text-white/40">
                            📅 {format(inst.date.toDate(), 'dd/MM/yyyy')}
                            {inst.notes && <span className="block mt-0.5 text-[11px] italic text-white/60">Note: {inst.notes}</span>}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                          {managedPayment.status !== 'cancelled' && (
                            <>
                              <Button
                                size="xs"
                                variant="secondary"
                                icon={<Edit size={12} />}
                                onClick={() => {
                                  setEditingInstallmentIndex(idx);
                                  setEditInstallmentAmount(inst.amount);
                                  setEditInstallmentDate(inst.date.toDate().toISOString().split('T')[0]);
                                  setEditInstallmentMethod(inst.method);
                                  setEditInstallmentNotes(inst.notes || '');
                                }}
                              >
                                Modifica
                              </Button>
                              <Button
                                size="xs"
                                variant="outline"
                                className="border-coral-500/20 text-coral-400 hover:bg-coral-500/10"
                                icon={<Trash2 size={12} />}
                                onClick={() => handleDeleteInstallmentClick(managedPayment.id, idx)}
                              >
                                Elimina
                              </Button>
                            </>
                          )}
                          
                          {inst.receiptEmitted ? (
                            <Button
                              size="xs"
                              variant="outline"
                              icon={<Download size={12} />}
                              onClick={() => handleDownloadReceipt(managedPayment, inst)}
                            >
                              Ricevuta
                            </Button>
                          ) : (
                            managedPayment.status !== 'cancelled' && (
                              <Button
                                size="xs"
                                variant="outline"
                                className="border-gold-500/30 text-gold-300 hover:bg-gold-500/10"
                                icon={<Plus size={12} />}
                                onClick={() => handleEmitReceiptClick(managedPayment.id, idx)}
                              >
                                Emetti
                              </Button>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Edit Installment Sub-Form */}
              {editingInstallmentIndex !== null && managedPayment.payments && (
                <div className="p-4 rounded-xl bg-brand-500/5 border border-brand-500/15 space-y-4">
                  <div className="flex justify-between items-center">
                    <h5 className="text-xs font-bold text-brand-300 uppercase">Modifica Versamento #{editingInstallmentIndex + 1}</h5>
                    <button 
                      className="text-white/40 hover:text-white/80 text-xs" 
                      onClick={() => setEditingInstallmentIndex(null)}
                    >
                      Annulla
                    </button>
                  </div>

                  {managedPayment.payments[editingInstallmentIndex].receiptEmitted && (
                    <div className="p-2.5 rounded-lg bg-gold-500/10 border border-gold-500/20 text-xs text-gold-300">
                      ⚠️ Ricevuta già emessa — i dati non saranno aggiornati automaticamente
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input
                      label="Importo (€)"
                      type="number"
                      step="0.01"
                      value={editInstallmentAmount}
                      onChange={(e) => setEditInstallmentAmount(Number(e.target.value))}
                    />
                    <Input
                      label="Data Versamento"
                      type="date"
                      value={editInstallmentDate}
                      onChange={(e) => setEditInstallmentDate(e.target.value)}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Select
                      label="Metodo di Pagamento"
                      value={editInstallmentMethod}
                      onChange={(e) => setEditInstallmentMethod(e.target.value as PaymentMethod)}
                      options={[
                        { value: 'cash', label: 'Contanti' },
                        { value: 'bank_transfer', label: 'Bonifico Bancario' },
                        { value: 'card', label: 'Carta / POS' },
                        { value: 'other', label: 'Altro' },
                      ]}
                    />
                    <Input
                      label="Note Interne"
                      value={editInstallmentNotes}
                      onChange={(e) => setEditInstallmentNotes(e.target.value)}
                    />
                  </div>

                  <Button 
                    size="sm" 
                    className="w-full"
                    onClick={() => handleSaveInstallmentEdit(managedPayment.id, editingInstallmentIndex)}
                  >
                    Salva Modifiche Versamento
                  </Button>
                </div>
              )}

              {/* Cancel Payment Panel */}
              {managedPayment.status !== 'cancelled' && editingInstallmentIndex === null && (
                <div className="pt-4 border-t border-white/5 space-y-3">
                  {isCancellingPayment ? (
                    <div className="p-4 rounded-xl bg-coral-500/5 border border-coral-500/15 space-y-3">
                      <h5 className="text-xs font-bold text-coral-400 uppercase">Annullamento Quota</h5>
                      
                      {managedPayment.payments && managedPayment.payments.length > 0 && (
                        <div className="p-2 rounded bg-coral-500/10 border border-coral-500/20 text-xs text-coral-300">
                          ⚠️ Gestisci eventuali rimborsi manualmente
                        </div>
                      )}

                      <Input
                        label="Motivazione Annullamento (Obbligatoria)"
                        placeholder="Es. Ritiro dell'allievo dal corso"
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                      />

                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="secondary"
                          onClick={() => {
                            setIsCancellingPayment(false);
                            setCancelReason('');
                          }}
                        >
                          Annulla
                        </Button>
                        <Button 
                          size="sm" 
                          className="bg-coral-600 hover:bg-coral-500 text-white"
                          onClick={() => handleConfirmCancelPayment(managedPayment.id)}
                          disabled={!cancelReason.trim()}
                        >
                          Conferma Annullamento
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-white/40">Vuoi annullare o archiviare questa quota?</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-coral-500/30 text-coral-400 hover:bg-coral-500/10"
                        icon={<XCircle size={14} />}
                        onClick={() => setIsCancellingPayment(true)}
                      >
                        Annulla Quota
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Modal>

        {/* MODAL: ESPORTAZIONE DATI PAGAMENTI */}
        <Modal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          title="Esportazione Dati Pagamenti"
          description="Seleziona il tipo di report e il formato che desideri esportare."
        >
          <div className="space-y-4">
            <Select
              label="Tipo Report"
              value={exportType}
              onChange={(e) => setExportType(e.target.value as 'filtered' | 'annual')}
              options={[
                { value: 'filtered', label: 'Report Mensile / Filtrato corrente' },
                { value: 'annual', label: 'Prospetto Annuale completo' },
              ]}
            />

            <Select
              label="Formato File"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as 'pdf' | 'csv')}
              options={[
                { value: 'pdf', label: 'Documento PDF Professionale' },
                { value: 'csv', label: 'Fogli di calcolo Excel / Google Sheets (CSV)' },
              ]}
            />

            {exportType === 'annual' && (
              <Input
                label="Anno Solare di Riferimento"
                type="number"
                value={exportYear}
                onChange={(e) => setExportYear(Number(e.target.value))}
              />
            )}

            {exportType === 'filtered' && (
              <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-xs text-white/50 space-y-1">
                <p className="font-semibold text-white/75">Nota sui filtri attivi:</p>
                <p>Questo report utilizzerà i filtri impostati a schermo:</p>
                <p>· Mese: {monthFilter === 0 ? 'Tutti i mesi' : `Mese ${monthFilter}`}</p>
                <p>· Corso: {courseFilter === 'all' ? 'Tutti i corsi' : courses.find(c => c.id === courseFilter)?.name}</p>
                <p>· Stato: {statusFilter === 'all' ? 'Tutti gli stati' : statusFilter.toUpperCase()}</p>
              </div>
            )}

            <ModalFooter>
              <Button variant="secondary" onClick={() => setIsExportModalOpen(false)}>Annulla</Button>
              <Button onClick={handleExecuteExport}>Esporta Ora</Button>
            </ModalFooter>
          </div>
        </Modal>

        {/* MODAL: GENERA QUOTE MENSILI */}
        <Modal
          isOpen={isGenerateModalOpen}
          onClose={() => setIsGenerateModalOpen(false)}
          title="Genera Quote Mensili"
          description="Crea automaticamente gli addebiti per tutti gli allievi iscritti a un corso."
        >
          <div className="space-y-4">
            <Select
              label="Seleziona Corso"
              value={genCourseId}
              onChange={(e) => setGenCourseId(e.target.value)}
              options={[
                { value: '', label: 'Scegli...' },
                ...courses.filter(c => c.isActive && c.fee?.monthly).map(c => ({ value: c.id, label: `${c.name} (€${c.fee!.monthly})` }))
              ]}
            />
            
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Mese"
                value={String(genMonth)}
                onChange={(e) => setGenMonth(Number(e.target.value))}
                options={Array.from({ length: 12 }).map((_, i) => ({ value: String(i + 1), label: `Mese ${i + 1}` }))}
              />
              <Input
                label="Anno"
                type="number"
                value={genYear}
                onChange={(e) => setGenYear(Number(e.target.value))}
              />
            </div>

            <Input
              label="Data di Scadenza"
              type="date"
              value={genDueDate}
              onChange={(e) => setGenDueDate(e.target.value)}
            />

            <ModalFooter>
              <Button variant="secondary" onClick={() => setIsGenerateModalOpen(false)}>Annulla</Button>
              <Button onClick={handleGenerateFees}>Genera Quote</Button>
            </ModalFooter>
          </div>
        </Modal>

        {/* MODAL: NUOVO ADDEBITO MANUALE */}
        <PaymentForm
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
        />
      </div>
    </ErrorBoundary>
  );
}
