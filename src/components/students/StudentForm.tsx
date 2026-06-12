import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useStudents } from '@/hooks/useStudents';
import { Modal, ModalFooter, Input, Textarea, Select, Button } from '@/components/ui';
import { toTimestamp } from '@/lib/converters';
import type { Student } from '@/types';

const studentFormSchema = z
  .object({
    firstName: z.string().min(2, 'Il nome deve essere di almeno 2 caratteri'),
    lastName: z.string().min(2, 'Il cognome deve essere di almeno 2 caratteri'),
    dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), 'Inserisci una data valida'),
    fiscalCode: z
      .string()
      .optional()
      .refine((val) => {
        if (!val || val === '') return true;
        return /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/i.test(val);
      }, 'Formato Codice Fiscale non valido (16 caratteri alfanumerici)'),
    gender: z.enum(['M', 'F', 'Other']),
    address: z.object({
      street: z.string().optional(),
      city: z.string().optional(),
      province: z.string().optional(),
      postalCode: z.string().optional(),
      country: z.string().optional(),
    }),
    contact: z.object({
      studentPhone: z.string().optional(),
      studentEmail: z.string().optional(),
      parentName: z.string().optional(),
      parentPhone: z.string().optional(),
      parentEmail: z.string().optional(),
      parentRelation: z.enum(['madre', 'padre', 'tutore', 'altro', '']).optional(),
      emergencyContact: z.string().min(2, 'Il contatto di emergenza è obbligatorio'),
      emergencyPhone: z.string().min(5, 'Il telefono di emergenza è obbligatorio'),
    }),
    medicalInfo: z.object({
      allergies: z.string().optional(),
      conditions: z.string().optional(),
      medications: z.string().optional(),
      medicalClearance: z.boolean().default(false),
      medicalClearanceExpiry: z.string().optional(),
    }),
    notes: z.string().optional(),
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    // ─── Age calculation ───
    if (data.dateOfBirth) {
      const dob = new Date(data.dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
      }

      // If minor (< 18), require parent info
      if (age < 18) {
        if (!data.contact.parentName || data.contact.parentName.trim() === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Il nome del genitore è obbligatorio per i minorenni',
            path: ['contact', 'parentName'],
          });
        }
        if (!data.contact.parentPhone || data.contact.parentPhone.trim() === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Il telefono del genitore è obbligatorio per i minorenni',
            path: ['contact', 'parentPhone'],
          });
        }
        if (!data.contact.parentEmail || data.contact.parentEmail.trim() === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "L'email del genitore è obbligatoria per i minorenni",
            path: ['contact', 'parentEmail'],
          });
        }
        if (!data.contact.parentRelation) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'La relazione di parentela è obbligatoria per i minorenni',
            path: ['contact', 'parentRelation'],
          });
        }
      }
    }

    // ─── Medical clearance expiry ───
    if (data.medicalInfo.medicalClearance) {
      if (!data.medicalInfo.medicalClearanceExpiry || data.medicalInfo.medicalClearanceExpiry === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'La data di scadenza del certificato medico è obbligatoria',
          path: ['medicalInfo', 'medicalClearanceExpiry'],
        });
      }
    }
  });

type StudentFormValues = z.infer<typeof studentFormSchema>;

interface StudentFormProps {
  isOpen: boolean;
  onClose: () => void;
  student?: Student | null;
  onSuccess?: () => void;
}

export function StudentForm({ isOpen, onClose, student, onSuccess }: StudentFormProps) {
  const { createStudent, editStudent } = useStudents();

  // ─── Default values setup ──────────────────────────────────────────────────
  const defaultValues: Partial<StudentFormValues> = {
    firstName: student?.firstName ?? '',
    lastName: student?.lastName ?? '',
    dateOfBirth: student?.dateOfBirth ? student.dateOfBirth.toDate().toISOString().split('T')[0] : '',
    fiscalCode: student?.fiscalCode ?? '',
    gender: student?.gender ?? 'M',
    address: {
      street: student?.address?.street ?? '',
      city: student?.address?.city ?? '',
      province: student?.address?.province ?? '',
      postalCode: student?.address?.postalCode ?? '',
      country: student?.address?.country ?? 'Italia',
    },
    contact: {
      studentPhone: student?.contact?.studentPhone ?? '',
      studentEmail: student?.contact?.studentEmail ?? '',
      parentName: student?.contact?.parentName ?? '',
      parentPhone: student?.contact?.parentPhone ?? '',
      parentEmail: student?.contact?.parentEmail ?? '',
      parentRelation: student?.contact?.parentRelation ?? '',
      emergencyContact: student?.contact?.emergencyContact ?? '',
      emergencyPhone: student?.contact?.emergencyPhone ?? '',
    },
    medicalInfo: {
      allergies: student?.medicalInfo?.allergies ?? '',
      conditions: student?.medicalInfo?.conditions ?? '',
      medications: student?.medicalInfo?.medications ?? '',
      medicalClearance: student?.medicalInfo?.medicalClearance ?? false,
      medicalClearanceExpiry: student?.medicalInfo?.medicalClearanceExpiry
        ? student.medicalInfo.medicalClearanceExpiry.toDate().toISOString().split('T')[0]
        : '',
    },
    notes: student?.notes ?? '',
    isActive: student?.isActive ?? true,
  };

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema) as any,
    defaultValues,
  });

  // Watch fields for dynamic visibility checks
  const dobWatch = useWatch({ control, name: 'dateOfBirth' });
  const medicalClearanceWatch = useWatch({ control, name: 'medicalInfo.medicalClearance' });

  // Calculate age
  let isMinor = false;
  if (dobWatch) {
    const dob = new Date(dobWatch);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    isMinor = age < 18;
  }

  // Reset form when student change
  useEffect(() => {
    if (isOpen) {
      reset(defaultValues);
    }
  }, [student, isOpen]);

  // ─── Submit Form ────────────────────────────────────────────────────────────
  async function onSubmit(data: StudentFormValues) {
    try {
      const studentData: Omit<Student, 'id' | 'schoolId' | 'createdAt' | 'updatedAt'> = {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        dateOfBirth: toTimestamp(new Date(data.dateOfBirth)),
        fiscalCode: data.fiscalCode?.trim().toUpperCase() || undefined,
        gender: data.gender,
        isActive: data.isActive,
        notes: data.notes?.trim() || undefined,
        enrolledCourseIds: student?.enrolledCourseIds ?? [],
        documents: student?.documents ?? [],
        address: {
          street: data.address.street?.trim() || '',
          city: data.address.city?.trim() || '',
          province: data.address.province?.trim().toUpperCase() || '',
          postalCode: data.address.postalCode?.trim() || '',
          country: data.address.country?.trim() || 'Italia',
        },
        contact: {
          studentPhone: data.contact.studentPhone?.trim() || undefined,
          studentEmail: data.contact.studentEmail?.trim() || undefined,
          parentName: isMinor ? data.contact.parentName?.trim() : undefined,
          parentPhone: isMinor ? data.contact.parentPhone?.trim() : undefined,
          parentEmail: isMinor ? data.contact.parentEmail?.trim() : undefined,
          parentRelation: isMinor
            ? (data.contact.parentRelation as 'madre' | 'padre' | 'tutore' | 'altro' | undefined)
            : undefined,
          emergencyContact: data.contact.emergencyContact.trim(),
          emergencyPhone: data.contact.emergencyPhone.trim(),
        },
        medicalInfo: {
          allergies: data.medicalInfo.allergies?.trim() || undefined,
          conditions: data.medicalInfo.conditions?.trim() || undefined,
          medications: data.medicalInfo.medications?.trim() || undefined,
          medicalClearance: data.medicalInfo.medicalClearance,
          medicalClearanceExpiry:
            data.medicalInfo.medicalClearance && data.medicalInfo.medicalClearanceExpiry
              ? toTimestamp(new Date(data.medicalInfo.medicalClearanceExpiry))
              : undefined,
        },
      };

      if (student) {
        await editStudent(student.id, studentData as Partial<Student>);
      } else {
        await createStudent(studentData);
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('[StudentForm] Submit error:', err);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={student ? 'Modifica Allievo' : 'Registra Nuovo Allievo'}
      description="Inserisci le informazioni dettagliate dell'allievo."
      size='xl'
    >
      <form onSubmit={handleSubmit(onSubmit)} className='space-y-6 max-h-[70vh] overflow-y-auto pr-1' noValidate>
        {/* Anagrafica Section */}
        <div className='space-y-4'>
          <h3 className='text-xs font-semibold uppercase tracking-wider text-brand-400 border-b border-white/5 pb-1'>
            Dati Anagrafici
          </h3>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            <Input
              label='Nome'
              required
              error={errors.firstName?.message}
              {...register('firstName')}
            />
            <Input
              label='Cognome'
              required
              error={errors.lastName?.message}
              {...register('lastName')}
            />
            <Select
              label='Genere'
              required
              options={[
                { value: 'M', label: 'Maschio' },
                { value: 'F', label: 'Femmina' },
                { value: 'Other', label: 'Altro' },
              ]}
              {...register('gender')}
            />
          </div>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <Input
              label='Data di Nascita'
              type='date'
              required
              error={errors.dateOfBirth?.message}
              {...register('dateOfBirth')}
            />
            <Input
              label='Codice Fiscale'
              placeholder='16 caratteri'
              error={errors.fiscalCode?.message}
              {...register('fiscalCode')}
            />
          </div>
        </div>

        {/* Indirizzo Section */}
        <div className='space-y-4'>
          <h3 className='text-xs font-semibold uppercase tracking-wider text-brand-400 border-b border-white/5 pb-1'>
            Indirizzo Residenza
          </h3>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <Input
              label='Via e Numero Civico'
              placeholder='es. Via Roma 12'
              error={errors.address?.street?.message}
              {...register('address.street')}
            />
            <div className='grid grid-cols-3 gap-2'>
              <Input
                className='col-span-2'
                label='Città'
                error={errors.address?.city?.message}
                {...register('address.city')}
              />
              <Input
                label='Provincia'
                placeholder='es. RM'
                maxLength={2}
                error={errors.address?.province?.message}
                {...register('address.province')}
              />
            </div>
          </div>
        </div>

        {/* Contatti Section */}
        <div className='space-y-4'>
          <h3 className='text-xs font-semibold uppercase tracking-wider text-brand-400 border-b border-white/5 pb-1'>
            Contatti
          </h3>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <Input
              label='Telefono Allievo'
              type='tel'
              disabled={isMinor}
              hint={isMinor ? 'Contatti genitore richiesti per minorenni' : undefined}
              error={errors.contact?.studentPhone?.message}
              {...register('contact.studentPhone')}
            />
            <Input
              label='Email Allievo'
              type='email'
              disabled={isMinor}
              error={errors.contact?.studentEmail?.message}
              {...register('contact.studentEmail')}
            />
          </div>

          {/* Minor Parent Section */}
          {isMinor && (
            <div className='p-4 rounded-2xl border border-brand-500/20 bg-brand-500/5 space-y-4 animate-fade-in-up'>
              <div className='flex items-center gap-2 mb-2'>
                <span className='text-xs font-bold uppercase tracking-wider bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded'>
                  Minorenne
                </span>
                <span className='text-xs text-white/50'>Compila i dati del genitore o tutore legale</span>
              </div>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <Input
                  label='Nome Genitore / Tutore'
                  required
                  error={errors.contact?.parentName?.message}
                  {...register('contact.parentName')}
                />
                <Select
                  label='Relazione di Parentela'
                  required
                  options={[
                    { value: 'madre', label: 'Madre' },
                    { value: 'padre', label: 'Padre' },
                    { value: 'tutore', label: 'Tutore Legale' },
                    { value: 'altro', label: 'Altro' },
                  ]}
                  placeholder='Seleziona...'
                  error={errors.contact?.parentRelation?.message}
                  {...register('contact.parentRelation')}
                />
              </div>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <Input
                  label='Telefono Genitore'
                  type='tel'
                  required
                  error={errors.contact?.parentPhone?.message}
                  {...register('contact.parentPhone')}
                />
                <Input
                  label='Email Genitore'
                  type='email'
                  required
                  error={errors.contact?.parentEmail?.message}
                  {...register('contact.parentEmail')}
                />
              </div>
            </div>
          )}

          {/* Emergency Contact */}
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 border border-white/5 p-4 rounded-2xl bg-white/2'>
            <Input
              label='Contatto di Emergenza (Nome)'
              required
              placeholder='es. Nome Cognome (Zio)'
              error={errors.contact?.emergencyContact?.message}
              {...register('contact.emergencyContact')}
            />
            <Input
              label='Telefono Contatto Emergenza'
              type='tel'
              required
              error={errors.contact?.emergencyPhone?.message}
              {...register('contact.emergencyPhone')}
            />
          </div>
        </div>

        {/* Medical Info Section */}
        <div className='space-y-4'>
          <h3 className='text-xs font-semibold uppercase tracking-wider text-brand-400 border-b border-white/5 pb-1'>
            Informazioni Mediche & Certificato
          </h3>

          <div className='flex items-center gap-3 p-3 rounded-2xl border border-white/10 glass-strong'>
            <input
              type='checkbox'
              id='medicalClearance'
              className='w-5 h-5 rounded border-white/20 text-brand-600 bg-black/30 focus:ring-brand-500'
              {...register('medicalInfo.medicalClearance')}
            />
            <label htmlFor='medicalClearance' className='text-sm font-semibold text-white cursor-pointer'>
              Certificato Medico Presente / Consegnato
            </label>
          </div>

          {medicalClearanceWatch && (
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl border border-teal-500/20 bg-teal-500/5 animate-fade-in-up'>
              <Input
                label='Data di Scadenza Certificato'
                type='date'
                required
                error={errors.medicalInfo?.medicalClearanceExpiry?.message}
                {...register('medicalInfo.medicalClearanceExpiry')}
              />
            </div>
          )}

          <div className='grid grid-cols-1 gap-4'>
            <Input
              label='Allergie / Intolleranze'
              placeholder='es. Glutine, Lattosio (Lasciare vuoto se nessuna)'
              error={errors.medicalInfo?.allergies?.message}
              {...register('medicalInfo.allergies')}
            />
            <Input
              label='Patologie / Condizioni Cliniche rilevanti'
              error={errors.medicalInfo?.conditions?.message}
              {...register('medicalInfo.conditions')}
            />
          </div>
        </div>

        {/* Note Interni e Stato */}
        <div className='space-y-4'>
          <h3 className='text-xs font-semibold uppercase tracking-wider text-brand-400 border-b border-white/5 pb-1'>
            Impostazioni Profilo & Note
          </h3>
          <div className='flex items-center gap-3 p-3 rounded-2xl border border-white/10 glass-strong'>
            <input
              type='checkbox'
              id='isActive'
              className='w-5 h-5 rounded border-white/20 text-brand-600 bg-black/30 focus:ring-brand-500'
              {...register('isActive')}
            />
            <label htmlFor='isActive' className='text-sm font-semibold text-white cursor-pointer'>
              Profilo Allievo Attivo
            </label>
          </div>
          <Textarea
            label='Note Interne della Scuola'
            placeholder="Inserisci eventuali note private sull'allievo..."
            error={errors.notes?.message}
            {...register('notes')}
          />
        </div>

        <ModalFooter>
          <Button type='button' variant='secondary' onClick={onClose}>
            Annulla
          </Button>
          <Button type='submit' loading={isSubmitting}>
            {student ? 'Salva Modifiche' : 'Registra Allievo'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
