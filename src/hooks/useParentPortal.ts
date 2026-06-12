import { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot, getDocs, doc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import {
  COLLECTIONS, studentConverter, courseConverter,
  paymentConverter, attendanceConverter, notificationConverter, schoolConverter, nowTimestamp
} from '@/lib/converters';
import type { Student, Course, Payment, AttendanceRecord, Notification, School } from '@/types';
import toast from 'react-hot-toast';

export function useParentPortal() {
  const user = useAuthStore((s) => s.user);
  const parentId = user?.uid;
  const schoolId = user?.schoolId;

  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [school, setSchool] = useState<School | null>(null);

  // 1. Sottoscrizione ai figli legati a questo genitore in tempo reale
  useEffect(() => {
    if (!parentId || !schoolId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, COLLECTIONS.students(schoolId)).withConverter(studentConverter),
      where('parentId', '==', parentId)
    );

    const unsubStudents = onSnapshot(q, (snap) => {
      const fetchedChildren = snap.docs
        .map((d) => d.data())
        .filter((s) => s.isDeleted !== true);
      setChildren(fetchedChildren);

      if (fetchedChildren.length === 0) {
        setLoading(false);
      }
    }, (err) => {
      console.error('[useParentPortal] Fetch children error:', err);
      toast.error('Errore nel caricamento dei dati degli allievi.');
      setLoading(false);
    });

    return () => unsubStudents();
  }, [parentId, schoolId]);

  // 2. Sottoscrizione alle informazioni relative ai figli (corsi, pagamenti, presenze, notifiche, scuola)
  useEffect(() => {
    if (!parentId || !schoolId || children.length === 0) {
      setCourses([]);
      setPayments([]);
      setAttendance([]);
      return;
    }

    let active = true;
    setLoading(true);

    const childIds = children.map((c) => c.id);
    const allCourseIds = Array.from(
      new Set(children.flatMap((c) => c.enrolledCourseIds || []))
    );

    // Carica i Corsi relativi ai figli (una tantum per evitare sottoscrizioni eccessive)
    if (allCourseIds.length > 0) {
      const coursesQuery = query(
        collection(db, COLLECTIONS.courses(schoolId)).withConverter(courseConverter)
      );
      getDocs(coursesQuery).then((coursesSnap) => {
        if (!active) return;
        const allCourses = coursesSnap.docs
          .map((d) => d.data())
          .filter((c) => c.isDeleted !== true);
        setCourses(allCourses.filter((c) => allCourseIds.includes(c.id)));
      }).catch((err) => {
        console.error('[useParentPortal] Fetch courses error:', err);
      });
    } else {
      setCourses([]);
    }

    // Sottoscrizione ai Pagamenti real-time per i figli
    const paymentsQuery = query(
      collection(db, COLLECTIONS.payments(schoolId)).withConverter(paymentConverter),
      where('studentId', 'in', childIds)
    );
    const unsubPayments = onSnapshot(paymentsQuery, (pSnap) => {
      if (!active) return;
      const fetchedPayments = pSnap.docs.map((d) => d.data());
      fetchedPayments.sort((a, b) => b.dueDate.toMillis() - a.dueDate.toMillis());
      setPayments(fetchedPayments);
    }, (err) => {
      console.error('[useParentPortal] Payments sync error:', err);
    });

    // Sottoscrizione alle Presenze per i figli
    const attQuery = query(
      collection(db, COLLECTIONS.attendance(schoolId)).withConverter(attendanceConverter),
      where('studentId', 'in', childIds)
    );
    const unsubAtt = onSnapshot(attQuery, (aSnap) => {
      if (!active) return;
      const fetchedAtt = aSnap.docs.map((d) => d.data());
      setAttendance(fetchedAtt);
      setLoading(false);
    }, (err) => {
      console.error('[useParentPortal] Attendance sync error:', err);
      setLoading(false);
    });

    // Sottoscrizione alle Notifiche del genitore
    const notifQuery = query(
      collection(db, COLLECTIONS.notifications(parentId)).withConverter(notificationConverter)
    );
    const unsubNotif = onSnapshot(notifQuery, (nSnap) => {
      if (!active) return;
      const fetchedNotif = nSnap.docs.map((d) => d.data());
      fetchedNotif.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
      setNotifications(fetchedNotif);
    }, (err) => {
      console.error('[useParentPortal] Notifications sync error:', err);
    });

    // Sottoscrizione ai dati della scuola
    const schoolRef = doc(db, 'schools', schoolId).withConverter(schoolConverter);
    const unsubSchool = onSnapshot(schoolRef, (snap) => {
      if (!active) return;
      if (snap.exists()) {
        setSchool(snap.data());
      }
    }, (err) => {
      console.error('[useParentPortal] School sync error:', err);
    });

    return () => {
      active = false;
      unsubPayments();
      unsubAtt();
      unsubNotif();
      unsubSchool();
    };
  }, [parentId, schoolId, children]);

  const markNotificationAsRead = async (id: string) => {
    if (!parentId) return;
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(db, COLLECTIONS.notifications(parentId), id), {
        isRead: true,
        updatedAt: nowTimestamp(),
      });
    } catch (err) {
      console.error('[useParentPortal] Mark read failed:', err);
    }
  };

  return {
    loading,
    children,
    courses,
    payments,
    attendance,
    notifications,
    school,
    markNotificationAsRead,
  };
}
