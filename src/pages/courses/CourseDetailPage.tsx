import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSchoolStore } from '@/stores/schoolStore';
import { useCourses } from '@/hooks/useCourses';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS, userConverter } from '@/lib/converters';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Badge, Button, EmptyState } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { CourseForm } from '@/components/courses/CourseForm';
import { DAYS_IT } from '@/lib/constants';
import type { AppUser } from '@/types';
import toast from 'react-hot-toast';
import { generateCourseRegisterPDF } from '@/lib/pdf';
import {
  Info,
  Users,
  Calendar,
  CreditCard,
  Edit2,
  ChevronRight,
  User,
  Clock,
  MapPin,
  Tag,
  Download
} from 'lucide-react';


type TabType = 'info' | 'students' | 'schedule' | 'payments';

export default function CourseDetailPage() {
  const { id: courseId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Ensure real-time courses subscription is active
  useCourses();

  const { courses, students, isLoadingCourses, activeSchool } = useSchoolStore();
  
  const [activeTab, setActiveTab] = useState<TabType>('info');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [teacher, setTeacher] = useState<AppUser | null>(null);

  const course = useMemo(() => courses.find((c) => c.id === courseId), [courses, courseId]);

  const enrolledStudents = useMemo(() => {
    if (!course) return [];
    return students.filter((s) => s.enrolledCourseIds?.includes(course.id) && !s.isDeleted);
  }, [students, course]);

  const handleExportRegister = async () => {
    if (!activeSchool) {
      toast.error('Scuola non selezionata.');
      return;
    }
    if (!course) return;
    try {
      const doc = await generateCourseRegisterPDF(course, enrolledStudents, activeSchool);
      doc.save(`Registro_${course.name.replace(/\s+/g, '_')}.pdf`);
      toast.success('Registro scaricato.');
    } catch (err) {
      console.error('[CourseDetail] Export register PDF error:', err);
      toast.error('Impossibile generare il PDF.');
    }
  };

  useEffect(() => {
    if (course?.teacherIds?.[0]) {
      fetchTeacher(course.teacherIds[0], course.schoolId);
    } else {
      setTeacher(null);
    }
  }, [course?.teacherIds, course?.schoolId]);

  async function fetchTeacher(tid: string, sid: string) {
    try {
      const q = query(
        collection(db, COLLECTIONS.users).withConverter(userConverter),
        where('schoolId', '==', sid),
        where('role', '==', 'teacher'),
        where('id', '==', tid)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        setTeacher(snap.docs[0].data());
      }
    } catch (err) {
      console.error('Error fetching teacher:', err);
    }
  }

  if (isLoadingCourses && !course) {
    return <div className="p-8 text-center text-white/50 animate-pulse">Caricamento corso...</div>;
  }

  if (!course) {
    return (
      <div className='page-enter'>
        <PageHeader title='Corso non trovato' />
        <EmptyState
          icon='❓'
          title='Corso Inesistente'
          description='Il corso richiesto non esiste o è stato eliminato.'
          action={{ label: 'Torna ai Corsi', onClick: () => navigate('/courses') }}
        />
      </div>
    );
  }

  const tabs = [
    { id: 'info', label: 'Info Corso', icon: <Info size={16} /> },
    { id: 'students', label: 'Allievi', icon: <Users size={16} />, badge: enrolledStudents.length },
    { id: 'schedule', label: 'Orari', icon: <Calendar size={16} /> },
    { id: 'payments', label: 'Pagamenti', icon: <CreditCard size={16} /> },
  ] as const;

  return (
    <ErrorBoundary>
      <div className='page-enter space-y-6 pb-12'>
        {/* Header with Color Bar */}
        <div className="relative rounded-3xl overflow-hidden border border-white/5 bg-white/[0.02]">
          <div className="h-4 w-full" style={{ backgroundColor: course.colorHex || '#8b5cf6' }} />
          <div className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl md:text-3xl font-display font-bold text-white">
                    {course.name}
                  </h1>
                  <Badge variant={course.isActive ? 'success' : 'gray'}>
                    {course.isActive ? 'Attivo' : 'Inattivo'}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-white/60">
                  <span className="flex items-center gap-1.5"><Tag size={14}/> {course.style}</span>
                  <span>•</span>
                  <Badge variant="gray" className="border-white/10 text-white/60">
                    {course.level.toUpperCase()}
                  </Badge>
                  <span>•</span>
                  <span className="flex items-center gap-1.5"><Calendar size={14}/> {course.academicYear}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  icon={<Edit2 size={16} />}
                  onClick={() => setIsFormOpen(true)}
                >
                  Modifica
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className='flex overflow-x-auto hide-scrollbar gap-2 p-1 bg-black/20 rounded-2xl border border-white/5'>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`
                flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap
                ${activeTab === tab.id
                  ? 'bg-white/10 text-white shadow-lg'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                }
              `}
            >
              {tab.icon}
              {tab.label}
              {'badge' in tab && tab.badge !== undefined && (
                <span className={`ml-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  activeTab === tab.id ? 'bg-brand-500 text-white' : 'bg-white/10 text-white/60'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className='animate-fade-in-up'>
          
          {/* TAB: INFO */}
          {activeTab === 'info' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-6 space-y-6">
                <h3 className="text-sm font-bold text-brand-300 uppercase tracking-wider">Dettagli Logistici</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-white/5 text-white/50"><User size={20} /></div>
                    <div>
                      <p className="text-xs text-white/40 mb-0.5">Insegnante Assegnato</p>
                      <p className="text-sm font-semibold text-white">{teacher ? teacher.displayName : 'Nessun insegnante'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-white/5 text-white/50"><MapPin size={20} /></div>
                    <div>
                      <p className="text-xs text-white/40 mb-0.5">Sala</p>
                      <p className="text-sm font-semibold text-white">{course.room || 'Non specificata'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-white/5 text-white/50"><Users size={20} /></div>
                    <div>
                      <p className="text-xs text-white/40 mb-0.5">Capacità</p>
                      <p className="text-sm font-semibold text-white">
                        {enrolledStudents.length} {course.maxStudents ? `/ ${course.maxStudents}` : ''} Allievi
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-6 space-y-6">
                <h3 className="text-sm font-bold text-brand-300 uppercase tracking-wider">Dettagli Finanziari</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-gold-500/10 text-gold-400"><CreditCard size={20} /></div>
                    <div>
                      <p className="text-xs text-white/40 mb-0.5">Retta Mensile</p>
                      <p className="text-lg font-bold text-white">
                        {course.fee?.monthly ? `€${course.fee.monthly.toFixed(2)}` : 'Non specificata'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-teal-500/10 text-teal-400"><CreditCard size={20} /></div>
                    <div>
                      <p className="text-xs text-white/40 mb-0.5">Quota Iscrizione Annuale</p>
                      <p className="text-lg font-bold text-white">
                        {course.fee?.registration ? `€${course.fee.registration.toFixed(2)}` : 'Non specificata'}
                      </p>
                    </div>
                  </div>
                </div>

                {course.description && (
                  <div className="pt-4 border-t border-white/5">
                    <p className="text-xs text-white/40 mb-1">Note / Descrizione</p>
                    <p className="text-sm text-white/70 bg-white/5 p-3 rounded-xl">
                      {course.description}
                    </p>
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* TAB: ALLIEVI */}
          {activeTab === 'students' && (
            <div className="space-y-4">
              {enrolledStudents.length > 0 && (
                <div className="flex justify-end">
                  <Button size="sm" variant="ghost" onClick={handleExportRegister}>
                    <Download size={14} className="mr-1.5" /> Esporta Registro Presenze (PDF)
                  </Button>
                </div>
              )}
              <Card className="p-0 overflow-hidden border border-white/5">
                {enrolledStudents.length === 0 ? (
                  <EmptyState
                  icon="👥"
                  title="Nessun Allievo Iscritto"
                  description="Non ci sono allievi iscritti a questo corso al momento."
                />
              ) : (
                <div className="divide-y divide-white/5">
                  {enrolledStudents.map((st) => (
                    <div 
                      key={st.id} 
                      className="p-4 flex items-center justify-between hover:bg-white/[0.03] transition-colors cursor-pointer group"
                      onClick={() => navigate(`/students/${st.id}`)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-brand-500/20 text-brand-300 font-bold flex items-center justify-center">
                          {st.firstName[0]}{st.lastName[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-white group-hover:text-brand-300 transition-colors">
                            {st.lastName} {st.firstName}
                          </p>
                          <p className="text-xs text-white/40">Codice Fiscale: {st.fiscalCode || '—'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={st.isActive ? 'success' : 'gray'} size="sm">
                          {st.isActive ? 'Attivo' : 'Inattivo'}
                        </Badge>
                        <ChevronRight size={16} className="text-white/20 group-hover:text-white/60 transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
          )}

          {/* TAB: ORARI */}
          {activeTab === 'schedule' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(!course.schedule || course.schedule.length === 0) ? (
                <div className="col-span-full">
                  <EmptyState
                    icon="🕒"
                    title="Nessun Orario Definito"
                    description="Questo corso non ha ancora una programmazione settimanale."
                    action={{ label: 'Imposta Orari', onClick: () => setIsFormOpen(true) }}
                  />
                </div>
              ) : (
                [...course.schedule].sort((a, b) => a.dayOfWeek - b.dayOfWeek).map((s, idx) => (
                  <div key={idx} className="relative rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02]">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: course.colorHex || '#8b5cf6' }} />
                    <div className="p-5 pl-7 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 flex flex-col items-center justify-center text-white/80">
                        <Calendar size={16} className="mb-1 opacity-50" />
                      </div>
                      <div>
                        <p className="font-bold text-white text-lg">
                          {s.dayOfWeek === 0 ? DAYS_IT[6] : DAYS_IT[s.dayOfWeek - 1]}
                        </p>
                        <div className="flex items-center gap-1.5 text-brand-300 text-sm font-medium mt-0.5">
                          <Clock size={14} />
                          {s.startTime} - {s.endTime}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB: PAGAMENTI */}
          {activeTab === 'payments' && (
            <Card className="p-8 text-center border border-white/5 border-dashed">
              <CreditCard size={48} className="mx-auto text-white/20 mb-4" />
              <h3 className="text-lg font-bold text-white mb-2">Riepilogo Pagamenti</h3>
              <p className="text-white/50 max-w-md mx-auto">
                Il modulo pagamenti sarà disponibile nel prossimo step (Step 13). Da qui potrai vedere tutte le quote mensili generate per gli allievi di questo corso.
              </p>
            </Card>
          )}
        </div>

        <CourseForm
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          course={course}
        />
      </div>
    </ErrorBoundary>
  );
}
