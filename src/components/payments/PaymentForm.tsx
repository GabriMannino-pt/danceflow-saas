import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { usePayments } from '@/hooks/usePayments';
import { useSchoolStore } from '@/stores/schoolStore';
import { Modal, ModalFooter, Input, Select, Button, Textarea } from '@/components/ui';
import { toTimestamp } from '@/lib/converters';
import type { PaymentMethod } from '@/types';
import { Search } from 'lucide-react';
import toast from 'react-hot-toast';

const paymentFormSchema = z.object({
  studentIds: z.array(z.string()).min(1, 'Seleziona almeno un allievo'),
  courseId: z.string().optional(),
  type: z.enum(['monthly', 'registration', 'event', 'costume', 'other']),
  description: z.string().min(2, 'Descrizione obbligatoria'),
  amount: z.number().min(0.01, 'L\'importo deve essere maggiore di 0'),
  dueDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Inserisci una data valida'),
  status: z.enum(['pending', 'paid', 'overdue', 'cancelled']),
  method: z.string().optional(),
  notes: z.string().optional(),
});

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

interface PaymentFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PaymentForm({ isOpen, onClose, onSuccess }: PaymentFormProps) {
  const { createPayment } = usePayments();
  const { students, courses } = useSchoolStore();
  const [studentSearch, setStudentSearch] = useState('');

  const defaultValues: Partial<PaymentFormValues> = {
    studentIds: [],
    courseId: '',
    type: 'other',
    description: '',
    amount: 0,
    dueDate: new Date().toISOString().split('T')[0],
    status: 'pending',
    method: '',
    notes: '',
  };

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema) as any,
    defaultValues,
  });

  const statusWatch = watch('status');
  const studentIdsWatch = watch('studentIds') || [];
  const courseIdWatch = watch('courseId');
  const typeWatch = watch('type');

  const activeStudents = useMemo(() => {
    return students.filter(s => s.isActive && !s.isDeleted);
  }, [students]);

  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return activeStudents;
    const query = studentSearch.toLowerCase();
    return activeStudents.filter(s => 
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(query) ||
      `${s.lastName} ${s.firstName}`.toLowerCase().includes(query) ||
      (s.fiscalCode && s.fiscalCode.toLowerCase().includes(query))
    );
  }, [activeStudents, studentSearch]);

  const handleToggleStudent = (id: string) => {
    const current = studentIdsWatch;
    const next = current.includes(id) 
      ? current.filter(x => x !== id) 
      : [...current, id];
    setValue('studentIds', next, { shouldValidate: true });
  };

  const handleSelectAll = () => {
    const allFilteredIds = filteredStudents.map(s => s.id);
    const areAllSelected = allFilteredIds.every(id => studentIdsWatch.includes(id));
    
    let next: string[];
    if (areAllSelected) {
      next = studentIdsWatch.filter(id => !allFilteredIds.includes(id));
    } else {
      next = Array.from(new Set([...studentIdsWatch, ...allFilteredIds]));
    }
    setValue('studentIds', next, { shouldValidate: true });
  };

  useEffect(() => {
    if (typeWatch === 'monthly') {
      const course = courses.find(c => c.id === courseIdWatch);
      if (studentIdsWatch.length === 1) {
        const student = students.find(s => s.id === studentIdsWatch[0]);
        if (student && student.customMonthlyFee !== undefined && student.customMonthlyFee !== null) {
          setValue('amount', student.customMonthlyFee);
          return;
        }
      }
      if (course?.fee?.monthly) {
        setValue('amount', course.fee.monthly);
      }
    } else if (typeWatch === 'registration') {
      const course = courses.find(c => c.id === courseIdWatch);
      if (studentIdsWatch.length === 1) {
        const student = students.find(s => s.id === studentIdsWatch[0]);
        if (student && student.customRegistrationFee !== undefined && student.customRegistrationFee !== null) {
          setValue('amount', student.customRegistrationFee);
          return;
        }
      }
      if (course?.fee?.registration) {
        setValue('amount', course.fee.registration);
      }
    } else if (typeWatch === 'event') {
      if (studentIdsWatch.length === 1) {
        const student = students.find(s => s.id === studentIdsWatch[0]);
        if (student && student.customShowFee !== undefined && student.customShowFee !== null) {
          setValue('amount', student.customShowFee);
        }
      }
    }
  }, [studentIdsWatch, courseIdWatch, typeWatch, students, courses, setValue]);

  useEffect(() => {
    if (isOpen) {
      reset(defaultValues);
      setStudentSearch('');
    }
  }, [isOpen]);

  async function onSubmit(data: PaymentFormValues) {
    try {
      for (const stId of data.studentIds) {
        const studentObj = students.find(s => s.id === stId);
        const courseObj = courses.find(c => c.id === data.courseId);
        
        let chargeAmount = data.amount;
        if (data.type === 'monthly') {
          if (studentObj?.customMonthlyFee !== undefined && studentObj?.customMonthlyFee !== null) {
            chargeAmount = studentObj.customMonthlyFee;
          } else if (courseObj?.fee?.monthly) {
            chargeAmount = courseObj.fee.monthly;
          }
        } else if (data.type === 'registration') {
          if (studentObj?.customRegistrationFee !== undefined && studentObj?.customRegistrationFee !== null) {
            chargeAmount = studentObj.customRegistrationFee;
          } else if (courseObj?.fee?.registration) {
            chargeAmount = courseObj.fee.registration;
          }
        } else if (data.type === 'event') {
          if (studentObj?.customShowFee !== undefined && studentObj?.customShowFee !== null) {
            chargeAmount = studentObj.customShowFee;
          }
        }
        
        await createPayment({
          studentId: stId,
          courseId: data.courseId || undefined,
          type: data.type,
          description: data.description.trim(),
          amount: chargeAmount,
          currency: 'EUR',
          status: data.status,
          dueDate: toTimestamp(new Date(data.dueDate)),
          method: (data.method as PaymentMethod) || undefined,
          notes: data.notes?.trim() || undefined,
        });
      }
      toast.success(`${data.studentIds.length} pagamenti registrati con successo!`);
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('[PaymentForm] Submit error:', err);
      toast.error('Errore durante la registrazione dei pagamenti.');
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Registra Pagamento Manuale"
      description="Crea un nuovo addebito o registra un pagamento spontaneo."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* Multi-Select Student Selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-white/70 flex justify-between items-center">
            <span>Allievi <span className="text-coral-400">*</span></span>
            <span className="text-xs text-white/40">Selezionati: {studentIdsWatch.length} allievi</span>
          </label>
          
          <div className="p-3 bg-black/25 border border-white/10 rounded-xl space-y-3">
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  placeholder="Cerca allievo..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-brand-500/60 focus:outline-none"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={handleSelectAll}
                className="whitespace-nowrap"
              >
                {filteredStudents.every(s => studentIdsWatch.includes(s.id)) ? 'Deseleziona tutti' : 'Seleziona tutti'}
              </Button>
            </div>

            <div className="max-h-40 overflow-y-auto divide-y divide-white/5 pr-1 space-y-1">
              {filteredStudents.length === 0 ? (
                <p className="text-xs text-white/30 italic text-center py-4">Nessun allievo trovato.</p>
              ) : (
                filteredStudents.map(s => {
                  const isChecked = studentIdsWatch.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-white/20 text-brand-600 bg-black/30 focus:ring-brand-500 cursor-pointer"
                          checked={isChecked}
                          onChange={() => handleToggleStudent(s.id)}
                        />
                        <span className="text-xs text-white/80 font-medium font-display">
                          {s.lastName} {s.firstName}
                        </span>
                      </div>
                      {s.fiscalCode && (
                        <span className="text-[10px] text-white/30 font-mono hidden sm:inline">
                          {s.fiscalCode}
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </div>
          {errors.studentIds && (
            <p className="text-xs text-coral-400">⚠ {errors.studentIds.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Tipo Addebito"
            required
            options={[
              { value: 'monthly', label: 'Retta Mensile' },
              { value: 'registration', label: 'Iscrizione Annuale' },
              { value: 'costume', label: 'Costumi / Abbigliamento' },
              { value: 'event', label: 'Evento / Stage' },
              { value: 'other', label: 'Altro' },
            ]}
            error={errors.type?.message}
            {...register('type')}
          />
          <Select
            label="Corso (Opzionale)"
            options={[
              { value: '', label: 'Nessun corso specifico' },
              ...courses.filter(c => c.isActive && !c.isDeleted).map(c => ({
                value: c.id,
                label: c.name
              }))
            ]}
            error={errors.courseId?.message}
            {...register('courseId')}
          />
        </div>

        <Input
          label="Descrizione"
          required
          placeholder="es. Quota stage estivo"
          error={errors.description?.message}
          {...register('description')}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Importo (€)"
            type="number"
            step="0.01"
            required
            error={errors.amount?.message}
            {...register('amount', { valueAsNumber: true })}
          />
          <Input
            label="Data di Scadenza"
            type="date"
            required
            error={errors.dueDate?.message}
            {...register('dueDate')}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Stato Pagamento"
            required
            options={[
              { value: 'pending', label: 'In Attesa' },
              { value: 'paid', label: 'Pagato' },
              { value: 'overdue', label: 'Scaduto (Moroso)' },
            ]}
            error={errors.status?.message}
            {...register('status')}
          />
          {statusWatch === 'paid' && (
            <Select
              label="Metodo di Pagamento"
              required={statusWatch === 'paid'}
              options={[
                { value: '', label: 'Seleziona metodo...' },
                { value: 'cash', label: 'Contanti' },
                { value: 'bank_transfer', label: 'Bonifico' },
                { value: 'card', label: 'Carta di Credito / POS' },
                { value: 'other', label: 'Altro' },
              ]}
              error={errors.method?.message}
              {...register('method')}
            />
          )}
        </div>

        <Textarea
          label="Note Interne"
          placeholder="Eventuali note sul pagamento..."
          error={errors.notes?.message}
          {...register('notes')}
        />

        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Registra Pagamento
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
