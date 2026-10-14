import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSchoolStore } from '@/stores/schoolStore';
import { useCourses } from '@/hooks/useCourses';
import { useStudents } from '@/hooks/useStudents';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS, userConverter } from '@/lib/converters';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Badge, Button, EmptyState, Modal, ModalFooter, Select } from '@/components/ui';
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
  User,
  Clock,
  MapPin,
  Tag,
  Download,
  UserPlus,
  UserMinus,
} from 'lucide-react';


type TabType = 'info' | 'students' | 'schedule' | 'payments';

export default function CourseDetailPage() {
  const { id: courseId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Ensure real-time courses and students subscriptions are active
  useCourses();
  useStudents();
  const { editStudent } = useStudents();
  const { editCourse } = useCourses();

  const { courses, students, isLoadingCourses, activeSchool } = useSchoolStore();
  
  // Default tab: 'students' so the owner immediately sees enrolled students
  const [activeTab, setActiveTab] = useState<TabType>('students');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedStudentToAdd, setSelectedStudentToAdd] = useState('');
  const [teacher, setTeacher] = useState<AppUser | null>(null);

  const course = useMemo(() => courses.find((c) => c.id === courseId), [courses, courseId]);

  const enrolledStudents = useMemo(() => {
    if (!course) return [];
    return students
      .filter((s) => s.enrolledCourseIds?.includes(course.id) && !s.isDeleted)
      .sort((a, b) => a.lastName.localeCompare(b.lastName, 'it'));
  }, [students, course]);

  const unenrolledStudents = useMemo(() => {
    if (!course) return [];
    return students
      .filter((s) => !s.isDeleted && s.isActive && !s.enrolledCourseIds?.includes(course.id))
      .sort((a, b) => a.lastName.localeCompare(b.lastName, 'it'));
  }, [students, course]);

  const handleRemoveStudentFromCourse = async (studentId: string, studentName: string) => {
    const confirmed = window.confirm(`Vuoi rimuovere ${studentName} da questo corso (${course?.name})?`);
    if (!confirmed || !course) return;
    try {
      const st = students.find((s) => s.id === studentId);
      if (!st) return;
      const updated = (st.enrolledCourseIds || []).filter((id) => id !== course.id);
      await editStudent(studentId, { enrolledCourseIds: updated });
      await editCourse(course.id, { enrolledCount: Math.max(0, (course.enrolledCount || 1) - 1) });
      toast.success(`${studentName} rimosso/a dal corso.`);
    } catch (err) {
      console.error('Error removing student from course:', err);
      toast.error('Impossibile rimuovere l\'allievo dal corso.');
    }
  };

  const handleAddStudentToCourse = async () => {
    if (!selectedStudentToAdd || !course) return;
    try {
      const st = students.find((s) => s.id === selectedStudentToAdd);
      if (!st) return;
      const current = st.enrolledCourseIds || [];
      if (current.includes(course.id)) return;
      await editStudent(selectedStudentToAdd, { enrolledCourseIds: [...current, course.id] });
      await editCourse(course.id, { enrolledCount: (course.enrolledCount || 0) + 1 });
      toast.success(`${st.firstName} ${st.lastName} aggiunto/a al corso con successo!`);
      setSelectedStudentToAdd('');
      setIsAddModalOpen(false);
    } catch (err) {
      console.error('Error adding student to course:', err);
      toast.error('Impossibile aggiungere l\'allievo al corso.');
    }
  };

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
    { id: 'students', label: 'Allievi Iscritti', icon: <Users size={16} />, badge: enrolledStudents.length },
    { id: 'info', label: 'Dettagli Corso', icon: <Info size={16} /> },
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Users size={16} className="text-brand-400" />
                    Allievi Iscritti al Gruppo ({enrolledStudents.length})
                  </h3>
                  <p className="text-xs text-white/50">
                    {course.maxStudents ? `Capienza: ${enrolledStudents.length} / ${course.maxStudents} allievi` : `${enrolledStudents.length} allievi registrati`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => setIsAddModalOpen(true)}
                    icon={<UserPlus size={14} />}
                  >
                    Iscrivi Allievo
                  </Button>
                  {enrolledStudents.length > 0 && (
                    <Button size="sm" variant="secondary" onClick={handleExportRegister} icon={<Download size={14} />}>
                      Scarica Registro PDF
                    </Button>
                  )}
                </div>
              </div>

              <Card className="p-0 overflow-hidden border border-white/5">
                {enrolledStudents.length === 0 ? (
                  <EmptyState
                    icon="👥"
                    title="Nessun Allievo Iscritto"
                    description="Non ci sono ancora allievi associati a questo gruppo."
                    action={{
                      label: 'Iscrivi un Allievo ora',
                      onClick: () => setIsAddModalOpen(true),
                    }}
                  />
                ) : (
                  <div className="divide-y divide-white/5">
                    {enrolledStudents.map((st) => (
                      <div 
                        key={st.id} 
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.03] transition-colors group"
                      >
                        <div
                          className="flex items-center gap-4 cursor-pointer flex-1 min-w-0"
                          onClick={() => navigate(`/students/${st.id}`)}
                        >
                          <div className="w-10 h-10 rounded-full bg-brand-500/20 text-brand-300 font-bold flex items-center justify-center flex-shrink-0">
                            {st.firstName[0]}{st.lastName[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-white group-hover:text-brand-300 transition-colors truncate uppercase">
                              {st.lastName} {st.firstName}
                            </p>
                            <p className="text-xs text-white/40 truncate">
                              CF: {st.fiscalCode || '—'} {st.contact?.parentPhone ? `· Tel: ${st.contact.parentPhone}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 flex-shrink-0 self-end sm:self-center">
                          <Badge variant={st.isActive ? 'success' : 'gray'} size="sm">
                            {st.isActive ? 'Attivo' : 'Inattivo'}
                          </Badge>
                          <Button
                            size="xs"
                            variant="outline"
                            className="border-coral-500/30 text-coral-400 hover:bg-coral-500/15 hover:border-coral-500/60 transition-all"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveStudentFromCourse(st.id, `${st.firstName} ${st.lastName}`);
                            }}
                            title="Rimuovi da questo corso"
                            icon={<UserMinus size={13} />}
                          >
                            Rimuovi dal gruppo
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Modal per aggiungere un allievo al corso */}
              {isAddModalOpen && (
                <Modal
                  isOpen={isAddModalOpen}
                  onClose={() => {
                    setIsAddModalOpen(false);
                    setSelectedStudentToAdd('');
                  }}
                  title={`Iscrivi Allievo a ${course.name}`}
                  description="Seleziona un allievo della scuola da inserire in questo gruppo."
                >
                  <div className="space-y-4">
                    {unenrolledStudents.length === 0 ? (
                      <p className="text-sm text-white/60">Tutti gli allievi attivi della scuola sono già iscritti a questo corso.</p>
                    ) : (
                      <Select
                        label="Seleziona Allievo"
                        value={selectedStudentToAdd}
                        onChange={(e: any) => setSelectedStudentToAdd(e.target.value)}
                        options={[
                          { value: '', label: 'Scegli allievo...' },
                          ...unenrolledStudents.map((st) => ({
                            value: st.id,
                            label: `${st.lastName} ${st.firstName} (${st.fiscalCode || 'Nessun CF'})`,
                          })),
                        ]}
                      />
                    )}
                  </div>
                  <ModalFooter>
                    <Button variant="secondary" onClick={() => setIsAddModalOpen(false)}>
                      Annulla
                    </Button>
                    <Button
                      variant="primary"
                      disabled={!selectedStudentToAdd}
                      onClick={handleAddStudentToCourse}
                    >
                      Conferma Iscrizione
                    </Button>
                  </ModalFooter>
                </Modal>
              )}
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
