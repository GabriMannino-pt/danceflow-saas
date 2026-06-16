import type { Timestamp } from 'firebase/firestore';
import type { Role } from '@/lib/constants';

// ─── Shared ──────────────────────────────────────────────────────────────────

export interface TimestampFields {
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SoftDelete {
  deletedAt?: Timestamp;
  isDeleted?: boolean;
}

// ─── User & Auth ──────────────────────────────────────────────────────────────

export interface AppUser extends TimestampFields {
  id: string; // same as uid — required by Firestore converter
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: Role;
  schoolId?: string; // null for superadmin
  isActive: boolean;
  lastLoginAt?: Timestamp;
  fcmTokens?: string[];
  isSuperAdmin?: boolean;
}

// ─── School ───────────────────────────────────────────────────────────────────

export interface School extends TimestampFields, SoftDelete {
  id: string;
  name: string;
  slug: string;
  logoURL?: string;
  address?: Address;
  contact: SchoolContact;
  subscription: Subscription;
  settings: SchoolSettings;
  stats: SchoolStats;
  customPrivacyUrl?: string;
  customTermsUrl?: string;
  suspended?: boolean;
}

export interface Address {
  street: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

export interface SchoolContact {
  phone?: string;
  email?: string;
  website?: string;
  instagram?: string;
}

export interface Subscription {
  plan: 'trial' | 'starter' | 'pro' | 'enterprise';
  status: 'active' | 'expired' | 'cancelled';
  trialEndsAt?: Timestamp;
  currentPeriodEnd?: Timestamp;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

export interface SchoolSettings {
  currency: 'EUR' | 'USD' | 'GBP';
  timezone: string;
  academicYearStart: number; // month (1=Jan, 9=Sep)
  paymentDueDay: number; // day of month
  allowParentPortal: boolean;
  notificationsEnabled: boolean;
  whatsappEnabled: boolean;
  registrationQR?: {
    enabled: boolean;
    token: string;
  };
}

export interface SchoolStats {
  totalStudents: number;
  activeStudents: number;
  totalCourses: number;
  monthlyRevenue: number;
}

// ─── Student ──────────────────────────────────────────────────────────────────

export interface Student extends TimestampFields, SoftDelete {
  id: string;
  schoolId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Timestamp;
  fiscalCode?: string;
  gender: 'M' | 'F' | 'Other';
  photoURL?: string;
  address?: Address;
  contact: StudentContact;
  medicalInfo?: MedicalInfo;
  enrolledCourseIds: string[];
  documents: StudentDocument[];
  notes?: string;
  isActive: boolean;
  parentId?: string; // uid of parent user
  costumes?: CostumeMeasurements;
  customMonthlyFee?: number | null;
  customRegistrationFee?: number | null;
  customShowFee?: number | null;
  flatRateEnabled?: boolean;
  flatRateAmount?: number | null;
  signatureMetadata?: {
    ipAddress: string;
    timestamp: any;
    userAgent: string;
    sessionId: string;
    consents?: {
      privacyCommon: boolean;
      privacySanitary: boolean;
    };
  };
  sha256Hash?: string | null;
}


export interface StudentContact {
  studentPhone?: string;
  studentEmail?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  parentRelation?: 'madre' | 'padre' | 'tutore' | 'altro';
  emergencyContact?: string;
  emergencyPhone?: string;
}

export interface MedicalInfo {
  allergies?: string;
  conditions?: string;
  medications?: string;
  medicalClearance: boolean;
  medicalClearanceExpiry?: Timestamp;
}

export interface StudentDocument {
  id: string;
  name: string;
  type: 'identity' | 'medical' | 'consent' | 'insurance' | 'other';
  fileURL?: string; // only when STORAGE_ENABLED = true
  uploadedAt: Timestamp;
  notes?: string;
}

export interface CostumeMeasurements {
  chest?: number;
  waist?: number;
  hips?: number;
  height?: number;
  weight?: number;
  shoeSize?: number;
  notes?: string;
  lastMeasuredAt?: Timestamp;
}

// ─── Course ───────────────────────────────────────────────────────────────────

export interface Course extends TimestampFields, SoftDelete {
  id: string;
  schoolId: string;
  name: string;
  description?: string;
  style: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'professional' | 'all';
  teacherIds: string[];
  schedule: CourseSchedule[];
  room?: string;
  maxStudents?: number;
  enrolledCount: number;
  fee: CourseFee;
  colorHex: string; // display color
  isActive: boolean;
  academicYear: string; // e.g. "2024-2025"
}

export interface CourseSchedule {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sun, 1=Mon...
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  startDate?: Timestamp;
  endDate?: Timestamp;
}

export interface CourseFee {
  monthly?: number;
  annual?: number;
  perLesson?: number;
  registration?: number;
  currency: 'EUR' | 'USD' | 'GBP';
}

// ─── Session ──────────────────────────────────────────────────────────────────

export interface CourseSession extends TimestampFields {
  id: string;
  schoolId: string;
  courseId: string;
  date: Timestamp;
  startTime: string;
  endTime: string;
  teacherId: string;
  room?: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'postponed';
  cancelReason?: string;
  substituteTeacherId?: string;
  notes?: string;
  attendanceRecorded: boolean;
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'justified';

export interface AttendanceRecord extends TimestampFields {
  id: string;
  schoolId: string;
  sessionId: string;
  courseId: string;
  studentId: string;
  date: Timestamp;
  status: AttendanceStatus;
  arrivalMinutes?: number; // minutes late if status='late'
  justification?: string;
  recordedBy: string; // uid
}

// ─── Payment ──────────────────────────────────────────────────────────────────

export type PaymentStatus = 'pending' | 'deposit_paid' | 'paid' | 'overdue' | 'cancelled';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'stripe' | 'other';

export interface Payment extends TimestampFields {
  id: string;
  schoolId: string;
  studentId: string;
  courseId?: string;
  description: string;
  amount: number; // Kept for compatibility (equals totalAmount)
  totalAmount?: number;
  depositAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  currency: 'EUR' | 'USD' | 'GBP';
  status: PaymentStatus;
  dueDate: Timestamp;
  paidAt?: Timestamp;
  method?: PaymentMethod;
  receiptURL?: string;
  receiptNumber?: string;
  invoiceNumber?: string;
  stripePaymentIntentId?: string;
  notes?: string;
  type: 'monthly' | 'registration' | 'event' | 'costume' | 'other';
  month?: number; // 1-12 for monthly fees
  year?: number;
  payments?: Array<{
    amount: number;
    date: Timestamp;
    method: PaymentMethod;
    receiptEmitted: boolean;
    receiptUrl?: string;
    notes?: string;
  }>;
}

// ─── Event ────────────────────────────────────────────────────────────────────

export interface Event extends TimestampFields, SoftDelete {
  id: string;
  schoolId: string;
  name: string;
  description?: string;
  type: 'show' | 'competition' | 'workshop' | 'exam' | 'party' | 'other';
  startDate: Timestamp;
  endDate?: Timestamp;
  location?: string;
  fee?: number;
  maxParticipants?: number;
  participantIds: string[];
  courseIds?: string[]; // linked courses
  imageURL?: string;
  isPublic: boolean;
  status: 'draft' | 'published' | 'cancelled' | 'completed';
}

// ─── Costume ──────────────────────────────────────────────────────────────────

export interface CostumeOrder extends TimestampFields {
  id: string;
  schoolId: string;
  eventId?: string;
  name: string;
  description?: string;
  supplier?: string;
  items: CostumeItem[];
  status: 'draft' | 'ordered' | 'received' | 'distributed';
  totalCost?: number;
  notes?: string;
  orderPdfURL?: string;
}

export interface CostumeItem {
  studentId: string;
  description: string;
  size?: string;
  measurements?: CostumeMeasurements;
  quantity: number;
  unitCost?: number;
  color?: string;
}

// ─── Communication ────────────────────────────────────────────────────────────

export interface Message extends TimestampFields {
  id: string;
  schoolId: string;
  subject: string;
  body: string;
  authorId: string;
  recipientType: 'all' | 'course' | 'students' | 'parents';
  recipientIds?: string[];
  courseId?: string;
  channels: Array<'app' | 'email' | 'whatsapp'>;
  status: 'draft' | 'sent' | 'failed';
  sentAt?: Timestamp;
  readBy?: string[]; // uids
}

export interface Notification extends TimestampFields {
  id: string;
  userId: string;
  schoolId?: string;
  title: string;
  body: string;
  type: 'payment_due' | 'payment_reminder' | 'message' | 'event' | 'attendance' | 'system';
  isRead: boolean;
  actionUrl?: string;
  data?: Record<string, string | number | boolean>;
}

// ─── UI Helper Types ──────────────────────────────────────────────────────────

export interface SelectOption<T = string> {
  value: T;
  label: string;
  icon?: string;
  disabled?: boolean;
}

export interface TableColumn<T> {
  key: keyof T | string;
  header: string;
  sortable?: boolean;
  width?: string;
  render?: (value: unknown, row: T) => React.ReactNode;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

export interface KPI {
  label: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon: string;
  color: 'brand' | 'gold' | 'coral' | 'teal';
}
