import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, orderBy,
  onSnapshot, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { useSchoolStore } from '@/stores/schoolStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardTitle, Skeleton, Badge } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { formatCurrency } from '@/lib/utils';
import { COLLECTIONS, eventConverter } from '@/lib/converters';
import { format, startOfWeek, endOfWeek, addMonths, startOfMonth, endOfMonth, differenceInDays } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  Users, BookOpen, TrendingUp, AlertCircle,
  CheckCircle, CreditCard,
  MessageSquare, ChevronRight,
  ShieldAlert, FileWarning, BadgeDollarSign,
} from 'lucide-react';
import type { Payment, Event, Student } from '@/types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardData {
  // KPIs
  activeStudentsCount: number;
  activeCourses: number;
  monthlyRevenue: number;
  overdueTotal: number;
  attendanceWeekPct: number;
  expiringCertsCount: number;

  // Activity
  recentPayments: (Payment & { studentName: string; courseName: string })[];
  recentStudents: Student[];
  upcomingEvents: Event[];

  // Alerts
  overdueStudents: { student: Student; amount: number; daysOverdue: number }[];
  expiredCertStudents: Student[];
  missingDocsStudents: Student[];

  // Charts
  revenueByMonth: { month: string; amount: number }[];
  studentsByCourse: { name: string; value: number; color: string }[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const schoolId = user?.schoolId;

  const students = useSchoolStore((s) => s.students);
  const courses = useSchoolStore((s) => s.courses);
  const payments = useSchoolStore((s) => s.payments);

  const activeStudents = useMemo(() =>
    students.filter((st) => st.isActive && !st.isDeleted),
  [students]);

  const activeCourses = useMemo(() =>
    courses.filter((c) => c.isActive && !c.isDeleted),
  [courses]);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const today = format(new Date(), "EEEE d MMMM yyyy", { locale: it });

  // ─── Derived KPIs from store ───────────────────────────────────────────────
  const monthlyRevenue = useMemo(() => {
    const today = new Date();
    const mStart = startOfMonth(today);
    const mEnd = endOfMonth(today);
    let sum = 0;
    
    payments.forEach((p) => {
      if (p.payments && p.payments.length > 0) {
        p.payments.forEach((inst) => {
          const instDate = inst.date.toDate();
          if (instDate >= mStart && instDate <= mEnd) {
            sum += inst.amount;
          }
        });
      } else if (p.status === 'paid' && p.paidAt) {
        const paid = p.paidAt.toDate();
        if (paid >= mStart && paid <= mEnd) {
          sum += p.amount;
        }
      }
    });
    return sum;
  }, [payments]);

  const overdueTotal = useMemo(() =>
    payments
      .filter((p) => p.status === 'overdue')
      .reduce((sum, p) => sum + (p.remainingAmount ?? p.amount), 0),
  [payments]);

  const expiringCerts = useMemo(() => {
    const today = new Date();
    const limit = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    return students.filter((s) => {
      if (!s.isActive || s.isDeleted) return false;
      const exp = s.medicalInfo?.medicalClearanceExpiry;
      if (!exp) return false;
      const expDate = exp.toDate();
      return expDate >= today && expDate <= limit;
    });
  }, [students]);

  // Revenue last 6 months for bar chart
  const revenueByMonth = useMemo(() => {
    const months: { month: string; amount: number }[] = [];
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = addMonths(today, -i);
      const mStart = startOfMonth(d);
      const mEnd   = endOfMonth(d);
      
      let sum = 0;
      payments.forEach((p) => {
        if (p.payments && p.payments.length > 0) {
          p.payments.forEach((inst) => {
            const instDate = inst.date.toDate();
            if (instDate >= mStart && instDate <= mEnd) {
              sum += inst.amount;
            }
          });
        } else if (p.status === 'paid' && p.paidAt) {
          const paid = p.paidAt.toDate();
          if (paid >= mStart && paid <= mEnd) {
            sum += p.amount;
          }
        }
      });
      months.push({ month: format(d, 'MMM', { locale: it }), amount: sum });
    }
    return months;
  }, [payments]);

  // Students by course for pie chart
  const studentsByCourse = useMemo(() => {
    return activeCourses.map((c) => ({
      name: c.name,
      value: students.filter((s) =>
        s.isActive && !s.isDeleted && s.enrolledCourseIds?.includes(c.id)
      ).length,
      color: c.colorHex || '#6366f1',
    })).filter((x) => x.value > 0);
  }, [activeCourses, students]);

  // ─── Alerts ───────────────────────────────────────────────────────────────
  const overdueStudents = useMemo(() => {
    const today = new Date();
    const overdue = payments.filter((p) => p.status === 'overdue');
    const grouped: Record<string, { student: Student; amount: number; daysOverdue: number }> = {};
    for (const p of overdue) {
      const student = students.find((s) => s.id === p.studentId);
      if (!student) continue;
      const days = differenceInDays(today, p.dueDate.toDate());
      if (!grouped[student.id]) {
        grouped[student.id] = { student, amount: 0, daysOverdue: days };
      }
      grouped[student.id].amount += (p.remainingAmount ?? p.amount);
      if (days > grouped[student.id].daysOverdue) grouped[student.id].daysOverdue = days;
    }
    return Object.values(grouped).sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [payments, students]);

  const expiredCertStudents = useMemo(() => {
    const today = new Date();
    return students.filter((s) => {
      if (!s.isActive || s.isDeleted) return false;
      const exp = s.medicalInfo?.medicalClearanceExpiry;
      if (!exp) return !s.medicalInfo?.medicalClearance; // no cert at all
      return exp.toDate() < today;
    }).slice(0, 5);
  }, [students]);

  const missingDocsStudents = useMemo(() =>
    students.filter((s) => {
      if (!s.isActive || s.isDeleted) return false;
      const docTypes = s.documents?.map((d) => d.type) ?? [];
      return !docTypes.includes('consent') || !docTypes.includes('medical');
    }).slice(0, 5),
  [students]);

  // ─── Firestore: recent payments enriched ──────────────────────────────────
  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    if (!payments.length && !students.length) { setLoading(false); return; }

    // Recent payments (enriched with student/course names from store)
    const recentPayments = payments.slice(0, 5).map((p) => {
      const student = students.find((s) => s.id === p.studentId);
      const course  = courses.find((c) => c.id === p.courseId);
      return {
        ...p,
        studentName: student ? `${student.firstName} ${student.lastName}` : '—',
        courseName:  course?.name ?? p.description,
      };
    });

    const recentStudents = [...students]
      .filter((s) => !s.isDeleted)
      .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
      .slice(0, 3);

    setData((prev) => ({
      ...(prev ?? {} as DashboardData),
      activeStudentsCount: activeStudents.length,
      activeCourses: activeCourses.length,
      monthlyRevenue,
      overdueTotal,
      attendanceWeekPct: prev?.attendanceWeekPct ?? 0,
      expiringCertsCount: expiringCerts.length,
      recentPayments,
      recentStudents,
      upcomingEvents: prev?.upcomingEvents ?? [],
      overdueStudents,
      expiredCertStudents,
      missingDocsStudents,
      revenueByMonth,
      studentsByCourse,
    }));
    setLoading(false);
  }, [payments, students, courses, activeStudents, activeCourses, monthlyRevenue,
      overdueTotal, expiringCerts, overdueStudents, expiredCertStudents,
      missingDocsStudents, revenueByMonth, studentsByCourse, schoolId]);

  // ─── Firestore: attendance this week + upcoming events ───────────────────
  useEffect(() => {
    if (!schoolId) return;

    const todayDate = new Date();
    const weekStart = startOfWeek(todayDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(todayDate, { weekStartsOn: 1 });
    const now = todayDate;

    // Attendance this week
    const attQ = query(
      collection(db, COLLECTIONS.attendance(schoolId)),
      where('date', '>=', Timestamp.fromDate(weekStart)),
      where('date', '<=', Timestamp.fromDate(weekEnd))
    );
    const unsubAtt = onSnapshot(attQ, (snap) => {
      const records = snap.docs.map((d) => d.data() as { status: string });
      const total   = records.length;
      const present = records.filter((r) => r.status === 'present' || r.status === 'late').length;
      const pct     = total > 0 ? Math.round((present / total) * 100) : 0;
      setData((prev) => prev ? { ...prev, attendanceWeekPct: pct } : prev);
    });

    // Upcoming events
    const evQ = query(
      collection(db, COLLECTIONS.events(schoolId)).withConverter(eventConverter),
      where('startDate', '>=', Timestamp.fromDate(now)),
      orderBy('startDate', 'asc')
    );
    const unsubEv = onSnapshot(evQ, (snap) => {
      const events = snap.docs
        .map((d) => d.data())
        .filter((e) => e.status !== 'cancelled' && e.isDeleted !== true)
        .slice(0, 3);
      setData((prev) => prev ? { ...prev, upcomingEvents: events } : prev);
    });

    return () => { unsubAtt(); unsubEv(); };
  }, [schoolId]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <ErrorBoundary>
      <div className='page-enter space-y-6'>
        <PageHeader
          title='Dashboard'
          subtitle={today}
          actions={
            <div className='flex items-center gap-2 glass px-3 py-1.5 rounded-xl'>
              <div className='w-2 h-2 rounded-full bg-teal-400 animate-pulse' />
              <span className='text-xs text-white/60'>Live</span>
            </div>
          }
        />

        {/* ── KPI Cards ─────────────────────────────────────────────────── */}
        {loading ? (
          <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4'>
            {[...Array(6)].map((_, i) => (
              <div key={i} className='glass rounded-2xl p-4 space-y-3'>
                <Skeleton className='h-4 w-20' />
                <Skeleton className='h-8 w-14' />
                <Skeleton className='h-3 w-16' />
              </div>
            ))}
          </div>
        ) : data ? (
          <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4'>
            <KPICard
              icon={<Users size={18} />}
              label='Allievi Attivi'
              value={data.activeStudentsCount}
              sub={`${students.filter((s) => !s.isDeleted).length} totali`}
              color='brand'
            />
            <KPICard
              icon={<BookOpen size={18} />}
              label='Corsi Attivi'
              value={data.activeCourses}
              sub='questo anno'
              color='teal'
            />
            <KPICard
              icon={<TrendingUp size={18} />}
              label='Incasso Mese'
              value={formatCurrency(data.monthlyRevenue)}
              sub='pagamenti saldati'
              color='gold'
            />
            <KPICard
              icon={<BadgeDollarSign size={18} />}
              label='Morosità Totale'
              value={formatCurrency(data.overdueTotal)}
              sub={`${overdueStudents.length} allievi`}
              color={data.overdueTotal > 0 ? 'coral' : 'teal'}
            />
            <KPICard
              icon={<CheckCircle size={18} />}
              label='Presenze Sett.'
              value={`${data.attendanceWeekPct}%`}
              sub='questa settimana'
              color={data.attendanceWeekPct >= 80 ? 'teal' : data.attendanceWeekPct >= 60 ? 'gold' : 'coral'}
            />
            <KPICard
              icon={<AlertCircle size={18} />}
              label='Cert. in Scadenza'
              value={data.expiringCertsCount}
              sub='entro 30 giorni'
              color={data.expiringCertsCount > 0 ? 'coral' : 'teal'}
            />
          </div>
        ) : null}

        {/* ── Charts Row ─────────────────────────────────────────────────── */}
        {data && (
          <div className='grid grid-cols-1 lg:grid-cols-5 gap-6'>
            {/* Revenue Bar Chart — 3/5 width */}
            <div className='lg:col-span-3'>
              <Card className='h-80'>
                <CardTitle className='mb-4'>Andamento Incassi — Ultimi 6 Mesi</CardTitle>
                <div className='w-full h-[220px]'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <BarChart data={data.revenueByMonth}>
                      <CartesianGrid strokeDasharray='3 3' stroke='rgba(255, 255, 255, 0.05)' />
                      <XAxis dataKey='month' stroke='rgba(255, 255, 255, 0.4)' fontSize={11} />
                      <YAxis stroke='rgba(255, 255, 255, 0.4)' fontSize={11} tickFormatter={(v: any) => `€${v}`} />
                      <Tooltip
                        contentStyle={{ background: 'rgba(15, 15, 25, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                        labelStyle={{ color: 'white', fontWeight: 'bold' }}
                        itemStyle={{ color: '#a78bfa' }}
                      />
                      <Bar dataKey='amount' fill='#8b5cf6' radius={[4, 4, 0, 0]} name='Incasso' />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
            {/* Students Pie Chart — 2/5 width */}
            <div className='lg:col-span-2'>
              <Card className='h-80'>
                <CardTitle className='mb-2'>Allievi per Corso</CardTitle>
                {data.studentsByCourse.length === 0 ? (
                  <div className='flex items-center justify-center h-[220px] text-sm text-white/30'>
                    Nessun allievo iscritto ai corsi
                  </div>
                ) : (
                  <div className='w-full h-[220px]'>
                    <ResponsiveContainer width='100%' height='100%'>
                      <PieChart>
                        <Pie
                          data={data.studentsByCourse}
                          cx='50%'
                          cy='50%'
                          innerRadius={50}
                          outerRadius={75}
                          paddingAngle={3}
                          dataKey='value'
                        >
                          {data.studentsByCourse.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: 'rgba(15, 15, 25, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                          itemStyle={{ color: 'white' }}
                        />
                        <Legend
                          verticalAlign='bottom'
                          height={36}
                          iconType='circle'
                          formatter={(value: any, entry: any) => (
                            <span className='text-xs text-white/60'>{value} ({entry.payload?.value})</span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}

        {/* ── Alerts ─────────────────────────────────────────────────────── */}
        {data && (overdueStudents.length > 0 || expiredCertStudents.length > 0 || missingDocsStudents.length > 0) && (
          <div className='space-y-3'>
            <h2 className='text-sm font-semibold text-white/50 uppercase tracking-wider'>⚠️ Alert</h2>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              {overdueStudents.length > 0 && (
                <AlertCard
                  icon={<BadgeDollarSign size={18} />}
                  title='Morosità Critiche'
                  color='coral'
                  items={overdueStudents.map((o) => ({
                    id: o.student.id,
                    label: `${o.student.firstName} ${o.student.lastName}`,
                    sub: `${formatCurrency(o.amount)} · ${o.daysOverdue}gg di ritardo`,
                    href: `/students/${o.student.id}`,
                  }))}
                  onNavigate={(href) => navigate(href)}
                />
              )}
              {expiredCertStudents.length > 0 && (
                <AlertCard
                  icon={<ShieldAlert size={18} />}
                  title='Certificati Scaduti / Mancanti'
                  color='gold'
                  items={expiredCertStudents.map((s) => ({
                    id: s.id,
                    label: `${s.firstName} ${s.lastName}`,
                    sub: s.medicalInfo?.medicalClearanceExpiry
                      ? `Scaduto il ${format(s.medicalInfo.medicalClearanceExpiry.toDate(), 'dd/MM/yyyy')}`
                      : 'Nessun certificato',
                    href: `/students/${s.id}`,
                  }))}
                  onNavigate={(href) => navigate(href)}
                />
              )}
              {missingDocsStudents.length > 0 && (
                <AlertCard
                  icon={<FileWarning size={18} />}
                  title='Documenti Mancanti'
                  color='gold'
                  items={missingDocsStudents.map((s) => {
                    const types = s.documents?.map((d) => d.type) ?? [];
                    const missing: string[] = [];
                    if (!types.includes('consent')) missing.push('Modulo iscrizione');
                    if (!types.includes('medical')) missing.push('Cert. medico');
                    return {
                      id: s.id,
                      label: `${s.firstName} ${s.lastName}`,
                      sub: missing.join(', '),
                      href: `/students/${s.id}`,
                    };
                  })}
                  onNavigate={(href) => navigate(href)}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Activity + Quick Actions ────────────────────────────────────── */}
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          {/* Recent Payments */}
          <Card>
            <div className='flex items-center justify-between mb-4'>
              <CardTitle>Pagamenti Recenti</CardTitle>
              <button
                onClick={() => navigate('/payments')}
                className='text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1'
              >
                Vedi tutti <ChevronRight size={12} />
              </button>
            </div>
            {loading ? (
              <div className='space-y-3'>
                {[...Array(4)].map((_, i) => (
                  <div key={i} className='flex gap-3 items-center'>
                    <Skeleton className='w-8 h-8 rounded-full' />
                    <div className='flex-1 space-y-1'>
                      <Skeleton className='h-3.5 w-32' />
                      <Skeleton className='h-3 w-20' />
                    </div>
                    <Skeleton className='h-5 w-14 rounded-full' />
                  </div>
                ))}
              </div>
            ) : (data?.recentPayments ?? []).length === 0 ? (
              <p className='text-sm text-white/30 text-center py-6'>Nessun pagamento registrato</p>
            ) : (
              <div className='space-y-2'>
                {(data?.recentPayments ?? []).map((p) => (
                  <PaymentRow key={p.id} payment={p} />
                ))}
              </div>
            )}
          </Card>

          {/* Recent Students */}
          <Card>
            <div className='flex items-center justify-between mb-4'>
              <CardTitle>Nuovi Allievi</CardTitle>
              <button
                onClick={() => navigate('/students')}
                className='text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1'
              >
                Vedi tutti <ChevronRight size={12} />
              </button>
            </div>
            {loading ? (
              <div className='space-y-3'>
                {[...Array(3)].map((_, i) => (
                  <div key={i} className='flex gap-3 items-center'>
                    <Skeleton className='w-9 h-9 rounded-full' />
                    <div className='flex-1 space-y-1'>
                      <Skeleton className='h-3.5 w-28' />
                      <Skeleton className='h-3 w-20' />
                    </div>
                  </div>
                ))}
              </div>
            ) : (data?.recentStudents ?? []).length === 0 ? (
              <p className='text-sm text-white/30 text-center py-6'>Nessun allievo iscritto</p>
            ) : (
              <div className='space-y-2'>
                {(data?.recentStudents ?? []).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/students/${s.id}`)}
                    className='w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors text-left'
                  >
                    <div className='w-9 h-9 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-300 text-sm font-bold flex-shrink-0'>
                      {s.firstName.charAt(0)}{s.lastName.charAt(0)}
                    </div>
                    <div className='flex-1 min-w-0'>
                      <p className='text-sm text-white font-medium truncate'>{s.firstName} {s.lastName}</p>
                      <p className='text-xs text-white/40'>
                        Iscritto {format(s.createdAt.toDate(), 'dd MMM yyyy', { locale: it })}
                      </p>
                    </div>
                    <ChevronRight size={14} className='text-white/30' />
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* Quick Actions + Upcoming Events */}
          <div className='space-y-4'>
            <Card>
              <CardTitle className='mb-3'>Azioni Rapide</CardTitle>
              <div className='grid grid-cols-2 gap-2'>
                {[
                  { icon: <Users size={18} />,       label: 'Nuovo Allievo',    href: '/students',   color: 'bg-brand-500/20 text-brand-300' },
                  { icon: <BookOpen size={18} />,    label: 'Nuovo Corso',      href: '/courses',    color: 'bg-teal-500/20 text-teal-300' },
                  { icon: <CreditCard size={18} />,  label: 'Registra Pagam.',  href: '/payments',   color: 'bg-gold-500/20 text-gold-300' },
                  { icon: <MessageSquare size={18} />,label: 'Nuova Comunic.',  href: '/messages',   color: 'bg-coral-500/20 text-coral-300' },
                ].map((a) => (
                  <button
                    key={a.href}
                    onClick={() => navigate(a.href)}
                    className='flex flex-col items-center gap-2 p-3 rounded-xl glass hover:bg-white/8 transition-all duration-200 card-hover text-center'
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${a.color}`}>
                      {a.icon}
                    </div>
                    <span className='text-xs font-medium text-white/80 leading-tight'>{a.label}</span>
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              <div className='flex items-center justify-between mb-3'>
                <CardTitle>Prossimi Eventi</CardTitle>
                <button
                  onClick={() => navigate('/calendar')}
                  className='text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1'
                >
                  Calendario <ChevronRight size={12} />
                </button>
              </div>
              {(data?.upcomingEvents ?? []).length === 0 ? (
                <p className='text-sm text-white/30 text-center py-4'>Nessun evento in programma</p>
              ) : (
                <div className='space-y-2'>
                  {(data?.upcomingEvents ?? []).map((ev) => (
                    <div key={ev.id} className='flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors'>
                      <div className='w-9 h-9 rounded-xl bg-brand-500/15 flex flex-col items-center justify-center flex-shrink-0'>
                        <span className='text-xs font-bold text-brand-300 leading-none'>
                          {format(ev.startDate.toDate(), 'dd')}
                        </span>
                        <span className='text-[9px] text-brand-400 uppercase'>
                          {format(ev.startDate.toDate(), 'MMM', { locale: it })}
                        </span>
                      </div>
                      <div className='flex-1 min-w-0'>
                        <p className='text-sm text-white font-medium truncate'>{ev.name}</p>
                        <p className='text-xs text-white/40 capitalize'>{ev.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

interface KPICardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  color: 'brand' | 'teal' | 'gold' | 'coral';
}

const colorMap = {
  brand: { bg: 'bg-brand-500/15', text: 'text-brand-300', border: 'border-brand-500/20' },
  teal:  { bg: 'bg-teal-500/15',  text: 'text-teal-300',  border: 'border-teal-500/20' },
  gold:  { bg: 'bg-gold-500/15',  text: 'text-gold-300',  border: 'border-gold-400/20' },
  coral: { bg: 'bg-coral-500/15', text: 'text-coral-300', border: 'border-coral-500/20' },
};

function KPICard({ icon, label, value, sub, color }: KPICardProps) {
  const c = colorMap[color];
  return (
    <div className={`glass rounded-2xl p-4 border ${c.border} card-hover`}>
      <div className={`w-8 h-8 rounded-xl ${c.bg} flex items-center justify-center mb-3 ${c.text}`}>
        {icon}
      </div>
      <p className='text-xs text-white/50 mb-1'>{label}</p>
      <p className={`text-xl font-display font-bold ${c.text}`}>{value}</p>
      <p className='text-xs text-white/30 mt-1'>{sub}</p>
    </div>
  );
}

// ─── Payment Row ──────────────────────────────────────────────────────────────

function PaymentRow({ payment }: { payment: { id: string; studentName: string; courseName: string; amount: number; status: string } }) {
  const statusMap: Record<string, { variant: 'success' | 'warning' | 'danger' | 'gray'; label: string }> = {
    paid:      { variant: 'success', label: 'Pagato' },
    pending:   { variant: 'warning', label: 'In attesa' },
    overdue:   { variant: 'danger',  label: 'Scaduto' },
    cancelled: { variant: 'gray',    label: 'Annullato' },
  };
  const s = statusMap[payment.status] ?? statusMap['pending'];

  return (
    <div className='flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors'>
      <div className='w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-300 text-xs font-bold flex-shrink-0'>
        {payment.studentName.charAt(0)}
      </div>
      <div className='flex-1 min-w-0'>
        <p className='text-sm text-white font-medium truncate'>{payment.studentName}</p>
        <p className='text-xs text-white/40 truncate'>{payment.courseName}</p>
      </div>
      <div className='text-right flex-shrink-0'>
        <p className='text-sm font-semibold text-white'>{formatCurrency(payment.amount)}</p>
        <Badge variant={s.variant} size='sm' dot>{s.label}</Badge>
      </div>
    </div>
  );
}

// ─── Alert Card ───────────────────────────────────────────────────────────────

interface AlertItem { id: string; label: string; sub: string; href: string }
interface AlertCardProps {
  icon: React.ReactNode;
  title: string;
  color: 'coral' | 'gold';
  items: AlertItem[];
  onNavigate: (href: string) => void;
}

function AlertCard({ icon, title, color, items, onNavigate }: AlertCardProps) {
  const c = color === 'coral'
    ? 'border-coral-500/30 bg-coral-500/5'
    : 'border-gold-500/30 bg-gold-500/5';
  const iconC = color === 'coral' ? 'text-coral-400' : 'text-gold-400';

  return (
    <div className={`rounded-2xl border p-4 ${c}`}>
      <div className={`flex items-center gap-2 mb-3 ${iconC}`}>
        {icon}
        <span className='text-sm font-semibold text-white'>{title}</span>
      </div>
      <div className='space-y-2'>
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.href)}
            className='w-full flex items-center gap-2 hover:bg-white/5 rounded-lg p-1 transition-colors text-left'
          >
            <div className='flex-1 min-w-0'>
              <p className='text-sm text-white font-medium truncate'>{item.label}</p>
              <p className='text-xs text-white/40 truncate'>{item.sub}</p>
            </div>
            <ChevronRight size={12} className='text-white/30 flex-shrink-0' />
          </button>
        ))}
      </div>
    </div>
  );
}
