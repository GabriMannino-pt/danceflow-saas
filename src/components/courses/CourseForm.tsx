import { useEffect, useState, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS, userConverter } from '@/lib/converters';
import { useCourses } from '@/hooks/useCourses';
import { useAuthStore } from '@/stores/authStore';
import { Modal, ModalFooter, Input, Select, Button, Textarea } from '@/components/ui';
import { DANCE_STYLES, DAYS_IT, getAcademicYearOptions, getCurrentAcademicYear } from '@/lib/constants';
import type { Course, AppUser, CourseSchedule } from '@/types';
import { Plus, Trash2 } from 'lucide-react';

const courseFormSchema = z.object({
  name: z.string().min(2, 'Il nome del corso è obbligatorio'),
  style: z.string().min(1, 'Lo stile di danza è obbligatorio'),
  level: z.enum(['beginner', 'intermediate', 'advanced', 'professional', 'all']),
  teacherId: z.string().optional(),
  room: z.string().optional(),
  maxStudents: z.number().min(1, 'Capienza minima 1').optional(),
  monthlyFee: z.number().min(0).optional(),
  registrationFee: z.number().min(0).optional(),
  colorHex: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Colore non valido'),
  academicYear: z.string().min(4, 'Anno accademico obbligatorio'),
  schedule: z.array(
    z.object({
      dayOfWeek: z.number().min(0).max(6),
      startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato ora non valido (HH:mm)'),
      endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato ora non valido (HH:mm)'),
    })
  ),
  isActive: z.boolean().default(true),
  description: z.string().optional(),
});

type CourseFormValues = z.infer<typeof courseFormSchema>;

interface CourseFormProps {
  isOpen: boolean;
  onClose: () => void;
  course?: Course | null;
  onSuccess?: () => void;
}

export function CourseForm({ isOpen, onClose, course, onSuccess }: CourseFormProps) {
  const { createCourse, editCourse } = useCourses();
  const schoolId = useAuthStore((s) => s.user?.schoolId);
  const [teachers, setTeachers] = useState<AppUser[]>([]);

  const academicYearOptions = useMemo(() => getAcademicYearOptions(), []);

  const defaultValues: Partial<CourseFormValues> = {
    name: course?.name ?? '',
    style: course?.style ?? DANCE_STYLES[0],
    level: course?.level ?? 'all',
    teacherId: course?.teacherIds?.[0] ?? '',
    room: course?.room ?? '',
    maxStudents: course?.maxStudents ?? 20,
    monthlyFee: course?.fee?.monthly ?? 0,
    registrationFee: course?.fee?.registration ?? 0,
    colorHex: course?.colorHex ?? '#8b5cf6', // default brand purple
    academicYear: course?.academicYear ?? getCurrentAcademicYear(),
    schedule: course?.schedule && course.schedule.length > 0
      ? course.schedule
      : (!course
          ? [
              { dayOfWeek: 1, startTime: '17:00', endTime: '18:00' },
              { dayOfWeek: 3, startTime: '17:00', endTime: '18:00' }
            ]
          : []),
    isActive: course?.isActive ?? true,
    description: course?.description ?? '',
  };

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CourseFormValues>({
    resolver: zodResolver(courseFormSchema) as any,
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'schedule',
  });

  useEffect(() => {
    if (isOpen) {
      reset(defaultValues);
      fetchTeachers();
    }
  }, [isOpen, course]);

  async function fetchTeachers() {
    if (!schoolId) return;
    try {
      const q = query(
        collection(db, COLLECTIONS.users).withConverter(userConverter),
        where('schoolId', '==', schoolId),
        where('role', '==', 'teacher'),
        where('isActive', '==', true)
      );
      const snap = await getDocs(q);
      setTeachers(snap.docs.map(d => d.data()));
    } catch (err) {
      console.error('[CourseForm] fetchTeachers error:', err);
    }
  }

  async function onSubmit(data: CourseFormValues) {
    try {
      const courseData: Omit<Course, 'id' | 'schoolId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'enrolledCount'> = {
        name: data.name.trim(),
        description: data.description?.trim() || undefined,
        style: data.style,
        level: data.level,
        teacherIds: data.teacherId ? [data.teacherId] : [],
        schedule: data.schedule as CourseSchedule[],
        room: data.room?.trim() || undefined,
        maxStudents: data.maxStudents || undefined,
        fee: {
          currency: 'EUR',
          monthly: data.monthlyFee || undefined,
          registration: data.registrationFee || undefined,
        },
        colorHex: data.colorHex,
        isActive: data.isActive,
        academicYear: data.academicYear.trim(),
      };

      if (course) {
        await editCourse(course.id, courseData);
      } else {
        await createCourse(courseData);
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('[CourseForm] Submit error:', err);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={course ? 'Modifica Corso' : 'Crea Nuovo Corso'}
      description="Configura le impostazioni del corso, l'insegnante e gli orari."
      size='xl'
    >
      <form onSubmit={handleSubmit(onSubmit)} className='space-y-6 max-h-[70vh] overflow-y-auto pr-1' noValidate>
        {/* Basic Info */}
        <div className='space-y-4'>
          <h3 className='text-xs font-semibold uppercase tracking-wider text-brand-400 border-b border-white/5 pb-1'>
            Informazioni Generali
          </h3>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <Input
              label='Nome del Corso'
              required
              placeholder='es. Danza Classica Avanzato'
              error={errors.name?.message}
              {...register('name')}
            />
            <Select
              label='Anno Accademico'
              required
              options={academicYearOptions}
              error={errors.academicYear?.message}
              {...register('academicYear')}
            />
          </div>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            <Select
              label='Stile di Danza'
              required
              options={DANCE_STYLES.map(s => ({ value: s, label: s }))}
              error={errors.style?.message}
              {...register('style')}
            />
            <Select
              label='Livello'
              required
              options={[
                { value: 'all', label: 'Tutti i livelli (Open)' },
                { value: 'beginner', label: 'Principianti' },
                { value: 'intermediate', label: 'Intermedio' },
                { value: 'advanced', label: 'Avanzato' },
                { value: 'professional', label: 'Professionale' },
              ]}
              error={errors.level?.message}
              {...register('level')}
            />
            <div className='flex flex-col gap-1'>
              <label className='text-xs font-medium text-white/70'>Colore Etichetta</label>
              <div className='flex items-center gap-2'>
                <input
                  type='color'
                  className='h-10 w-14 rounded cursor-pointer bg-black/20 border border-white/10'
                  {...register('colorHex')}
                />
                <Input
                  className='flex-1'
                  error={errors.colorHex?.message}
                  {...register('colorHex')}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Logistic & Financial */}
        <div className='space-y-4'>
          <h3 className='text-xs font-semibold uppercase tracking-wider text-brand-400 border-b border-white/5 pb-1'>
            Logistica e Costi
          </h3>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <Select
              label='Insegnante Assegnato'
              options={[
                { value: '', label: 'Da assegnare...' },
                ...teachers.map(t => ({ value: t.id, label: t.displayName }))
              ]}
              error={errors.teacherId?.message}
              {...register('teacherId')}
            />
            <Input
              label='Sala (Opzionale)'
              placeholder='es. Sala A, Sala Specchi'
              error={errors.room?.message}
              {...register('room')}
            />
          </div>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            <Input
              label='Capienza Max Allievi'
              type='number'
              error={errors.maxStudents?.message}
              {...register('maxStudents', { valueAsNumber: true })}
            />
            <Input
              label='Retta Mensile (€)'
              type='number'
              step='0.01'
              error={errors.monthlyFee?.message}
              {...register('monthlyFee', { valueAsNumber: true })}
            />
            <Input
              label='Quota Iscrizione (€)'
              type='number'
              step='0.01'
              error={errors.registrationFee?.message}
              {...register('registrationFee', { valueAsNumber: true })}
            />
          </div>
        </div>

        {/* Schedule */}
        <div className='space-y-4'>
          <div className='flex justify-between items-center border-b border-white/5 pb-2'>
            <div>
              <h3 className='text-xs font-semibold uppercase tracking-wider text-brand-400'>
                Programmazione Settimanale (Giorni e Orari)
              </h3>
              <p className='text-[11px] text-white/40'>
                Configura i giorni e orari di lezione (es. Lunedì e Mercoledì)
              </p>
            </div>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='text-brand-300 border-brand-500/30 hover:bg-brand-500/10'
              icon={<Plus size={14} />}
              onClick={() => {
                const existingDays = fields.map((f) => f.dayOfWeek);
                let nextDay = 3;
                if (existingDays.includes(1) && !existingDays.includes(3)) nextDay = 3;
                else if (existingDays.includes(2) && !existingDays.includes(4)) nextDay = 4;
                else if (existingDays.includes(1) && existingDays.includes(3) && !existingDays.includes(5)) nextDay = 5;
                else {
                  for (let d = 1; d <= 6; d++) {
                    if (!existingDays.includes(d)) {
                      nextDay = d;
                      break;
                    }
                  }
                }
                const lastSlot = fields[fields.length - 1];
                append({
                  dayOfWeek: nextDay,
                  startTime: lastSlot?.startTime || '17:00',
                  endTime: lastSlot?.endTime || '18:00',
                });
              }}
            >
              + Aggiungi Giorno / Orario
            </Button>
          </div>
          
          {fields.length === 0 ? (
            <div className='text-center py-6 bg-white/5 rounded-xl border border-dashed border-white/10 space-y-2'>
              <p className='text-sm text-white/60'>Nessun giorno di lezione inserito per questo corso.</p>
              <Button
                type='button'
                size='sm'
                variant='outline'
                icon={<Plus size={14} />}
                onClick={() => append({ dayOfWeek: 1, startTime: '17:00', endTime: '18:00' })}
              >
                + Aggiungi Giorno / Orario
              </Button>
            </div>
          ) : (
            <div className='space-y-3'>
              {fields.map((field, index) => (
                <div key={field.id} className='flex gap-3 items-start animate-fade-in-up bg-black/20 p-3 rounded-xl border border-white/10'>
                  <Select
                    className='flex-1'
                    label='Giorno'
                    options={[
                      { value: '1', label: DAYS_IT[0] },
                      { value: '2', label: DAYS_IT[1] },
                      { value: '3', label: DAYS_IT[2] },
                      { value: '4', label: DAYS_IT[3] },
                      { value: '5', label: DAYS_IT[4] },
                      { value: '6', label: DAYS_IT[5] },
                      { value: '0', label: DAYS_IT[6] },
                    ]}
                    error={errors.schedule?.[index]?.dayOfWeek?.message}
                    {...register(`schedule.${index}.dayOfWeek`, { valueAsNumber: true })}
                  />
                  <Input
                    className='w-28'
                    label='Inizio'
                    type='time'
                    error={errors.schedule?.[index]?.startTime?.message}
                    {...register(`schedule.${index}.startTime`)}
                  />
                  <Input
                    className='w-28'
                    label='Fine'
                    type='time'
                    error={errors.schedule?.[index]?.endTime?.message}
                    {...register(`schedule.${index}.endTime`)}
                  />
                  <div className='pt-7'>
                    <button
                      type='button'
                      onClick={() => remove(index)}
                      className='p-2.5 text-coral-400 hover:bg-coral-500/20 hover:text-coral-300 rounded-lg transition-colors border border-transparent hover:border-coral-500/30'
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Settings & Notes */}
        <div className='space-y-4'>
          <h3 className='text-xs font-semibold uppercase tracking-wider text-brand-400 border-b border-white/5 pb-1'>
            Impostazioni Aggiuntive
          </h3>
          <div className='flex items-center gap-3 p-3 rounded-2xl border border-white/10 glass-strong'>
            <input
              type='checkbox'
              id='isActive'
              className='w-5 h-5 rounded border-white/20 text-brand-600 bg-black/30 focus:ring-brand-500'
              {...register('isActive')}
            />
            <label htmlFor='isActive' className='text-sm font-semibold text-white cursor-pointer'>
              Corso Attivo
            </label>
          </div>
          <Textarea
            label='Descrizione del Corso / Note interne'
            placeholder="Dettagli sul corso..."
            error={errors.description?.message}
            {...register('description')}
          />
        </div>

        <ModalFooter>
          <Button type='button' variant='secondary' onClick={onClose}>
            Annulla
          </Button>
          <Button type='submit' loading={isSubmitting}>
            {course ? 'Salva Modifiche' : 'Crea Corso'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
