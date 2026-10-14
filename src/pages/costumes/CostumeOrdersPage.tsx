import React, { useState, useMemo, useEffect } from 'react';
import { useCostumes } from '@/hooks/useCostumes';
import { useEvents } from '@/hooks/useEvents';
import { useStudents } from '@/hooks/useStudents';
import { useCourses } from '@/hooks/useCourses';
import { useSchoolStore } from '@/stores/schoolStore';
import { useAuthStore } from '@/stores/authStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Select, Input, Textarea, Button, Badge, Skeleton, EmptyState, Modal, ModalFooter } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { format } from 'date-fns';
import {
  Plus, Users, DollarSign, Download, Eye, FileSpreadsheet, CreditCard,
  Ruler, Shirt, Check, Sparkles,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { computeCostumeSize } from '@/pages/students/StudentDetailPage';
import jsPDF from 'jspdf';
import type { CostumeOrder, CostumeItem, Student, CostumeMeasurements } from '@/types';

import { generateReceiptPDF } from '@/lib/pdf';
import { getNextReceiptNumber } from '@/services/receiptService';
import { doc, collection, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS, paymentConverter, nowTimestamp } from '@/lib/converters';
import toast from 'react-hot-toast';

export default function CostumeOrdersPage() {
  const user = useAuthStore((s) => s.user);
  const isTeacher = user?.role === 'teacher';
  const { editStudent, fetchStudents } = useStudents();
  useCourses();

  useEffect(() => {
    void fetchStudents();
  }, []);

  const courses = useSchoolStore((s) => s.courses);
  const { loading: ordersLoading, orders, createOrder, updateOrderStatus, updateOrder } = useCostumes();
  const { events } = useEvents();
  const students = useSchoolStore((s) => s.students);
  const activeSchool = useSchoolStore((s) => s.activeSchool);

  const activeCourses = useMemo(() => courses.filter((c) => c.isActive && !c.isDeleted), [courses]);
  const teacherCourses = useMemo(() => activeCourses.filter((c) => c.teacherIds?.includes(user?.uid || '')), [activeCourses, user?.uid]);
  const availableCourses = useMemo(() => isTeacher && teacherCourses.length > 0 ? teacherCourses : activeCourses, [isTeacher, teacherCourses, activeCourses]);

  const [activeTab, setActiveTab] = useState<'orders' | 'measurements'>(isTeacher ? 'measurements' : 'orders');
  const [measuringCourseId, setMeasuringCourseId] = useState<string>(() => {
    if (isTeacher && teacherCourses.length > 0) return teacherCourses[0].id;
    if (activeCourses.length > 0) return activeCourses[0].id;
    return '';
  });

  useEffect(() => {
    if (isTeacher && activeTab !== 'measurements') {
      setActiveTab('measurements');
    }
  }, [isTeacher, activeTab]);

  useEffect(() => {
    if (!measuringCourseId && availableCourses.length > 0) {
      setMeasuringCourseId(availableCourses[0].id);
    }
  }, [availableCourses, measuringCourseId]);

  const measuringStudents = useMemo(() => {
    if (!measuringCourseId) return [];
    return students.filter((s) => s.isActive && !s.isDeleted && s.enrolledCourseIds?.includes(measuringCourseId));
  }, [measuringCourseId, students]);

  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [measForm, setMeasForm] = useState<CostumeMeasurements>({});
  const [savingMeasurements, setSavingMeasurements] = useState(false);

  const handleOpenMeasureModal = (student: Student) => {
    setEditingStudent(student);
    setMeasForm(student.costumes || {});
  };

  const handleSaveMeasurements = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setSavingMeasurements(true);
    try {
      const updated: CostumeMeasurements = {
        ...measForm,
        lastMeasuredAt: nowTimestamp(),
      };
      await editStudent(editingStudent.id, { costumes: updated });
      toast.success(`Misure aggiornate per ${editingStudent.firstName} ${editingStudent.lastName}`);
      setEditingStudent(null);
    } catch (err) {
      console.error('Save measurements error:', err);
      toast.error('Errore durante il salvataggio delle misure');
    } finally {
      setSavingMeasurements(false);
    }
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<CostumeOrder | null>(null);

  // Form States per Nuovo Ordine
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [supplier, setSupplier] = useState('');
  const [eventId, setEventId] = useState('');
  const [unitCost, setUnitCost] = useState<number>(35);
  const [creating, setCreating] = useState(false);
  const [itemCategory, setItemCategory] = useState('Costumi Spettacolo');
  const [customCategory, setCustomCategory] = useState('');

  // Payment States
  const [payingItem, setPayingItem] = useState<CostumeItem | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [emettiRicevuta, setEmettiRicevuta] = useState<boolean>(true);

  useEffect(() => {
    if (payingItem) {
      const amountPaid = (payingItem.paymentsLog || []).reduce((sum, p) => sum + p.amount, 0);
      const remaining = Math.max(0, (payingItem.fixedAmount || 0) - amountPaid);
      setPaymentAmount(remaining);
      setEmettiRicevuta(true);
    }
  }, [payingItem]);

  // Calcola allievi iscritti all'evento per pre-compilare l'ordine
  const selectedEventParticipants = useMemo(() => {
    if (!eventId) return [];
    const event = events.find((e) => e.id === eventId);
    if (!event || !event.participantIds) return [];
    return students.filter((s) => event.participantIds.includes(s.id));
  }, [eventId, events, students]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !supplier || !eventId) {
      alert('Compila tutti i campi obbligatori.');
      return;
    }

    if (selectedEventParticipants.length === 0) {
      alert('L\'evento selezionato non ha ancora nessun allievo iscritto. Iscrivi prima gli allievi dall\'evento.');
      return;
    }

    setCreating(true);
    try {
      // Prepara i singoli capi per l'ordine recuperando le misure di ciascun allievo
      const items: CostumeItem[] = selectedEventParticipants.map((student) => {
        const m = student.costumes;
        const calculatedSize = m ? computeCostumeSize(m.chest, m.waist, m.hips) : undefined;
        return {
          studentId: student.id,
          description: `Costume per ${student.firstName} ${student.lastName}`,
          size: calculatedSize || 'M', // M come taglia di fallback
          measurements: m || undefined,
          quantity: 1,
          unitCost,
          fixedAmount: unitCost,
          fittingNotes: '',
          paymentsLog: [],
        };
      });

      const totalCost = items.reduce((sum, item) => sum + (item.unitCost || 0) * item.quantity, 0);

      await createOrder({
        name,
        description: description || undefined,
        supplier: supplier || undefined,
        eventId: eventId || undefined,
        items,
        status: 'draft',
        totalCost,
        itemCategory: itemCategory === 'Altro' ? customCategory.trim() : itemCategory,
      });

      setName('');
      setDescription('');
      setSupplier('');
      setEventId('');
      setItemCategory('Costumi Spettacolo');
      setCustomCategory('');
      setIsModalOpen(false);
    } catch (err) {
      console.error('[CostumeOrdersPage] Create failed:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !payingItem || !activeSchool) return;

    if (paymentAmount <= 0) {
      toast.error('Inserisci un importo valido.');
      return;
    }

    const toastId = toast.loading('Registrazione pagamento in corso...');

    try {
      let receiptNumber: string | undefined = undefined;

      if (emettiRicevuta) {
        // Genera receiptNumber progressivo
        receiptNumber = await getNextReceiptNumber(activeSchool.id);

        // Crea documento Payment in Firestore per contabilità
        const paymentId = doc(collection(db, 'placeholder')).id;
        const paymentRef = doc(db, COLLECTIONS.payments(activeSchool.id), paymentId).withConverter(paymentConverter);

        const newPayment = {
          id: paymentId,
          schoolId: activeSchool.id,
          studentId: payingItem.studentId,
          description: `Versamento Costume - Ordine: ${selectedOrder.name} (${selectedOrder.itemCategory || 'Costumi'})`,
          amount: paymentAmount,
          totalAmount: paymentAmount,
          paidAmount: paymentAmount,
          remainingAmount: 0,
          currency: 'EUR' as const,
          status: 'paid' as const,
          dueDate: nowTimestamp(),
          paidAt: nowTimestamp(),
          method: 'cash' as const,
          type: 'costume' as const,
          receiptNumber,
          createdAt: nowTimestamp(),
          updatedAt: nowTimestamp(),
        };

        await setDoc(paymentRef, newPayment);

        // Genera e scarica PDF ricevuta
        const studentObj = students.find((s) => s.id === payingItem.studentId);
        if (studentObj) {
          try {
            const pdf = await generateReceiptPDF(newPayment, studentObj, activeSchool);
            pdf.save(`Ricevuta_${receiptNumber}.pdf`);
            toast.success('Ricevuta PDF scaricata.');
          } catch (pdfErr) {
            console.error('Error generating PDF receipt:', pdfErr);
            toast.error('Errore nella generazione del file PDF.');
          }
        }
      }

      // Salva entry nel paymentsLog del costume
      const logEntry = {
        amount: paymentAmount,
        date: nowTimestamp(),
        receiptIssued: emettiRicevuta,
        receiptNumber,
      };

      const updatedItems = selectedOrder.items.map((item) => {
        if (item.studentId === payingItem.studentId) {
          return {
            ...item,
            paymentsLog: [...(item.paymentsLog || []), logEntry],
          };
        }
        return item;
      });

      await updateOrder(selectedOrder.id, {
        items: updatedItems,
      });

      setSelectedOrder((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          items: updatedItems,
        };
      });

      toast.success('Pagamento registrato con successo!', { id: toastId });
      setPayingItem(null);
    } catch (err: any) {
      console.error('[CostumeOrdersPage] Register payment failed:', err);
      toast.error(err.message || 'Errore durante la registrazione del pagamento.', { id: toastId });
    }
  };

  const handleExportMatrix = (order: CostumeOrder) => {
    // Aggrega per modello/descrizione e taglia
    const aggregation: Record<string, Record<string, number>> = {};
    order.items.forEach(item => {
      const model = item.description || order.name;
      const size = item.size || 'M';
      const q = item.quantity || 1;

      if (!aggregation[model]) {
        aggregation[model] = {};
      }
      aggregation[model][size] = (aggregation[model][size] || 0) + q;
    });

    // Costruisci il CSV
    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += 'Articolo/Modello;Taglia;Quantità Ordinata\r\n';

    Object.entries(aggregation).forEach(([model, sizes]) => {
      Object.entries(sizes).forEach(([size, q]) => {
        csvContent += `"${model.replace(/"/g, '""')}";"${size}";${q} Pezzi\r\n`;
      });
    });

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `matrice_fornitore_${order.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Matrice fornitore esportata con successo!');
  };

  // ─── Generazione PDF Sartoria ───────────────────────────────────────────────
  const generateSartoriaPDF = (order: CostumeOrder) => {
    const doc = new jsPDF();
    const event = events.find((e) => e.id === order.eventId);

    // Titolo e Intestazione
    doc.setFillColor(26, 26, 36);
    doc.rect(0, 0, 210, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('Helvetica', 'bold');
    doc.text('TROPICAL STYLE - ORDINE SARTORIA', 15, 18);
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Generato il: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 15, 28);

    // Dati Ordine
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('Helvetica', 'bold');
    doc.text('Dettagli Commessa:', 15, 52);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Ordine: ${order.name}`, 15, 60);
    doc.text(`Fornitore / Sartoria: ${order.supplier || '—'}`, 15, 67);
    doc.text(`Evento Collegato: ${event?.name || '—'}`, 15, 74);
    doc.text(`Capi Totali: ${order.items?.length || 0} costumi`, 15, 81);

    // Tabella delle Misure
    doc.setFont('Helvetica', 'bold');
    doc.text('Registro Misure Allievi:', 15, 95);

    let y = 105;
    // Disegna intestazione tabella
    doc.setFillColor(240, 240, 245);
    doc.rect(15, y - 5, 180, 8, 'F');
    doc.setFontSize(9);
    doc.setFont('Helvetica', 'bold');
    doc.text('Allievo', 17, y);
    doc.text('Taglia', 65, y);
    doc.text('Altezza', 85, y);
    doc.text('Seno', 110, y);
    doc.text('Vita', 135, y);
    doc.text('Fianchi', 160, y);
    doc.text('Scarpa', 182, y);

    y += 8;

    order.items?.forEach((item) => {
      // Paginazione automatica
      if (y > 270) {
        doc.addPage();
        y = 25;
        // Ristampa intestazione tabella
        doc.setFillColor(240, 240, 245);
        doc.rect(15, y - 5, 180, 8, 'F');
        doc.setFont('Helvetica', 'bold');
        doc.text('Allievo', 17, y);
        doc.text('Taglia', 65, y);
        doc.text('Altezza', 85, y);
        doc.text('Seno', 110, y);
        doc.text('Vita', 135, y);
        doc.text('Fianchi', 160, y);
        doc.text('Scarpa', 182, y);
        y += 8;
      }

      const student = students.find((s) => s.id === item.studentId);
      const name = student ? `${student.firstName} ${student.lastName}` : '—';
      const m = item.measurements;

      doc.setFont('Helvetica', 'normal');
      doc.text(name.substring(0, 24), 17, y);
      doc.text(item.size || '—', 67, y);
      doc.text(m?.height ? `${m.height} cm` : '—', 85, y);
      doc.text(m?.chest ? `${m.chest} cm` : '—', 110, y);
      doc.text(m?.waist ? `${m.waist} cm` : '—', 135, y);
      doc.text(m?.hips ? `${m.hips} cm` : '—', 160, y);
      doc.text(m?.shoeSize ? `${m.shoeSize}` : '—', 184, y);

      y += 8;
    });

    // Conteggio Riepilogo Taglie in fondo
    const sizeCounts: Record<string, number> = {};
    order.items?.forEach((item) => {
      const s = item.size || 'Da misurare';
      sizeCounts[s] = (sizeCounts[s] || 0) + 1;
    });

    if (y > 240) {
      doc.addPage();
      y = 25;
    }

    y += 10;
    doc.setFillColor(245, 245, 250);
    doc.rect(15, y, 180, 20, 'F');
    doc.setFont('Helvetica', 'bold');
    doc.text('RIEPILOGO TAGLIE DA CONFEZIONARE:', 18, y + 7);
    doc.setFont('Helvetica', 'normal');
    
    const summaryStr = Object.entries(sizeCounts)
      .map(([size, count]) => `${size}: ${count} pz`)
      .join('   |   ');
    doc.text(summaryStr, 18, y + 14);

    doc.save(`ordine_sartoria_${order.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.pdf`);
  };

  return (
    <ErrorBoundary>
      <div className='page-enter space-y-6'>
        <PageHeader
          title={isTeacher ? 'Rilevazione Misure Costumi' : 'Gestione Costumi & Sartoria'}
          subtitle={
            isTeacher
              ? 'Rilevazione rapida touch-first delle misure sartoriali degli allievi in sala prove'
              : 'Ordini di produzione per spettacoli con calcolo taglie automatico e PDF sartoria'
          }
          actions={
            !isTeacher && (
              <Button icon={<Plus size={16} />} onClick={() => setIsModalOpen(true)}>
                Nuovo Ordine
              </Button>
            )
          }
        />

        {/* ── Switcher Modalità Admin (Fornitori vs Misure in Sala) ─────── */}
        {!isTeacher && (
          <div className="flex gap-2 p-1 bg-black/20 rounded-2xl border border-white/5 w-fit">
            <button
              onClick={() => setActiveTab('orders')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'orders'
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-500/20'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              <Shirt size={16} />
              Ordini Fornitori ({orders.length})
            </button>
            <button
              onClick={() => setActiveTab('measurements')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'measurements'
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-500/20'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              <Ruler size={16} />
              Misure Allievi in Sala Prove
            </button>
          </div>
        )}

        {/* ── Vista Rilevazione Misure in Sala ───────────────────────────── */}
        {(isTeacher || activeTab === 'measurements') && (
          <div className="space-y-6">
            <Card className="border border-white/5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1 max-w-md">
                  <Select
                    label={isTeacher ? "I Tuoi Corsi Assegnati" : "Seleziona Corso"}
                    value={measuringCourseId}
                    onChange={(e) => setMeasuringCourseId(e.target.value)}
                    options={[
                      { value: '', label: 'Scegli un corso...' },
                      ...availableCourses.map((c) => {
                        const count = students.filter(s => s.isActive && !s.isDeleted && s.enrolledCourseIds?.includes(c.id)).length;
                        return {
                          value: c.id,
                          label: `${c.name} (${c.style}) — ${count} ${count === 1 ? 'allievo' : 'allievi'}`,
                        };
                      })
                    ]}
                  />
                </div>
                <div className="flex items-center gap-2 text-xs text-white/50 bg-white/5 px-3.5 py-2.5 rounded-xl border border-white/5">
                  <Ruler size={14} className="text-brand-400" />
                  <span>
                    {measuringStudents.length} {measuringStudents.length === 1 ? 'allievo iscritto' : 'allievi iscritti'}
                  </span>
                </div>
              </div>
            </Card>

            {measuringCourseId ? (
              measuringStudents.length === 0 ? (
                <EmptyState
                  icon="👥"
                  title="Nessun allievo in questo corso"
                  description="Non risultano allievi attivi iscritti a questo corso."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {measuringStudents.map((st) => {
                    const m = st.costumes;
                    const calculatedSize = m ? computeCostumeSize(m.chest, m.waist, m.hips) : undefined;
                    const isComplete = Boolean(m?.chest && m?.waist && m?.hips && m?.height);

                    return (
                      <Card
                        key={st.id}
                        className="p-4 border border-white/5 hover:border-brand-500/30 transition-all flex flex-col justify-between gap-4"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-brand-500/20 text-brand-300 font-bold flex items-center justify-center text-xs flex-shrink-0">
                                {st.firstName.charAt(0)}{st.lastName.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-sm font-bold text-white leading-tight truncate">
                                  {st.firstName} {st.lastName}
                                </h4>
                                <p className="text-[11px] text-white/40 mt-0.5">
                                  {m?.lastMeasuredAt ? `Rilevato il ${format(m.lastMeasuredAt.toDate(), 'dd/MM/yyyy')}` : 'Da misurare'}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              {calculatedSize && (
                                <Badge variant="brand" size="sm">
                                  Taglia {calculatedSize}
                                </Badge>
                              )}
                              <Badge variant={isComplete ? "success" : (m?.chest || m?.waist) ? "warning" : "gray"} size="sm">
                                {isComplete ? "Completo" : (m?.chest || m?.waist) ? "Parziale" : "Da misurare"}
                              </Badge>
                            </div>
                          </div>

                          {/* Griglia Misure Touch */}
                          <div className="grid grid-cols-3 gap-1.5 text-xs">
                            <div className="bg-white/[0.03] p-2 rounded-xl border border-white/5 text-center">
                              <span className="text-[10px] text-white/40 block">Torace</span>
                              <span className="font-semibold text-white">{m?.chest ? `${m.chest} cm` : '—'}</span>
                            </div>
                            <div className="bg-white/[0.03] p-2 rounded-xl border border-white/5 text-center">
                              <span className="text-[10px] text-white/40 block">Vita</span>
                              <span className="font-semibold text-white">{m?.waist ? `${m.waist} cm` : '—'}</span>
                            </div>
                            <div className="bg-white/[0.03] p-2 rounded-xl border border-white/5 text-center">
                              <span className="text-[10px] text-white/40 block">Fianchi</span>
                              <span className="font-semibold text-white">{m?.hips ? `${m.hips} cm` : '—'}</span>
                            </div>
                            <div className="bg-white/[0.03] p-2 rounded-xl border border-white/5 text-center">
                              <span className="text-[10px] text-white/40 block">Altezza</span>
                              <span className="font-semibold text-white">{m?.height ? `${m.height} cm` : '—'}</span>
                            </div>
                            <div className="bg-white/[0.03] p-2 rounded-xl border border-white/5 text-center">
                              <span className="text-[10px] text-white/40 block">Scarpe</span>
                              <span className="font-semibold text-white">{m?.shoeSize ? `${m.shoeSize}` : '—'}</span>
                            </div>
                            <div className="bg-white/[0.03] p-2 rounded-xl border border-white/5 text-center">
                              <span className="text-[10px] text-white/40 block">Peso</span>
                              <span className="font-semibold text-white">{m?.weight ? `${m.weight} kg` : '—'}</span>
                            </div>
                          </div>

                          {m?.notes && (
                            <p className="text-[11px] text-white/60 bg-white/5 p-2 rounded-lg italic line-clamp-2">
                              "{m.notes}"
                            </p>
                          )}
                        </div>

                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Ruler size={14} />}
                          onClick={() => handleOpenMeasureModal(st)}
                          className="w-full text-xs"
                        >
                          {m?.chest ? 'Aggiorna Misure' : 'Rileva Misure in Sala'}
                        </Button>
                      </Card>
                    );
                  })}
                </div>
              )
            ) : (
              <EmptyState
                icon="📐"
                title="Seleziona un corso"
                description="Seleziona un corso in alto per visualizzare gli allievi e registrare le loro misure sartoriali."
              />
            )}
          </div>
        )}

        {/* ── Elenco Ordini Costumi (Solo Admin / non Insegnanti) ──────── */}
        {!isTeacher && activeTab === 'orders' && (
          <>
            {ordersLoading ? (
              <div className='space-y-4'>
                {[...Array(2)].map((_, i) => (
                  <Skeleton key={i} className='h-24 w-full rounded-2xl' />
                ))}
              </div>
            ) : orders.length === 0 ? (
              <EmptyState
                icon='📐'
                title='Nessun ordine costumi'
                description='Registra subito il tuo primo ordine legandolo a un saggio o a una gara.'
              />
            ) : (
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                {orders.map((order) => {
                  const event = events.find((e) => e.id === order.eventId);
                  return (
                    <Card key={order.id} className='p-5 border border-white/5 flex flex-col justify-between hover:border-white/10 transition-all'>
                      <div className='space-y-3'>
                        <div className='flex items-start justify-between gap-2'>
                          <div className='flex flex-wrap gap-1.5'>
                            <Badge
                              variant={
                                order.status === 'distributed' ? 'success' :
                                order.status === 'received' ? 'teal' :
                                order.status === 'ordered' ? 'warning' : 'gray'
                              }
                              size='sm'
                            >
                              {order.status === 'draft' && 'In lavorazione (Bozza)'}
                              {order.status === 'ordered' && 'Ordinato in Sartoria'}
                              {order.status === 'received' && 'Ricevuto a Scuola'}
                              {order.status === 'distributed' && 'Distribuito agli allievi'}
                            </Badge>
                            {order.itemCategory && (
                              <Badge variant='brand' size='sm'>
                                📂 {order.itemCategory}
                              </Badge>
                            )}
                          </div>
                          
                          <span className='text-xs text-white/30'>
                            {format(order.createdAt.toDate(), 'dd/MM/yyyy')}
                          </span>
                        </div>

                        <h3 className='text-base font-bold text-white'>{order.name}</h3>
                        {order.description && <p className='text-xs text-white/50'>{order.description}</p>}

                        <div className='grid grid-cols-2 gap-2 text-xs text-white/40 pt-2'>
                          <div>Sartoria: <span className='text-white/80 font-medium'>{order.supplier || '—'}</span></div>
                          <div>Spettacolo: <span className='text-white/80 font-medium'>{event?.name || '—'}</span></div>
                        </div>
                      </div>

                      <div className='flex items-center justify-between gap-4 mt-6 pt-3 border-t border-white/5'>
                        <div className='flex gap-2 text-xs text-white/60 items-center'>
                          <span className='flex items-center gap-1'><Users size={12} /> {order.items?.length || 0} capi</span>
                          <span>·</span>
                          <span className='flex items-center gap-0.5'><DollarSign size={12} /> {formatCurrency(order.totalCost || 0)}</span>
                        </div>

                        <div className='flex gap-2'>
                          <Button
                            variant='outline'
                            size='xs'
                            icon={<Download size={12} />}
                            onClick={() => generateSartoriaPDF(order)}
                          >
                            PDF Sartoria
                          </Button>
                          <Button
                            variant='secondary'
                            size='xs'
                            icon={<Eye size={12} />}
                            onClick={() => setSelectedOrder(order)}
                          >
                            Dettagli
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Modal Modifica Misure Allievo in Sala ────────────────────── */}
        {editingStudent && (
          <Modal
            isOpen={true}
            onClose={() => setEditingStudent(null)}
            title={`📐 Misure: ${editingStudent.firstName} ${editingStudent.lastName}`}
          >
            <form onSubmit={handleSaveMeasurements} className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  label="Torace / Seno (cm)"
                  placeholder="Es. 88"
                  value={measForm.chest?.toString() || ''}
                  onChange={(e: any) => setMeasForm({ ...measForm, chest: e.target.value ? Number(e.target.value) : undefined })}
                />
                <Input
                  type="number"
                  label="Girovita (cm)"
                  placeholder="Es. 68"
                  value={measForm.waist?.toString() || ''}
                  onChange={(e: any) => setMeasForm({ ...measForm, waist: e.target.value ? Number(e.target.value) : undefined })}
                />
                <Input
                  type="number"
                  label="Fianchi (cm)"
                  placeholder="Es. 94"
                  value={measForm.hips?.toString() || ''}
                  onChange={(e: any) => setMeasForm({ ...measForm, hips: e.target.value ? Number(e.target.value) : undefined })}
                />
                <Input
                  type="number"
                  label="Altezza (cm)"
                  placeholder="Es. 165"
                  value={measForm.height?.toString() || ''}
                  onChange={(e: any) => setMeasForm({ ...measForm, height: e.target.value ? Number(e.target.value) : undefined })}
                />
                <Input
                  type="number"
                  label="Numero Scarpa (EU)"
                  placeholder="Es. 38"
                  value={measForm.shoeSize?.toString() || ''}
                  onChange={(e: any) => setMeasForm({ ...measForm, shoeSize: e.target.value ? Number(e.target.value) : undefined })}
                />
                <Input
                  type="number"
                  label="Peso (kg)"
                  placeholder="Es. 55"
                  value={measForm.weight?.toString() || ''}
                  onChange={(e: any) => setMeasForm({ ...measForm, weight: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>

              {/* Taglia calcolata in tempo reale */}
              {(measForm.chest || measForm.waist || measForm.hips) ? (
                <div className="flex items-center justify-between p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 text-xs text-brand-300">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Sparkles size={14} /> Taglia indicativa calcolata:
                  </span>
                  <span className="font-bold text-sm text-white px-2.5 py-0.5 rounded-lg bg-brand-500/20 border border-brand-500/30">
                    {computeCostumeSize(measForm.chest, measForm.waist, measForm.hips) || 'Da definire'}
                  </span>
                </div>
              ) : null}

              <Textarea
                label="Note Sartoria & Confezione"
                placeholder="Es. manica allungata, necessita orlo, preferenza corpino elasticizzato..."
                value={measForm.notes || ''}
                onChange={(e: any) => setMeasForm({ ...measForm, notes: e.target.value })}
                rows={2}
              />

              <ModalFooter>
                <Button variant="secondary" type="button" onClick={() => setEditingStudent(null)}>
                  Annulla
                </Button>
                <Button type="submit" loading={savingMeasurements} icon={<Check size={16} />}>
                  Salva Misure
                </Button>
              </ModalFooter>
            </form>
          </Modal>
        )}

        {/* ── Modal Nuovo Ordine ───────────────────────────────────────── */}
        {isModalOpen && (
          <Modal
            isOpen={true}
            onClose={() => setIsModalOpen(false)}
            title='Nuovo Ordine Costumi'
          >
            <form onSubmit={handleCreate} className='space-y-4 py-2'>
              <Input
                label="Nome dell'Ordine *"
                placeholder="Es. Costumi Lago dei Cigni classica"
                value={name}
                onChange={(e: any) => setName(e.target.value)}
                required
              />

              <Input
                label="Fornitore / Sartoria *"
                placeholder="Es. Sartoria Danza D'Angelo"
                value={supplier}
                onChange={(e: any) => setSupplier(e.target.value)}
                required
              />

              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <Select
                  label='Spettacolo / Evento Collegato *'
                  value={eventId}
                  onChange={(e: any) => setEventId(e.target.value)}
                  options={[
                    { value: '', label: 'Seleziona un evento...' },
                    ...events.map((e) => ({ value: e.id, label: e.name }))
                  ]}
                  required
                />
                <Input
                  type='number'
                  label='Costo Unitario Costume (€) *'
                  value={unitCost.toString()}
                  onChange={(e: any) => setUnitCost(Number(e.target.value))}
                  required
                />
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <Select
                  label="Categoria Articolo *"
                  value={itemCategory}
                  onChange={(e: any) => setItemCategory(e.target.value)}
                  options={[
                    { value: 'Costumi Spettacolo', label: 'Costumi Spettacolo' },
                    { value: 'Tute', label: 'Tute' },
                    { value: 'Scarpe', label: 'Scarpe' },
                    { value: 'Altro', label: 'Altro' },
                  ]}
                  required
                />
                {itemCategory === 'Altro' && (
                  <Input
                    label="Specifica Articolo *"
                    placeholder="Es. Magliette, Pantaloni"
                    value={customCategory}
                    onChange={(e: any) => setCustomCategory(e.target.value)}
                    required
                  />
                )}
              </div>

              {eventId && (
                <div className='p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-300'>
                  Verranno estratti automaticamente gli allievi iscritti all'evento selezionato ({selectedEventParticipants.length} allievi trovati).
                </div>
              )}

              <Textarea
                label='Descrizione ed Istruzioni'
                placeholder='Dettagli particolari sul modello, tessuti o personalizzazioni da inviare alla sartoria...'
                value={description}
                onChange={(e: any) => setDescription(e.target.value)}
              />

              <ModalFooter>
                <Button variant='secondary' onClick={() => setIsModalOpen(false)} disabled={creating}>
                  Annulla
                </Button>
                <Button type='submit' loading={creating}>
                  Crea Ordine
                </Button>
              </ModalFooter>
            </form>
          </Modal>
        )}

        {/* ── Modal Dettaglio Ordine ───────────────────────────────────── */}
        {selectedOrder && (
          <Modal
            isOpen={true}
            onClose={() => setSelectedOrder(null)}
            title={`Ordine: ${selectedOrder.name}`}
            size="lg"
          >
            <div className='space-y-4 py-2 max-h-[500px] overflow-y-auto pr-1'>
              <div className='flex flex-wrap gap-2 items-center justify-between p-3.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white/60'>
                <div>Fornitore: <span className='text-white font-medium'>{selectedOrder.supplier || '—'}</span></div>
                <div>Totale: <span className='text-white font-medium'>{formatCurrency(selectedOrder.totalCost || 0)}</span></div>
                <div className='flex items-center gap-1.5'>
                  <span>Stato:</span>
                  <Select
                    value={selectedOrder.status}
                    onChange={(e: any) => updateOrderStatus(selectedOrder.id, e.target.value as CostumeOrder['status'])}
                    options={[
                      { value: 'draft', label: 'Bozza' },
                      { value: 'ordered', label: 'Ordinato' },
                      { value: 'received', label: 'Ricevuto' },
                      { value: 'distributed', label: 'Distribuito' },
                    ]}
                  />
                </div>
                <Button
                  variant="outline"
                  size="xs"
                  icon={<FileSpreadsheet size={12} />}
                  onClick={() => handleExportMatrix(selectedOrder)}
                  className="mt-1 md:mt-0"
                >
                  Esporta Matrice
                </Button>
              </div>

              <div className='space-y-3'>
                <h4 className='text-xs font-bold text-brand-300 uppercase tracking-wider'>Ripartizione Capi, Misure & Pagamenti:</h4>
                {selectedOrder.items?.map((item, idx) => {
                  const student = students.find((s) => s.id === item.studentId);
                  const amountPaid = (item.paymentsLog || []).reduce((sum, p) => sum + p.amount, 0);
                  const balance = (item.fixedAmount || 0) - amountPaid;
                  
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
                    <div key={idx} className='p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-3 text-xs'>
                      <div className='flex items-center justify-between gap-2'>
                        <div>
                          <p className='font-bold text-white'>{student ? `${student.firstName} ${student.lastName}` : '—'}</p>
                          <p className='text-[10px] text-white/40 mt-0.5'>
                            {item.measurements
                              ? `H: ${item.measurements.height}cm · Seno: ${item.measurements.chest}cm · Vita: ${item.measurements.waist}cm · Fianchi: ${item.measurements.hips}cm`
                              : 'Misure non inserite'}
                          </p>
                        </div>
                        <div className='flex items-center gap-1.5'>
                          <Badge variant='brand'>{item.size || 'M'}</Badge>
                          <Badge variant={statusVariant}>{statusLabel}</Badge>
                        </div>
                      </div>

                      {/* inputs contabili */}
                      <div className='grid grid-cols-1 md:grid-cols-3 gap-2.5 items-center pt-1'>
                        <div className='flex flex-col gap-1 text-left'>
                          <span className='text-[10px] text-white/40'>Quota Fissata (€):</span>
                          <input
                            type="number"
                            value={item.fixedAmount || 0}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              const updatedItems = selectedOrder.items.map(it => {
                                  if (it.studentId === item.studentId) {
                                    return { ...it, fixedAmount: val };
                                  }
                                  return it;
                                });
                              setSelectedOrder({ ...selectedOrder, items: updatedItems });
                            }}
                            onBlur={async () => {
                              await updateOrder(selectedOrder.id, { items: selectedOrder.items });
                            }}
                            className="w-full px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-brand-500"
                          />
                        </div>

                        <div className='flex flex-col gap-1 text-left'>
                          <span className='text-[10px] text-white/40'>Note Sartoria:</span>
                          <input
                            type="text"
                            placeholder="Note misure..."
                            value={item.fittingNotes || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              const updatedItems = selectedOrder.items.map(it => {
                                  if (it.studentId === item.studentId) {
                                    return { ...it, fittingNotes: val };
                                  }
                                  return it;
                                });
                              setSelectedOrder({ ...selectedOrder, items: updatedItems });
                            }}
                            onBlur={async () => {
                              await updateOrder(selectedOrder.id, { items: selectedOrder.items });
                            }}
                            className="w-full px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-brand-500"
                          />
                        </div>

                        <div className='flex items-end justify-between md:justify-end gap-2 h-full pt-4 md:pt-0'>
                          <div className='text-right mr-1'>
                            <p className='text-[10px] text-white/40'>Versato/Residuo:</p>
                            <p className='text-xs font-semibold text-white/80'>
                              {formatCurrency(amountPaid)} / <span className={balance > 0 ? 'text-coral-300' : 'text-emerald-300'}>{formatCurrency(balance)}</span>
                            </p>
                          </div>
                          <Button
                            variant='ghost'
                            size='xs'
                            onClick={() => setPayingItem(item)}
                            className="text-brand-400 hover:text-brand-300 hover:bg-brand-500/10 flex items-center gap-1 border border-brand-500/20 px-2.5 py-1.5 rounded-lg"
                          >
                            <CreditCard size={12} /> Paga
                          </Button>
                        </div>
                      </div>

                      {/* storico pagamenti dell'allievo */}
                      {item.paymentsLog && item.paymentsLog.length > 0 && (
                        <div className='mt-2 pt-2 border-t border-white/5 space-y-1 bg-white/[0.01] p-2 rounded-lg text-left'>
                          <p className='text-[9px] font-bold text-white/40 uppercase tracking-wider'>Storico Acconti:</p>
                          {item.paymentsLog.map((log, lIdx) => (
                            <div key={lIdx} className='flex items-center justify-between text-[10px] text-white/60'>
                              <span>{formatCurrency(log.amount)} il {format(log.date.toDate ? log.date.toDate() : new Date(log.date as any), 'dd/MM/yyyy')}</span>
                              {log.receiptIssued ? (
                                <span className='text-brand-300 font-medium'>📄 Ricevuta {log.receiptNumber}</span>
                              ) : (
                                <span className='text-white/30 italic'>Registrato in cassa</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <ModalFooter>
              <Button onClick={() => setSelectedOrder(null)}>Chiudi</Button>
            </ModalFooter>
          </Modal>
        )}

        {/* ── Modal Registrazione Pagamento ────────────────────────────── */}
        {payingItem && (
          <Modal
            isOpen={true}
            onClose={() => setPayingItem(null)}
            title="Registra Pagamento Costume"
          >
            <form onSubmit={handleRegisterPayment} className="space-y-4 py-2 text-left">
              <p className="text-xs text-white/60">
                Allievo: <strong className="text-white">{students.find(s => s.id === payingItem.studentId)?.firstName} {students.find(s => s.id === payingItem.studentId)?.lastName}</strong>
              </p>
              <div className="grid grid-cols-2 gap-4 text-xs bg-white/5 p-3 rounded-xl">
                <div>Importo Totale: <span className="text-white font-bold">{formatCurrency(payingItem.fixedAmount || 0)}</span></div>
                <div>Già Versato: <span className="text-white font-bold">{formatCurrency((payingItem.paymentsLog || []).reduce((sum, p) => sum + p.amount, 0))}</span></div>
              </div>

              <Input
                type="number"
                label="Importo Versato (€) *"
                value={paymentAmount.toString()}
                onChange={(e: any) => setPaymentAmount(Number(e.target.value))}
                required
              />

              <label className="flex items-center gap-2.5 cursor-pointer group pt-1">
                <input
                  type="checkbox"
                  checked={emettiRicevuta}
                  onChange={(e) => setEmettiRicevuta(e.target.checked)}
                  className="rounded bg-white/5 border-white/20 text-brand-500 focus:ring-brand-500/50"
                />
                <span className="text-xs text-white/70 group-hover:text-white transition-colors">
                  Emetti Ricevuta Fiscale (Genera PDF e inserisci in contabilità)
                </span>
              </label>

              <ModalFooter>
                <Button variant="secondary" onClick={() => setPayingItem(null)}>
                  Annulla
                </Button>
                <Button type="submit">
                  Registra
                </Button>
              </ModalFooter>
            </form>
          </Modal>
        )}
      </div>
    </ErrorBoundary>
  );
}
