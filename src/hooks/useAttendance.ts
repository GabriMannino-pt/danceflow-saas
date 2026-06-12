import { useState, useEffect } from 'react';
import {
  collection, doc, query, where, onSnapshot,
  setDoc, updateDoc, writeBatch, Timestamp, deleteDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { useSchoolStore } from '@/stores/schoolStore';
import { COLLECTIONS, attendanceConverter, sessionConverter, nowTimestamp } from '@/lib/converters';
import type { AttendanceRecord, CourseSession, AttendanceStatus } from '@/types';
import toast from 'react-hot-toast';

export function useAttendance(courseId?: string, dateStr?: string) {
  const user = useAuthStore((s) => s.user);
  const schoolId = user?.schoolId;
  const students = useSchoolStore((s) => s.students);

  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<CourseSession | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);

  // Sottoscrizione real-time ai record di presenza e alla sessione se configurati
  useEffect(() => {
    if (!schoolId || !courseId || !dateStr) {
      setSession(null);
      setRecords([]);
      return;
    }

    setLoading(true);
    const targetDate = new Date(dateStr);
    targetDate.setHours(0, 0, 0, 0);
    const startTs = Timestamp.fromDate(targetDate);
    const endTs = Timestamp.fromDate(new Date(targetDate.getTime() + 24 * 60 * 60 * 1000 - 1));

    // 1. Cerca la sessione per questo corso in questa data
    const sessionQuery = query(
      collection(db, COLLECTIONS.sessions(schoolId)).withConverter(sessionConverter),
      where('date', '>=', startTs),
      where('date', '<=', endTs)
    );

    const unsubSession = onSnapshot(sessionQuery, async (snap) => {
      const match = snap.docs.find((d) => d.data().courseId === courseId);
      if (!match) {
        // Se non esiste una sessione, ne creiamo una al volo (auto-inizializzazione per la data selezionata)
        try {
          const sessionRef = doc(collection(db, COLLECTIONS.sessions(schoolId))).withConverter(sessionConverter);
          const newSession: CourseSession = {
            id: sessionRef.id,
            schoolId,
            courseId,
            date: startTs,
            startTime: '00:00', // Modificabile
            endTime: '00:00',
            teacherId: user?.uid || '',
            status: 'scheduled',
            attendanceRecorded: false,
            createdAt: nowTimestamp(),
            updatedAt: nowTimestamp(),
          };
          await setDoc(sessionRef, newSession);
          setSession(newSession);
        } catch (err) {
          console.error('[useAttendance] Auto-session creation failed:', err);
        }
      } else {
        setSession(match.data());
      }
    });

    // 2. Sottoscrizione alle presenze registrate per questo corso e data
    const attQuery = query(
      collection(db, COLLECTIONS.attendance(schoolId)).withConverter(attendanceConverter),
      where('date', '>=', startTs),
      where('date', '<=', endTs)
    );

    const unsubAtt = onSnapshot(attQuery, (snap) => {
      const fetched = snap.docs
        .map((d) => d.data())
        .filter((r) => r.courseId === courseId);
      setRecords(fetched);
      setLoading(false);
    }, (error) => {
      console.error('[useAttendance] Attendance fetch error:', error);
      toast.error('Errore nel caricamento delle presenze.');
      setLoading(false);
    });

    return () => {
      unsubSession();
      unsubAtt();
    };
  }, [schoolId, courseId, dateStr, user?.uid]);

  // ─── Salva o Aggiorna Singola Presenza ───────────────────────────────────────
  async function updateStudentAttendance(
    studentId: string,
    status: AttendanceStatus,
    arrivalMinutes?: number,
    justification?: string
  ) {
    if (!schoolId || !courseId || !dateStr || !session) {
      toast.error('Sessione non valida o non inizializzata.');
      return;
    }

    try {
      const existingRecord = records.find((r) => r.studentId === studentId);
      const targetDate = new Date(dateStr);
      targetDate.setHours(0, 0, 0, 0);

      const attCol = collection(db, COLLECTIONS.attendance(schoolId)).withConverter(attendanceConverter);

      if (existingRecord) {
        const docRef = doc(db, COLLECTIONS.attendance(schoolId), existingRecord.id).withConverter(attendanceConverter);
        await updateDoc(docRef, {
          status,
          arrivalMinutes: status === 'late' ? (arrivalMinutes ?? 0) : null,
          justification: status === 'justified' ? (justification ?? '') : null,
          recordedBy: user?.uid || '',
          updatedAt: nowTimestamp(),
        });
      } else {
        const newDocRef = doc(attCol);
        const newRecord: AttendanceRecord = {
          id: newDocRef.id,
          schoolId,
          sessionId: session.id,
          courseId,
          studentId,
          date: Timestamp.fromDate(targetDate),
          status,
          arrivalMinutes: status === 'late' ? (arrivalMinutes ?? 0) : undefined,
          justification: status === 'justified' ? (justification ?? '') : undefined,
          recordedBy: user?.uid || '',
          createdAt: nowTimestamp(),
          updatedAt: nowTimestamp(),
        };
        await setDoc(newDocRef, newRecord);
      }

      // Aggiorna anche la sessione segnandola come completata/registrata se non lo era
      if (!session.attendanceRecorded) {
        const sessionRef = doc(db, COLLECTIONS.sessions(schoolId), session.id).withConverter(sessionConverter);
        await updateDoc(sessionRef, {
          attendanceRecorded: true,
          status: 'completed',
          updatedAt: nowTimestamp(),
        });
      }

    } catch (err) {
      console.error('[useAttendance] update error:', err);
      toast.error('Impossibile salvare la presenza.');
      throw err;
    }
  }

  // ─── Salva Presenze in Batch (Es. Segna tutti presenti) ─────────────────────
  async function markAllAs(status: AttendanceStatus) {
    if (!schoolId || !courseId || !dateStr || !session) return;

    setLoading(true);
    try {
      const batch = writeBatch(db);
      const targetDate = new Date(dateStr);
      targetDate.setHours(0, 0, 0, 0);

      const enrolledStudents = students.filter(
        (s) => s.enrolledCourseIds?.includes(courseId) && s.isActive && !s.isDeleted
      );

      const attCol = collection(db, COLLECTIONS.attendance(schoolId)).withConverter(attendanceConverter);

      for (const student of enrolledStudents) {
        const existing = records.find((r) => r.studentId === student.id);
        if (existing) {
          const docRef = doc(db, COLLECTIONS.attendance(schoolId), existing.id).withConverter(attendanceConverter);
          batch.update(docRef, {
            status,
            recordedBy: user?.uid || '',
            updatedAt: nowTimestamp(),
          });
        } else {
          const newDocRef = doc(attCol);
          const newRecord: AttendanceRecord = {
            id: newDocRef.id,
            schoolId,
            sessionId: session.id,
            courseId,
            studentId: student.id,
            date: Timestamp.fromDate(targetDate),
            status,
            recordedBy: user?.uid || '',
            createdAt: nowTimestamp(),
            updatedAt: nowTimestamp(),
          };
          batch.set(newDocRef, newRecord);
        }
      }

      // Aggiorna lo stato della sessione
      const sessionRef = doc(db, COLLECTIONS.sessions(schoolId), session.id).withConverter(sessionConverter);
      batch.update(sessionRef, {
        attendanceRecorded: true,
        status: 'completed',
        updatedAt: nowTimestamp(),
      });

      await batch.commit();
      toast.success('Stato presenze aggiornato per tutta la classe!');
    } catch (err) {
      console.error('[useAttendance] Batch update failed:', err);
      toast.error('Errore nel salvataggio in blocco delle presenze.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Elimina Singola Presenza (Reset) ───────────────────────────────────────
  async function deleteStudentAttendance(studentId: string) {
    if (!schoolId) throw new Error('Not authenticated');
    setLoading(true);
    try {
      const existing = records.find((r) => r.studentId === studentId);
      if (existing) {
        const docRef = doc(db, COLLECTIONS.attendance(schoolId), existing.id).withConverter(attendanceConverter);
        await deleteDoc(docRef);
        toast.success('Presenza eliminata con successo.');
      }
    } catch (err) {
      console.error('[useAttendance] Delete attendance record error:', err);
      toast.error('Errore durante l\'eliminazione della presenza.');
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    session,
    records,
    updateStudentAttendance,
    deleteStudentAttendance,
    markAllAs,
  };
}
