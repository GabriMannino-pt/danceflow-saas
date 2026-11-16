import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSchoolStore } from '@/stores/schoolStore';
import { useAuthStore } from '@/stores/authStore';
import { useCourses } from '@/hooks/useCourses';
import { useStudents } from '@/hooks/useStudents';
import { usePayments } from '@/hooks/usePayments';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS, userConverter } from '@/lib/converters';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Badge, Button, EmptyState, Modal, ModalFooter, Select } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { CourseForm } from '@/components/courses/CourseForm';
import { QuickPaymentModal } from '@/components/payments/QuickPaymentModal';
import { DAYS_IT } from '@/lib/constants';
import type { AppUser } from '@/types';
import toast from 'react-hot-toast';
import {
  generateCourseAttendanceGridPDF,
  ACADEMIC_MONTHS,
  getStudentMonthPaymentStatus,
  hasStudentPaidRegistration,
  getCurrentAcademicYearString,
} from '@/services/pdf/CourseGridPdfBuilder';
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
  CheckCircle,
  Plus,
} from 'lucide-react';


type TabType = 'info' | 'students' | 'schedule' | 'payments';

export default function CourseDetailPage() {
  const { id: courseId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Ensure real-time courses, students, and payments subscriptions are active (single listener per collection)
  const { editCourse } = useCourses();
  const { editStudent } = useStudents();
  usePayments();

  const user = useAuthStore((s) => s.user);
  const isTeacher = user?.role === 'teacher';
  const { courses, students, payments, isLoadingCourses, activeSchool } = useSchoolStore();
  
  // Default tab: 'students' so the owner immediately sees enrolled students
  const [activeTab, setActiveTab] = useState<TabType>('students');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedStudentToAdd, setSelectedStudentToAdd] = useState('');
  const [teacher, setTeacher] = useState<AppUser | null>(null);
  const [isExportingGrid, setIsExportingGrid] = useState(false);
  const [isMutatingEnrollment, setIsMutatingEnrollment] = useState(false);
  const enrollmentLockRef = useRef(false);
  const [quickPayModal, setQuickPayModal] = useState<{
    isOpen: boolean;
    studentId?: string;
    month?: number;
  }>({ isOpen: false });

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

  const getCourseErrorMessage = (err: any, networkMsg: string, fallback: string) => {
    const isNetwork =
      err?.code === 'unavailable' ||
      /network|offline|fetch|timeout|failed to get/i.test(err?.message || '');
    return isNetwork ? networkMsg : fallback;
  };

  const handleRemoveStudentFromCourse = async (studentId: string, studentName: string) => {
    if (enrollmentLockRef.current || !course) return;
    const confirmed = window.confirm(`Vuoi rimuovere ${studentName} da questo corso (${course?.name})?`);
    if (!confirmed) return;

    const st = students.find((s) => s.id === studentId);
    if (!st) {
      toast.error('Allievo non trovato.');
      return;
    }

    const prevEnrolledIds = [...(st.enrolledCourseIds || [])];
    const prevEnrolledCount = course.enrolledCount ?? enrolledStudents.length;
    const updatedIds = prevEnrolledIds.filter((id) => id !== course.id);
    const nextCount = Math.max(0, prevEnrolledCount - 1);

    enrollmentLockRef.current = true;
    setIsMutatingEnrollment(true);

    // Optimistic UI: aggiorna subito la vista del gruppo prima della risposta di Firestore
    useSchoolStore.getState().updateStudent(studentId, { enrolledCourseIds: updatedIds });
    useSchoolStore.getState().updateCourse(course.id, { enrolledCount: nextCount });

    try {
      await editStudent(studentId, { enrolledCourseIds: updatedIds });
      await editCourse(course.id, { enrolledCount: nextCount });
      toast.success(`${studentName} rimosso/a dal corso.`);
    } catch (err: any) {
      // Rollback stato locale in caso di errore di rete o permessi
      useSchoolStore.getState().updateStudent(studentId, { enrolledCourseIds: prevEnrolledIds });
      useSchoolStore.getState().updateCourse(course.id, { enrolledCount: prevEnrolledCount });
      console.error('Error removing student from course:', err);
      toast.error(
        getCourseErrorMessage(
          err,
          'Connessione internet assente o instabile. Rimozione annullata, riprova tra qualche secondo.',
          'Impossibile rimuovere l\'allievo dal corso. Riprova.'
        )
      );
    } finally {
      enrollmentLockRef.current = false;
      setIsMutatingEnrollment(false);
    }
  };

  const handleAddStudentToCourse = async () => {
    if (enrollmentLockRef.current || !selectedStudentToAdd || !course) return;
    const st = students.find((s) => s.id === selectedStudentToAdd);
    if (!st) {
      toast.error('Allievo selezionato non trovato.');
      return;
    }

    const prevEnrolledIds = [...(st.enrolledCourseIds || [])];
    if (prevEnrolledIds.includes(course.id)) {
      toast.error('Questo allievo è già iscritto al corso.');
      return;
    }

    const prevEnrolledCount = course.enrolledCount ?? enrolledStudents.length;
    const nextIds = [...prevEnrolledIds, course.id];
    const nextCount = prevEnrolledCount + 1;

    enrollmentLockRef.current = true;
    setIsMutatingEnrollment(true);

    // Optimistic UI
    useSchoolStore.getState().updateStudent(selectedStudentToAdd, { enrolledCourseIds: nextIds });
    useSchoolStore.getState().updateCourse(course.id, { enrolledCount: nextCount });

    try {
      await editStudent(selectedStudentToAdd, { enrolledCourseIds: nextIds });
      await editCourse(course.id, { enrolledCount: nextCount });
      const studentLabel = `${st.firstName?.trim() || ''} ${st.lastName?.trim() || ''}`.trim() || 'Allievo';
      toast.success(`${studentLabel} aggiunto/a al corso con successo!`);
      setSelectedStudentToAdd('');
      setIsAddModalOpen(false);
    } catch (err: any) {
      useSchoolStore.getState().updateStudent(selectedStudentToAdd, { enrolledCourseIds: prevEnrolledIds });
      useSchoolStore.getState().updateCourse(course.id, { enrolledCount: prevEnrolledCount });
      console.error('Error adding student to course:', err);
      toast.error(
        getCourseErrorMessage(
          err,
          'Connessione internet assente o instabile. Iscrizione non salvata, riprova.',
          'Impossibile aggiungere l\'allievo al corso. Riprova.'
        )
      );
    } finally {
      enrollmentLockRef.current = false;
      setIsMutatingEnrollment(false);
    }
  };

  const currentAcademicYear = getCurrentAcademicYearString();

  const handleExportRegister = () => {
    if (isExportingGrid) return;
    if (!activeSchool) {
      toast.error('Scuola non selezionata.');
      return;
    }
    if (!course) return;
    setIsExportingGrid(true);
    try {
      const doc = generateCourseAttendanceGridPDF(
        course,
        students,
        activeSchool,
        teacher?.displayName,
        currentAcademicYear,
        payments
      );
      const safeName = (course.name || 'Corso').trim().replace(/\s+/g, '_') || 'Corso';
      doc.save(`Registro_Quote_${safeName}.pdf`);
      toast.success('Registro corso con pagamenti scaricato!');
    } catch (err) {
      console.error('[CourseDetail] Export register PDF error:', err);
      toast.error('Impossibile generare il PDF del registro corso.');
    } finally {
      setIsExportingGrid(false);
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
    ...(!isTeacher ? [{ id: 'payments', label: 'Pagamenti', icon: <CreditCard size={16} /> }] : []),
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
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleExportRegister}
                      loading={isExportingGrid}
                      disabled={isExportingGrid}
                      icon={<Download size={14} />}
                    >
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
                          <div className="w-10 h-10 rounded-full bg-brand-500/20 text-brand-300 font-bold flex items-center justify-center flex-shrink-0 uppercase">
                            {`${st.firstName?.trim()?.[0] || ''}${st.lastName?.trim()?.[0] || ''}` || 'A'}
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
                            disabled={isMutatingEnrollment}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveStudentFromCourse(st.id, `${st.firstName?.trim() || ''} ${st.lastName?.trim() || ''}`.trim() || 'Allievo');
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
                    <Button
                      variant="secondary"
                      disabled={isMutatingEnrollment}
                      onClick={() => setIsAddModalOpen(false)}
                    >
                      Annulla
                    </Button>
                    <Button
                      variant="primary"
                      disabled={!selectedStudentToAdd || isMutatingEnrollment}
                      loading={isMutatingEnrollment}
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
          {activeTab === 'payments' && !isTeacher && (() => {
            const currM = new Date().getMonth() + 1;
            const paidCountCurr = enrolledStudents.filter(
              (st) => getStudentMonthPaymentStatus(st.id, currM, payments, currentAcademicYear).status === 'paid'
            ).length;
            const unpaidCountCurr = enrolledStudents.length - paidCountCurr;

            return (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <CreditCard size={16} className="text-brand-400" />
                      Situazione Pagamenti Corso ({currentAcademicYear})
                    </h3>
                    <p className="text-xs text-white/50 mt-0.5">
                      Mese corrente: <strong className="text-emerald-400">{paidCountCurr} pagati</strong> · <strong className="text-coral-400">{unpaidCountCurr} da saldare</strong>. Clicca su qualsiasi mese da pagare per incassare subito.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleExportRegister}
                      loading={isExportingGrid}
                      disabled={isExportingGrid}
                      icon={<Download size={14} />}
                    >
                      Scarica Griglia Pagamenti PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => setQuickPayModal({ isOpen: true })}
                      icon={<Plus size={14} />}
                    >
                      Registra Pagamento
                    </Button>
                  </div>
                </div>

                <Card className="p-0 overflow-hidden border border-white/5">
                  {enrolledStudents.length === 0 ? (
                    <EmptyState
                      icon="💳"
                      title="Nessun Allievo Iscritto"
                      description="Iscrivi almeno un allievo al corso per visualizzare la tabella dei pagamenti mensili."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[820px]">
                        <thead>
                          <tr className="border-b border-white/8 bg-white/[0.02] text-[11px] font-semibold text-white/50 uppercase tracking-wider">
                            <th className="py-3 px-4">Allievo</th>
                            <th className="py-3 px-3 text-center">Quota</th>
                            <th className="py-3 px-2 text-center">Iscr.</th>
                            {ACADEMIC_MONTHS.map((mObj) => (
                              <th
                                key={mObj.month}
                                className={`py-3 px-1.5 text-center ${
                                  mObj.month === currM ? 'text-brand-300 bg-brand-500/10' : ''
                                }`}
                              >
                                {mObj.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-xs">
                          {enrolledStudents.map((st) => {
                            const effectiveFee =
                              st.customMonthlyFee !== undefined && st.customMonthlyFee !== null
                                ? st.customMonthlyFee
                                : course.fee?.monthly;
                            const regOk = hasStudentPaidRegistration(st.id, payments);

                            return (
                              <tr key={st.id} className="hover:bg-white/[0.02] transition-colors">
                                <td
                                  className="py-3 px-4 font-semibold text-white cursor-pointer hover:text-brand-300"
                                  onClick={() => navigate(`/students/${st.id}`)}
                                >
                                  <span className="uppercase">{st.lastName}</span> {st.firstName}
                                </td>
                                <td className="py-3 px-3 text-center text-white/70 font-medium">
                                  {effectiveFee ? `€${effectiveFee}` : '—'}
                                </td>
                                <td className="py-3 px-2 text-center">
                                  {regOk ? (
                                    <Badge variant="success" size="sm">OK</Badge>
                                  ) : (
                                    <Badge variant="gray" size="sm">—</Badge>
                                  )}
                                </td>
                                {ACADEMIC_MONTHS.map((mObj) => {
                                  const ms = getStudentMonthPaymentStatus(
                                    st.id,
                                    mObj.month,
                                    payments,
                                    currentAcademicYear
                                  );
                                  const isCurr = mObj.month === currM;
                                  return (
                                    <td
                                      key={mObj.month}
                                      className={`py-2.5 px-1 text-center ${isCurr ? 'bg-brand-500/5' : ''}`}
                                    >
                                      {ms.status === 'paid' ? (
                                        <span
                                          className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 font-semibold text-[10px]"
                                          title={ms.receiptNumber ? `Pagato - Ricevuta N° ${ms.receiptNumber}` : 'Pagato'}
                                        >
                                          <CheckCircle size={10} className="mr-0.5" />
                                          {ms.paidAmount > 0 ? `€${Math.round(ms.paidAmount)}` : 'OK'}
                                        </span>
                                      ) : ms.status === 'partial' ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setQuickPayModal({ isOpen: true, studentId: st.id, month: mObj.month })
                                          }
                                          className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold text-[10px] hover:bg-amber-500/25 cursor-pointer"
                                          title="Acconto registrato - Clicca per saldare"
                                        >
                                          Acc. €{Math.round(ms.paidAmount)}
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setQuickPayModal({ isOpen: true, studentId: st.id, month: mObj.month })
                                          }
                                          className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-md border text-[10px] transition-colors cursor-pointer ${
                                            isCurr
                                              ? 'bg-coral-500/15 text-coral-300 border-coral-500/30 hover:bg-coral-500/30 font-semibold'
                                              : 'bg-white/5 text-white/35 border-white/10 hover:text-white hover:border-brand-500/40'
                                          }`}
                                          title={`Incassa ${mObj.label} per ${st.firstName} ${st.lastName}`}
                                        >
                                          Da pag.
                                        </button>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            );
          })()}
        </div>

        <CourseForm
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          course={course}
        />

        <QuickPaymentModal
          isOpen={quickPayModal.isOpen}
          onClose={() => setQuickPayModal({ isOpen: false })}
          initialStudentId={quickPayModal.studentId}
          initialMonth={quickPayModal.month}
        />
      </div>
    </ErrorBoundary>
  );
}
