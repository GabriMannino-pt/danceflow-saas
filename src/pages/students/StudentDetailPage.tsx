import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  collection, doc, getDocs, query, where, getDoc,
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { useStudents } from '@/hooks/useStudents';
import { useSchoolStore } from '@/stores/schoolStore';
import { useAuthStore } from '@/stores/authStore';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  Card, Badge, Button, Input, Textarea, Skeleton, EmptyState, Modal, ModalFooter, Select,
} from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { StudentForm } from '@/components/students/StudentForm';
import { MedicalStatusBadge } from '@/components/students/MedicalStatusBadge';
import { generateReceiptPDF, generateStudentHistoryPDF } from '@/lib/pdf';
import {
  COLLECTIONS, studentConverter, paymentConverter,
  attendanceConverter, courseConverter, nowTimestamp,
} from '@/lib/converters';
import { STORAGE_ENABLED } from '@/lib/constants';
import type { Student, Course, Payment, AttendanceRecord, StudentDocument, PaymentMethod } from '@/types';
import { format, differenceInYears, isPast, isWithinInterval, addDays } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  Edit, BellRing, User, BookOpen, CreditCard,
  CheckSquare, FileText, Phone, Mail, MapPin, AlertTriangle,
  CheckCircle, XCircle, Upload, Download,
  Shield, Heart, Clipboard, Clock, Trash2, Plus,
} from 'lucide-react';
import { usePayments } from '@/hooks/usePayments';

// ─── Tab type ──────────────────────────────────────────────────────────────────
type Tab = 'anagrafica' | 'corsi' | 'pagamenti' | 'presenze' | 'documenti' | 'costumi';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'anagrafica', label: 'Anagrafica', icon: <User size={15} /> },
  { id: 'corsi', label: 'Corsi', icon: <BookOpen size={15} /> },
  { id: 'pagamenti', label: 'Pagamenti', icon: <CreditCard size={15} /> },
  { id: 'presenze', label: 'Presenze', icon: <CheckSquare size={15} /> },
  { id: 'documenti', label: 'Documenti', icon: <FileText size={15} /> },
  { id: 'costumi', label: 'Costumi & Misure', icon: <Clipboard size={15} /> },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
function calcAge(ts: any): number {
  if (!ts) return 0;
  return differenceInYears(new Date(), ts.toDate());
}

function getMedicalStatus(student: Student): 'valid' | 'expiring' | 'expired' | 'missing' {
  const info = student.medicalInfo;
  if (!info?.medicalClearance || !info.medicalClearanceExpiry) return 'missing';
  const expiry = info.medicalClearanceExpiry.toDate();
  if (isPast(expiry)) return 'expired';
  if (isWithinInterval(expiry, { start: new Date(), end: addDays(new Date(), 30) })) return 'expiring';
  return 'valid';
}

function getDocCount(student: Student): number {
  return student.documents?.length ?? 0;
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function StudentDetailPage() {
  const { id: studentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const schoolId = useAuthStore((s) => s.user?.schoolId);
  const { editStudent, sendDocumentReminder, uploadStudentDocument } = useStudents();
  const { students, updateStudent: _u } = useSchoolStore();

  const [activeTab, setActiveTab] = useState<Tab>('anagrafica');
  const [student, setStudent] = useState<Student | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [enrolledCourses, setEnrolledCourses] = useState<Course[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);

  const [loading, setLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isCostumeOpen, setIsCostumeOpen] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);

  // ─── Load student ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!schoolId || !studentId) return;
    void loadAll(schoolId, studentId);
  }, [schoolId, studentId]);

  async function loadAll(sid: string, stId: string) {
    setLoading(true);
    try {
      // Student (from store or Firestore)
      const stored = students.find((s) => s.id === stId);
      let st: Student;
      if (stored) {
        st = stored;
      } else {
        const ref = doc(db, COLLECTIONS.students(sid), stId).withConverter(studentConverter);
        const snap = await getDoc(ref);
        if (!snap.exists()) { navigate('/students'); return; }
        st = snap.data();
      }
      setStudent(st);

      // Courses
      const cSnap = await getDocs(
        query(collection(db, COLLECTIONS.courses(sid)).withConverter(courseConverter))
      );
      const allC = cSnap.docs
        .map((d) => d.data())
        .filter((c) => c.isDeleted !== true);
      setAllCourses(allC);
      setEnrolledCourses(allC.filter((c) => st.enrolledCourseIds?.includes(c.id)));

      // Payments
      const pSnap = await getDocs(
        query(collection(db, COLLECTIONS.payments(sid)).withConverter(paymentConverter),
          where('studentId', '==', stId))
      );
      const fetchedPayments = pSnap.docs.map((d) => d.data());
      fetchedPayments.sort((a, b) => b.dueDate.toMillis() - a.dueDate.toMillis());
      setPayments(fetchedPayments);

      // Attendance
      const aSnap = await getDocs(
        query(collection(db, COLLECTIONS.attendance(sid)).withConverter(attendanceConverter),
          where('studentId', '==', stId))
      );
      const fetchedAttendance = aSnap.docs.map((d) => d.data());
      fetchedAttendance.sort((a, b) => b.date.toMillis() - a.date.toMillis());
      setAttendance(fetchedAttendance);

    } catch (err) {
      console.error('[StudentDetail] load error:', err);
    } finally {
      setLoading(false);
    }
  }

  // ─── Enroll / Unenroll course ────────────────────────────────────────────────
  async function handleEnrollToggle(courseId: string) {
    if (!student || !schoolId) return;
    const current = student.enrolledCourseIds ?? [];
    const updated = current.includes(courseId)
      ? current.filter((id) => id !== courseId)
      : [...current, courseId];
    await editStudent(student.id, { enrolledCourseIds: updated });
    const next = { ...student, enrolledCourseIds: updated };
    setStudent(next);
    setEnrolledCourses(allCourses.filter((c) => updated.includes(c.id)));
  }

  // ─── Sollecito ───────────────────────────────────────────────────────────────
  async function handleSollecito() {
    if (!student) return;
    setSendingReminder(true);
    try { await sendDocumentReminder(student); }
    finally { setSendingReminder(false); }
  }

  // ─── Update Custom Fees ───────────────────────────────────────────────────────
  async function handleUpdateCustomFees(fees: { customMonthlyFee: number | null; customRegistrationFee: number | null; customShowFee: number | null }) {
    if (!student || !schoolId || !studentId) return;
    await editStudent(student.id, fees);
    void loadAll(schoolId, studentId);
  }

  // ─── Computed stats ──────────────────────────────────────────────────────────
  const attendanceStats = useMemo(() => {
    const total = attendance.length;
    const present = attendance.filter((a) => a.status === 'present' || a.status === 'late').length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, rate };
  }, [attendance]);

  const resolvedPayments = useMemo(() => {
    return payments.map(p => {
      const course = allCourses.find(c => c.id === p.courseId);
      
      const isMonthly = p.type === 'monthly';
      const hasCustomFee = student && student.customMonthlyFee !== undefined && student.customMonthlyFee !== null;
      
      const total = (isMonthly && hasCustomFee)
        ? student.customMonthlyFee!
        : (p.type === 'registration' && student && student.customRegistrationFee !== undefined && student.customRegistrationFee !== null)
          ? student.customRegistrationFee
          : (p.type === 'event' && student && student.customShowFee !== undefined && student.customShowFee !== null)
            ? student.customShowFee
            : (isMonthly && course?.fee?.monthly)
              ? course.fee.monthly
              : (p.totalAmount ?? p.amount);
      
      const paid = p.paidAmount ?? (p.status === 'paid' ? p.amount : 0);
      const remaining = Math.max(0, total - paid);
      
      let status = p.status;
      if (status !== 'cancelled' && status !== 'paid') {
        if (paid >= total) {
          status = 'paid';
        } else if (paid > 0) {
          status = 'deposit_paid';
        } else {
          const isOverdue = p.dueDate.toDate() < new Date();
          status = isOverdue ? 'overdue' : 'pending';
        }
      }
      
      return {
        ...p,
        totalAmount: total,
        amount: total,
        paidAmount: paid,
        remainingAmount: remaining,
        status,
      };
    });
  }, [payments, student, allCourses]);

  const paymentStats = useMemo(() => {
    const paid = resolvedPayments.reduce((s, p) => s + p.paidAmount, 0);
    const overdue = resolvedPayments.filter((p) => p.status === 'overdue').reduce((s, p) => s + p.remainingAmount, 0);
    const pending = resolvedPayments.filter((p) => p.status === 'pending' || p.status === 'deposit_paid').length;
    return { paid, overdue, pending };
  }, [resolvedPayments]);

  // ─── Loading skeleton ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 p-4">
        <Skeleton className="h-24 w-full rounded-3xl" />
        <Skeleton className="h-12 w-2/3 rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    );
  }

  if (!student) return null;

  const age = calcAge(student.dateOfBirth);
  const isMinor = age < 18;
  const medStatus = getMedicalStatus(student);
  const docCount = getDocCount(student);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <ErrorBoundary>
      <div className="page-enter space-y-6 pb-16">

        {/* Back + Header */}
        <PageHeader
          title={`${student.lastName} ${student.firstName}`}
          subtitle={`${age} anni · ${enrolledCourses.map((c) => c.name).join(', ') || 'Nessun corso'}`}
          actions={
            <div className="flex gap-2">
              {docCount < 3 && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={<BellRing size={14} />}
                  onClick={handleSollecito}
                  loading={sendingReminder}
                  className="border-coral-500/30 text-coral-300 hover:bg-coral-500/10"
                >
                  Sollecita
                </Button>
              )}
              <Button
                size="sm"
                icon={<Edit size={14} />}
                onClick={() => setIsEditOpen(true)}
              >
                Modifica
              </Button>
            </div>
          }
        />

        {/* Hero Card */}
        <Card className="p-6 border border-white/8">
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-brand-500/40 to-brand-700/40 border border-brand-500/30 flex items-center justify-center text-3xl font-display font-bold text-brand-200 flex-shrink-0">
              {student.firstName[0]}{student.lastName[0]}
            </div>

            {/* Quick info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-2 mb-3">
                <Badge variant={student.isActive ? 'success' : 'gray'}>
                  {student.isActive ? 'Attivo' : 'Inattivo'}
                </Badge>
                {isMinor && <Badge variant="brand">Minorenne</Badge>}
                <MedicalStatusBadge student={student} />
                <Badge variant={docCount >= 3 ? 'success' : docCount > 0 ? 'warning' : 'danger'}>
                  Documenti {docCount}/3
                </Badge>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-white/60">
                {student.fiscalCode && (
                  <div className="flex items-center gap-1.5">
                    <Clipboard size={12} className="text-white/30" />
                    <span className="font-mono text-white/80">{student.fiscalCode}</span>
                  </div>
                )}
                {student.contact.studentPhone && (
                  <div className="flex items-center gap-1.5">
                    <Phone size={12} className="text-white/30" />
                    <span>{student.contact.studentPhone}</span>
                  </div>
                )}
                {(student.contact.studentEmail || student.contact.parentEmail) && (
                  <div className="flex items-center gap-1.5">
                    <Mail size={12} className="text-white/30" />
                    <span className="truncate">{student.contact.studentEmail || student.contact.parentEmail}</span>
                  </div>
                )}
                {student.address?.city && (
                  <div className="flex items-center gap-1.5">
                    <MapPin size={12} className="text-white/30" />
                    <span>{student.address.city} ({student.address.province})</span>
                  </div>
                )}
              </div>
            </div>

            {/* Mini Stats */}
            <div className="flex gap-4 flex-shrink-0">
              <div className="text-center">
                <p className="text-2xl font-display font-bold text-white">{enrolledCourses.length}</p>
                <p className="text-xs text-white/40">Corsi</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-display font-bold text-teal-400">{attendanceStats.rate}%</p>
                <p className="text-xs text-white/40">Presenze</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl font-display font-bold ${paymentStats.overdue > 0 ? 'text-coral-400' : 'text-white'}`}>
                  €{paymentStats.overdue > 0 ? paymentStats.overdue : paymentStats.paid}
                </p>
                <p className="text-xs text-white/40">{paymentStats.overdue > 0 ? 'Scaduto' : 'Pagato'}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-black/20 rounded-2xl border border-white/5 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${activeTab === tab.id
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-500/20'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'anagrafica' && (
          <AnagraficaTab student={student} isMinor={isMinor} />
        )}
        {activeTab === 'corsi' && (
          <CorsiTab
            enrolledCourses={enrolledCourses}
            allCourses={allCourses}
            onToggle={handleEnrollToggle}
          />
        )}
        {activeTab === 'pagamenti' && student && (
          <PagamentiTab
            payments={resolvedPayments}
            stats={paymentStats}
            student={student}
            onUpdateCustomFees={handleUpdateCustomFees}
            onRefresh={() => loadAll(schoolId!, studentId!)}
          />
        )}
        {activeTab === 'presenze' && (
          <PresenzeTab attendance={attendance} stats={attendanceStats} />
        )}
        {activeTab === 'documenti' && (
          <DocumentiTab
            student={student}
            medStatus={medStatus}
            onUpload={() => setIsUploadOpen(true)}
            onSollecita={handleSollecito}
            sendingReminder={sendingReminder}
          />
        )}
        {activeTab === 'costumi' && (
          <CostumiTab
            student={student}
            onEdit={() => setIsCostumeOpen(true)}
          />
        )}

        {/* Costume Measurements Modal */}
        <CostumeModal
          isOpen={isCostumeOpen}
          onClose={() => setIsCostumeOpen(false)}
          student={student}
          onSave={async (m) => {
            await editStudent(student.id, { costumes: m });
            setStudent({ ...student, costumes: m });
            setIsCostumeOpen(false);
          }}
        />

        {/* Edit Modal */}
        <StudentForm
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          student={student}
          onSuccess={() => {
            setIsEditOpen(false);
            if (schoolId && studentId) void loadAll(schoolId, studentId);
          }}
        />

        {/* Upload Modal */}
        <UploadDocumentModal
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          student={student}
          onUpload={uploadStudentDocument}
          onSuccess={() => {
            setIsUploadOpen(false);
            if (schoolId && studentId) void loadAll(schoolId, studentId);
          }}
        />
      </div>
    </ErrorBoundary>
  );
}

// ─── Tab: Anagrafica ──────────────────────────────────────────────────────────
function AnagraficaTab({ student, isMinor }: { student: Student; isMinor: boolean }) {
  return (
    <div className="space-y-4">
      {/* Dati Personali */}
      <Card className="p-5 border border-white/8">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-4 flex items-center gap-2">
          <User size={13} /> Dati Anagrafici
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <InfoRow label="Nome" value={student.firstName} />
          <InfoRow label="Cognome" value={student.lastName} />
          <InfoRow label="Genere" value={student.gender === 'M' ? 'Maschio' : student.gender === 'F' ? 'Femmina' : 'Altro'} />
          <InfoRow
            label="Data di nascita"
            value={student.dateOfBirth
              ? format(student.dateOfBirth.toDate(), 'dd MMMM yyyy', { locale: it })
              : '—'}
          />
          <InfoRow label="Codice Fiscale" value={student.fiscalCode || '—'} mono />
          <InfoRow label="Stato" value={student.isActive ? 'Attivo' : 'Inattivo'} />
        </div>
      </Card>

      {/* Indirizzo */}
      {student.address && (
        <Card className="p-5 border border-white/8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-4 flex items-center gap-2">
            <MapPin size={13} /> Residenza
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <InfoRow label="Via" value={student.address.street || '—'} />
            <InfoRow label="Città" value={student.address.city || '—'} />
            <InfoRow label="Provincia" value={student.address.province || '—'} />
            <InfoRow label="CAP" value={student.address.postalCode || '—'} />
            <InfoRow label="Paese" value={student.address.country || 'Italia'} />
          </div>
        </Card>
      )}

      {/* Contatti */}
      <Card className="p-5 border border-white/8">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-4 flex items-center gap-2">
          <Phone size={13} /> Contatti
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <InfoRow label="Telefono allievo" value={student.contact.studentPhone || '—'} />
          <InfoRow label="Email allievo" value={student.contact.studentEmail || '—'} />
          <InfoRow label="Contatto emergenza" value={student.contact.emergencyContact || '—'} />
          <InfoRow label="Tel. emergenza" value={student.contact.emergencyPhone || '—'} />
        </div>
      </Card>

      {/* Genitore (se minore) */}
      {isMinor && (
        <Card className="p-5 border border-brand-500/20 bg-brand-500/5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-4 flex items-center gap-2">
            <Shield size={13} /> Genitore / Tutore Legale
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <InfoRow label="Nome" value={student.contact.parentName || '—'} />
            <InfoRow label="Relazione" value={student.contact.parentRelation || '—'} />
            <InfoRow label="Telefono" value={student.contact.parentPhone || '—'} />
            <InfoRow label="Email" value={student.contact.parentEmail || '—'} />
          </div>
        </Card>
      )}

      {/* Info mediche */}
      <Card className="p-5 border border-white/8">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-4 flex items-center gap-2">
          <Heart size={13} /> Informazioni Mediche
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <InfoRow
            label="Certificato medico"
            value={student.medicalInfo?.medicalClearance ? 'Presente' : 'Assente'}
            highlight={student.medicalInfo?.medicalClearance ? 'success' : 'danger'}
          />
          {student.medicalInfo?.medicalClearanceExpiry && (
            <InfoRow
              label="Scadenza certificato"
              value={format(student.medicalInfo.medicalClearanceExpiry.toDate(), 'dd/MM/yyyy')}
            />
          )}
          <InfoRow label="Allergie" value={student.medicalInfo?.allergies || 'Nessuna'} />
          <InfoRow label="Patologie" value={student.medicalInfo?.conditions || 'Nessuna'} />
          <InfoRow label="Farmaci" value={student.medicalInfo?.medications || 'Nessuno'} />
        </div>
      </Card>

      {/* Note */}
      {student.notes && (
        <Card className="p-5 border border-white/8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-2">Note Interne</h3>
          <p className="text-sm text-white/70 whitespace-pre-wrap">{student.notes}</p>
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Corsi ───────────────────────────────────────────────────────────────
function CorsiTab({
  enrolledCourses, allCourses, onToggle,
}: {
  enrolledCourses: Course[];
  allCourses: Course[];
  onToggle: (courseId: string) => void;
}) {
  const unenrolled = allCourses.filter(
    (c) => c.isActive && !enrolledCourses.find((e) => e.id === c.id)
  );

  return (
    <div className="space-y-4">
      {/* Enrolled */}
      <Card className="p-5 border border-white/8">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-4">
          Corsi Frequentati ({enrolledCourses.length})
        </h3>
        {enrolledCourses.length === 0 ? (
          <EmptyState icon="📚" title="Nessun corso" description={"L'allievo non è iscritto a nessun corso."} />
        ) : (
          <div className="space-y-2">
            {enrolledCourses.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: c.colorHex || '#7C3AED' }}
                  />
                  <div>
                    <p className="text-sm font-medium text-white">{c.name}</p>
                    <p className="text-xs text-white/40">{c.style} · {c.level} · €{c.fee.monthly}/mese</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onToggle(c.id)}
                  className="border-coral-500/30 text-coral-400 hover:bg-coral-500/10"
                >
                  Rimuovi
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Available */}
      {unenrolled.length > 0 && (
        <Card className="p-5 border border-white/8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/30 mb-4">
            Aggiungi a un Corso
          </h3>
          <div className="space-y-2">
            {unenrolled.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0 opacity-50"
                    style={{ backgroundColor: c.colorHex || '#7C3AED' }}
                  />
                  <div>
                    <p className="text-sm font-medium text-white/70">{c.name}</p>
                    <p className="text-xs text-white/30">{c.style} · {c.level} · €{c.fee.monthly}/mese</p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => onToggle(c.id)}>
                  Iscrive
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Pagamenti ───────────────────────────────────────────────────────────
function PagamentiTab({
  payments, stats, student, onUpdateCustomFees, onRefresh
}: {
  payments: Payment[];
  stats: { paid: number; overdue: number; pending: number };
  student: Student;
  onUpdateCustomFees: (fees: { customMonthlyFee: number | null; customRegistrationFee: number | null; customShowFee: number | null }) => Promise<void>;
  onRefresh: () => void;
}) {
  const { 
    registerInstallment,
    updateInstallment,
    deleteInstallment,
    emitInstallmentReceipt,
    cancelPayment
  } = usePayments();

  const { courses, activeSchool, students } = useSchoolStore();
  const [feeInput, setFeeInput] = useState(student.customMonthlyFee?.toString() || '');
  const [registrationFeeInput, setRegistrationFeeInput] = useState(student.customRegistrationFee?.toString() || '');
  const [showFeeInput, setShowFeeInput] = useState(student.customShowFee?.toString() || '');
  const [selectedExportYear, setSelectedExportYear] = useState('2025-2026');
  const [saving, setSaving] = useState(false);

  // Manage modal states
  const [selectedManagePayment, setSelectedManagePayment] = useState<Payment | null>(null);
  const [editingInstallmentIndex, setEditingInstallmentIndex] = useState<number | null>(null);
  const [editInstallmentAmount, setEditInstallmentAmount] = useState<number>(0);
  const [editInstallmentDate, setEditInstallmentDate] = useState<string>('');
  const [editInstallmentMethod, setEditInstallmentMethod] = useState<PaymentMethod>('cash');
  const [editInstallmentNotes, setEditInstallmentNotes] = useState<string>('');
  
  const [isCancellingPayment, setIsCancellingPayment] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Pay states
  const [payingPayment, setPayingPayment] = useState<Payment | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState<string>('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [payEmitReceipt, setPayEmitReceipt] = useState(false);

  useEffect(() => {
    if (payingPayment) {
      setPayAmount(payingPayment.remainingAmount ?? payingPayment.amount);
      setPayDate(new Date().toISOString().split('T')[0]);
      setPayNotes('');
      setPayEmitReceipt(false);
    }
  }, [payingPayment]);

  const handleConfirmPayment = async () => {
    if (!payingPayment) return;
    if (payAmount <= 0) {
      toast.error('Inserisci un importo valido.');
      return;
    }
    const maxAllowed = payingPayment.remainingAmount ?? payingPayment.amount;
    if (payAmount > maxAllowed) {
      toast.error(`L'importo inserito (€${payAmount}) supera il debito residuo (€${maxAllowed}).`);
      return;
    }

    try {
      const res = await registerInstallment(
        payingPayment.id,
        payAmount,
        payMethod,
        new Date(payDate),
        payNotes,
        payEmitReceipt
      );
      
      if (payEmitReceipt && res) {
        const studentObj = students.find(s => s.id === payingPayment.studentId);
        const course = courses.find(c => c.id === payingPayment.courseId);
        if (studentObj) {
          const docPDF = await generateReceiptPDF(res.updates, studentObj, activeSchool!, course, res.newInstallment);
          docPDF.save(`Ricevuta_${res.updates.receiptNumber || res.updates.id}.pdf`);
        }
      }

      setPayingPayment(null);
      setPayMethod('cash');
      setPayEmitReceipt(false);
      setPayNotes('');
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const statusVariant: Record<string, 'success' | 'danger' | 'warning' | 'gray'> = {
    paid: 'success', overdue: 'danger', pending: 'warning', cancelled: 'gray', deposit_paid: 'warning',
  };
  const statusLabel: Record<string, string> = {
    paid: 'Saldato', overdue: 'Scaduto', pending: 'In attesa', cancelled: 'Annullato', deposit_paid: 'Acconto',
  };

  const handleSave = async () => {
    const monthlyVal = feeInput.trim() === '' ? null : Number(feeInput);
    const regVal = registrationFeeInput.trim() === '' ? null : Number(registrationFeeInput);
    const showVal = showFeeInput.trim() === '' ? null : Number(showFeeInput);

    if ((monthlyVal !== null && isNaN(monthlyVal)) || 
        (regVal !== null && isNaN(regVal)) || 
        (showVal !== null && isNaN(showVal))) {
      toast.error('Inserisci importi validi.');
      return;
    }
    setSaving(true);
    try {
      await onUpdateCustomFees({
        customMonthlyFee: monthlyVal,
        customRegistrationFee: regVal,
        customShowFee: showVal,
      });
      toast.success('Quote personalizzate salvate con successo!');
    } catch (err) {
      console.error(err);
      toast.error('Errore durante il salvataggio.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportHistory = async () => {
    if (!activeSchool) return;
    try {
      const doc = await generateStudentHistoryPDF(student, payments, activeSchool, selectedExportYear, courses);
      doc.save(`Storico_Pagamenti_${student.lastName}_${student.firstName}_${selectedExportYear}.pdf`);
      toast.success('Storico pagamenti scaricato!');
    } catch (err) {
      console.error(err);
      toast.error("Impossibile generare il PDF dello storico.");
    }
  };

  const handleDeleteInstallmentClick = async (paymentId: string, index: number) => {
    if (!window.confirm('Sei sicuro di voler eliminare questo versamento? Residuo e stato verranno ricalcolati.')) return;
    try {
      await deleteInstallment(paymentId, index);
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEmitReceiptClick = async (paymentId: string, index: number) => {
    try {
      const res = await emitInstallmentReceipt(paymentId, index);
      if (res) {
        onRefresh();
        const studentObj = students.find(s => s.id === res.updates.studentId);
        const course = courses.find(c => c.id === res.updates.courseId);
        if (studentObj) {
          const docPDF = await generateReceiptPDF(res.updates, studentObj, activeSchool!, course, res.newInstallment);
          docPDF.save(`Ricevuta_${res.updates.receiptNumber || res.updates.id}.pdf`);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveInstallmentEdit = async (paymentId: string, index: number) => {
    if (editInstallmentAmount <= 0) {
      toast.error('Inserisci un importo valido.');
      return;
    }
    try {
      await updateInstallment(paymentId, index, {
        amount: editInstallmentAmount,
        date: new Date(editInstallmentDate),
        method: editInstallmentMethod,
        notes: editInstallmentNotes,
      });
      setEditingInstallmentIndex(null);
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfirmCancelPayment = async (paymentId: string) => {
    if (!cancelReason.trim()) return;
    try {
      await cancelPayment(paymentId, cancelReason.trim());
      setIsCancellingPayment(false);
      setCancelReason('');
      setSelectedManagePayment(null);
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadReceipt = async (payment: Payment, installment?: any) => {
    if (!activeSchool) return;
    const studentObj = students.find(s => s.id === payment.studentId);
    if (!studentObj) {
      toast.error('Allievo non trovato');
      return;
    }
    const course = courses.find(c => c.id === payment.courseId);
    
    try {
      const docPDF = await generateReceiptPDF(payment, studentObj, activeSchool, course, installment);
      docPDF.save(`Ricevuta_${payment.receiptNumber || payment.id}.pdf`);
      toast.success('Ricevuta scaricata!');
    } catch (err) {
      console.error(err);
      toast.error('Errore durante la generazione del PDF');
    }
  };

  const managedPayment = useMemo(() => {
    if (!selectedManagePayment) return null;
    return payments.find(p => p.id === selectedManagePayment.id) || null;
  }, [selectedManagePayment, payments]);

  return (
    <div className="space-y-4">
      {/* Custom Fee configuration card */}
      <Card className="p-5 border border-white/8">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-2">
          Quote Personalizzate Allievo
        </h3>
        <p className="text-xs text-white/50 mb-4">
          Imposta quote personalizzate per questo allievo (es. sconti fratelli). Lascia vuoto per utilizzare le tariffe standard.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <Input
            type="number"
            label="Retta Mensile (€)"
            placeholder="Es. 45.00"
            value={feeInput}
            onChange={(e) => setFeeInput(e.target.value)}
          />
          <Input
            type="number"
            label="Quota Iscrizione (€)"
            placeholder="Es. 30.00"
            value={registrationFeeInput}
            onChange={(e) => setRegistrationFeeInput(e.target.value)}
          />
          <Input
            type="number"
            label="Quota Saggio (€)"
            placeholder="Es. 50.00"
            value={showFeeInput}
            onChange={(e) => setShowFeeInput(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} loading={saving}>
            Salva Quote Personalizzate
          </Button>
        </div>
      </Card>

      {/* Export History Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
        <div>
          <h4 className="text-sm font-medium text-white">Esporta Storico Pagamenti</h4>
          <p className="text-xs text-white/40">Genera un PDF con tutti i pagamenti dell'anno selezionato</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-40">
            <Select
              value={selectedExportYear}
              onChange={(e) => setSelectedExportYear(e.target.value)}
              options={[
                { value: '2024-2025', label: 'A.A. 2024/2025' },
                { value: '2025-2026', label: 'A.A. 2025/2026' },
                { value: '2026-2027', label: 'A.A. 2026/2027' },
              ]}
            />
          </div>
          <Button
            variant="outline"
            icon={<Download size={14} />}
            onClick={handleExportHistory}
          >
            Esporta PDF
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 border-l-4 border-teal-500">
          <p className="text-xs text-white/50">Totale Pagato</p>
          <p className="text-2xl font-display font-bold text-teal-400">€{stats.paid.toFixed(2)}</p>
        </Card>
        <Card className="p-4 border-l-4 border-coral-500">
          <p className="text-xs text-white/50">Importo Scaduto</p>
          <p className="text-2xl font-display font-bold text-coral-400">€{stats.overdue.toFixed(2)}</p>
        </Card>
        <Card className="p-4 border-l-4 border-gold-500">
          <p className="text-xs text-white/50">Quote in Attesa</p>
          <p className="text-2xl font-display font-bold text-gold-400">{stats.pending}</p>
        </Card>
      </div>

      {/* List */}
      <Card className="overflow-hidden border border-white/8 p-0 rounded-3xl">
        {payments.length === 0 ? (
          <div className="p-6">
            <EmptyState icon="💳" title="Nessun pagamento" description="Non ci sono pagamenti registrati per questo allievo." />
          </div>
        ) : (
          <table className="w-full text-left min-w-[500px]">
            <thead>
              <tr className="border-b border-white/8 bg-white/[0.02] text-xs font-semibold text-white/40 uppercase tracking-wider">
                <th className="py-3 px-5">Descrizione</th>
                <th className="py-3 px-5">Mese</th>
                <th className="py-3 px-5">Scadenza</th>
                <th className="py-3 px-5">Importo</th>
                <th className="py-3 px-5">Stato</th>
                <th className="py-3 px-5 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-5 text-white/80">{p.description}</td>
                  <td className="py-3 px-5 text-white/50">
                    {p.month && p.year ? `${p.month}/${p.year}` : '—'}
                  </td>
                  <td className="py-3 px-5 text-white/50">
                    {p.dueDate ? format(p.dueDate.toDate(), 'dd/MM/yyyy') : '—'}
                  </td>
                  <td className="py-3 px-5 font-semibold text-white">
                    <div>
                      €{(p.paidAmount ?? 0).toFixed(2)}
                      <span className="text-xs text-white/40 font-normal block mt-0.5">
                        su €{(p.totalAmount ?? 0).toFixed(2)}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-5">
                    <Badge variant={statusVariant[p.status] ?? 'gray'} size="sm">
                      {statusLabel[p.status] ?? p.status}
                    </Badge>
                  </td>
                  <td className="py-3 px-5 text-right">
                    <div className="flex justify-end items-center gap-2">
                      {(p.status === 'pending' || p.status === 'deposit_paid' || p.status === 'overdue') && (
                        <Button
                          size="xs"
                          onClick={() => setPayingPayment(p)}
                          icon={<CheckCircle size={12} />}
                        >
                          Incassa
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => setSelectedManagePayment(p)}
                        icon={<Clock size={12} />}
                      >
                        Storico
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* MODAL: GESTIONE STORICO E DETTAGLIO PAGAMENTO IN SCHEDA ALLIEVO */}
      <Modal
        isOpen={!!managedPayment}
        onClose={() => {
          setSelectedManagePayment(null);
          setEditingInstallmentIndex(null);
        }}
        title="Gestione Storico Pagamento"
        description={managedPayment ? `${managedPayment.description} - Totale Dovuto: €${(managedPayment.totalAmount ?? 0).toFixed(2)}` : ''}
      >
        {managedPayment && (
          <div className="space-y-6">
            {/* Payment Summary */}
            <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
              <div>
                <p className="text-[10px] text-white/40 uppercase font-semibold">Incassato</p>
                <p className="text-lg font-bold text-teal-400">€{(managedPayment.paidAmount ?? 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] text-white/40 uppercase font-semibold">Residuo</p>
                <p className="text-lg font-bold text-white">€{(managedPayment.remainingAmount ?? 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] text-white/40 uppercase font-semibold">Stato</p>
                <div className="mt-1">
                  <Badge variant={
                    managedPayment.status === 'paid' ? 'success' :
                    managedPayment.status === 'deposit_paid' ? 'warning' :
                    managedPayment.status === 'cancelled' ? 'gray' :
                    managedPayment.status === 'overdue' ? 'danger' : 'brand'
                  } size="sm">
                    {managedPayment.status === 'paid' ? 'Saldato' :
                     managedPayment.status === 'deposit_paid' ? 'Acconto' :
                     managedPayment.status === 'cancelled' ? 'Annullato' :
                     managedPayment.status === 'overdue' ? 'Scaduto' : 'In Attesa'}
                  </Badge>
                </div>
              </div>
            </div>

            {(managedPayment.status === 'pending' || managedPayment.status === 'deposit_paid' || managedPayment.status === 'overdue') && (
                <Button
                  className="w-full"
                  onClick={() => {
                    setPayingPayment(managedPayment);
                    setSelectedManagePayment(null);
                  }}
                  icon={<CheckCircle size={14} />}
                >
                  Registra Versamento / Incassa
                </Button>
              )}

            {/* Installments History */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40">Storico Versamenti</h4>
              {!managedPayment.payments || managedPayment.payments.length === 0 ? (
                <p className="text-sm text-white/30 italic">Nessun versamento registrato per questa quota.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {managedPayment.payments.map((inst, idx) => (
                    <div key={idx} className="p-3 rounded-lg bg-black/20 border border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">€{inst.amount.toFixed(2)}</span>
                          <span className="text-[10px] text-white/50 bg-white/5 px-2 py-0.5 rounded-full uppercase">
                            {inst.method === 'cash' ? 'Contanti' :
                             inst.method === 'bank_transfer' ? 'Bonifico' :
                             inst.method === 'card' ? 'Carta / POS' : 'Altro'}
                          </span>
                        </div>
                        <p className="text-xs text-white/40">
                          📅 {format(inst.date.toDate(), 'dd/MM/yyyy')}
                          {inst.notes && <span className="block mt-0.5 text-[11px] italic text-white/60">Note: {inst.notes}</span>}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                        {managedPayment.status !== 'cancelled' && (
                          <>
                            <Button
                              size="xs"
                              variant="secondary"
                              icon={<Edit size={12} />}
                              onClick={() => {
                                setEditingInstallmentIndex(idx);
                                setEditInstallmentAmount(inst.amount);
                                setEditInstallmentDate(inst.date.toDate().toISOString().split('T')[0]);
                                setEditInstallmentMethod(inst.method);
                                setEditInstallmentNotes(inst.notes || '');
                              }}
                            >
                              Modifica
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              className="border-coral-500/20 text-coral-400 hover:bg-coral-500/10"
                              icon={<Trash2 size={12} />}
                              onClick={() => handleDeleteInstallmentClick(managedPayment.id, idx)}
                            >
                              Elimina
                            </Button>
                          </>
                        )}
                        
                        {inst.receiptEmitted ? (
                          <Button
                            size="xs"
                            variant="outline"
                            icon={<Download size={12} />}
                            onClick={() => handleDownloadReceipt(managedPayment, inst)}
                          >
                            Ricevuta
                          </Button>
                        ) : (
                          managedPayment.status !== 'cancelled' && (
                            <Button
                              size="xs"
                              variant="outline"
                              className="border-gold-500/30 text-gold-300 hover:bg-gold-500/10"
                              icon={<Plus size={12} />}
                              onClick={() => handleEmitReceiptClick(managedPayment.id, idx)}
                            >
                              Emetti
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Edit Installment Sub-Form */}
            {editingInstallmentIndex !== null && managedPayment.payments && (
              <div className="p-4 rounded-xl bg-brand-500/5 border border-brand-500/15 space-y-4">
                <div className="flex justify-between items-center">
                  <h5 className="text-xs font-bold text-brand-300 uppercase">Modifica Versamento #{editingInstallmentIndex + 1}</h5>
                  <button 
                    className="text-white/40 hover:text-white/80 text-xs" 
                    onClick={() => setEditingInstallmentIndex(null)}
                  >
                    Annulla
                  </button>
                </div>

                {managedPayment.payments[editingInstallmentIndex].receiptEmitted && (
                  <div className="p-2.5 rounded-lg bg-gold-500/10 border border-gold-500/20 text-xs text-gold-300">
                    ⚠️ Ricevuta già emessa — i dati non saranno aggiornati automaticamente
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    label="Importo (€)"
                    type="number"
                    step="0.01"
                    value={editInstallmentAmount}
                    onChange={(e) => setEditInstallmentAmount(Number(e.target.value))}
                  />
                  <Input
                    label="Data Versamento"
                    type="date"
                    value={editInstallmentDate}
                    onChange={(e) => setEditInstallmentDate(e.target.value)}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Select
                    label="Metodo di Pagamento"
                    value={editInstallmentMethod}
                    onChange={(e) => setEditInstallmentMethod(e.target.value as PaymentMethod)}
                    options={[
                      { value: 'cash', label: 'Contanti' },
                      { value: 'bank_transfer', label: 'Bonifico Bancario' },
                      { value: 'card', label: 'Carta / POS' },
                      { value: 'other', label: 'Altro' },
                    ]}
                  />
                  <Input
                    label="Note Interne"
                    value={editInstallmentNotes}
                    onChange={(e) => setEditInstallmentNotes(e.target.value)}
                  />
                </div>

                <Button 
                  size="sm" 
                  className="w-full"
                  onClick={() => handleSaveInstallmentEdit(managedPayment.id, editingInstallmentIndex)}
                >
                  Salva Modifiche Versamento
                </Button>
              </div>
            )}

            {/* Cancel Payment Panel */}
            {managedPayment.status !== 'cancelled' && editingInstallmentIndex === null && (
              <div className="pt-4 border-t border-white/5 space-y-3">
                {isCancellingPayment ? (
                  <div className="p-4 rounded-xl bg-coral-500/5 border border-coral-500/15 space-y-3">
                    <h5 className="text-xs font-bold text-coral-400 uppercase">Annullamento Quota</h5>
                    
                    {managedPayment.payments && managedPayment.payments.length > 0 && (
                      <div className="p-2 rounded bg-coral-500/10 border border-coral-500/20 text-xs text-coral-300">
                        ⚠️ Gestisci eventuali rimborsi manualmente
                      </div>
                    )}

                    <Input
                      label="Motivazione Annullamento (Obbligatoria)"
                      placeholder="Es. Ritiro dell'allievo dal corso"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                    />

                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="secondary"
                        onClick={() => {
                          setIsCancellingPayment(false);
                          setCancelReason('');
                        }}
                      >
                        Annulla
                      </Button>
                      <Button 
                        size="sm" 
                        className="bg-coral-600 hover:bg-coral-500 text-white"
                        onClick={() => handleConfirmCancelPayment(managedPayment.id)}
                        disabled={!cancelReason.trim()}
                      >
                        Conferma Annullamento
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-white/40">Vuoi annullare o archiviare questa quota?</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-coral-500/30 text-coral-400 hover:bg-coral-500/10"
                      icon={<XCircle size={14} />}
                      onClick={() => setIsCancellingPayment(true)}
                    >
                      Annulla Quota
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* MODAL: INCASSA PAGAMENTO */}
      <Modal
        isOpen={!!payingPayment}
        onClose={() => setPayingPayment(null)}
        title="Registra Versamento"
        description={`Inserisci i dettagli del pagamento per: ${payingPayment?.description}`}
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-black/20 border border-white/5 flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/60">Importo Totale Dovuto:</span>
              <span className="text-white font-semibold">€{(payingPayment?.totalAmount ?? payingPayment?.amount ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/60">Importo Già Pagato:</span>
              <span className="text-teal-400 font-semibold">€{(payingPayment?.paidAmount ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-sm border-t border-white/8 pt-1.5 mt-1 font-bold">
              <span className="text-white/85">Debito Residuo:</span>
              <span className="text-white">€{(payingPayment?.remainingAmount ?? payingPayment?.amount ?? 0).toFixed(2)}</span>
            </div>
          </div>

          <Input
            label="Importo Versato"
            type="number"
            step="0.01"
            value={payAmount}
            onChange={(e) => setPayAmount(Number(e.target.value))}
          />

          <Select
            label="Metodo di Pagamento"
            value={payMethod}
            onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
            options={[
              { value: 'cash', label: 'Contanti' },
              { value: 'bank_transfer', label: 'Bonifico Bancario' },
              { value: 'card', label: 'Carta / POS' },
              { value: 'other', label: 'Altro' },
            ]}
          />

          <Input
            label="Data Versamento"
            type="date"
            value={payDate}
            onChange={(e) => setPayDate(e.target.value)}
          />

          <Input
            label="Note Versamento"
            placeholder="es. Acconto quota o saldo"
            value={payNotes}
            onChange={(e) => setPayNotes(e.target.value)}
          />

          <div className='flex items-center justify-between p-4 rounded-xl border border-white/10 glass-strong'>
            <div>
              <p className="font-semibold text-white text-sm">Emetti ricevuta PDF?</p>
              <p className="text-xs text-white/50 mt-0.5">Genera una ricevuta per questo versamento.</p>
            </div>
            <input
              type='checkbox'
              className='w-5 h-5 rounded border-white/20 text-brand-600 bg-black/30 focus:ring-brand-500 cursor-pointer'
              checked={payEmitReceipt}
              onChange={(e) => setPayEmitReceipt(e.target.checked)}
            />
          </div>

          <ModalFooter>
            <Button variant="secondary" onClick={() => setPayingPayment(null)}>Annulla</Button>
            <Button onClick={handleConfirmPayment}>Conferma Incasso</Button>
          </ModalFooter>
        </div>
      </Modal>
    </div>
  );
}

// ─── Tab: Presenze ────────────────────────────────────────────────────────────
function PresenzeTab({
  attendance, stats,
}: {
  attendance: AttendanceRecord[];
  stats: { total: number; present: number; rate: number };
}) {
  const statusConfig: Record<string, { label: string; color: string }> = {
    present: { label: 'Presente', color: 'text-teal-400' },
    absent: { label: 'Assente', color: 'text-coral-400' },
    late: { label: 'In Ritardo', color: 'text-gold-400' },
    justified: { label: 'Giustificato', color: 'text-white/50' },
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 text-center border border-white/8">
          <p className="text-3xl font-display font-bold text-white">{stats.total}</p>
          <p className="text-xs text-white/40 mt-1">Lezioni Totali</p>
        </Card>
        <Card className="p-4 text-center border border-white/8">
          <p className="text-3xl font-display font-bold text-teal-400">{stats.present}</p>
          <p className="text-xs text-white/40 mt-1">Presenze</p>
        </Card>
        <Card className="p-4 text-center border border-white/8">
          <div className="relative w-16 h-16 mx-auto mb-1">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke="#14b8a6" strokeWidth="3"
                strokeDasharray={`${stats.rate} ${100 - stats.rate}`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">
              {stats.rate}%
            </span>
          </div>
          <p className="text-xs text-white/40">Tasso Presenze</p>
        </Card>
      </div>

      {/* List */}
      <Card className="overflow-hidden border border-white/8 p-0 rounded-3xl">
        {attendance.length === 0 ? (
          <div className="p-6">
            <EmptyState icon="✅" title="Nessuna presenza" description="Non ci sono registrazioni di presenza per questo allievo." />
          </div>
        ) : (
          <table className="w-full text-left min-w-[400px]">
            <thead>
              <tr className="border-b border-white/8 bg-white/[0.02] text-xs font-semibold text-white/40 uppercase tracking-wider">
                <th className="py-3 px-5">Data</th>
                <th className="py-3 px-5">Stato</th>
                <th className="py-3 px-5">Nota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {attendance.map((a) => {
                const cfg = statusConfig[a.status] ?? { label: a.status, color: 'text-white/50' };
                return (
                  <tr key={a.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-5 text-white/70">
                      {a.date ? format(a.date.toDate(), 'EEE dd MMM yyyy', { locale: it }) : '—'}
                    </td>
                    <td className={`py-3 px-5 font-semibold ${cfg.color}`}>{cfg.label}</td>
                    <td className="py-3 px-5 text-white/40 text-xs">{a.justification || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ─── Tab: Documenti ───────────────────────────────────────────────────────────
const DOC_TYPES: { type: StudentDocument['type']; label: string; desc: string; icon: React.ReactNode }[] = [
  { type: 'consent', label: 'Modulo di Iscrizione', desc: 'Modulo iscrizione/consenso firmato', icon: <Clipboard size={16} /> },
  { type: 'medical', label: 'Certificato Medico', desc: 'Idoneità fisica agonistica/non', icon: <Heart size={16} /> },
  { type: 'identity', label: 'Documento Identità', desc: "Carta d'identità o passaporto", icon: <Shield size={16} /> },
];

function DocumentiTab({
  student, medStatus, onUpload, onSollecita, sendingReminder,
}: {
  student: Student;
  medStatus: string;
  onUpload: () => void;
  onSollecita: () => void;
  sendingReminder: boolean;
}) {
  const [isGdprModalOpen, setIsGdprModalOpen] = useState(false);

  // Helper to format date/time of signature
  const getSignatureDateTime = () => {
    if (!student.signatureMetadata?.timestamp) return '—';
    const ts = student.signatureMetadata.timestamp;
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      return format(date, 'dd/MM/yyyy HH:mm:ss');
    } catch (e) {
      return '—';
    }
  };

  const getMedicalDaysRemaining = () => {
    if (!student.medicalInfo?.medicalClearanceExpiry) return 0;
    const expiry = student.medicalInfo.medicalClearanceExpiry.toDate();
    const diffTime = expiry.getTime() - new Date().getTime();
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  };

  return (
    <div className="space-y-4">
      {/* Required docs */}
      <Card className="p-5 border border-white/8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-400">
            Documenti Obbligatori (3)
          </h3>
          <Button size="sm" icon={<Upload size={13} />} onClick={onUpload}>
            Carica Documento
          </Button>
        </div>

        <div className="space-y-3">
          {DOC_TYPES.map(({ type, label, desc, icon }) => {
            const found = student.documents?.find((d) => d.type === type);
            const isConsent = type === 'consent';
            const isMedical = type === 'medical';
            const isExpiring = isMedical && medStatus === 'expiring';
            const isExpired = isMedical && medStatus === 'expired';

            // Calculate dynamic badge
            let badgeComponent = null;
            if (found) {
              if (isMedical) {
                if (medStatus === 'expired') {
                  badgeComponent = <Badge variant="danger" size="sm" dot>Scaduto</Badge>;
                } else if (medStatus === 'expiring') {
                  const days = getMedicalDaysRemaining();
                  badgeComponent = <Badge variant="warning" size="sm" dot>{`In scadenza (${days} gg rim.)`}</Badge>;
                } else {
                  badgeComponent = <Badge variant="success" size="sm" dot>Valido</Badge>;
                }
              } else {
                badgeComponent = <Badge variant="success" size="sm" dot>Valido</Badge>;
              }
            } else {
              badgeComponent = <Badge variant="danger" size="sm">Mancante</Badge>;
            }

            return (
              <div
                key={type}
                className={`flex items-center justify-between p-4 rounded-2xl border transition-colors ${found
                    ? isExpired
                      ? 'bg-coral-500/5 border-coral-500/20'
                      : isExpiring
                        ? 'bg-gold-500/5 border-gold-500/20'
                        : 'bg-teal-500/5 border-teal-500/20'
                    : 'bg-white/[0.02] border-white/8'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${found
                      ? isExpired ? 'bg-coral-500/20 text-coral-400'
                        : isExpiring ? 'bg-gold-500/20 text-gold-400'
                          : 'bg-teal-500/20 text-teal-400'
                      : 'bg-white/5 text-white/30'
                    }`}>
                    {icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{label}</p>
                      {badgeComponent}
                    </div>
                    <p className="text-xs text-white/40">
                      {found
                        ? `Caricato il ${format(found.uploadedAt.toDate(), 'dd/MM/yyyy')}`
                        : desc}
                    </p>
                    {isMedical && student.medicalInfo?.medicalClearanceExpiry && (
                      <p className={`text-xs font-medium ${isExpired ? 'text-coral-400' : isExpiring ? 'text-gold-400' : 'text-teal-400'
                        }`}>
                        {isExpired ? '⚠ Scaduto il ' : 'Scade il '}
                        {format(student.medicalInfo.medicalClearanceExpiry.toDate(), 'dd/MM/yyyy')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {found ? (
                    <>
                      {isConsent && (
                        <button
                          type="button"
                          onClick={() => setIsGdprModalOpen(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-300 hover:bg-teal-500/20 text-xs font-semibold cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                          <Shield size={12} className="text-teal-400" />
                          <span>Verificato GDPR</span>
                        </button>
                      )}
                      {found.fileURL && (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Download size={13} />}
                          onClick={() => window.open(found.fileURL, '_blank')}
                        >
                          Apri
                        </Button>
                      )}
                      <div className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center">
                        <CheckCircle size={14} />
                      </div>
                    </>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-coral-500/10 text-coral-500 flex items-center justify-center">
                      <XCircle size={14} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Storage disabled notice */}
      {!STORAGE_ENABLED && (
        <div className="p-4 rounded-2xl border border-gold-500/20 bg-gold-500/5 flex items-start gap-3 text-sm text-gold-300">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Caricamento file in modalità simulazione</p>
            <p className="text-xs text-gold-300/70 mt-0.5">
              Lo Storage non è ancora attivo. I documenti vengono registrati su Firestore con URL simulato.
              Attiva Firebase Storage per abilitare il caricamento reale dei file.
            </p>
          </div>
        </div>
      )}

      {/* Sollecito CTA */}
      {(student.documents?.length ?? 0) < 3 && (
        <Card className="p-5 border border-coral-500/20 bg-coral-500/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-coral-300">Documentazione Incompleta</p>
              <p className="text-xs text-coral-300/70 mt-0.5">
                Invia una notifica al genitore/allievo per richiedere i documenti mancanti.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={<BellRing size={13} />}
              onClick={onSollecita}
              loading={sendingReminder}
              className="border-coral-500/30 text-coral-300 hover:bg-coral-500/10 flex-shrink-0"
            >
              Invia Sollecito
            </Button>
          </div>
        </Card>
      )}

      {/* Other docs */}
      {student.documents?.filter((d) => !['consent', 'medical', 'identity'].includes(d.type)).length > 0 && (
        <Card className="p-5 border border-white/8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/30 mb-4">
            Altri Documenti
          </h3>
          <div className="space-y-2">
            {student.documents
              .filter((d) => !['consent', 'medical', 'identity'].includes(d.type))
              .map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                  <div>
                    <p className="text-sm text-white/80">{doc.name}</p>
                    <p className="text-xs text-white/40">
                      {format(doc.uploadedAt.toDate(), 'dd/MM/yyyy')}
                      {doc.notes ? ` · ${doc.notes}` : ''}
                    </p>
                  </div>
                  {doc.fileURL && (
                    <Button variant="secondary" size="sm" icon={<Download size={13} />}
                      onClick={() => window.open(doc.fileURL, '_blank')}>
                      Apri
                    </Button>
                  )}
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* MODAL: VERIFICATO GDPR */}
      <Modal
        isOpen={isGdprModalOpen}
        onClose={() => setIsGdprModalOpen(false)}
        title="Dettagli di Verifica GDPR (FES)"
        description="Informazioni forensi relative alla sottoscrizione del modulo di iscrizione."
      >
        <div className="space-y-5 text-sm text-white/80">
          {student.signatureMetadata ? (
            <>
              {/* Consenti espressi */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-brand-300 uppercase tracking-wider">Consensi Espressi</h4>
                <div className="space-y-2 bg-black/20 p-4 rounded-xl border border-white/5">
                  <div className="flex items-start gap-2 text-xs">
                    <CheckCircle size={16} className="text-teal-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-white">Consenso Dati Comuni & Liberatoria Foto/Video</p>
                      <p className="text-white/50 text-[10px] mt-0.5">Firmato digitalmente il {getSignatureDateTime()}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-xs border-t border-white/5 pt-2 mt-2">
                    <CheckCircle size={16} className="text-teal-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-white">Consenso Dati Sensibili Sanitari</p>
                      <p className="text-white/50 text-[10px] mt-0.5">Firmato digitalmente il {getSignatureDateTime()}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Forensic Details */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-brand-300 uppercase tracking-wider">Dettagli di Connessione</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                    <p className="text-white/40 font-semibold mb-1">Indirizzo IP</p>
                    <p className="font-mono text-white/95">{student.signatureMetadata.ipAddress}</p>
                  </div>
                  <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                    <p className="text-white/40 font-semibold mb-1">Sessione ID</p>
                    <p className="font-mono text-white/95 truncate">{student.signatureMetadata.sessionId}</p>
                  </div>
                </div>
                <div className="bg-black/20 p-3 rounded-xl border border-white/5 text-xs">
                  <p className="text-white/40 font-semibold mb-1">Dispositivo / User Agent</p>
                  <p className="text-white/85 leading-relaxed">{student.signatureMetadata.userAgent}</p>
                </div>
              </div>

              {/* Integrity Fingerprint */}
              {student.sha256Hash && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-brand-300 uppercase tracking-wider">Impronta Digitale dell'Integrità (SHA-256)</h4>
                  <div className="bg-black/30 p-3 rounded-xl border border-brand-500/20 text-xs font-mono text-brand-300 break-all select-all">
                    {student.sha256Hash}
                  </div>
                  <p className="text-[10px] text-white/40 leading-relaxed">
                    Questo hash SHA-256 garantisce l'integrità del documento firmato. Qualsiasi modifica successiva ai dati anagrafici dell'allievo invalida la corrispondenza crittografica.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center p-6 bg-black/20 border border-white/5 rounded-2xl">
              <p className="text-sm text-white/40 italic">
                Nessun metadato di firma digitale (FES) disponibile per questo allievo. 
                Il modulo di iscrizione potrebbe essere stato caricato manualmente dalla segreteria o l'iscrizione è precedente all'integrazione del modulo GDPR FES.
              </p>
            </div>
          )}
          
          <ModalFooter>
            <Button className="w-full" onClick={() => setIsGdprModalOpen(false)}>Chiudi Dettagli</Button>
          </ModalFooter>
        </div>
      </Modal>
    </div>
  );
}

// ─── Upload Document Modal ────────────────────────────────────────────────────
interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  onUpload: (
    studentId: string,
    docType: StudentDocument['type'],
    fileName: string,
    notes?: string,
    expiryDate?: Date
  ) => Promise<StudentDocument | undefined>;
  onSuccess: () => void;
}

function UploadDocumentModal({ isOpen, onClose, student, onUpload, onSuccess }: UploadModalProps) {
  const [docType, setDocType] = useState<StudentDocument['type']>('consent');
  const [fileName, setFileName] = useState('');
  const [notes, setNotes] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!fileName.trim()) return;
    setLoading(true);
    try {
      await onUpload(
        student.id,
        docType,
        fileName.trim(),
        notes.trim() || undefined,
        expiryDate ? new Date(expiryDate) : undefined
      );
      onSuccess();
      setFileName(''); setNotes(''); setExpiryDate('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Carica Documento"
      description={`Registra un documento per ${student.firstName} ${student.lastName}`}
    >
      <div className="space-y-4">
        <Select
          label="Tipo Documento"
          value={docType}
          onChange={(e) => setDocType(e.target.value as StudentDocument['type'])}
          options={[
            { value: 'consent', label: 'Modulo di Iscrizione' },
            { value: 'medical', label: 'Certificato Medico' },
            { value: 'identity', label: 'Documento Identità' },
            { value: 'insurance', label: 'Assicurazione' },
            { value: 'other', label: 'Altro' },
          ]}
        />

        <Input
          label="Nome File / Documento"
          placeholder="es. Certificato Medico 2025-26.pdf"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          required
        />

        {docType === 'medical' && (
          <Input
            label="Data Scadenza Certificato"
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            required
          />
        )}

        <Input
          label="Note (opzionale)"
          placeholder="Es. Originale consegnato in segreteria"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {!STORAGE_ENABLED && (
          <p className="text-xs text-gold-300/70 bg-gold-500/5 border border-gold-500/20 rounded-xl p-3">
            ℹ Storage disabilitato: il documento verrà registrato con URL simulato.
          </p>
        )}
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>Annulla</Button>
        <Button onClick={handleSubmit} loading={loading} disabled={!fileName.trim()}>
          Registra Documento
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ─── InfoRow helper ───────────────────────────────────────────────────────────
function InfoRow({
  label, value, mono, highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: 'success' | 'danger';
}) {
  return (
    <div>
      <p className="text-xs text-white/40 mb-0.5">{label}</p>
      <p className={`text-sm font-medium ${highlight === 'success' ? 'text-teal-400' :
          highlight === 'danger' ? 'text-coral-400' :
            'text-white/90'
        } ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
    </div>
  );
}

// ─── Size Calculator Helper ──────────────────────────────────────────────────
export function computeCostumeSize(chest?: number, waist?: number, hips?: number): string {
  if (!chest || !waist || !hips) return '—';
  // Logica calcolo taglia
  if (chest < 84 && waist < 64 && hips < 88) return 'XS';
  if (chest < 90 && waist < 70 && hips < 94) return 'S';
  if (chest < 96 && waist < 76 && hips < 100) return 'M';
  if (chest < 102 && waist < 82 && hips < 106) return 'L';
  return 'XL';
}

// ─── Tab: Costumi & Misure ─────────────────────────────────────────────────────
import { Scissors } from 'lucide-react';
import type { CostumeMeasurements } from '@/types';
import { generateMeasurementsPDF } from '@/lib/pdf';

interface CostumiTabProps {
  student: Student;
  onEdit: () => void;
}

function CostumiTab({ student, onEdit }: CostumiTabProps) {
  const m = student.costumes;
  const computedSize = m ? computeCostumeSize(m.chest, m.waist, m.hips) : '—';
  const activeSchool = useSchoolStore((s) => s.activeSchool);

  const handleExportPDF = async () => {
    if (!activeSchool) {
      toast.error('Scuola non selezionata.');
      return;
    }
    try {
      const doc = await generateMeasurementsPDF(student, activeSchool);
      doc.save(`Misure_${student.lastName}_${student.firstName}.pdf`);
      toast.success('Scheda misure scaricata.');
    } catch (err) {
      console.error('[CostumiTab] Export PDF error:', err);
      toast.error('Impossibile generare il PDF.');
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-5 border border-white/8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-400 flex items-center gap-2">
            <Scissors size={13} /> Misure Corporee & Sartoria
          </h3>
          <div className="flex items-center gap-2">
            {m && (
              <Button size="sm" variant="ghost" onClick={handleExportPDF}>
                <Download size={14} className="mr-1" /> Esporta PDF
              </Button>
            )}
            <Button size="sm" onClick={onEdit}>
              Aggiorna Misure
            </Button>
          </div>
        </div>

        {!m ? (
          <EmptyState
            icon="📐"
            title="Nessuna misura registrata"
            description="Inserisci le misure per calcolare automaticamente la taglia del costume per saggi e gare."
          />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <InfoRow label="Altezza (cm)" value={m.height ? `${m.height} cm` : '—'} />
              <InfoRow label="Peso (kg)" value={m.weight ? `${m.weight} kg` : '—'} />
              <InfoRow label="Torace / Seno (cm)" value={m.chest ? `${m.chest} cm` : '—'} />
              <InfoRow label="Vita (cm)" value={m.waist ? `${m.waist} cm` : '—'} />
              <InfoRow label="Fianchi (cm)" value={m.hips ? `${m.hips} cm` : '—'} />
              <InfoRow label="Scarpa (n.)" value={m.shoeSize ? `${m.shoeSize}` : '—'} />
              
              {m.lastMeasuredAt && (
                <InfoRow
                  label="Ultimo Rilevamento"
                  value={format(m.lastMeasuredAt.toDate(), 'dd/MM/yyyy')}
                />
              )}

              <div>
                <p className="text-xs text-white/40 mb-0.5">Taglia Suggerita (Auto)</p>
                <Badge variant={computedSize !== '—' ? 'success' : 'gray'} size="sm">
                  {computedSize}
                </Badge>
              </div>
            </div>

            {m.notes && (
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <p className="text-xs text-white/40 mb-1">Note Sartoria</p>
                <p className="text-sm text-white/80">{m.notes}</p>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Modal: Costume Measurements ─────────────────────────────────────────────
interface CostumeModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  onSave: (m: CostumeMeasurements) => Promise<void>;
}

function CostumeModal({ isOpen, onClose, student, onSave }: CostumeModalProps) {
  const m = student.costumes;

  const [height, setHeight] = useState(m?.height?.toString() || '');
  const [weight, setWeight] = useState(m?.weight?.toString() || '');
  const [chest, setChest] = useState(m?.chest?.toString() || '');
  const [waist, setWaist] = useState(m?.waist?.toString() || '');
  const [hips, setHips] = useState(m?.hips?.toString() || '');
  const [shoeSize, setShoeSize] = useState(m?.shoeSize?.toString() || '');
  const [notes, setNotes] = useState(m?.notes || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const data: CostumeMeasurements = {
        height: height ? Number(height) : undefined,
        weight: weight ? Number(weight) : undefined,
        chest: chest ? Number(chest) : undefined,
        waist: waist ? Number(waist) : undefined,
        hips: hips ? Number(hips) : undefined,
        shoeSize: shoeSize ? Number(shoeSize) : undefined,
        notes: notes.trim() || undefined,
        lastMeasuredAt: nowTimestamp(),
      };
      await onSave(data);
    } catch (err) {
      console.error('[CostumeModal] Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Aggiorna Misure Corporee"
      description={`Inserisci le misure per ${student.firstName} ${student.lastName} per il calcolo delle taglie.`}
    >
      <div className="space-y-4 py-2">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Altezza (cm)"
            type="number"
            placeholder="es. 165"
            value={height}
            onChange={(e: any) => setHeight(e.target.value)}
          />
          <Input
            label="Peso (kg)"
            type="number"
            placeholder="es. 55"
            value={weight}
            onChange={(e: any) => setWeight(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Seno (cm)"
            type="number"
            placeholder="es. 88"
            value={chest}
            onChange={(e: any) => setChest(e.target.value)}
          />
          <Input
            label="Vita (cm)"
            type="number"
            placeholder="es. 68"
            value={waist}
            onChange={(e: any) => setWaist(e.target.value)}
          />
          <Input
            label="Fianchi (cm)"
            type="number"
            placeholder="es. 92"
            value={hips}
            onChange={(e: any) => setHips(e.target.value)}
          />
        </div>

        <Input
          label="Taglia Scarpa"
          type="number"
          placeholder="es. 38"
          value={shoeSize}
          onChange={(e: any) => setShoeSize(e.target.value)}
        />

        <Textarea
          label="Note Sartoriali Speciali"
          placeholder="Es. maniche più lunghe, allacciatura facilitata, spalle strette..."
          value={notes}
          onChange={(e: any) => setNotes(e.target.value)}
        />
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Annulla</Button>
        <Button onClick={handleSubmit} loading={saving}>
          Salva Misure
        </Button>
      </ModalFooter>
    </Modal>
  );
}