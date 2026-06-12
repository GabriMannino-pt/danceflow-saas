import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useStudents } from '@/hooks/useStudents';
import { useSchoolStore } from '@/stores/schoolStore';
import { useAuthStore } from '@/stores/authStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Skeleton, EmptyState, Badge, Button, Input, Select } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { StudentForm } from '@/components/students/StudentForm';
import { COLLECTIONS, courseConverter } from '@/lib/converters';
import type { Student } from '@/types';
import toast from 'react-hot-toast';
import { generateStudentsListPDF } from '@/lib/pdf';
import JSZip from 'jszip';
import { PLAN_LIMITS } from '@/lib/constants';
import {
  Users,
  Search,
  Filter,
  Grid,
  List,
  UserPlus,
  AlertTriangle,
  CheckCircle,
  Clock,
  ChevronRight,
  BellRing,
  Download,
  Trash2
} from 'lucide-react';
import { format } from 'date-fns';

export default function StudentsPage() {
  const navigate = useNavigate();
  const schoolId = useAuthStore((s) => s.user?.schoolId);

  const {
    students,
    loading: _actionsLoading,
    fetchStudents,
    sendDocumentReminder,
    deleteStudent,
  } = useStudents();

  const {
    courses,
    setCourses,
    isLoadingStudents,
    activeSchool
  } = useSchoolStore();

  const activeStudentsCount = useMemo(() => {
    return students.filter((s) => s.isActive && !s.isDeleted).length;
  }, [students]);

  const planLimit = useMemo(() => {
    if (!activeSchool?.subscription?.plan) return Infinity;
    return PLAN_LIMITS[activeSchool.subscription.plan as keyof typeof PLAN_LIMITS] ?? Infinity;
  }, [activeSchool]);

  const isAtLimit = activeStudentsCount >= planLimit;

  const [isZipping, setIsZipping] = useState(false);

  const handleExportPDF = async () => {
    if (!activeSchool) {
      toast.error('Scuola non selezionata.');
      return;
    }
    try {
      const doc = await generateStudentsListPDF(filteredStudents, activeSchool);
      doc.save(`Elenco_Allievi.pdf`);
      toast.success('Elenco scaricato.');
    } catch (err) {
      console.error('[StudentsPage] Export PDF error:', err);
      toast.error('Impossibile generare il PDF.');
    }
  };

  const handleExportZip = async () => {
    const activeStudents = students.filter((s) => s.isActive && !s.isDeleted);

    if (activeStudents.length === 0) {
      toast.error('Nessun allievo attivo trovato.');
      return;
    }

    setIsZipping(true);
    const toastId = toast.loading("Preparazione dell'archivio ZIP in corso...");

    try {
      const zip = new JSZip();
      let successCount = 0;
      let errorCount = 0;
      const errorLogs: string[] = [];

      // Concurrency Control: Loop sequenziale esterno per gli allievi
      for (const student of activeStudents) {
        if (!student.documents || student.documents.length === 0) {
          continue;
        }

        const folderName = `${student.lastName}_${student.firstName}`;
        const typeCounts: Record<string, number> = {};

        // Scaricamento parallelo interno limitato ai soli file del singolo studente
        await Promise.all(
          student.documents.map(async (doc) => {
            if (!doc.fileURL) return;

            try {
              const res = await fetch(doc.fileURL);
              if (!res.ok) throw new Error(`HTTP status ${res.status}`);
              const blob = await res.blob();

              const docType = doc.type;
              typeCounts[docType] = (typeCounts[docType] || 0) + 1;
              const count = typeCounts[docType];

              // Nomenclatura pulita ed esplicita per evitare omonimie
              let cleanName = doc.name;
              if (docType === 'consent') {
                cleanName = count === 1 ? 'Modulo_Iscrizione.pdf' : `Modulo_Iscrizione_${count}.pdf`;
              } else if (docType === 'medical') {
                cleanName = count === 1 ? 'Certificato_Medico.pdf' : `Certificato_Medico_${count}.pdf`;
              } else if (docType === 'identity') {
                cleanName = count === 1 ? 'Documento_Identita.pdf' : `Documento_Identita_${count}.pdf`;
              } else if (docType === 'insurance') {
                cleanName = count === 1 ? 'Assicurazione.pdf' : `Assicurazione_${count}.pdf`;
              } else {
                const lastDot = doc.name.lastIndexOf('.');
                const nameWithoutExt = lastDot !== -1 ? doc.name.substring(0, lastDot) : doc.name;
                const ext = lastDot !== -1 ? doc.name.substring(lastDot) : '.pdf';
                cleanName = count === 1 ? `${nameWithoutExt}${ext}` : `${nameWithoutExt}_${count}${ext}`;
              }

              zip.folder(folderName)?.file(cleanName, blob);
              successCount++;
            } catch (err: any) {
              console.error(`Errore scaricamento ${doc.name} per ${student.lastName} ${student.firstName}:`, err);
              errorCount++;
              errorLogs.push(
                `Allievo: ${student.lastName} ${student.firstName} | Documento: ${doc.name} (Tipo: ${doc.type}) | Errore: ${err.message || err}`
              );
            }
          })
        );
      }

      if (successCount === 0) {
        throw new Error('Impossibile scaricare i documenti. Verifica i permessi CORS dello storage Supabase.');
      }

      // Inserisce log degli errori se presenti
      if (errorLogs.length > 0) {
        const reportContent = `REPORT ERRORI DI SCARICAMENTO - DANCEFLOW\n` +
          `Data: ${new Date().toLocaleString('it-IT')}\n\n` +
          `I seguenti documenti non sono stati inclusi nello ZIP a causa di errori di rete o CORS:\n\n` +
          errorLogs.join('\n');
        zip.file('REPORT_ERRORI_SCARICAMENTO.txt', reportContent);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Documenti_Allievi_Attivi_${format(new Date(), 'yyyyMMdd_HHmmss')}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(
        errorCount > 0
          ? `ZIP creato. ${successCount} file inclusi, ${errorCount} falliti (vedi REPORT_ERRORI_SCARICAMENTO.txt).`
          : `Archivio scaricato con successo! Inclusi ${successCount} documenti.`,
        { id: toastId }
      );
    } catch (err: any) {
      console.error('[Export ZIP error]:', err);
      toast.error(err.message || 'Errore durante la creazione dello ZIP.', { id: toastId });
    } finally {
      setIsZipping(false);
    }
  };

  // ─── Component State ────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [courseFilter, setCourseFilter] = useState('all');
  const [docFilter, setDocFilter] = useState<'all' | 'complete' | 'incomplete'>('all');
  const [medicalFilter, setMedicalFilter] = useState<'all' | 'expired' | 'expiring' | 'missing'>('all');

  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);

  // ─── Fetch data on mount ────────────────────────────────────────────────────
  useEffect(() => {
    if (schoolId) {
      void fetchStudents();
      void loadCourses(schoolId);
    }
  }, [schoolId]);

  async function loadCourses(sid: string) {
    try {
      const q = query(
        collection(db, COLLECTIONS.courses(sid)).withConverter(courseConverter)
      );
      const snap = await getDocs(q);
      const fetched = snap.docs
        .map((d) => d.data())
        .filter((c) => c.isDeleted !== true);
      setCourses(fetched);
    } catch (err) {
      console.error('[StudentsPage] loadCourses error:', err);
    }
  }

  // ─── Helpers: Expiry Status ─────────────────────────────────────────────────
  function getMedicalCertStatus(student: Student): 'valid' | 'expiring' | 'expired' | 'missing' {
    const info = student.medicalInfo;
    if (!info || !info.medicalClearance || !info.medicalClearanceExpiry) {
      return 'missing';
    }
    const expiry = info.medicalClearanceExpiry.toDate();
    const today = new Date();
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (expiry < today) {
      return 'expired';
    } else if (expiry <= thirtyDaysFromNow) {
      return 'expiring';
    }
    return 'valid';
  }

  // ─── Computations & Stats ───────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = students.length;
    const active = students.filter((s) => s.isActive).length;
    const incompleteDocs = students.filter((s) => (s.documents?.length ?? 0) < 3).length;

    let expiringCerts = 0;
    students.forEach((s) => {
      const certStatus = getMedicalCertStatus(s);
      if (certStatus === 'expired' || certStatus === 'expiring') {
        expiringCerts++;
      }
    });

    return { total, active, incompleteDocs, expiringCerts };
  }, [students]);

  // ─── Filtering Logic ────────────────────────────────────────────────────────
  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      // 1. Text Search (firstName, lastName, fiscalCode)
      const nameStr = `${student.firstName} ${student.lastName}`.toLowerCase();
      const codeStr = (student.fiscalCode || '').toLowerCase();
      const matchesSearch =
        nameStr.includes(searchQuery.toLowerCase()) || codeStr.includes(searchQuery.toLowerCase());

      // 2. Active Status Filter
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
            ? student.isActive
            : !student.isActive;

      // 3. Course Enrolled Filter
      const matchesCourse =
        courseFilter === 'all' ? true : student.enrolledCourseIds?.includes(courseFilter);

      // 4. Document Status Filter (3 documents are: registration form, medical cert, ID)
      const totalDocs = student.documents?.length ?? 0;
      const matchesDocs =
        docFilter === 'all'
          ? true
          : docFilter === 'complete'
            ? totalDocs >= 3
            : totalDocs < 3;

      // 5. Medical Certificate Filter
      const certStatus = getMedicalCertStatus(student);
      const matchesMedical =
        medicalFilter === 'all'
          ? true
          : medicalFilter === 'expired'
            ? certStatus === 'expired'
            : medicalFilter === 'expiring'
              ? certStatus === 'expiring'
              : medicalFilter === 'missing'
                ? certStatus === 'missing'
                : true;

      return matchesSearch && matchesStatus && matchesCourse && matchesDocs && matchesMedical;
    });
  }, [students, searchQuery, statusFilter, courseFilter, docFilter, medicalFilter]);

  // ─── Trigger Sollecito ──────────────────────────────────────────────────────
  async function handleSollecito(student: Student, e: React.MouseEvent) {
    e.stopPropagation(); // prevent row click
    setSendingReminderId(student.id);
    try {
      await sendDocumentReminder(student);
    } finally {
      setSendingReminderId(null);
    }
  }

  async function handleDeleteStudent(studentId: string, e: React.MouseEvent) {
    e.stopPropagation(); // prevent card click
    if (confirm('Sei sicuro di voler eliminare questo allievo? L\'azione è irreversibile.')) {
      try {
        await deleteStudent(studentId);
      } catch (err) {
        console.error('[StudentsPage] delete error:', err);
      }
    }
  }

  // ─── Calculate age ──────────────────────────────────────────────────────────
  function getAge(dobTimestamp: any): number {
    if (!dobTimestamp) return 0;
    const dob = dobTimestamp.toDate();
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }

  return (
    <ErrorBoundary>
      <div className='page-enter space-y-6 pb-12'>
        {/* Header */}
        <PageHeader
          title='Allievi'
          subtitle="Gestisci gli allievi della scuola, l'anagrafica e la documentazione obbligatoria."
          actions={
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={handleExportZip}
                icon={<Download size={18} />}
                loading={isZipping}
              >
                Scarica ZIP Documenti
              </Button>
              <Button
                variant="secondary"
                onClick={handleExportPDF}
                icon={<Download size={18} />}
              >
                Esporta PDF
              </Button>
              <Button
                onClick={() => {
                  setEditingStudent(null);
                  setIsFormOpen(true);
                }}
                disabled={isAtLimit}
                icon={<UserPlus size={18} />}
              >
                Nuovo Allievo
              </Button>
            </div>
          }
        />

        {isAtLimit && activeSchool && (
          <div className="glass p-4 rounded-2xl border border-coral-500/30 bg-coral-500/10 text-coral-300 flex items-center justify-between animate-fade-in-up">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <p className="text-sm font-body">
                Limite del piano <strong className="uppercase">{activeSchool.subscription.plan}</strong> raggiunto ({activeStudentsCount}/{planLimit} allievi). Passa al piano superiore.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-coral-500/30 hover:bg-coral-500/20 text-coral-300"
              onClick={() => navigate('/settings')}
            >
              Aggiorna Piano
            </Button>
          </div>
        )}

        {/* Stats Panel */}
        <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
          <Card className='p-4 border-l-4 border-brand-500'>
            <div className='flex items-center gap-3'>
              <div className='w-9 h-9 rounded-xl bg-brand-500/15 text-brand-300 flex items-center justify-center'>
                <Users size={18} />
              </div>
              <div>
                <p className='text-xs text-white/50'>Allievi Attivi</p>
                <p className='text-xl font-display font-bold text-white'>
                  {stats.active} <span className='text-xs text-white/30 font-sans'>/ {stats.total}</span>
                </p>
              </div>
            </div>
          </Card>

          <Card className='p-4 border-l-4 border-coral-500'>
            <div className='flex items-center gap-3'>
              <div className='w-9 h-9 rounded-xl bg-coral-500/15 text-coral-300 flex items-center justify-center'>
                <AlertTriangle size={18} />
              </div>
              <div>
                <p className='text-xs text-white/50'>Documenti Incompleti</p>
                <p className='text-xl font-display font-bold text-coral-400'>{stats.incompleteDocs}</p>
              </div>
            </div>
          </Card>

          <Card className='p-4 border-l-4 border-gold-500'>
            <div className='flex items-center gap-3'>
              <div className='w-9 h-9 rounded-xl bg-gold-500/15 text-gold-300 flex items-center justify-center'>
                <Clock size={18} />
              </div>
              <div>
                <p className='text-xs text-white/50'>Scadenze Mediche 30gg</p>
                <p className='text-xl font-display font-bold text-gold-400'>{stats.expiringCerts}</p>
              </div>
            </div>
          </Card>

          <Card className='p-4 border-l-4 border-teal-500'>
            <div className='flex items-center gap-3'>
              <div className='w-9 h-9 rounded-xl bg-teal-500/15 text-teal-300 flex items-center justify-center'>
                <CheckCircle size={18} />
              </div>
              <div>
                <p className='text-xs text-white/50'>Tasso Regolarità</p>
                <p className='text-xl font-display font-bold text-teal-400'>
                  {stats.total > 0 ? `${Math.round(((stats.total - stats.incompleteDocs) / stats.total) * 100)}%` : '—'}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Filters Panel */}
        <Card className='p-4 space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-5 gap-3'>
            {/* Search */}
            <div className='md:col-span-2'>
              <Input
                placeholder='Cerca per nome, cognome o codice fiscale...'
                icon={<Search size={16} />}
                fullWidth
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {/* Course Filter */}
            <Select
              label=''
              options={[
                { value: 'all', label: 'Tutti i Corsi' },
                ...courses.map((c) => ({ value: c.id, label: c.name })),
              ]}
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
            />
            {/* Doc Completeness Filter */}
            <Select
              label=''
              options={[
                { value: 'all', label: 'Tutti i Documenti' },
                { value: 'complete', label: 'Documentazione Completa' },
                { value: 'incomplete', label: 'Documentazione Mancante' },
              ]}
              value={docFilter}
              onChange={(e) => setDocFilter(e.target.value as any)}
            />
            {/* Medical Expiry Filter */}
            <Select
              label=''
              options={[
                { value: 'all', label: 'Qualsiasi Stato Medico' },
                { value: 'expired', label: 'Certificato Scaduto' },
                { value: 'expiring', label: 'Certificato In Scadenza (30gg)' },
                { value: 'missing', label: 'Certificato Mancante' },
              ]}
              value={medicalFilter}
              onChange={(e) => setMedicalFilter(e.target.value as any)}
            />
          </div>

          <div className='flex items-center justify-between border-t border-white/5 pt-3'>
            <div className='flex items-center gap-4 text-xs text-white/50'>
              <div className='flex items-center gap-2'>
                <Filter size={14} />
                <span>Trovati: <strong className='text-white'>{filteredStudents.length}</strong> allievi</span>
              </div>
              <div className='flex gap-2 items-center'>
                <Select
                  className='py-1 text-xs'
                  options={[
                    { value: 'active', label: 'Stato: Solo Attivi' },
                    { value: 'inactive', label: 'Stato: Solo Inattivi' },
                    { value: 'all', label: 'Stato: Tutti' },
                  ]}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                />
              </div>
            </div>

            {/* View Mode buttons */}
            <div className='flex items-center gap-1 bg-black/20 p-0.5 rounded-lg border border-white/5'>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-brand-500/20 text-brand-300' : 'text-white/40 hover:text-white/70'
                  }`}
                aria-label='Vista Tabella'
              >
                <List size={16} />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-brand-500/20 text-brand-300' : 'text-white/40 hover:text-white/70'
                  }`}
                aria-label='Vista Griglia'
              >
                <Grid size={16} />
              </button>
            </div>
          </div>
        </Card>

        {/* Content Lists */}
        {isLoadingStudents ? (
          <div className='space-y-4'>
            {[...Array(5)].map((_, i) => (
              <div key={i} className='glass rounded-2xl p-5 space-y-3'>
                <div className='flex items-center gap-4'>
                  <Skeleton className='w-10 h-10 rounded-full' />
                  <div className='space-y-2 flex-1'>
                    <Skeleton className='h-4 w-1/4' />
                    <Skeleton className='h-3 w-1/6' />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredStudents.length === 0 ? (
          <EmptyState
            icon='👥'
            title='Nessun allievo trovato'
            description='Prova a modificare i filtri o la query di ricerca, o inserisci un nuovo allievo.'
          />
        ) : viewMode === 'table' ? (
          // ─── Table View ───
          <Card className='overflow-x-auto p-0 border border-white/5 rounded-3xl'>
            <table className='w-full text-left border-collapse min-w-[700px]'>
              <thead>
                <tr className='border-b border-white/8 bg-white/[0.02] text-xs font-semibold text-white/50 tracking-wider'>
                  <th className='py-4 px-5'>Nominativo</th>
                  <th className='py-4 px-5'>Età</th>
                  <th className='py-4 px-5'>Stato Anagrafico</th>
                  <th className='py-4 px-5'>Corsi Iscritti</th>
                  <th className='py-4 px-5'>Documentazione (3)</th>
                  <th className='py-4 px-5 text-right'>Azioni</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-white/5 text-sm text-white/80'>
                {filteredStudents.map((st) => {
                  const docCount = st.documents?.length ?? 0;
                  const certStatus = getMedicalCertStatus(st);
                  const isMin = getAge(st.dateOfBirth) < 18;

                  return (
                    <tr
                      key={st.id}
                      onClick={() => navigate(`/students/${st.id}`)}
                      className='hover:bg-white/[0.03] transition-colors cursor-pointer group'
                    >
                      {/* Name / Pic */}
                      <td className='py-3.5 px-5 flex items-center gap-3'>
                        <div className='w-9 h-9 rounded-full bg-brand-500/20 text-brand-300 text-xs font-bold flex items-center justify-center flex-shrink-0 border border-brand-500/20 group-hover:scale-105 transition-transform'>
                          {st.firstName[0]}{st.lastName[0]}
                        </div>
                        <div>
                          <p className='font-semibold text-white group-hover:text-brand-300 transition-colors'>
                            {st.lastName} {st.firstName}
                          </p>
                          <p className='text-xs text-white/40'>{st.fiscalCode || '—'}</p>
                        </div>
                      </td>

                      {/* Age */}
                      <td className='py-3.5 px-5'>
                        <span className='font-medium'>{getAge(st.dateOfBirth)} anni</span>
                        {isMin && (
                          <span className='ml-2 text-[10px] bg-brand-500/20 text-brand-300 font-bold px-1.5 py-0.5 rounded'>
                            MINORE
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className='py-3.5 px-5'>
                        <Badge variant={st.isActive ? 'success' : 'gray'} size='sm'>
                          {st.isActive ? 'Attivo' : 'Inattivo'}
                        </Badge>
                      </td>

                      {/* Courses */}
                      <td className='py-3.5 px-5'>
                        <span className='font-semibold text-white/90'>
                          {st.enrolledCourseIds?.length ?? 0}
                        </span>
                        <span className='text-xs text-white/30 ml-1'>corsi</span>
                      </td>

                      {/* Documents Status */}
                      <td className='py-3.5 px-5'>
                        <div className='flex items-center gap-3'>
                          <Badge
                            variant={docCount >= 3 ? 'success' : docCount > 0 ? 'warning' : 'danger'}
                            size='sm'
                          >
                            {docCount}/3
                          </Badge>

                          {/* Quick Document Status Icons */}
                          <div className='flex gap-1.5 items-center text-xs' onClick={(e) => e.stopPropagation()}>
                            <DocIconIndicator
                              present={st.documents?.some((d) => d.type === 'consent')}
                              label='Modulo Iscrizione'
                            />
                            <DocIconIndicator
                              present={st.documents?.some((d) => d.type === 'medical')}
                              label='Certificato Medico'
                              warning={certStatus === 'expiring'}
                              danger={certStatus === 'expired'}
                              tooltip={
                                certStatus === 'expired'
                                  ? 'Scaduto!'
                                  : certStatus === 'expiring'
                                    ? `Scade il ${format(st.medicalInfo!.medicalClearanceExpiry!.toDate(), 'dd/MM/yyyy')}`
                                    : undefined
                              }
                            />
                            <DocIconIndicator
                              present={st.documents?.some((d) => d.type === 'identity')}
                              label="Documento d'Identità"
                            />
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className='py-3.5 px-5 text-right' onClick={(e) => e.stopPropagation()}>
                        <div className='flex justify-end items-center gap-2'>
                          {docCount < 3 && st.isActive && (
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={(e) => handleSollecito(st, e)}
                              loading={sendingReminderId === st.id}
                              icon={<BellRing size={13} />}
                              className='border-coral-500/20 text-coral-300 hover:bg-coral-500/10'
                            >
                              Sollecita
                            </Button>
                          )}
                          <Button
                            variant='secondary'
                            size='sm'
                            onClick={() => navigate(`/students/${st.id}`)}
                            icon={<ChevronRight size={14} />}
                          />
                          <Button
                            variant='danger'
                            size='sm'
                            onClick={(e) => handleDeleteStudent(st.id, e)}
                            icon={<Trash2 size={14} />}
                            title="Elimina allievo"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        ) : (
          // ─── Grid View ───
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            {filteredStudents.map((st) => {
              const docCount = st.documents?.length ?? 0;
              const certStatus = getMedicalCertStatus(st);

              return (
                <Card
                  key={st.id}
                  onClick={() => navigate(`/students/${st.id}`)}
                  className='p-5 hover:bg-white/[0.03] transition-colors cursor-pointer group flex flex-col justify-between h-56 border border-white/5'
                >
                  <div className='space-y-3'>
                    <div className='flex items-start justify-between'>
                      <div className='flex gap-3 items-center'>
                        <div className='w-10 h-10 rounded-full bg-brand-500/20 text-brand-300 text-sm font-bold flex items-center justify-center flex-shrink-0 border border-brand-500/20'>
                          {st.firstName[0]}{st.lastName[0]}
                        </div>
                        <div>
                          <h4 className='font-semibold text-white group-hover:text-brand-300 transition-colors truncate max-w-[150px]'>
                            {st.lastName} {st.firstName}
                          </h4>
                          <p className='text-xs text-white/40'>{getAge(st.dateOfBirth)} anni</p>
                        </div>
                      </div>
                      <Badge variant={st.isActive ? 'success' : 'gray'} size='sm'>
                        {st.isActive ? 'Attivo' : 'Inattivo'}
                      </Badge>
                    </div>

                    <div className='space-y-1.5 text-xs text-white/60'>
                      <div className='flex justify-between'>
                        <span>Corsi Iscritti:</span>
                        <span className='font-semibold text-white'>{st.enrolledCourseIds?.length ?? 0} corsi</span>
                      </div>
                      <div className='flex justify-between'>
                        <span>Codice Fiscale:</span>
                        <span className='text-white/80'>{st.fiscalCode || '—'}</span>
                      </div>
                      <div className='flex justify-between items-center'>
                        <span>Documenti (3):</span>
                        <span className='font-semibold text-white'>{docCount}/3</span>
                      </div>
                    </div>
                  </div>

                  <div className='flex justify-between items-center border-t border-white/5 pt-3 mt-3' onClick={(e) => e.stopPropagation()}>
                    {/* Icons bar */}
                    <div className='flex gap-1.5 items-center text-xs'>
                      <DocIconIndicator
                        present={st.documents?.some((d) => d.type === 'consent')}
                        label='Modulo Iscrizione'
                      />
                      <DocIconIndicator
                        present={st.documents?.some((d) => d.type === 'medical')}
                        label='Certificato Medico'
                        warning={certStatus === 'expiring'}
                        danger={certStatus === 'expired'}
                      />
                      <DocIconIndicator
                        present={st.documents?.some((d) => d.type === 'identity')}
                        label="Documento d'Identità"
                      />
                    </div>

                    <div className='flex gap-1.5'>
                      {docCount < 3 && st.isActive && (
                        <button
                          onClick={(e) => handleSollecito(st, e)}
                          disabled={sendingReminderId === st.id}
                          className='p-1.5 rounded-xl border border-coral-500/20 text-coral-300 hover:bg-coral-500/10 transition-colors flex items-center justify-center'
                          title='Invia Sollecitazione Documenti'
                        >
                          <BellRing size={14} />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDeleteStudent(st.id, e)}
                        className='p-1.5 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 active:scale-95 transition-all flex items-center justify-center border border-rose-500/20'
                        title="Elimina allievo"
                      >
                        <Trash2 size={14} />
                      </button>
                      <button
                        onClick={() => navigate(`/students/${st.id}`)}
                        className='p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors flex items-center justify-center'
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Modal Creation/Edit Form */}
        <StudentForm
          isOpen={isFormOpen}
          onClose={() => {
            setIsFormOpen(false);
            setEditingStudent(null);
          }}
          student={editingStudent}
          onSuccess={fetchStudents}
        />
      </div>
    </ErrorBoundary>
  );
}

// ─── Inner helper component ──────────────────────────────────────────────────
interface DocIconProps {
  present: boolean;
  label: string;
  warning?: boolean;
  danger?: boolean;
  tooltip?: string;
}

function DocIconIndicator({ present, label, warning, danger, tooltip }: DocIconProps) {
  let indicatorColor = 'bg-coral-500/10 text-coral-500 border border-coral-500/20';
  let char = '✗';

  if (present) {
    indicatorColor = 'bg-teal-500/15 text-teal-400 border border-teal-500/20';
    char = '✓';
    if (danger) {
      indicatorColor = 'bg-coral-500/20 text-coral-400 border border-coral-400/30 animate-pulse';
      char = '⚠️';
    } else if (warning) {
      indicatorColor = 'bg-gold-500/20 text-gold-400 border border-gold-400/30 animate-pulse';
      char = '⚠️';
    }
  }

  return (
    <div
      className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${indicatorColor}`}
      title={`${label}: ${present ? (danger ? 'Scaduto!' : warning ? 'In Scadenza!' : 'Caricato') : 'Mancante'}${tooltip ? ` (${tooltip})` : ''
        }`}
    >
      {char}
    </div>
  );
}
