// ─── App Constants ────────────────────────────────────────────────
export const APP_NAME = 'Tropical Style' as const;
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

// Dance styles specific to Tropical Style
export const DANCE_STYLES = [
  'Danza Classica',
  'Danza Moderna',
  'Danza Contemporanea',
  'Pilates',
  'Zumba',
  'Posturale',
  'Caraibico Coppia',
  'Reggaeton',
  'Lady Style',
  'Hip-Hop',
  'Avviamento Caraibico',
  'Altro...',
] as const;

// Dynamic Academic Year Generator
export function getAcademicYearOptions(startYear = 2023, futureOffset = 4) {
  const currentYear = new Date().getFullYear();
  const maxYear = Math.max(currentYear + futureOffset, 2030);
  const options: { value: string; label: string }[] = [];
  for (let y = startYear; y < maxYear; y++) {
    options.push({
      value: `${y}-${y + 1}`,
      label: `${y}/${y + 1}`,
    });
  }
  return options;
}

export function getCurrentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11, 7 is August, 8 is September
  if (month >= 7) {
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
}

export const PLAN_LIMITS = {
  free: 20,
  light: 80,
  growth: 200,
  unlimited: Infinity
} as const;

