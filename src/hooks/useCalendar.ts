import { useState, useEffect, useMemo } from 'react';
import {
  collection, doc, query, where, onSnapshot,
  updateDoc, setDoc, Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { useSchoolStore } from '@/stores/schoolStore';
import { COLLECTIONS, sessionConverter, eventConverter, nowTimestamp } from '@/lib/converters';
import type { CourseSession, Event } from '@/types';
import toast from 'react-hot-toast';
import { isSameDay, format } from 'date-fns';

export function useCalendar(startOfMonthDate: Date, endOfMonthDate: Date) {
  const user = useAuthStore((s) => s.user);
  const schoolId = user?.schoolId;

  const allCourses = useSchoolStore((s) => s.courses);
  const courses = useMemo(() =>
    allCourses.filter((c) => c.isActive && !c.isDeleted),
    [allCourses]
  );

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<CourseSession[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const startTs = Timestamp.fromDate(startOfMonthDate);
    const endTs = Timestamp.fromDate(endOfMonthDate);

    // 1. Sottoscrizione alle sessioni di lezione nel mese
    const sessionsQuery = query(
      collection(db, COLLECTIONS.sessions(schoolId)).withConverter(sessionConverter),
      where('date', '>=', startTs),
      where('date', '<=', endTs)
    );

    const unsubSessions = onSnapshot(sessionsQuery, (snap) => {
      const fetched = snap.docs.map((d) => d.data());
      setSessions(fetched);
    }, (err) => {
      console.error('[useCalendar] Fetch sessions error:', err);
      toast.error('Errore nel caricamento delle lezioni.');
    });

    // 2. Sottoscrizione agli eventi nel mese
    const eventsQuery = query(
      collection(db, COLLECTIONS.events(schoolId)).withConverter(eventConverter),
      where('startDate', '>=', startTs),
      where('startDate', '<=', endTs)
    );

    const unsubEvents = onSnapshot(eventsQuery, (snap) => {
      const fetched = snap.docs
        .map((d) => d.data())
        .filter((e) => e.isDeleted !== true);
      setEvents(fetched);
      setLoading(false);
    }, (err) => {
      console.error('[useCalendar] Fetch events error:', err);
      toast.error('Errore nel caricamento degli eventi.');
      setLoading(false);
    });

    return () => {
      unsubSessions();
      unsubEvents();
    };
  }, [schoolId, startOfMonthDate.getTime(), endOfMonthDate.getTime()]);

  // Genera dinamicamente le sessioni per i corsi con schedule attivo che non hanno ancora una sessione in Firestore
  const combinedSessions = useMemo(() => {
    if (!schoolId) return sessions;

    const dynamicSessions: CourseSession[] = [];
    const currentDate = new Date(startOfMonthDate);

    while (currentDate <= endOfMonthDate) {
      const dayOfWeek = currentDate.getDay(); // 0 = Sun, 1 = Mon...
      
      courses.forEach((course) => {
        course.schedule?.forEach((sch) => {
          if (sch.dayOfWeek === dayOfWeek) {
            // Verifica se la data ricade nel range dello schedule (se specificato)
            if (sch.startDate && currentDate < sch.startDate.toDate()) return;
            if (sch.endDate && currentDate > sch.endDate.toDate()) return;

            // Verifica se esiste già una sessione in Firestore per lo stesso corso e giorno
            const hasFirestore = sessions.some(
              (fs) => fs.courseId === course.id && isSameDay(fs.date.toDate(), currentDate)
            );

            if (!hasFirestore) {
              const dateCopy = new Date(currentDate);
              const dateStr = format(dateCopy, 'yyyyMMdd');
              dynamicSessions.push({
                id: `dynamic-${course.id}-${dateStr}`,
                schoolId,
                courseId: course.id,
                date: Timestamp.fromDate(dateCopy),
                startTime: sch.startTime,
                endTime: sch.endTime,
                teacherId: course.teacherIds[0] || '',
                room: course.room || 'Sala principale',
                status: 'scheduled',
                attendanceRecorded: false,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
              });
            }
          }
        });
      });

      // Passa al giorno successivo
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return [...sessions, ...dynamicSessions];
  }, [sessions, courses, startOfMonthDate, endOfMonthDate, schoolId]);

  // Modifica lo stato di una sessione di lezione (es. cancella, cambia orari, assegna supplente)
  async function updateSession(
    sessionId: string,
    updates: Partial<Omit<CourseSession, 'id' | 'schoolId' | 'createdAt' | 'updatedAt'>>
  ) {
    if (!schoolId) return;

    try {
      const sessionRef = doc(db, COLLECTIONS.sessions(schoolId), sessionId).withConverter(sessionConverter);
      
      if (sessionId.startsWith('dynamic-')) {
        // Se la sessione è dinamica, ricreiamo il record completo e lo salviamo su Firestore con setDoc
        const parts = sessionId.split('-');
        const courseId = parts[1];
        const dateStr = parts[2]; // yyyyMMdd
        
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));
        const sessionDate = new Date(year, month, day);

        const course = courses.find((c) => c.id === courseId);
        const sch = course?.schedule.find((s) => s.dayOfWeek === sessionDate.getDay());

        const newSession: CourseSession = {
          id: sessionId,
          schoolId,
          courseId,
          date: Timestamp.fromDate(sessionDate),
          startTime: updates.startTime || sch?.startTime || '09:00',
          endTime: updates.endTime || sch?.endTime || '10:00',
          teacherId: updates.teacherId || course?.teacherIds[0] || '',
          room: updates.room || course?.room || 'Sala principale',
          status: updates.status || 'scheduled',
          cancelReason: updates.cancelReason || undefined,
          substituteTeacherId: updates.substituteTeacherId || undefined,
          notes: updates.notes || undefined,
          attendanceRecorded: updates.attendanceRecorded || false,
          createdAt: nowTimestamp(),
          updatedAt: nowTimestamp(),
        };

        await setDoc(sessionRef, newSession);
      } else {
        await updateDoc(sessionRef, {
          ...updates,
          updatedAt: nowTimestamp(),
        });
      }
      toast.success('Lezione aggiornata con successo.');
    } catch (err) {
      console.error('[useCalendar] Update session error:', err);
      toast.error('Impossibile aggiornare la lezione.');
      throw err;
    }
  }

  return {
    loading,
    sessions: combinedSessions,
    events,
    updateSession,
  };
}
