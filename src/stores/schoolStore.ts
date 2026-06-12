import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { School, Student, Course, Payment } from '@/types';

interface SchoolState {
  activeSchool: School | null;
  students: Student[];
  courses: Course[];
  payments: Payment[];
  isLoadingStudents: boolean;
  isLoadingCourses: boolean;
  isLoadingPayments: boolean;
  studentsLastFetched: number | null;
  coursesLastFetched: number | null;

  // Actions
  setActiveSchool: (school: School | null) => void;
  setStudents: (students: Student[]) => void;
  setCourses: (courses: Course[]) => void;
  setPayments: (payments: Payment[]) => void;
  addStudent: (student: Student) => void;
  updateStudent: (id: string, updates: Partial<Student>) => void;
  removeStudent: (id: string) => void;
  addCourse: (course: Course) => void;
  updateCourse: (id: string, updates: Partial<Course>) => void;
  removeCourse: (id: string) => void;
  setLoadingStudents: (loading: boolean) => void;
  setLoadingCourses: (loading: boolean) => void;
  setLoadingPayments: (loading: boolean) => void;
  reset: () => void;
}

const initialState = {
  activeSchool: null,
  students: [],
  courses: [],
  payments: [],
  isLoadingStudents: false,
  isLoadingCourses: false,
  isLoadingPayments: false,
  studentsLastFetched: null,
  coursesLastFetched: null,
};

export const useSchoolStore = create<SchoolState>()(
  subscribeWithSelector((set) => ({
    ...initialState,

    setActiveSchool: (school) => set({ activeSchool: school }),

    setStudents: (students) =>
      set({ students, studentsLastFetched: Date.now(), isLoadingStudents: false }),

    setCourses: (courses) =>
      set({ courses, coursesLastFetched: Date.now(), isLoadingCourses: false }),

    setPayments: (payments) =>
      set({ payments, isLoadingPayments: false }),

    addStudent: (student) =>
      set((s) => ({ students: [...s.students, student] })),

    updateStudent: (id, updates) =>
      set((s) => ({
        students: s.students.map((st) =>
          st.id === id ? { ...st, ...updates } : st
        ),
      })),

    removeStudent: (id) =>
      set((s) => ({ students: s.students.filter((st) => st.id !== id) })),

    addCourse: (course) =>
      set((s) => ({ courses: [...s.courses, course] })),

    updateCourse: (id, updates) =>
      set((s) => ({
        courses: s.courses.map((c) => (c.id === id ? { ...c, ...updates } : c)),
      })),

    removeCourse: (id) =>
      set((s) => ({ courses: s.courses.filter((c) => c.id !== id) })),

    setLoadingStudents: (isLoadingStudents) => set({ isLoadingStudents }),
    setLoadingCourses:  (isLoadingCourses) => set({ isLoadingCourses }),
    setLoadingPayments: (isLoadingPayments) => set({ isLoadingPayments }),

    reset: () => set(initialState),
  }))
);

// ─── Selectors ────────────────────────────────────────────────────────────────
export const selectActiveStudents = (s: SchoolState) =>
  s.students.filter((st) => st.isActive && !st.isDeleted);

export const selectActiveCourses = (s: SchoolState) =>
  s.courses.filter((c) => c.isActive && !c.isDeleted);
