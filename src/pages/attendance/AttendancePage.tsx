import React, { useState, useMemo } from 'react';
import { useSchoolStore } from '@/stores/schoolStore';
import { useAttendance } from '@/hooks/useAttendance';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardTitle, Select, Input, Badge, Button, Skeleton, EmptyState, Modal } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  UserCheck, Clock, CheckCircle,
  Calendar as CalendarIcon, UserX, Check, Trash2
} from 'lucide-react';
import type { AttendanceStatus } from '@/types';

export default function AttendancePage() {
  const students = useSchoolStore((s) => s.students);
  const courses = useSchoolStore((s) => s.courses);

  const activeCourses = useMemo(() =>
    courses.filter((c) => c.isActive && !c.isDeleted),
  [courses]);

  const activeStudents = useMemo(() =>
    students.filter((st) => st.isActive && !st.isDeleted),
  [students]);

  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [lateMinutes, setLateMinutes] = useState<number>(10);
  const [justification, setJustification] = useState<string>('');
  const [showQRModal, setShowQRModal] = useState(false);

  // Sottoscrizione alle presenze tramite il nostro hook
  const {
    loading,
    records,
    updateStudentAttendance,
    deleteStudentAttendance,
    markAllAs
  } = useAttendance(selectedCourseId || undefined, selectedDate);

  // Allineamento allievi iscritti al corso selezionato
  const enrolledStudents = useMemo(() => {
    if (!selectedCourseId) return [];
    return activeStudents.filter((s) => s.enrolledCourseIds?.includes(selectedCourseId));
  }, [selectedCourseId, activeStudents]);

  // Statistiche presenze odierne della classe
  const stats = useMemo(() => {
    const total = enrolledStudents.length;
    if (total === 0) return { present: 0, absent: 0, late: 0, justified: 0, rate: 0 };

    let present = 0;
    let absent = 0;
    let late = 0;
    let justified = 0;

    records.forEach((r) => {
      if (r.status === 'present') present++;
      else if (r.status === 'absent') absent++;
      else if (r.status === 'late') {
        late++;
        present++; // i ritardatari contano come presenti ai fini della partecipazione
      }
      else if (r.status === 'justified') justified++;
    });

    // Se non ci sono record inseriti, la partecipazione è 0%
    const rate = records.length > 0 ? Math.round((present / total) * 100) : 0;

    return { present, absent, late, justified, rate };
  }, [enrolledStudents, records]);

  // Gestione click dello stato di presenza
  const handleStatusChange = async (studentId: string, status: AttendanceStatus) => {
    if (status === 'late') {
      setEditingStudentId(studentId);
      setLateMinutes(10);
      return;
    }
    if (status === 'justified') {
      setEditingStudentId(studentId);
      setJustification('');
      return;
    }
    await updateStudentAttendance(studentId, status);
  };

  const submitLate = async (studentId: string) => {
    await updateStudentAttendance(studentId, 'late', lateMinutes);
    setEditingStudentId(null);
  };

  const submitJustified = async (studentId: string) => {
    await updateStudentAttendance(studentId, 'justified', undefined, justification);
    setEditingStudentId(null);
  };

  return (
    <ErrorBoundary>
      <div className='page-enter space-y-6'>
        <PageHeader
          title='Registro Presenze'
          subtitle='Gestione rapida e touch-first delle presenze in aula'
          actions={
            <div className='flex items-center gap-2'>
              {selectedCourseId && (
                <Button size='sm' onClick={() => setShowQRModal(true)} variant='outline' className='flex items-center gap-1.5 cursor-pointer'>
                  📱 Genera QR Lezione
                </Button>
              )}
              <div className='flex items-center gap-2 glass px-3 py-1.5 rounded-xl text-xs text-white/70'>
                <CalendarIcon size={14} />
                <span>{format(new Date(selectedDate), 'dd MMMM yyyy', { locale: it })}</span>
              </div>
            </div>
          }
        />

        {/* ── Filtri di Selezione ────────────────────────────────────────── */}
        <Card>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <Select
              label='Seleziona Corso'
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              options={[
                { value: '', label: 'Scegli un corso...' },
                ...activeCourses.map((c) => ({ value: c.id, label: `${c.name} (${c.style})` }))
              ]}
            />
            <Input
              type='date'
              label='Data Lezione'
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={format(new Date(), 'yyyy-MM-dd')}
            />
          </div>
        </Card>

        {selectedCourseId ? (
          <>
            {/* ── Pannello Statistiche e Azioni in Blocco ────────────────────── */}
            {enrolledStudents.length > 0 && (
              <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
                {/* Stats Box */}
                <div className='lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4'>
                  <StatsBox
                    icon={<CheckCircle className='text-emerald-400' size={20} />}
                    label='Presenti'
                    value={stats.present}
                    sub={`Incl. ${stats.late} in ritardo`}
                  />
                  <StatsBox
                    icon={<UserX className='text-rose-400' size={20} />}
                    label='Assenti'
                    value={stats.absent}
                    sub='Non giustificati'
                  />
                  <StatsBox
                    icon={<Clock className='text-amber-400' size={20} />}
                    label='Giustificati'
                    value={stats.justified}
                    sub='Con motivazione'
                  />
                  <StatsBox
                    icon={<UserCheck className='text-brand-300' size={20} />}
                    label='Tasso Presenza'
                    value={`${stats.rate}%`}
                    sub='Presenti / Iscritti'
                  />
                </div>

                {/* Batch Actions Box */}
                <Card className='flex flex-col justify-center gap-3'>
                  <CardTitle className='text-sm mb-2'>Azioni di Gruppo</CardTitle>
                  <div className='grid grid-cols-2 gap-2'>
                    <Button
                      variant='success'
                      size='sm'
                      onClick={() => markAllAs('present')}
                      className='w-full'
                    >
                      Tutti Presenti
                    </Button>
                    <Button
                      variant='danger'
                      size='sm'
                      onClick={() => markAllAs('absent')}
                      className='w-full'
                    >
                      Tutti Assenti
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* ── Lista Touch-First Allievi ─────────────────────────────────── */}
            <Card>
              <div className='flex items-center justify-between mb-4'>
                <CardTitle>Registro Allievi ({enrolledStudents.length})</CardTitle>
                <div className='flex gap-2 text-xs text-white/40'>
                  <span>P = Presente</span>
                  <span>·</span>
                  <span>A = Assente</span>
                  <span>·</span>
                  <span>R = Ritardo</span>
                  <span>·</span>
                  <span>G = Giustif.</span>
                </div>
              </div>

              {loading ? (
                <div className='space-y-4'>
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className='flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center p-3 rounded-2xl glass'>
                      <Skeleton className='h-5 w-40' />
                      <Skeleton className='h-10 w-64 rounded-xl' />
                    </div>
                  ))}
                </div>
              ) : enrolledStudents.length === 0 ? (
                <EmptyState
                  icon='👥'
                  title='Nessun allievo iscritto'
                  description='Nessun allievo attivo è attualmente iscritto a questo corso.'
                />
              ) : (
                <div className='divide-y divide-white/5 space-y-2'>
                  {enrolledStudents.map((student) => {
                    const record = records.find((r) => r.studentId === student.id);
                    const currentStatus = record?.status;

                    return (
                      <div
                        key={student.id}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 rounded-2xl transition-all ${
                          currentStatus === 'present' ? 'bg-emerald-500/5' :
                          currentStatus === 'absent' ? 'bg-rose-500/5' :
                          currentStatus === 'late' ? 'bg-amber-500/5' :
                          currentStatus === 'justified' ? 'bg-blue-500/5' : 'hover:bg-white/5'
                        }`}
                      >
                        {/* Info Allievo */}
                        <div className='flex items-center gap-3'>
                          <div className='w-10 h-10 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-300 font-bold'>
                            {student.firstName.charAt(0)}{student.lastName.charAt(0)}
                          </div>
                          <div>
                            <p className='text-sm font-semibold text-white'>
                              {student.firstName} {student.lastName}
                            </p>
                            <div className='flex items-center gap-1.5 mt-0.5'>
                              {currentStatus ? (
                                <Badge
                                  variant={
                                    currentStatus === 'present' ? 'success' :
                                    currentStatus === 'absent' ? 'danger' :
                                    currentStatus === 'late' ? 'warning' : 'brand'
                                  }
                                  size='sm'
                                >
                                  {currentStatus === 'present' && 'Presente'}
                                  {currentStatus === 'absent' && 'Assente'}
                                  {currentStatus === 'late' && `Ritardo (${record.arrivalMinutes || 0} min)`}
                                  {currentStatus === 'justified' && 'Giustificato'}
                                </Badge>
                              ) : (
                                <Badge variant='gray' size='sm'>Da registrare</Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Pulsantiera Touch-First */}
                        <div className='flex flex-col gap-2'>
                          {editingStudentId === student.id ? (
                            <div className='flex items-center gap-2 glass p-2 rounded-xl page-enter'>
                              {currentStatus === 'late' || (editingStudentId && !record?.status && editingStudentId === student.id) ? (
                                <>
                                  <Input
                                    type='number'
                                    placeholder='Minuti'
                                    value={lateMinutes.toString()}
                                    onChange={(e) => setLateMinutes(Number(e.target.value))}
                                    className='w-20'
                                  />
                                  <Button size='sm' onClick={() => submitLate(student.id)}>
                                    <Check size={14} />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Input
                                    type='text'
                                    placeholder='Motivazione...'
                                    value={justification}
                                    onChange={(e) => setJustification(e.target.value)}
                                    className='w-40'
                                  />
                                  <Button size='sm' onClick={() => submitJustified(student.id)}>
                                    <Check size={14} />
                                  </Button>
                                </>
                              )}
                              <Button
                                variant='secondary'
                                size='sm'
                                onClick={() => setEditingStudentId(null)}
                              >
                                Annulla
                              </Button>
                            </div>
                          ) : (
                            <div className='flex items-center gap-1 sm:gap-2'>
                              <TouchButton
                                active={currentStatus === 'present'}
                                onClick={() => handleStatusChange(student.id, 'present')}
                                colorClass='bg-emerald-500 text-white'
                                label='P'
                              />
                              <TouchButton
                                active={currentStatus === 'absent'}
                                onClick={() => handleStatusChange(student.id, 'absent')}
                                colorClass='bg-rose-500 text-white'
                                label='A'
                              />
                              <TouchButton
                                active={currentStatus === 'late'}
                                onClick={() => {
                                  setEditingStudentId(student.id);
                                  setLateMinutes(10);
                                }}
                                colorClass='bg-amber-500 text-white'
                                label='R'
                              />
                              <TouchButton
                                active={currentStatus === 'justified'}
                                onClick={() => {
                                  setEditingStudentId(student.id);
                                  setJustification('');
                                }}
                                colorClass='bg-blue-500 text-white'
                                label='G'
                              />
                              {currentStatus && (
                                <button
                                  onClick={() => {
                                    if (confirm('Sei sicuro di voler eliminare questa presenza?')) {
                                      void deleteStudentAttendance(student.id);
                                    }
                                  }}
                                  className='w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 active:scale-90 transition-all border border-rose-500/20'
                                  aria-label='Elimina presenza'
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </>
        ) : (
          <EmptyState
            icon='📅'
            title='Seleziona un corso'
            description='Scegli un corso dal menu a tendina sopra per visualizzare il registro delle presenze.'
          />
        )}
      </div>

      {/* QR Code Lezione Modal */}
      <Modal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        title='📱 QR Code Auto Check-in Presenze'
      >
        <div className='flex flex-col items-center justify-center text-center p-4 space-y-4 font-body'>
          <p className='text-xs text-white/60 leading-relaxed px-4'>
            Mostra questo QR Code in aula. Gli allievi o i genitori, inquadrandolo dal proprio smartphone all'interno del Portale Famiglie, registreranno all'istante l'ingresso e la presenza in aula.
          </p>

          <div className='p-4 bg-white rounded-3xl shadow-xl border border-white/10'>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
                JSON.stringify({ courseId: selectedCourseId, date: selectedDate, token: 'DF-CHECKIN-TOKEN' })
              )}`}
              alt='QR Code Presenze Lezione'
              className='w-56 h-56 select-none'
            />
          </div>

          <div className='flex items-center gap-2 text-xs text-teal-400 font-bold uppercase tracking-wider animate-pulse'>
            <span className='w-2 h-2 rounded-full bg-teal-400' />
            <span>QR Code Attivo e Sicuro</span>
          </div>

          <div className='w-full pt-4 border-t border-white/5'>
            <Button onClick={() => setShowQRModal(false)} className='w-full'>
              Chiudi
            </Button>
          </div>
        </div>
      </Modal>
    </ErrorBoundary>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatsBox({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub: string }) {
  return (
    <div className='glass rounded-2xl p-4 border border-white/5 flex flex-col justify-between card-hover'>
      <div className='flex items-center gap-2 text-white/50 mb-1.5'>
        {icon}
        <span className='text-xs font-medium'>{label}</span>
      </div>
      <p className='text-xl font-bold text-white font-display'>{value}</p>
      <p className='text-[10px] text-white/30 mt-1 truncate'>{sub}</p>
    </div>
  );
}

interface TouchButtonProps {
  active: boolean;
  onClick: () => void;
  colorClass: string;
  label: string;
}

function TouchButton({ active, onClick, colorClass, label }: TouchButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl font-bold text-sm flex items-center justify-center transition-all active:scale-90 ${
        active
          ? `${colorClass} shadow-lg shadow-black/30 scale-105`
          : 'bg-white/5 text-white/40 hover:bg-white/10'
      }`}
    >
      {label}
    </button>
  );
}
