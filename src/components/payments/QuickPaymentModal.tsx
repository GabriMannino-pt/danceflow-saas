import { useState, useEffect, useMemo } from 'react';
import { usePayments } from '@/hooks/usePayments';
import { useSchoolStore } from '@/stores/schoolStore';
import { Modal, ModalFooter, Input, Select, Button, Badge } from '@/components/ui';
import { generateReceiptPDF } from '@/lib/pdf';
import type { PaymentMethod } from '@/types';
import { Search, CreditCard, CheckCircle, Calendar, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';

interface QuickPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialStudentId?: string;
  initialMonth?: number;
}

const MONTHS_OPTIONS = [
  { value: '1', label: 'Gennaio' },
  { value: '2', label: 'Febbraio' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Aprile' },
  { value: '5', label: 'Maggio' },
  { value: '6', label: 'Giugno' },
  { value: '7', label: 'Luglio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Settembre' },
  { value: '10', label: 'Ottobre' },
  { value: '11', label: 'Novembre' },
  { value: '12', label: 'Dicembre' },
];

export function QuickPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  initialStudentId,
  initialMonth,
}: QuickPaymentModalProps) {
  const { registerDirectPayment } = usePayments();
  const { students, courses, activeSchool } = useSchoolStore();

  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  
  // Payment Type: 'monthly' | 'registration'
  const [paymentType, setPaymentType] = useState<'monthly' | 'registration'>('monthly');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [selectedMonths, setSelectedMonths] = useState<number[]>([initialMonth || (new Date().getMonth() + 1)]);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [amount, setAmount] = useState<number>(40);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>('');
  const [emitReceipt, setEmitReceipt] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Active students
  const activeStudents = useMemo(() => {
    return students.filter((s) => s.isActive && !s.isDeleted);
  }, [students]);

  // Selected student object
  const selectedStudent = useMemo(() => {
    return activeStudents.find((s) => s.id === selectedStudentId) || null;
  }, [activeStudents, selectedStudentId]);

  // Filtered students for search dropdown
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return [];
    const q = studentSearch.trim().toLowerCase();
    return activeStudents.filter((s) =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
      `${s.lastName} ${s.firstName}`.toLowerCase().includes(q) ||
      (s.fiscalCode && s.fiscalCode.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [activeStudents, studentSearch]);

  // Student's enrolled courses
  const studentCourses = useMemo(() => {
    if (!selectedStudent) return courses;
    const enrolled = courses.filter((c) => selectedStudent.enrolledCourseIds?.includes(c.id));
    return enrolled.length > 0 ? enrolled : courses;
  }, [selectedStudent, courses]);

  // Single base fee
  const standardSingleFee = useMemo(() => {
    if (!selectedStudent) return 40;
    const targetCourse = courses.find((c) => c.id === selectedCourseId);
    if (paymentType === 'monthly') {
      return selectedStudent.customMonthlyFee !== undefined && selectedStudent.customMonthlyFee !== null
        ? selectedStudent.customMonthlyFee
        : (targetCourse?.fee?.monthly || 40);
    }
    return selectedStudent.customRegistrationFee !== undefined && selectedStudent.customRegistrationFee !== null
      ? selectedStudent.customRegistrationFee
      : (targetCourse?.fee?.registration || 30);
  }, [selectedStudent, selectedCourseId, paymentType, courses]);

  // Standard fee multiplied by months
  const standardFee = useMemo(() => {
    if (paymentType === 'monthly') {
      return standardSingleFee * (selectedMonths.length || 1);
    }
    return standardSingleFee;
  }, [paymentType, standardSingleFee, selectedMonths.length]);

  const toggleMonth = (mNum: number) => {
    setSelectedMonths((prev) => {
      let updated: number[];
      if (prev.includes(mNum)) {
        if (prev.length === 1) return prev; // keep at least one
        updated = prev.filter((m) => m !== mNum);
      } else {
        updated = [...prev, mNum].sort((a, b) => a - b);
      }
      setAmount(standardSingleFee * updated.length);
      return updated;
    });
  };

  // Initialize or reset when modal opens or initialStudentId changes
  useEffect(() => {
    if (isOpen) {
      if (initialStudentId) {
        setSelectedStudentId(initialStudentId);
        setStudentSearch('');
      } else {
        setSelectedStudentId('');
        setStudentSearch('');
      }
      const initM = initialMonth || (new Date().getMonth() + 1);
      setPaymentType('monthly');
      setSelectedMonths([initM]);
      setYear(new Date().getFullYear());
      setDate(new Date().toISOString().split('T')[0]);
      setMethod('cash');
      setNotes('');
      setEmitReceipt(false);
    }
  }, [isOpen, initialStudentId, initialMonth]);

  // Auto-select course and calculate standard fee when student or course changes
  useEffect(() => {
    if (selectedStudent) {
      const firstCourse = studentCourses[0];
      const targetCourseId = selectedCourseId && studentCourses.some(c => c.id === selectedCourseId)
        ? selectedCourseId
        : (firstCourse?.id || '');
      
      setSelectedCourseId(targetCourseId);

      const targetCourse = courses.find((c) => c.id === targetCourseId);

      if (paymentType === 'monthly') {
        const stdFee = selectedStudent.customMonthlyFee !== undefined && selectedStudent.customMonthlyFee !== null
          ? selectedStudent.customMonthlyFee
          : (targetCourse?.fee?.monthly || 40);
        setAmount(stdFee * (selectedMonths.length || 1));
      } else if (paymentType === 'registration') {
        const regFee = selectedStudent.customRegistrationFee !== undefined && selectedStudent.customRegistrationFee !== null
          ? selectedStudent.customRegistrationFee
          : (targetCourse?.fee?.registration || 30);
        setAmount(regFee);
      }
    }
  }, [selectedStudent, selectedCourseId, paymentType, studentCourses, courses, selectedMonths.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) {
      toast.error('Seleziona un allievo.');
      return;
    }
    if (!amount || amount <= 0) {
      toast.error('Inserisci un importo valido.');
      return;
    }

    setSubmitting(true);
    try {
      const courseObj = courses.find((c) => c.id === selectedCourseId);
      
      let description = '';
      if (paymentType === 'monthly') {
        const mNames = selectedMonths
          .map((m) => MONTHS_OPTIONS.find((o) => Number(o.value) === m)?.label || `Mese ${m}`)
          .join(', ');
        const courseName = courseObj ? ` (Corso: ${courseObj.name})` : '';
        description = selectedMonths.length > 1
          ? `Quota Mensile - Mesi di ${mNames} ${year}${courseName}`
          : `Quota Mensile - Mese di ${mNames} ${year}${courseName}`;
      } else {
        description = `Quota Iscrizione e Tesseramento Annuale ${year}/${year + 1}`;
      }

      const res = await registerDirectPayment({
        studentId: selectedStudent.id,
        courseId: selectedCourseId || undefined,
        type: paymentType,
        month: selectedMonths[0],
        months: selectedMonths,
        year,
        description,
        amount: Number(amount),
        method,
        date: new Date(date),
        notes: notes.trim() || undefined,
        emitReceipt,
      });

      // If receipt requested, generate & download PDF
      if (emitReceipt && res?.payment && activeSchool) {
        try {
          const doc = await generateReceiptPDF(
            res.payment,
            selectedStudent,
            activeSchool,
            courseObj,
            res.installment
          );
          doc.save(`Ricevuta_${res.payment.receiptNumber || res.payment.id}.pdf`);
        } catch (pdfErr) {
          console.error('[QuickPaymentModal] PDF generation error:', pdfErr);
        }
      }

      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('[QuickPaymentModal] Error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Registra Pagamento"
      description="Incassa direttamente una mensilità o la quota di iscrizione per un allievo."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* 1. SELEZIONE ALLIEVO */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-white/70 block">
            Allievo *
          </label>
          
          {selectedStudent ? (
            <div className="p-3 bg-brand-500/10 border border-brand-500/30 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-500/20 text-brand-300 flex items-center justify-center font-bold text-xs">
                  {selectedStudent.firstName[0]}{selectedStudent.lastName[0]}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">
                    {selectedStudent.firstName} {selectedStudent.lastName}
                  </p>
                  <p className="text-[11px] text-white/50">
                    CF: {selectedStudent.fiscalCode || '—'} · {studentCourses.map(c => c.name).join(', ') || 'Nessun corso'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedStudentId('');
                  setStudentSearch('');
                }}
                className="text-xs text-white/40 hover:text-white underline cursor-pointer"
              >
                Cambia
              </button>
            </div>
          ) : (
            <div className="relative">
              <Input
                placeholder="Cerca allievo per Nome, Cognome o CF..."
                icon={<Search size={16} />}
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                autoFocus
              />
              {filteredStudents.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto bg-surface-900 border border-white/10 rounded-xl shadow-2xl divide-y divide-white/5">
                  {filteredStudents.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => {
                        setSelectedStudentId(st.id);
                        setStudentSearch('');
                      }}
                      className="w-full text-left p-2.5 hover:bg-brand-500/20 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div>
                        <p className="text-xs font-bold text-white">{st.firstName} {st.lastName}</p>
                        <p className="text-[10px] text-white/40">CF: {st.fiscalCode || '—'}</p>
                      </div>
                      <Badge variant="brand" size="sm">Seleziona</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2. TIPOLOGIA: MENSILITÀ O ISCRIZIONE */}
        <div className="space-y-1.5 pt-1">
          <label className="text-xs font-semibold text-white/70 block">
            Cosa sta pagando? *
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentType('monthly')}
              className={`p-2.5 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                paymentType === 'monthly'
                  ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20 border-brand-400/40'
                  : 'bg-black/20 border-white/10 text-white/60 hover:text-white'
              }`}
            >
              <Calendar size={14} />
              <span>Pagamento Mensilità</span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentType('registration')}
              className={`p-2.5 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                paymentType === 'registration'
                  ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20 border-brand-400/40'
                  : 'bg-black/20 border-white/10 text-white/60 hover:text-white'
              }`}
            >
              <CreditCard size={14} />
              <span>Quota Iscrizione Annuale</span>
            </button>
          </div>
        </div>

        {/* 3. DETTAGLI CORSO & MENSILITÀ MULTIPLE */}
        {paymentType === 'monthly' && (
          <div className="space-y-3 p-3.5 bg-black/20 rounded-xl border border-white/5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="Corso di Ballo *"
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                options={studentCourses.map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.fee?.monthly ? `€${c.fee.monthly}/m` : 'Tariffa scuola'})`,
                }))}
              />
              <Select
                label="Anno di Riferimento *"
                value={String(year)}
                onChange={(e) => setYear(Number(e.target.value))}
                options={[
                  { value: String(new Date().getFullYear() - 1), label: String(new Date().getFullYear() - 1) },
                  { value: String(new Date().getFullYear()), label: String(new Date().getFullYear()) },
                  { value: String(new Date().getFullYear() + 1), label: String(new Date().getFullYear() + 1) },
                ]}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-white/80">
                  Mensilità da Saldare (seleziona più mesi per ricevuta unica):
                </label>
                <span className="text-[11px] text-brand-300 font-medium">
                  {selectedMonths.length} {selectedMonths.length === 1 ? 'mese selezionato' : 'mesi selezionati'}
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {MONTHS_OPTIONS.map((m) => {
                  const mNum = Number(m.value);
                  const isSelected = selectedMonths.includes(mNum);
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => toggleMonth(mNum)}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-center border cursor-pointer ${
                        isSelected
                          ? 'bg-brand-500 text-white border-brand-400 font-bold shadow-sm'
                          : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border-white/5'
                      }`}
                    >
                      {m.label.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 4. IMPORTO VARIABILE & SCORCIATOIE RAPIDE */}
        <div className="space-y-1.5 p-3.5 bg-black/20 rounded-xl border border-white/5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-white/70">
              Importo Effettivo Pagato (€) *
            </label>
            <span className="text-[10px] text-white/40">
              Tariffa standard: €{standardFee}
            </span>
          </div>

          <div className="relative">
            <Input
              type="number"
              step="0.50"
              min="0.50"
              value={amount.toString()}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              required
              className="text-lg font-bold font-display"
            />
          </div>

          {/* Quick Shortcuts: Half month (mezzo mese) / Full fee */}
          {paymentType === 'monthly' && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[10px] text-white/40 font-medium">Imposta rapido:</span>
              <button
                type="button"
                onClick={() => setAmount(standardFee)}
                className="text-[11px] px-2.5 py-1 bg-white/5 hover:bg-white/10 text-brand-300 rounded-lg border border-brand-500/30 transition-colors cursor-pointer"
              >
                Quota Intera (€{standardFee})
              </button>
              <button
                type="button"
                onClick={() => setAmount(Math.round((standardFee / 2) * 100) / 100)}
                className="text-[11px] px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-lg border border-amber-500/30 transition-colors cursor-pointer"
              >
                Mezzo Mese (50% - €{standardFee / 2})
              </button>
            </div>
          )}
        </div>

        {/* 5. METODO & DATA INCASSO */}
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Metodo di Pagamento *"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            options={[
              { value: 'cash', label: '💵 Contanti' },
              { value: 'card', label: '💳 POS / Carta' },
              { value: 'bank_transfer', label: '🏦 Bonifico Bancario' },
              { value: 'other', label: 'Altro' },
            ]}
          />
          <Input
            type="date"
            label="Data Incasso *"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        {/* 6. NOTE OPZIONALI */}
        <Input
          label="Note (Opzionale)"
          placeholder="Es. Pagamento per metà mese di settembre..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {/* 7. EMISSIONE RICEVUTA PROGRESSIVA */}
        <div className="p-3 bg-brand-500/5 border border-brand-500/20 rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Receipt size={16} className="text-brand-400" />
            <div>
              <p className="text-xs font-semibold text-white">Emetti Ricevuta Ufficiale</p>
              <p className="text-[10px] text-white/40">Assegna il numero progressivo automatico e scarica il PDF</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={emitReceipt}
            onChange={(e) => setEmitReceipt(e.target.checked)}
            className="w-4 h-4 rounded text-brand-500 bg-black/40 border-white/20 focus:ring-brand-500 cursor-pointer"
          />
        </div>

        {/* FOOTER */}
        <ModalFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Annulla
          </Button>
          <Button
            type="submit"
            loading={submitting}
            className="btn-primary-gradient"
            icon={<CheckCircle size={16} />}
            disabled={!selectedStudent || amount <= 0}
          >
            Conferma e Incassa €{amount.toFixed(2)}
          </Button>
        </ModalFooter>

      </form>
    </Modal>
  );
}
