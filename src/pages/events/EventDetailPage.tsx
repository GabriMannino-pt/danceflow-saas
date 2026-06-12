import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, collection, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useEvents } from '@/hooks/useEvents';
import { usePayments } from '@/hooks/usePayments';
import { useSchoolStore } from '@/stores/schoolStore';
import { useAuthStore } from '@/stores/authStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardTitle, Select, Button, Badge, Skeleton, EmptyState, Input, Modal, ModalFooter } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  Calendar, MapPin, DollarSign, Users, Trash2, Plus, ArrowLeft, ShieldAlert, Download, CheckCircle, Clock, Edit, XCircle
} from 'lucide-react';
import { COLLECTIONS, eventConverter, paymentConverter, nowTimestamp } from '@/lib/converters';
import { formatCurrency } from '@/lib/utils';
import type { Event, Payment, PaymentMethod } from '@/types';
import { generateReceiptPDF } from '@/lib/pdf';
import toast from 'react-hot-toast';

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const user = useAuthStore((s) => s.user);
  const schoolId = user?.schoolId;

  const students = useSchoolStore((s) => s.students);
  const activeSchool = useSchoolStore((s) => s.activeSchool);
  const { addParticipant, removeParticipant } = useEvents();
  
  const { 
    createPayment, 
    payments,
    registerInstallment,
    updateInstallment,
    deleteInstallment,
    emitInstallmentReceipt,
    cancelPayment
  } = usePayments();

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<Event | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [registering, setRegistering] = useState(false);

  // Manage modal states
  const [selectedManagePayment, setSelectedManagePayment] = useState<Payment | null>(null);
  const [editingInstallmentIndex, setEditingInstallmentIndex] = useState<number | null>(null);
  const [editInstallmentAmount, setEditInstallmentAmount] = useState<number>(0);
  const [editInstallmentDate, setEditInstallmentDate] = useState<string>('');
  const [editInstallmentMethod, setEditInstallmentMethod] = useState<PaymentMethod>('cash');
  const [editInstallmentNotes, setEditInstallmentNotes] = useState<string>('');
  
  const [isCancellingPayment, setIsCancellingPayment] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Pay states
  const [payingPayment, setPayingPayment] = useState<Payment | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState<string>('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [payEmitReceipt, setPayEmitReceipt] = useState(false);

  // Sottoscrizione all'evento corrente
  useEffect(() => {
    if (!id || !schoolId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    
    const ref = doc(db, COLLECTIONS.events(schoolId), id).withConverter(eventConverter);

    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setEvent(snap.data());
      } else {
        setEvent(null);
      }
      setLoading(false);
    }, (err) => {
      console.error('[EventDetailPage] Snapshot error:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [id, schoolId]);

  // Initialize values when opening payment modal
  useEffect(() => {
    if (payingPayment) {
      setPayAmount(payingPayment.remainingAmount ?? payingPayment.amount);
      setPayDate(new Date().toISOString().split('T')[0]);
      setPayNotes('');
      setPayEmitReceipt(false);
    }
  }, [payingPayment]);

  // Lista di tutti gli allievi iscritti a questo evento
  const participants = useMemo(() => {
    if (!event || !event.participantIds) return [];
    return students.filter((s) => event.participantIds.includes(s.id));
  }, [event, students]);

  // Filtra allievi per la dropdown (solo quelli non ancora iscritti all'evento)
  const nonParticipantsOptions = useMemo(() => {
    if (!event) return [];
    const enrolledIds = event.participantIds || [];
    return students
      .filter((s) => !s.isDeleted && s.isActive && !enrolledIds.includes(s.id))
      .map((s) => ({
        value: s.id,
        label: `${s.lastName} ${s.firstName}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [event, students]);

  // Calcola lo stato dei pagamenti per questo evento
  const eventPayments = useMemo(() => {
    if (!event) return [];
    return payments.filter((p) => p.courseId === event.id || p.description.includes(event.name));
  }, [event, payments]);

  // Risolve i pagamenti per applicare quote personalizzate all'evento in tempo reale
  const resolvedEventPayments = useMemo(() => {
    return eventPayments.map((p) => {
      const student = students.find((s) => s.id === p.studentId);
      const hasCustomFee = student && student.customShowFee !== undefined && student.customShowFee !== null;
      
      const total = (p.type === 'event' && hasCustomFee)
        ? student.customShowFee!
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
  }, [eventPayments, students]);

  // Calcola i totali contabili per l'evento
  const financialStats = useMemo(() => {
    let dovuto = 0;
    let incassato = 0;
    let residuo = 0;
    let morosi = 0;

    resolvedEventPayments.forEach((p) => {
      if (p.status !== 'cancelled') {
        dovuto += p.totalAmount;
        incassato += p.paidAmount;
        residuo += p.remainingAmount;
        if (p.status === 'overdue') {
          morosi++;
        }
      }
    });

    return { dovuto, incassato, residuo, morosi };
  }, [resolvedEventPayments]);

  const managedPayment = useMemo(() => {
    if (!selectedManagePayment) return null;
    return resolvedEventPayments.find(p => p.id === selectedManagePayment.id) || null;
  }, [selectedManagePayment, resolvedEventPayments]);

  // Iscrizione di un allievo
  const handleAdd = async () => {
    if (!event || !selectedStudentId) return;

    setRegistering(true);
    try {
      // 1. Aggiungi partecipante all'evento
      await addParticipant(event.id, selectedStudentId);

      // 2. Se l'evento ha una quota prevista, genera automaticamente un pagamento in sospeso
      if (event.fee && event.fee > 0) {
        await createPayment({
          studentId: selectedStudentId,
          courseId: event.id, // usiamo courseId per legare l'evento
          description: `Quota Iscrizione: ${event.name}`,
          amount: event.fee,
          currency: 'EUR',
          status: 'pending',
          dueDate: event.startDate, // scade il giorno dell'evento
          type: 'event',
        });
      }

      setSelectedStudentId('');
      toast.success('Allievo iscritto con successo all\'evento!');
    } catch (err) {
      console.error('[EventDetailPage] Add participant failed:', err);
      toast.error('Impossibile iscrivere l\'allievo.');
    } finally {
      setRegistering(false);
    }
  };

  // Iscrizione massiva di tutti gli allievi attivi
  const handleEnrollAllActive = async () => {
    if (!event || !schoolId) return;

    // Filtra gli allievi attivi e non cancellati che non partecipano ancora
    const activeNonEnrolled = students.filter(
      (st) => st.isActive && !st.isDeleted && !event.participantIds?.includes(st.id)
    );

    if (activeNonEnrolled.length === 0) {
      toast.error('Tutti gli allievi attivi sono già iscritti a questo evento!');
      return;
    }

    if (confirm(`Sei sicuro di voler iscrivere tutti i ${activeNonEnrolled.length} allievi attivi a questo evento?`)) {
      setRegistering(true);
      try {
        const studentIdsToEnroll = activeNonEnrolled.map((st) => st.id);

        // 1. Aggiorna l'evento inserendo i nuovi allievi
        const eventRef = doc(db, COLLECTIONS.events(schoolId), event.id).withConverter(eventConverter);
        await updateDoc(eventRef, {
          participantIds: [...(event.participantIds || []), ...studentIdsToEnroll],
          updatedAt: nowTimestamp(),
        });

        // 2. Se l'evento ha una quota, crea gli addebiti in sospeso per ciascuno
        if (event.fee && event.fee > 0) {
          const batch = writeBatch(db);
          activeNonEnrolled.forEach((st) => {
            // Controlla se ha una quota saggio personalizzata
            const amount = st.customShowFee ?? event.fee!;
            const paymentRef = doc(collection(db, COLLECTIONS.payments(schoolId))).withConverter(paymentConverter);
            const newPayment: Payment = {
              id: paymentRef.id,
              schoolId,
              studentId: st.id,
              courseId: event.id,
              description: `Quota Iscrizione: ${event.name}`,
              amount,
              totalAmount: amount,
              remainingAmount: amount,
              currency: 'EUR',
              status: 'pending',
              dueDate: event.startDate,
              type: 'event',
              createdAt: nowTimestamp(),
              updatedAt: nowTimestamp(),
              payments: [],
            };
            batch.set(paymentRef, newPayment);
          });
          await batch.commit();
        }

        toast.success(`Iscritti ${studentIdsToEnroll.length} allievi con successo!`);
      } catch (err) {
        console.error('[EventDetailPage] Enroll all active failed:', err);
        toast.error('Errore durante l\'iscrizione massiva degli allievi.');
      } finally {
        setRegistering(false);
      }
    }
  };

  // Rimozione di un allievo
  const handleRemove = async (studentId: string) => {
    if (!event) return;
    if (confirm('Sei sicuro di voler rimuovere questo partecipante dall\'evento?')) {
      try {
        await removeParticipant(event.id, studentId);
        toast.success('Partecipante rimosso.');
      } catch (err) {
        console.error(err);
        toast.error('Errore durante la rimozione.');
      }
    }
  };

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
        const studentObj = students.find(s => s.id === payingPayment.studentId);
        const eventCourse = event ? { id: event.id, name: event.name } as any : undefined;
        if (studentObj && activeSchool) {
          const docPDF = await generateReceiptPDF(res.updates, studentObj, activeSchool, eventCourse, res.newInstallment);
          docPDF.save(`Ricevuta_${res.updates.receiptNumber || res.updates.id}.pdf`);
        }
      }

      setPayingPayment(null);
      setPayMethod('cash');
      setPayEmitReceipt(false);
      setPayNotes('');
      toast.success('Incasso registrato con successo!');
    } catch (err) {
      console.error(err);
      toast.error('Errore durante la registrazione del versamento.');
    }
  };

  const handleDeleteInstallmentClick = async (paymentId: string, index: number) => {
    if (!window.confirm('Sei sicuro di voler eliminare questo versamento? Residuo e stato verranno ricalcolati.')) return;
    try {
      await deleteInstallment(paymentId, index);
      toast.success('Versamento eliminato.');
    } catch (err) {
      console.error(err);
      toast.error('Errore durante l\'eliminazione.');
    }
  };

  const handleEmitReceiptClick = async (paymentId: string, index: number) => {
    try {
      const res = await emitInstallmentReceipt(paymentId, index);
      if (res) {
        const studentObj = students.find(s => s.id === res.updates.studentId);
        const eventCourse = event ? { id: event.id, name: event.name } as any : undefined;
        if (studentObj && activeSchool) {
          const docPDF = await generateReceiptPDF(res.updates, studentObj, activeSchool, eventCourse, res.newInstallment);
          docPDF.save(`Ricevuta_${res.updates.receiptNumber || res.updates.id}.pdf`);
          toast.success('Ricevuta emessa e scaricata!');
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Errore durante l\'emissione della ricevuta.');
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
      toast.success('Versamento modificato.');
    } catch (err) {
      console.error(err);
      toast.error('Errore durante il salvataggio.');
    }
  };

  const handleConfirmCancelPayment = async (paymentId: string) => {
    if (!cancelReason.trim()) return;
    try {
      await cancelPayment(paymentId, cancelReason.trim());
      setIsCancellingPayment(false);
      setCancelReason('');
      setSelectedManagePayment(null);
      toast.success('Quota annullata con successo.');
    } catch (err) {
      console.error(err);
      toast.error('Errore durante l\'annullamento.');
    }
  };

  const handleDownloadReceipt = async (payment: Payment, installment?: any) => {
    if (!activeSchool) return;
    const studentObj = students.find(s => s.id === payment.studentId);
    if (!studentObj) {
      toast.error('Allievo non trovato');
      return;
    }
    const eventCourse = event ? { id: event.id, name: event.name } as any : undefined;
    
    try {
      const docPDF = await generateReceiptPDF(payment, studentObj, activeSchool, eventCourse, installment);
      docPDF.save(`Ricevuta_${payment.receiptNumber || payment.id}.pdf`);
      toast.success('Ricevuta scaricata!');
    } catch (err) {
      console.error(err);
      toast.error('Errore durante la generazione del PDF');
    }
  };

  // Esportazione allievi iscritti in formato CSV (standard per federazioni gare)
  const exportToCSV = () => {
    if (!event || participants.length === 0) return;

    const headers = ['Cognome', 'Nome', 'Data Nascita', 'Genere', 'Codice Fiscale', 'Email', 'Telefono', 'Gara / Evento'];

    const rows = participants.map((student) => [
      student.lastName,
      student.firstName,
      student.dateOfBirth ? format(student.dateOfBirth.toDate(), 'dd/MM/yyyy') : '',
      student.gender,
      student.fiscalCode || '',
      student.contact.studentEmail || student.contact.parentEmail || '',
      student.contact.studentPhone || student.contact.parentPhone || '',
      event.name
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((val) => `"${val.toString().replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `esportazione_iscritti_${event.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToCompetitionJSON = (evt: Event, parts: any[]) => {
    const exportData = {
      format: "danceflow-competition-v1",
      version: "1.0",
      generatedAt: new Date().toISOString(),
      event: { id: evt.id, name: evt.name, date: evt.startDate.toDate().toISOString(), type: evt.type },
      participants: parts.map(p => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        dateOfBirth: p.dateOfBirth.toDate().toISOString(),
        gender: p.gender,
        fiscalCode: p.fiscalCode || ''
      }))
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `export_gare_${evt.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const statusVariant: Record<string, 'success' | 'danger' | 'warning' | 'gray'> = {
    paid: 'success', overdue: 'danger', pending: 'warning', cancelled: 'gray', deposit_paid: 'warning',
  };
  const statusLabel: Record<string, string> = {
    paid: 'Saldato', overdue: 'Scaduto', pending: 'In attesa', cancelled: 'Annullato', deposit_paid: 'Acconto',
  };

  if (loading) {
    return (
      <div className='space-y-6 page-enter'>
        <Skeleton className='h-8 w-64' />
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          <Skeleton className='h-48 lg:col-span-2' />
          <Skeleton className='h-48' />
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <EmptyState
        icon='🔍'
        title='Evento non trovato'
        description="L'evento richiesto potrebbe essere stato eliminato o non esistere."
        action={{
          label: 'Torna agli Eventi',
          onClick: () => navigate('/events'),
        }}
      />
    );
  }

  const date = event.startDate.toDate();

  return (
    <ErrorBoundary>
      <div className='page-enter space-y-6'>
        <button
          onClick={() => navigate('/events')}
          className='flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors'
        >
          <ArrowLeft size={16} />
          <span>Torna all'elenco eventi</span>
        </button>

        <PageHeader
          title={event.name}
          subtitle={`Dettagli e iscritti per la categoria ${event.type.toUpperCase()}`}
          actions={
            <div className='flex gap-2'>
              {participants.length > 0 && (
                <>
                  <Button
                    variant='outline'
                    size='sm'
                    icon={<Download size={14} />}
                    onClick={exportToCSV}
                  >
                    Esporta CSV (Gare)
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    icon={<Download size={14} />}
                    onClick={() => exportToCompetitionJSON(event, participants)}
                  >
                    Esporta per Gestionale Gare
                  </Button>
                </>
              )}
              <Badge
                variant={
                  event.type === 'show' ? 'brand' :
                  event.type === 'competition' ? 'coral' :
                  event.type === 'workshop' ? 'teal' : 'gold'
                }
                size='md'
              >
                {event.type.toUpperCase()}
              </Badge>
            </div>
          }
        />

        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          <div className='lg:col-span-2 space-y-6'>
            {/* ── Scheda Dettagli Anagrafici ────────────────────────────────── */}
            <Card>
              <CardTitle className='mb-4'>Informazioni Evento</CardTitle>
              {event.description && (
                <p className='text-sm text-white/70 mb-4 whitespace-pre-wrap'>{event.description}</p>
              )}

              <div className='grid grid-cols-2 gap-4 text-xs sm:text-sm text-white/60'>
                <div className='flex items-center gap-2'>
                  <Calendar size={16} className='text-brand-300' />
                  <div>
                    <p className='text-[10px] text-white/40'>Data e Ora</p>
                    <p className='text-white font-medium'>
                      {format(date, 'dd MMMM yyyy HH:mm', { locale: it })}
                    </p>
                  </div>
                </div>

                <div className='flex items-center gap-2'>
                  <MapPin size={16} className='text-teal-400' />
                  <div>
                    <p className='text-[10px] text-white/40'>Luogo</p>
                    <p className='text-white font-medium'>{event.location || 'Sede scuola'}</p>
                  </div>
                </div>

                <div className='flex items-center gap-2'>
                  <DollarSign size={16} className='text-gold-400' />
                  <div>
                    <p className='text-[10px] text-white/40'>Quota Iscrizione</p>
                    <p className='text-white font-medium'>
                      {event.fee ? formatCurrency(event.fee) : 'Gratuito'}
                    </p>
                  </div>
                </div>

                <div className='flex items-center gap-2'>
                  <Users size={16} className='text-coral-400' />
                  <div>
                    <p className='text-[10px] text-white/40'>Posti Disponibili</p>
                    <p className='text-white font-medium'>
                      {event.participantIds?.length || 0}
                      {event.maxParticipants && ` / ${event.maxParticipants}`}
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* ── Card Riepilogo Finanziario ────────────────────────────────── */}
            {event.fee !== undefined && event.fee > 0 && (
              <Card className="p-5 border border-white/8">
                <CardTitle className='mb-4 text-xs font-semibold uppercase tracking-wider text-brand-400'>Riepilogo Finanziario Evento</CardTitle>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl">
                    <p className="text-[10px] text-white/40 uppercase font-semibold">Totale Dovuto</p>
                    <p className="text-xl font-bold text-white mt-1">€{financialStats.dovuto.toFixed(2)}</p>
                  </div>
                  <div className="bg-teal-500/5 border border-teal-500/10 p-3 rounded-xl">
                    <p className="text-[10px] text-white/40 uppercase font-semibold text-teal-300">Totale Incassato</p>
                    <p className="text-xl font-bold text-teal-400 mt-1">€{financialStats.incassato.toFixed(2)}</p>
                  </div>
                  <div className="bg-coral-500/5 border border-coral-500/10 p-3 rounded-xl">
                    <p className="text-[10px] text-white/40 uppercase font-semibold text-coral-300">Totale Residuo</p>
                    <p className="text-xl font-bold text-coral-400 mt-1">€{financialStats.residuo.toFixed(2)}</p>
                  </div>
                  <div className="bg-gold-500/5 border border-gold-500/10 p-3 rounded-xl">
                    <p className="text-[10px] text-white/40 uppercase font-semibold text-gold-300">Allievi Morosi</p>
                    <p className="text-xl font-bold text-gold-400 mt-1">{financialStats.morosi}</p>
                  </div>
                </div>
              </Card>
            )}

            {/* ── Gestione Iscritti ────────────────────────────────────────── */}
            <Card>
              <div className='flex items-center justify-between mb-4'>
                <CardTitle>Allievi Iscritti ({participants.length})</CardTitle>
              </div>

              {participants.length === 0 ? (
                <EmptyState
                  icon='👥'
                  title='Nessun allievo iscritto'
                  description='Utilizza il pannello a destra per iscrivere il primo partecipante.'
                />
              ) : (
                <div className='divide-y divide-white/5 space-y-2'>
                  {participants.map((student) => {
                    const payment = resolvedEventPayments.find((p) => p.studentId === student.id);
                    return (
                      <div key={student.id} className='flex items-center justify-between gap-4 p-3 hover:bg-white/5 rounded-xl transition-all border border-white/5 bg-black/10'>
                        <div className='flex items-center gap-3'>
                          <div className='w-9 h-9 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-300 text-sm font-bold flex-shrink-0'>
                            {student.firstName.charAt(0)}{student.lastName.charAt(0)}
                          </div>
                          <div>
                            <p className='text-sm font-semibold text-white'>
                              {student.firstName} {student.lastName}
                            </p>
                            {payment ? (
                              <div className='flex flex-col sm:flex-row sm:items-center gap-2 mt-1'>
                                <Badge
                                  variant={statusVariant[payment.status] || 'warning'}
                                  size='sm'
                                >
                                  {statusLabel[payment.status] || payment.status.toUpperCase()}
                                </Badge>
                                <span className="text-xs text-white/40">
                                  Incassato: €{(payment.paidAmount ?? 0).toFixed(2)} su €{(payment.totalAmount ?? 0).toFixed(2)}
                                </span>
                              </div>
                            ) : (
                              event.fee && event.fee > 0 && (
                                <span className="text-xs text-coral-400 mt-1 block">Nessun pagamento registrato</span>
                              )
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {payment && (
                            <>
                              {(payment.status === 'pending' || payment.status === 'deposit_paid' || payment.status === 'overdue') && (
                                <Button
                                  size="xs"
                                  onClick={() => setPayingPayment(payment)}
                                  icon={<CheckCircle size={12} />}
                                >
                                  Incassa
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => setSelectedManagePayment(payment)}
                                icon={<Clock size={12} />}
                              >
                                Storico
                              </Button>
                            </>
                          )}
                          <Button
                            variant='danger'
                            size='xs'
                            icon={<Trash2 size={12} />}
                            onClick={() => handleRemove(student.id)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* ── Pannello Iscrizione Rapida ────────────────────────────────── */}
          <div className='space-y-4'>
            <Card>
              <CardTitle className='mb-3'>Iscrizione Rapida</CardTitle>
              
              {event.maxParticipants && (event.participantIds?.length || 0) >= event.maxParticipants ? (
                <div className='flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300'>
                  <ShieldAlert size={16} className='flex-shrink-0' />
                  <span>Raggiunto il numero massimo di partecipanti per questo evento.</span>
                </div>
              ) : (
                <div className='space-y-4'>
                  <Select
                    label='Seleziona Allievo'
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    options={[
                      { value: '', label: 'Scegli un allievo...' },
                      ...nonParticipantsOptions
                    ]}
                  />
                  <Button
                    onClick={handleAdd}
                    loading={registering}
                    disabled={!selectedStudentId}
                    className='w-full'
                    icon={<Plus size={16} />}
                  >
                    Iscrivi Allievo
                  </Button>
                  
                  <div className='border-t border-white/5 pt-4 flex flex-col gap-2'>
                    <p className='text-[10px] text-white/40 text-center font-sans'>
                      Oppure iscrivi tutti gli allievi attivi in un colpo solo
                    </p>
                    <Button
                      onClick={handleEnrollAllActive}
                      loading={registering}
                      variant='secondary'
                      className='w-full border border-brand-500/20 text-brand-300 hover:bg-brand-500/10'
                      icon={<Users size={16} />}
                    >
                      Iscrivi tutti gli allievi attivi
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* MODAL: INCASSA PAGAMENTO EVENTO */}
        <Modal
          isOpen={!!payingPayment}
          onClose={() => setPayingPayment(null)}
          title="Registra Versamento Evento"
          description={`Inserisci i dettagli del pagamento per l'allievo.`}
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

        {/* MODAL: GESTIONE STORICO E DETTAGLIO PAGAMENTO EVENTO */}
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
                    <Badge variant={statusVariant[managedPayment.status] || 'brand'} size="sm">
                      {statusLabel[managedPayment.status] || managedPayment.status.toUpperCase()}
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
                        placeholder="Es. Ritiro dell'allievo dall'evento"
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
      </div>
    </ErrorBoundary>
  );
}
