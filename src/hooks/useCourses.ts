import { useEffect } from 'react';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  query,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { courseConverter, COLLECTIONS, nowTimestamp, removeUndefined } from '@/lib/converters';
import { useSchoolStore } from '@/stores/schoolStore';
import { useAuthStore } from '@/stores/authStore';
import type { Course } from '@/types';
import toast from 'react-hot-toast';

export function useCourses() {
  const user = useAuthStore((s) => s.user);
  const schoolId = user?.schoolId;

  const {
    courses,
    setCourses,
    setLoadingCourses,
  } = useSchoolStore();

  // ─── Real-time Subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!schoolId) {
      setCourses([]);
      return;
    }

    setLoadingCourses(true);

    const q = query(
      collection(db, COLLECTIONS.courses(schoolId)).withConverter(courseConverter)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs
          .map((d) => d.data())
          .filter((c) => c.isDeleted !== true);
        // Sort by name
        fetched.sort((a, b) => a.name.localeCompare(b.name, 'it'));
        setCourses(fetched);
      },
      (error) => {
        console.error('[useCourses] onSnapshot error:', error);
        toast.error('Errore durante la sincronizzazione dei corsi.');
        setLoadingCourses(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [schoolId, setCourses, setLoadingCourses]);

  // ─── Create Course ──────────────────────────────────────────────────────────
  async function createCourse(data: Omit<Course, 'id' | 'schoolId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'enrolledCount'>) {
    if (!schoolId) throw new Error('Not authenticated to a school');
    try {
      const courseRef = doc(collection(db, COLLECTIONS.courses(schoolId))).withConverter(courseConverter);
      
      const newCourse: Course = {
        ...data,
        id: courseRef.id,
        schoolId,
        enrolledCount: 0,
        isDeleted: false,
        createdAt: nowTimestamp(),
        updatedAt: nowTimestamp(),
      };

      await setDoc(courseRef, newCourse);
      toast.success('Corso creato con successo!');
      return newCourse;
    } catch (err) {
      console.error('[useCourses] create error:', err);
      toast.error('Errore durante la creazione del corso.');
      throw err;
    }
  }

  // ─── Edit Course ────────────────────────────────────────────────────────────
  async function editCourse(courseId: string, updates: Partial<Course>) {
    if (!schoolId) throw new Error('Not authenticated to a school');
    try {
      const ref = doc(db, COLLECTIONS.courses(schoolId), courseId).withConverter(courseConverter);
      const finalUpdates = {
        ...updates,
        updatedAt: nowTimestamp(),
      };

      await updateDoc(ref, removeUndefined(finalUpdates));
      toast.success('Dati corso aggiornati!');
    } catch (err) {
      console.error('[useCourses] edit error:', err);
      toast.error('Impossibile aggiornare i dati del corso.');
      throw err;
    }
  }

  // ─── Delete (Soft Delete) Course ──────────────────────────────────────────
  async function deleteCourse(courseId: string) {
    if (!schoolId) throw new Error('Not authenticated to a school');
    try {
      const ref = doc(db, COLLECTIONS.courses(schoolId), courseId).withConverter(courseConverter);
      const updates = {
        isDeleted: true,
        deletedAt: nowTimestamp(),
        updatedAt: nowTimestamp(),
        isActive: false,
      };

      await updateDoc(ref, removeUndefined(updates));
      toast.success('Corso eliminato con successo.');
    } catch (err) {
      console.error('[useCourses] delete error:', err);
      toast.error('Impossibile eliminare il corso.');
      throw err;
    }
  }

  return {
    courses,
    createCourse,
    editCourse,
    deleteCourse,
  };
}
