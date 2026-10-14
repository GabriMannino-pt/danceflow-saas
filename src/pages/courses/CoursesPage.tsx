import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCourses } from '@/hooks/useCourses';
import { useSchoolStore } from '@/stores/schoolStore';
import { useAuthStore } from '@/stores/authStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Skeleton, EmptyState, Badge, Button, Input, Select } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { CourseForm } from '@/components/courses/CourseForm';
import { DAYS_IT } from '@/lib/constants';
import type { Course } from '@/types';
import {
  BookOpen,
  Search,
  Filter,
  Plus,
  Users,
  UserX,
  Calendar,
  ChevronRight,
  Trash2,
  Printer,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { generateSecretaryPaymentsRegistryPDF } from '@/services/pdf/SecretaryPaymentsRegistryPdfBuilder';

export default function CoursesPage() {
  const navigate = useNavigate();

  // Initialize real-time courses listening
  const { deleteCourse } = useCourses();

  const { courses, isLoadingCourses, students, activeSchool } = useSchoolStore();
  const user = useAuthStore((s) => s.user);
  const isTeacher = user?.role === 'teacher';

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [levelFilter, setLevelFilter] = useState('all');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [isPrintingAll, setIsPrintingAll] = useState(false);

  const handlePrintSecretaryRegistry = () => {
    try {
      setIsPrintingAll(true);
      const activeStudents = students.filter((s) => !s.isDeleted && s.isActive);
      if (activeStudents.length === 0) {
        toast.error('Nessun allievo attivo da includere nel registro.');
        return;
      }
      const doc = generateSecretaryPaymentsRegistryPDF({
        students,
        courses,
        school: activeSchool,
        academicYear: '2025/2026',
        emptyRowsCount: 10,
      });
      doc.save(`Registro_Generale_Incassi_Segreteria_${new Date().getFullYear()}.pdf`);
      toast.success(`Scaricato Registro Generale Incassi Segreteria (${activeStudents.length} allievi)!`);
    } catch (err: any) {
      console.error('[CoursesPage] Error generating secretary registry PDF:', err);
      toast.error('Impossibile generare il registro segreteria.');
    } finally {
      setIsPrintingAll(false);
    }
  };

  const handleDeleteCourse = async (courseId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent card click
    if (confirm('Sei sicuro di voler eliminare questo corso? L\'azione è irreversibile.')) {
      try {
        await deleteCourse(courseId);
      } catch (err) {
        console.error('[CoursesPage] deleteCourse error:', err);
      }
    }
  };

  // ─── Helpers: Enrolled Students ──────────────────────────────────────────────
  const getEnrolledCount = (courseId: string) => {
    return students.filter(s => s.enrolledCourseIds?.includes(courseId) && s.isActive && !s.isDeleted).length;
  };

  // ─── Computations & Stats ───────────────────────────────────────────────────
  const stats = useMemo(() => {
    const activeCourses = courses.filter((c) => c.isActive && !c.isDeleted).length;
    let totalCourseEnrollments = 0;
    let withoutTeacher = 0;

    courses.forEach(c => {
      totalCourseEnrollments += getEnrolledCount(c.id);
      if (!c.teacherIds || c.teacherIds.length === 0) {
        withoutTeacher++;
      }
    });

    const uniqueEnrolledStudents = students.filter(
      (s) => !s.isDeleted && s.isActive && (s.enrolledCourseIds || []).length > 0
    ).length;

    const totalActiveStudents = students.filter((s) => !s.isDeleted && s.isActive).length;

    return {
      total: courses.length,
      activeCourses,
      uniqueEnrolledStudents,
      totalCourseEnrollments,
      totalActiveStudents,
      withoutTeacher
    };
  }, [courses, students]);

  // ─── Filtering Logic ────────────────────────────────────────────────────────
  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      // 1. Text Search
      const matchesSearch = course.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            course.style.toLowerCase().includes(searchQuery.toLowerCase());

      // 2. Active Status Filter
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
            ? course.isActive
            : !course.isActive;

      // 3. Level Filter
      const matchesLevel = levelFilter === 'all' ? true : course.level === levelFilter;

      return matchesSearch && matchesStatus && matchesLevel;
    });
  }, [courses, searchQuery, statusFilter, levelFilter]);

  // ─── Helper: Format Schedule ──────────────────────────────────────────────
  const formatSchedule = (schedule: Course['schedule']) => {
    if (!schedule || schedule.length === 0) return 'Orario non definito';
    const sorted = [...schedule].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    return sorted.map(s => {
      const dayName = s.dayOfWeek === 0 ? DAYS_IT[6] : DAYS_IT[s.dayOfWeek - 1];
      return `${dayName.substring(0, 3)} ${s.startTime}-${s.endTime}`;
    }).join(' • ');
  };

  return (
    <ErrorBoundary>
      <div className='page-enter space-y-6 pb-12'>
        <PageHeader
          title='Corsi e Classi'
          subtitle='Gestisci i corsi, le classi, e le programmazioni settimanali.'
          actions={
            <div className='flex items-center gap-3'>
              <Button
                variant='outline'
                onClick={handlePrintSecretaryRegistry}
                disabled={isPrintingAll}
                icon={<Printer size={18} />}
              >
                {isPrintingAll ? 'Generazione...' : 'Stampa Registro Incassi Segreteria (A-Z)'}
              </Button>
              <Button
                onClick={() => {
                  setEditingCourse(null);
                  setIsFormOpen(true);
                }}
                icon={<Plus size={18} />}
              >
                Nuovo Corso
              </Button>
            </div>
          }
        />

        {/* Stats Panel */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          <Card className='p-4 border-l-4 border-brand-500'>
            <div className='flex items-center gap-3'>
              <div className='w-9 h-9 rounded-xl bg-brand-500/15 text-brand-300 flex items-center justify-center'>
                <BookOpen size={18} />
              </div>
              <div>
                <p className='text-xs text-white/50'>Corsi Attivi</p>
                <p className='text-xl font-display font-bold text-white'>
                  {stats.activeCourses} <span className='text-xs text-white/30 font-sans'>/ {stats.total}</span>
                </p>
              </div>
            </div>
          </Card>

          <Card className='p-4 border-l-4 border-teal-500'>
            <div className='flex items-center gap-3'>
              <div className='w-9 h-9 rounded-xl bg-teal-500/15 text-teal-300 flex items-center justify-center'>
                <Users size={18} />
              </div>
              <div>
                <p className='text-xs text-white/50'>Allievi Iscritti ai Corsi</p>
                <div className='flex items-baseline gap-1.5'>
                  <p className='text-xl font-display font-bold text-teal-400'>
                    {stats.uniqueEnrolledStudents}
                  </p>
                  <span className='text-xs text-white/40'>
                    / {stats.totalActiveStudents} attivi ({stats.totalCourseEnrollments} frequenze)
                  </span>
                </div>
              </div>
            </div>
          </Card>

          <Card className='p-4 border-l-4 border-coral-500'>
            <div className='flex items-center gap-3'>
              <div className='w-9 h-9 rounded-xl bg-coral-500/15 text-coral-300 flex items-center justify-center'>
                <UserX size={18} />
              </div>
              <div>
                <p className='text-xs text-white/50'>Corsi senza Insegnante</p>
                <p className='text-xl font-display font-bold text-coral-400'>{stats.withoutTeacher}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Filters Panel */}
        <Card className='p-4 space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
            <div className='md:col-span-1'>
              <Input
                placeholder='Cerca per nome o stile...'
                icon={<Search size={16} />}
                fullWidth
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select
              label=''
              options={[
                { value: 'all', label: 'Tutti i Livelli' },
                { value: 'beginner', label: 'Principianti' },
                { value: 'intermediate', label: 'Intermedio' },
                { value: 'advanced', label: 'Avanzato' },
                { value: 'professional', label: 'Professionale' },
              ]}
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
            />
            <Select
              label=''
              options={[
                { value: 'active', label: 'Solo Corsi Attivi' },
                { value: 'inactive', label: 'Solo Corsi Inattivi' },
                { value: 'all', label: 'Tutti i Corsi' },
              ]}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            />
          </div>
          
          <div className='flex items-center gap-2 text-xs text-white/50 border-t border-white/5 pt-3'>
            <Filter size={14} />
            <span>Trovati: <strong className='text-white'>{filteredCourses.length}</strong> corsi</span>
          </div>
        </Card>

        {/* Content */}
        {isLoadingCourses ? (
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            {[...Array(6)].map((_, i) => (
              <Card key={i} className='p-5 space-y-4'>
                <div className='flex gap-4'>
                  <Skeleton className='w-12 h-12 rounded-xl' />
                  <div className='space-y-2 flex-1'>
                    <Skeleton className='h-4 w-3/4' />
                    <Skeleton className='h-3 w-1/2' />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : filteredCourses.length === 0 ? (
          <EmptyState
            icon='🎭'
            title='Nessun corso trovato'
            description='Modifica i filtri di ricerca o crea un nuovo corso per iniziare.'
            action={{
              label: 'Crea Corso',
              onClick: () => setIsFormOpen(true),
            }}
          />
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4'>
            {filteredCourses.map((course) => {
              const enrolled = getEnrolledCount(course.id);
              const max = course.maxStudents || 0;
              const isFull = max > 0 && enrolled >= max;

              return (
                <Card
                  key={course.id}
                  as="div"
                  onClick={() => navigate(`/courses/${course.id}`)}
                  className='p-0 overflow-hidden hover:bg-white/[0.03] transition-colors cursor-pointer group flex flex-col h-full border border-white/5'
                >
                  <div className='h-2 w-full' style={{ backgroundColor: course.colorHex || '#8b5cf6' }} />
                  
                  <div className='p-5 flex flex-col flex-1'>
                    <div className='flex justify-between items-start mb-4'>
                      <div>
                        <h3 className='font-bold text-white text-lg group-hover:text-brand-300 transition-colors line-clamp-2'>
                          {course.name}
                        </h3>
                        <p className='text-sm text-white/50'>{course.style}</p>
                      </div>
                      <Badge variant={course.isActive ? 'success' : 'gray'} size='sm'>
                        {course.isActive ? 'Attivo' : 'Inattivo'}
                      </Badge>
                    </div>

                    <div className='space-y-3 flex-1 text-sm text-white/70'>
                      <div className='flex items-center gap-2'>
                        <Badge variant='gray' className='border-white/10 text-white/60'>
                          {course.level.toUpperCase()}
                        </Badge>
                      </div>
                      
                      <div className='flex items-start gap-2 bg-black/20 p-2 rounded-lg border border-white/5'>
                        <Calendar size={14} className='mt-0.5 text-brand-400 shrink-0' />
                        <span className='text-xs leading-relaxed'>
                          {formatSchedule(course.schedule)}
                        </span>
                      </div>
                    </div>

                    <div className='mt-5 pt-4 border-t border-white/5 flex items-center justify-between'>
                      <div className='flex items-center gap-2'>
                        <div className={`p-1.5 rounded-lg ${isFull ? 'bg-coral-500/20 text-coral-300' : 'bg-teal-500/20 text-teal-300'}`}>
                          <Users size={16} />
                        </div>
                        <div>
                          <p className='text-xs text-white/40'>Iscritti</p>
                          <p className={`text-sm font-bold ${isFull ? 'text-coral-400' : 'text-white'}`}>
                            {enrolled} {max > 0 && <span className='text-white/30 text-xs font-normal'>/ {max}</span>}
                          </p>
                        </div>
                      </div>

                      <div className='flex gap-1.5' onClick={(e) => e.stopPropagation()}>
                        {!isTeacher && (
                          <button
                            onClick={(e) => handleDeleteCourse(course.id, e)}
                            className='p-2 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors flex items-center justify-center border border-rose-500/20 active:scale-90'
                            title="Elimina corso"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                        <div className='p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors flex items-center justify-center group-hover:bg-brand-500 group-hover:text-white'>
                          <ChevronRight size={16} />
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <CourseForm
          isOpen={isFormOpen}
          onClose={() => {
            setIsFormOpen(false);
            setEditingCourse(null);
          }}
          course={editingCourse}
        />
      </div>
    </ErrorBoundary>
  );
}
