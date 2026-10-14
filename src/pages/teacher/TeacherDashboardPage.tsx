import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useSchoolStore } from '@/stores/schoolStore';
import { useCalendar } from '@/hooks/useCalendar';
import { useMessages } from '@/hooks/useMessages';
import { Card, CardTitle, Badge, Button, EmptyState } from '@/components/ui';
import { startOfMonth, endOfMonth, isSameDay, format } from 'date-fns';
import { it } from 'date-fns/locale';
import { 
  Sparkles, Calendar, Clock, MapPin, 
  Megaphone, ArrowRight, UserCheck, Users,
} from 'lucide-react';

export default function TeacherDashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const courses = useSchoolStore((s) => s.courses);
  const students = useSchoolStore((s) => s.students);

  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  // Load calendar sessions for the current month
  const { sessions, loading: loadingCalendar } = useCalendar(monthStart, monthEnd);
  
  // Load staff communications
  const { messages, loading: loadingMessages } = useMessages();

  const teacherName = (user as any)?.firstName || user?.displayName?.split(' ')[0] || 'Docente';

  // Filter lessons scheduled for today for this teacher
  const todayLessons = useMemo(() => {
    return sessions
      .filter((s) => {
        const isToday = isSameDay(s.date.toDate(), today);
        const course = courses.find((c) => c.id === s.courseId);
        const isMyLesson =
          s.teacherId === user?.uid ||
          s.substituteTeacherId === user?.uid ||
          (Boolean(course?.teacherIds?.includes(user?.uid || '')) && !s.substituteTeacherId);
        return isToday && isMyLesson;
      })
      .map((s) => {
        const course = courses.find((c) => c.id === s.courseId);
        const count = students.filter(
          (st) => st.isActive && !st.isDeleted && st.enrolledCourseIds?.includes(s.courseId)
        ).length;
        return {
          ...s,
          courseName: course?.name || 'Lezione di Danza',
          style: course?.style || 'Stile libero',
          color: course?.colorHex || '#8b5cf6',
          enrolledCount: count || course?.enrolledCount || 0,
        };
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [sessions, courses, students, user?.uid]);

  // Filter staff communications
  const staffCommunications = useMemo(() => {
    return messages
      .filter((m) => (m.recipientType as string) === 'staff' || m.recipientType === 'all')
      .slice(0, 5);
  }, [messages]);

  const formattedDate = format(today, "EEEE d MMMM yyyy", { locale: it });

  return (
    <div className="space-y-6 text-white font-sans text-left pb-12">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-brand-500/20 bg-gradient-to-r from-brand-900/40 via-surface-900/80 to-surface-950 p-6 md:p-8 shadow-2xl animate-fade-in-up">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/10 blur-3xl rounded-full -mr-20 -mt-20" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-500/10 text-brand-300 border border-brand-500/20 text-xs font-semibold">
              <Sparkles size={14} className="animate-spin-slow" />
              Area Docenti Tropical Style
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-extrabold tracking-tight">
              Benvenuto, <span className="gradient-text">{teacherName}</span>!
            </h1>
            <p className="text-sm text-white/60 leading-relaxed font-body">
              Oggi è <strong className="text-white capitalize">{formattedDate}</strong>. Ecco il programma delle tue lezioni e le ultime comunicazioni della segreteria.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/calendar')}
              icon={<Calendar size={16} />}
              className="border-white/10 hover:bg-white/5 text-white/80"
            >
              Vedi Calendario
            </Button>
            <Button
              size="sm"
              onClick={() => navigate('/attendance')}
              icon={<UserCheck size={16} />}
            >
              Registro Presenze
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Lezioni di oggi - 3/5 width */}
        <div className="lg:col-span-3 space-y-4">
          <Card className="border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="text-brand-400" size={18} />
                <CardTitle>Lezioni di Oggi</CardTitle>
              </div>
              <Badge variant="brand" size="sm">
                {todayLessons.length} lezioni
              </Badge>
            </div>

            {loadingCalendar ? (
              <div className="py-12 text-center text-white/40 text-sm">
                Caricamento lezioni in corso...
              </div>
            ) : todayLessons.length === 0 ? (
              <EmptyState
                icon="🎉"
                title="Nessuna lezione oggi"
                description="Oggi non hai lezioni pianificate. Goditi il tempo libero!"
              />
            ) : (
              <div className="space-y-3">
                {todayLessons.map((session) => {
                  const isSubstitute = session.substituteTeacherId === user?.uid;
                  return (
                    <div
                      key={session.id}
                      className="p-4 rounded-2xl glass border border-white/5 hover:border-brand-500/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                    >
                      <div className="flex gap-3.5 items-start">
                        <div
                          className="w-2.5 h-12 rounded-full flex-shrink-0"
                          style={{ backgroundColor: session.color }}
                        />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-white group-hover:text-brand-300 transition-colors">
                              {session.courseName}
                            </h4>
                            {isSubstitute && (
                              <Badge variant="warning" size="sm">
                                Supplenza
                              </Badge>
                            )}
                            <Badge
                              variant={
                                session.status === 'completed' ? 'success' :
                                session.status === 'cancelled' ? 'danger' : 'brand'
                              }
                              size="sm"
                            >
                              {session.status === 'scheduled' ? 'In programma' :
                               session.status === 'completed' ? 'Svolta' : 'Annullata'}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
                            <span className="flex items-center gap-1">
                              <Clock size={12} />
                              {session.startTime} - {session.endTime}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin size={12} />
                              {session.room}
                            </span>
                            <span className="flex items-center gap-1 text-brand-300 font-medium">
                              <Users size={12} />
                              {session.enrolledCount} {session.enrolledCount === 1 ? 'allievo atteso' : 'allievi attesi'}
                            </span>
                            <span className="text-white/40 font-semibold">{session.style}</span>
                          </div>
                        </div>
                      </div>
                      <div className="self-end sm:self-center flex gap-2">
                        {session.status !== 'cancelled' && (
                          <Button
                            size="sm"
                            variant={session.attendanceRecorded ? 'secondary' : 'primary'}
                            onClick={() => {
                              const dateStr = format(session.date.toDate(), 'yyyy-MM-dd');
                              navigate(`/attendance?courseId=${session.courseId}&date=${dateStr}`);
                            }}
                            icon={session.attendanceRecorded ? <UserCheck size={14} /> : <ArrowRight size={14} />}
                            className="text-xs"
                          >
                            {session.attendanceRecorded ? 'Presenze' : 'Appello'}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Comunicazioni di staff - 2/5 width */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border border-white/5 h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Megaphone className="text-coral-400" size={18} />
                <CardTitle>Comunicazioni di Staff</CardTitle>
              </div>

              {loadingMessages ? (
                <div className="py-12 text-center text-white/40 text-sm">
                  Caricamento comunicazioni...
                </div>
              ) : staffCommunications.length === 0 ? (
                <EmptyState
                  icon="📩"
                  title="Nessun avviso"
                  description="Non ci sono comunicazioni per lo staff al momento."
                />
              ) : (
                <div className="space-y-3.5">
                  {staffCommunications.map((msg) => (
                    <div
                      key={msg.id}
                      className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all space-y-1.5 text-xs text-left"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <h5 className="font-bold text-white text-sm line-clamp-1">
                          {msg.subject}
                        </h5>
                        <span className="text-[10px] text-white/30 flex-shrink-0">
                          {msg.sentAt ? format(msg.sentAt.toDate(), 'dd MMM', { locale: it }) : '—'}
                        </span>
                      </div>
                      <p className="text-white/60 line-clamp-2 leading-relaxed">
                        {msg.body}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
