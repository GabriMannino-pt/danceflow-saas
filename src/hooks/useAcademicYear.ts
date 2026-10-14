import { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, doc, writeBatch, getDocs, query, where } from 'firebase/firestore';
import { COLLECTIONS, nowTimestamp, studentConverter, courseConverter, paymentConverter } from '@/lib/converters';
import { useSchoolStore } from '@/stores/schoolStore';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

export function useAcademicYear() {
  const [transitioning, setTransitioning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const user = useAuthStore((s) => s.user);
  const schoolId = user?.schoolId;
  const { setStudents, setCourses } = useSchoolStore();

  async function performAcademicYearTransition(nextAcademicYear: string) {
    if (!schoolId) throw new Error('Operazione non consentita: ID scuola mancante.');
    setTransitioning(true);
    setProgress({ current: 0, total: 0 });

    try {
      // 1. Fetch all students for this school (not deleted)
      const studentsSnap = await getDocs(
        query(
          collection(db, COLLECTIONS.students(schoolId)).withConverter(studentConverter),
          where('isDeleted', '==', false)
        )
      );
      const allStudents = studentsSnap.docs.map((d) => d.data());

      // 2. Fetch all courses for this school (not deleted)
      const coursesSnap = await getDocs(
        query(
          collection(db, COLLECTIONS.courses(schoolId)).withConverter(courseConverter),
          where('isDeleted', '==', false)
        )
      );
      const allCourses = coursesSnap.docs.map((d) => d.data());

      // 3. Fetch all payments for this school to calculate totalPaid per student
      const paymentsSnap = await getDocs(
        collection(db, COLLECTIONS.payments(schoolId)).withConverter(paymentConverter)
      );
      const allPayments = paymentsSnap.docs.map((d) => d.data());

      // Filter active students and active, non-archived courses
      const activeStudents = allStudents.filter((s) => s.isActive);
      const activeCourses = allCourses.filter((c) => c.isActive && !c.archived);

      const totalOperations = activeStudents.length + activeCourses.length;
      setProgress({ current: 0, total: totalOperations });

      const BATCH_SIZE = 400;
      let batch = writeBatch(db);
      let opCount = 0;
      let currentProgress = 0;

      // Helper to commit and reset batch
      const commitBatchIfNeeded = async (force = false) => {
        if (opCount >= BATCH_SIZE || (force && opCount > 0)) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      };

      // A. Process active students
      for (const student of activeStudents) {
        // Calculate totalPaid: sum of non-cancelled payments for this student
        const studentPayments = allPayments.filter(
          (p) => p.studentId === student.id && p.status !== 'cancelled'
        );
        const totalPaid = studentPayments.reduce((acc, p) => {
          const paidVal = p.paidAmount ?? (p.status === 'paid' ? (p.totalAmount ?? p.amount) : 0);
          return acc + paidVal;
        }, 0);

        // Get names of courses enrolled in
        const enrolledCourses = allCourses
          .filter((c) => student.enrolledCourseIds?.includes(c.id))
          .map((c) => c.name);

        // Find closing academic year from the student's enrolled courses or fallback
        let closingYear = 'N/D';
        if (student.enrolledCourseIds && student.enrolledCourseIds.length > 0) {
          const firstCourseId = student.enrolledCourseIds[0];
          const course = allCourses.find((c) => c.id === firstCourseId);
          if (course?.academicYear) {
            closingYear = course.academicYear;
          }
        }
        if (closingYear === 'N/D') {
          const now = new Date();
          const yr = now.getFullYear();
          closingYear = now.getMonth() >= 8 ? `${yr - 1}/${yr}` : `${yr - 1}/${yr}`;
        }

        const newHistoryItem = {
          academicYear: closingYear,
          courses: enrolledCourses,
          totalPaid,
        };

        const updatedHistory = [...(student.enrollmentHistory || []), newHistoryItem];

        const studentDocRef = doc(db, COLLECTIONS.students(schoolId), student.id).withConverter(studentConverter);
        
        batch.update(studentDocRef, {
          enrolledCourseIds: [],
          status: 'toRenew',
          enrollmentHistory: updatedHistory,
          updatedAt: nowTimestamp(),
        });

        opCount++;
        currentProgress++;
        setProgress((p) => ({ ...p, current: currentProgress }));
        await commitBatchIfNeeded();
      }

      // B. Process active courses
      for (const course of activeCourses) {
        const courseDocRef = doc(db, COLLECTIONS.courses(schoolId), course.id).withConverter(courseConverter);
        
        batch.update(courseDocRef, {
          archived: true,
          isActive: false,
          updatedAt: nowTimestamp(),
        });

        opCount++;
        currentProgress++;
        setProgress((p) => ({ ...p, current: currentProgress }));
        await commitBatchIfNeeded();
      }

      // Final commit
      await commitBatchIfNeeded(true);

      // 4. Force refresh local states in Zustand stores
      const updatedStudents = allStudents.map((s) => {
        if (s.isActive) {
          // Calculate historical details matching loop above
          const studentPayments = allPayments.filter(
            (p) => p.studentId === s.id && p.status !== 'cancelled'
          );
          const totalPaid = studentPayments.reduce((acc, p) => {
            const paidVal = p.paidAmount ?? (p.status === 'paid' ? (p.totalAmount ?? p.amount) : 0);
            return acc + paidVal;
          }, 0);

          const enrolledCourses = allCourses
            .filter((c) => s.enrolledCourseIds?.includes(c.id))
            .map((c) => c.name);

          let closingYear = 'N/D';
          if (s.enrolledCourseIds && s.enrolledCourseIds.length > 0) {
            const firstCourseId = s.enrolledCourseIds[0];
            const course = allCourses.find((c) => c.id === firstCourseId);
            if (course?.academicYear) {
              closingYear = course.academicYear;
            }
          }
          if (closingYear === 'N/D') {
            const now = new Date();
            const yr = now.getFullYear();
            closingYear = now.getMonth() >= 8 ? `${yr - 1}/${yr}` : `${yr - 1}/${yr}`;
          }

          const newHistoryItem = {
            academicYear: closingYear,
            courses: enrolledCourses,
            totalPaid,
          };

          return {
            ...s,
            enrolledCourseIds: [],
            status: 'toRenew' as const,
            enrollmentHistory: [...(s.enrollmentHistory || []), newHistoryItem],
          };
        }
        return s;
      });

      const updatedCourses = allCourses.map((c) => {
        if (c.isActive && !c.archived) {
          return {
            ...c,
            archived: true,
            isActive: false,
          };
        }
        return c;
      });

      setStudents(updatedStudents);
      setCourses(updatedCourses);

      toast.success('Passaggio all\'anno accademico ' + nextAcademicYear + ' completato con successo!');
    } catch (error: any) {
      console.error('[useAcademicYear] Error during transition:', error);
      toast.error(error.message || 'Errore critico durante la chiusura dell\'anno.');
      throw error;
    } finally {
      setTransitioning(false);
    }
  }

  return {
    transitioning,
    progress,
    performAcademicYearTransition,
  };
}
