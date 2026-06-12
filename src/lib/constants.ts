// ─── App Constants ────────────────────────────────────────────────
export const APP_NAME = 'DanceFlow' as const;
export const APP_VERSION = '1.0.0' as const;

// Feature flags
export const STORAGE_ENABLED = true as const;

// Firestore region
export const FIRESTORE_REGION = 'europe-west' as const;

// Pagination
export const PAGE_SIZE = 20 as const;

// Roles
export const ROLES = ['superadmin', 'admin', 'teacher', 'parent', 'owner'] as const;
export type Role = (typeof ROLES)[number];

// Payment status
export const PAYMENT_STATUSES = ['pending', 'paid', 'overdue', 'cancelled'] as const;

// Attendance status
export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'justified'] as const;

// Course days
export const DAYS_IT = [
  'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì',
  'Venerdì', 'Sabato', 'Domenica',
] as const;

// Dance styles
export const DANCE_STYLES = [
  'Danza Classica', 'Danza Moderna', 'Hip Hop', 'Contemporanea',
  'Latino-Americano', 'Balli di Sala', 'Flamenco', 'Jazz', 'Acrobatica',
  'Break Dance', 'Pole Dance', 'Tap', 'Musical', 'Altro',
] as const;

export const PLAN_LIMITS = {
  free: 20,
  light: 80,
  growth: 200,
  unlimited: Infinity
} as const;

