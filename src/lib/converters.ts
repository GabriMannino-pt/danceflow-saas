import {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  WithFieldValue,
  DocumentData,
  Timestamp,
} from 'firebase/firestore';
import type {
  AppUser, School, Student, Course, CourseSession,
  AttendanceRecord, Payment, Event, CostumeOrder, Message, Notification,
} from '@/types';

// ─── Generic Converter Factory ────────────────────────────────────────────────
export function removeUndefined(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefined(item));
  } else if (obj !== null && typeof obj === 'object') {
    // Prevent stripping fields on special Firebase/native classes like Timestamp
    if (obj.constructor && obj.constructor.name !== 'Object') {
      return obj;
    }
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefined(v)])
    );
  }
  return obj;
}

function createConverter<T extends { id: string }>(): FirestoreDataConverter<T> {
  return {
    toFirestore(data: WithFieldValue<T>): DocumentData {
      const { id: _id, ...rest } = data as T & { id: string };
      void _id;
      return removeUndefined(rest) as DocumentData;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): T {
      const data = snapshot.data(options);
      return { id: snapshot.id, ...data } as T;
    },
  };
}

// ─── Typed Converters ─────────────────────────────────────────────────────────
export const userConverter          = createConverter<AppUser>();
export const schoolConverter        = createConverter<School>();
export const studentConverter       = createConverter<Student>();
export const courseConverter        = createConverter<Course>();
export const sessionConverter       = createConverter<CourseSession>();
export const attendanceConverter    = createConverter<AttendanceRecord>();
export const paymentConverter       = createConverter<Payment>();
export const eventConverter         = createConverter<Event>();
export const costumeOrderConverter  = createConverter<CostumeOrder>();
export const messageConverter       = createConverter<Message>();
export const notificationConverter  = createConverter<Notification>();

// ─── Firestore Collection Paths ───────────────────────────────────────────────
export const COLLECTIONS = {
  users:       'users',
  schools:     'schools',
  students:    (schoolId: string) => `schools/${schoolId}/students`,
  courses:     (schoolId: string) => `schools/${schoolId}/courses`,
  sessions:    (schoolId: string) => `schools/${schoolId}/sessions`,
  attendance:  (schoolId: string) => `schools/${schoolId}/attendance`,
  payments:    (schoolId: string) => `schools/${schoolId}/payments`,
  events:      (schoolId: string) => `schools/${schoolId}/events`,
  costumes:    (schoolId: string) => `schools/${schoolId}/costumeOrders`,
  messages:    (schoolId: string) => `schools/${schoolId}/messages`,
  notifications: (userId: string) => `users/${userId}/notifications`,
} as const;

// ─── Timestamp Helpers ────────────────────────────────────────────────────────
export function toTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(date);
}

export function fromTimestamp(ts: Timestamp): Date {
  return ts.toDate();
}

export function nowTimestamp(): Timestamp {
  return Timestamp.now();
}
