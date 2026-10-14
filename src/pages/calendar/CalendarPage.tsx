import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSchoolStore } from '@/stores/schoolStore';
import { useAuthStore } from '@/stores/authStore';
import { useCalendar } from '@/hooks/useCalendar';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardTitle, Modal, ModalFooter, Select, Input, Textarea, Button, Badge, Skeleton, EmptyState } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, addMonths, startOfWeek, endOfWeek
} from 'date-fns';
import { it } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight,
  Clock, MapPin, Edit, CheckCircle
} from 'lucide-react';
import type { CourseSession } from '@/types';

export default function CalendarPage() {
  const user = useAuthStore((s) => s.user);
  const isTeacher = user?.role === 'teacher';
  const allCourses = useSchoolStore((s) => s.courses);
  const courses = useMemo(() =>
    allCourses.filter((c) => c.isActive && !c.isDeleted),
  [allCourses]);

  const [onlyMyLessons, setOnlyMyLessons] = useState<boolean>(isTeacher);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [editingSession, setEditingSession] = useState<CourseSession | null>(null);

  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Form Fields per la modifica della sessione
  const [sessionStatus, setSessionStatus] = useState<CourseSession['status']>('scheduled');
  const [cancelReason, setCancelReason] = useState<string>('');
  const [substituteTeacherId, setSubstituteTeacherId] = useState<string>('');
  const [sessionNotes, setSessionNotes] = useState<string>('');

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  // Includiamo i giorni della settimana precedente e successiva per riempire la griglia mensile
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const {
    loading,
    sessions,
    events,
    updateSession
  } = useCalendar(gridStart, gridEnd);

  // Filtra le sessioni se il toggle "Solo le mie lezioni" è attivo
  const filteredSessions = useMemo(() => {
    if (!onlyMyLessons || !user?.uid) return sessions;
    return sessions.filter((s) => {
      const course = courses.find((c) => c.id === s.courseId);
      return (
        s.teacherId === user.uid ||
        s.substituteTeacherId === user.uid ||
        Boolean(course?.teacherIds?.includes(user.uid))
      );
    });
  }, [sessions, onlyMyLessons, user?.uid, courses]);

  // Lista di tutti i giorni da visualizzare nel calendario
  const daysInGrid = useMemo(() => {
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [gridStart, gridEnd]);

  // Seleziona le attività previste per il giorno evidenziato
  const activeDayActivities = useMemo(() => {
    const daySessions = filteredSessions
      .filter((s) => isSameDay(s.date.toDate(), selectedDate))
      .map((s) => {
        const course = courses.find((c) => c.id === s.courseId);
        return {
          type: 'session' as const,
          id: s.id,
          title: course?.name ?? 'Lezione',
          style: course?.style ?? 'Danza',
          color: course?.colorHex ?? '#8b5cf6',
          startTime: s.startTime,
          endTime: s.endTime,
          room: s.room ?? course?.room ?? 'Sala principale',
          status: s.status,
          attendanceRecorded: s.attendanceRecorded,
          raw: s
        };
      });

    const dayEvents = events
      .filter((e) => isSameDay(e.startDate.toDate(), selectedDate))
      .map((e) => ({
        type: 'event' as const,
        id: e.id,
        title: e.name,
        style: e.type,
        color: '#f59e0b', // colore oro/arancione fisso per eventi
        startTime: format(e.startDate.toDate(), 'HH:mm'),
        endTime: e.endDate ? format(e.endDate.toDate(), 'HH:mm') : undefined,
        room: e.location ?? 'Scuola',
        status: e.status,
        attendanceRecorded: false,
        raw: e
      }));

    return [...daySessions, ...dayEvents].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [selectedDate, filteredSessions, events, courses]);

  // Gestione navigazione mesi
  const prevMonth = () => setCurrentMonth(addMonths(currentMonth, -1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  // Funzione per salvare le modifiche a una lezione
  const handleSaveSession = async () => {
    if (!editingSession) return;
    await updateSession(editingSession.id, {
      status: sessionStatus,
      cancelReason: sessionStatus === 'cancelled' ? cancelReason : undefined,
      substituteTeacherId: substituteTeacherId || undefined,
      notes: sessionNotes || undefined
    });
    setEditingSession(null);
  };

  return (
    <ErrorBoundary>
      <div className='page-enter space-y-6'>
        <PageHeader
          title='Calendario lezioni ed eventi'
          subtitle='Pianificazione delle attività e gestione del registro'
          actions={
            <div className='flex items-center gap-2'>
              <button
                onClick={() => setOnlyMyLessons(!onlyMyLessons)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                  onlyMyLessons
                    ? 'bg-brand-500/20 text-brand-300 border-brand-500/30'
                    : 'bg-white/5 text-white/60 border-white/10 hover:text-white'
                }`}
              >
                {onlyMyLessons ? '✨ Le mie lezioni' : 'Tutte le lezioni'}
              </button>
              <div className='flex items-center gap-1 glass p-1 rounded-xl'>
                <Button variant='ghost' size='xs' onClick={prevMonth}>
                  <ChevronLeft size={16} />
                </Button>
                <span className='text-xs font-semibold px-2 text-white capitalize'>
                  {format(currentMonth, 'MMMM yyyy', { locale: it })}
                </span>
                <Button variant='ghost' size='xs' onClick={nextMonth}>
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          }
        />

        {isMobile ? (
          <div className='space-y-4 animate-fade-in-up'>
            {/* Day Selector Bar */}
            <div className='flex items-center justify-between bg-surface-900 border border-white/5 p-3 rounded-2xl'>
              <Button
                variant='ghost'
                size='sm'
                onClick={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() - 1);
                  setSelectedDate(d);
                  if (d.getMonth() !== currentMonth.getMonth()) {
                    setCurrentMonth(startOfMonth(d));
                  }
                }}
              >
                <ChevronLeft size={18} />
              </Button>
              <span className='text-xs font-bold text-white capitalize'>
                {format(selectedDate, 'eeee d MMMM yyyy', { locale: it })}
              </span>
              <Button
                variant='ghost'
                size='sm'
                onClick={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() + 1);
                  setSelectedDate(d);
                  if (d.getMonth() !== currentMonth.getMonth()) {
                    setCurrentMonth(startOfMonth(d));
                  }
                }}
              >
                <ChevronRight size={18} />
              </Button>
            </div>

            {/* Activities List */}
            <Card className='p-4 border border-white/5'>
              <div className='flex items-center justify-between mb-4'>
                <CardTitle className='text-sm font-semibold'>Lezioni ed Eventi del Giorno</CardTitle>
                <Badge variant='gray' size='sm'>
                  {activeDayActivities.length} attività
                </Badge>
              </div>

              {activeDayActivities.length === 0 ? (
                <EmptyState
                  icon='📅'
                  title='Nessuna attività programmata'
                  description='Non ci sono lezioni o eventi previsti per oggi.'
                />
              ) : (
                <div className='space-y-3'>
                  {activeDayActivities.map((act) => (
                    <div
                      key={act.id}
                      className='p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-brand-500/20 transition-all space-y-2 text-left'
                    >
                      <div className='flex items-start justify-between gap-2'>
                        <div className='flex items-center gap-2'>
                          <span
                            className='w-2.5 h-2.5 rounded-full flex-shrink-0'
                            style={{ backgroundColor: act.color }}
                          />
                          <p className='text-sm font-bold text-white truncate'>{act.title}</p>
                        </div>
                        {act.type === 'session' && (
                          <Badge
                            variant={
                              act.status === 'completed' ? 'success' :
                              act.status === 'cancelled' ? 'danger' :
                              act.status === 'postponed' ? 'warning' : 'brand'
                            }
                            size='sm'
                          >
                            {act.status === 'scheduled' && 'In programma'}
                            {act.status === 'completed' && 'Svolta'}
                            {act.status === 'cancelled' && 'Annullata'}
                            {act.status === 'postponed' && 'Posticipata'}
                          </Badge>
                        )}
                      </div>
                      <div className='flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50'>
                        <span className='flex items-center gap-1'>
                          <Clock size={12} />
                          {act.startTime} - {act.endTime || '—'}
                        </span>
                        <span className='flex items-center gap-1 capitalize'>
                          <MapPin size={12} />
                          {act.room}
                        </span>
                        <span className='text-white/40 font-semibold'>{act.style}</span>
                      </div>
                      {act.type === 'session' && act.status !== 'cancelled' && (
                        <div className='flex justify-end gap-1.5 pt-2 border-t border-white/5'>
                          <Button
                            size='xs'
                            variant='outline'
                            icon={<Edit size={12} />}
                            onClick={() => {
                              setEditingSession(act.raw as CourseSession);
                              setSessionStatus((act.raw as CourseSession).status);
                              setCancelReason((act.raw as CourseSession).cancelReason || '');
                              setSubstituteTeacherId((act.raw as CourseSession).substituteTeacherId || '');
                              setSessionNotes((act.raw as CourseSession).notes || '');
                            }}
                          >
                            Modifica
                          </Button>
                          <Button
                            size='xs'
                            variant={act.attendanceRecorded ? 'secondary' : 'primary'}
                            icon={<CheckCircle size={12} />}
                            onClick={() => {
                              if (act.type === 'session') {
                                const sess = act.raw as CourseSession;
                                const dateStr = format(sess.date.toDate(), 'yyyy-MM-dd');
                                navigate(`/attendance?courseId=${sess.courseId}&date=${dateStr}`);
                              } else {
                                navigate('/attendance');
                              }
                            }}
                          >
                            {act.attendanceRecorded ? 'Presenze' : 'Appello'}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        ) : (
          <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
            {/* ── Vista Griglia Mensile ────────────────────────────────────── */}
            <Card className='lg:col-span-2 p-4 flex flex-col'>
              {/* Header Giorni della Settimana */}
              <div className='grid grid-cols-7 gap-1 text-center mb-2'>
                {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((d) => (
                  <span key={d} className='text-xs font-medium text-white/40 py-1'>
                    {d}
                  </span>
                ))}
              </div>

              {/* Griglia Calendario */}
              {loading ? (
                <div className='grid grid-cols-7 gap-1 flex-1 min-h-[320px]'>
                  {[...Array(35)].map((_, i) => (
                    <Skeleton key={i} className='rounded-xl h-12 w-full' />
                  ))}
                </div>
              ) : (
                <div className='grid grid-cols-7 gap-1 flex-1'>
                  {daysInGrid.map((day) => {
                    const isCurrent = isSameDay(day, selectedDate);
                    const isToday = isSameDay(day, new Date());
                    const isThisMonth = day.getMonth() === currentMonth.getMonth();

                    // Filtra le attività di questo giorno specifico per mostrare i pallini indicatori
                    const daySessionsCount = filteredSessions.filter((s) => isSameDay(s.date.toDate(), day)).length;
                    const dayEventsCount = events.filter((e) => isSameDay(e.startDate.toDate(), day)).length;

                    return (
                      <button
                        key={day.toString()}
                        onClick={() => setSelectedDate(day)}
                        className={`relative rounded-xl p-2 h-14 sm:h-16 flex flex-col justify-between items-start transition-all active:scale-95 text-left border ${
                          isCurrent
                            ? 'bg-brand-500/20 border-brand-500 text-white'
                            : isToday
                            ? 'bg-white/5 border-white/20 text-white'
                            : 'bg-transparent border-transparent hover:bg-white/5 text-white/80'
                        } ${!isThisMonth && 'opacity-30'}`}
                      >
                        <span className={`text-xs font-bold ${isToday && 'text-brand-300 font-display'}`}>
                          {format(day, 'd')}
                        </span>

                        {/* Pallini indicatori */}
                        <div className='flex gap-1 mt-1'>
                          {[...Array(Math.min(daySessionsCount, 3))].map((_, idx) => (
                            <span key={idx} className='w-1.5 h-1.5 rounded-full bg-brand-400' />
                          ))}
                          {dayEventsCount > 0 && (
                            <span className='w-1.5 h-1.5 rounded-full bg-amber-400' />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* ── Attività e Lezioni del Giorno ────────────────────────────── */}
            <div className='space-y-4'>
              <Card>
                <div className='flex items-center justify-between mb-4'>
                  <CardTitle className='text-sm font-semibold'>
                    Attività di {format(selectedDate, 'eeee d MMMM', { locale: it })}
                  </CardTitle>
                  <Badge variant='gray' size='sm'>
                    {activeDayActivities.length} attività
                  </Badge>
                </div>

                {activeDayActivities.length === 0 ? (
                  <EmptyState
                    icon='☕'
                    title='Nessuna attività pianificata'
                    description='Non ci sono lezioni o eventi previsti per questo giorno.'
                  />
                ) : (
                  <div className='space-y-3 max-h-[380px] overflow-y-auto pr-1'>
                    {activeDayActivities.map((act) => (
                      <div
                        key={act.id}
                        className='p-3 rounded-2xl glass border border-white/5 hover:bg-white/5 transition-all space-y-2'
                      >
                        <div className='flex items-start justify-between gap-2'>
                          <div className='flex items-center gap-2'>
                            <span
                              className='w-3 h-3 rounded-full flex-shrink-0'
                              style={{ backgroundColor: act.color }}
                            />
                            <p className='text-sm font-semibold text-white truncate'>{act.title}</p>
                          </div>
                          {act.type === 'session' && (
                            <Badge
                              variant={
                                act.status === 'completed' ? 'success' :
                                act.status === 'cancelled' ? 'danger' :
                                act.status === 'postponed' ? 'warning' : 'brand'
                              }
                              size='sm'
                            >
                              {act.status === 'scheduled' && 'In programma'}
                              {act.status === 'completed' && 'Svolta'}
                              {act.status === 'cancelled' && 'Annullata'}
                              {act.status === 'postponed' && 'Posticipata'}
                            </Badge>
                          )}
                        </div>

                        {/* Info extra */}
                        <div className='flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50'>
                          <span className='flex items-center gap-1'>
                            <Clock size={12} />
                            {act.startTime} - {act.endTime || '—'}
                          </span>
                          <span className='flex items-center gap-1 capitalize'>
                            <MapPin size={12} />
                            {act.room}
                          </span>
                          <span className='text-white/40 font-semibold'>{act.style}</span>
                        </div>

                        {act.type === 'session' && act.status !== 'cancelled' && (
                          <div className='flex justify-end gap-1.5 pt-2 border-t border-white/5'>
                            <Button
                              size='xs'
                              variant='outline'
                              icon={<Edit size={12} />}
                              onClick={() => {
                                setEditingSession(act.raw as CourseSession);
                                setSessionStatus((act.raw as CourseSession).status);
                                setCancelReason((act.raw as CourseSession).cancelReason || '');
                                setSubstituteTeacherId((act.raw as CourseSession).substituteTeacherId || '');
                                setSessionNotes((act.raw as CourseSession).notes || '');
                              }}
                            >
                              Modifica
                            </Button>
                            <Button
                              variant='outline'
                              size='xs'
                              icon={<CheckCircle size={12} />}
                              onClick={() => {
                                if (act.type === 'session') {
                                  const sess = act.raw as CourseSession;
                                  const dateStr = format(sess.date.toDate(), 'yyyy-MM-dd');
                                  navigate(`/attendance?courseId=${sess.courseId}&date=${dateStr}`);
                                } else {
                                  navigate('/attendance');
                                }
                              }}
                            >
                              Registro
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}

        {/* ── Modal Gestione Lezione ───────────────────────────────────── */}
        {editingSession && (
          <Modal
            isOpen={true}
            onClose={() => setEditingSession(null)}
            title='Modifica Sessione Lezione'
          >
            <div className='space-y-4 py-2'>
              <Select
                label='Stato Lezione'
                value={sessionStatus}
                onChange={(e) => setSessionStatus(e.target.value as CourseSession['status'])}
                options={[
                  { value: 'scheduled', label: 'In programma' },
                  { value: 'completed', label: 'Completata / Svolta' },
                  { value: 'cancelled', label: 'Annullata / Sospesa' },
                  { value: 'postponed', label: 'Posticipata' },
                ]}
              />

              {sessionStatus === 'cancelled' && (
                <Textarea
                  label='Motivo Annullamento'
                  placeholder='Es. Festività nazionale o malattia docente'
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              )}

              <Input
                label='Docente Supplente (ID o Nome)'
                placeholder='Es. Prof. Rossi'
                value={substituteTeacherId}
                onChange={(e) => setSubstituteTeacherId(e.target.value)}
              />

              <Textarea
                label='Note per la Lezione'
                placeholder="Es. Portare abbigliamento comodo e bottiglia d'acqua"
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
              />
            </div>
            <ModalFooter>
              <Button variant='secondary' onClick={() => setEditingSession(null)}>
                Annulla
              </Button>
              <Button onClick={handleSaveSession}>
                Salva Modifiche
              </Button>
            </ModalFooter>
          </Modal>
        )}
      </div>
    </ErrorBoundary>
  );
}
