import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Outlet, Navigate } from 'react-router-dom';
import { AuthGuard, GuestGuard, RoleGuard } from '@/components/guards/RoleGuard';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

// ─── Lazy page imports ────────────────────────────────────────────────────────
const LoginPage          = lazy(() => import('@/pages/auth/LoginPage'));
const DashboardPage      = lazy(() => import('@/pages/dashboard/DashboardPage'));
const StudentsPage       = lazy(() => import('@/pages/students/StudentsPage'));
const StudentDetailPage  = lazy(() => import('@/pages/students/StudentDetailPage'));
const CoursesPage        = lazy(() => import('@/pages/courses/CoursesPage'));
const CourseDetailPage   = lazy(() => import('@/pages/courses/CourseDetailPage'));
const PaymentsPage       = lazy(() => import('@/pages/payments/PaymentsPage'));
const AttendancePage     = lazy(() => import('@/pages/attendance/AttendancePage'));
const CalendarPage       = lazy(() => import('@/pages/calendar/CalendarPage'));
const MessagesPage       = lazy(() => import('@/pages/messages/MessagesPage'));
const EventsPage         = lazy(() => import('@/pages/events/EventsPage'));
const EventDetailPage    = lazy(() => import('@/pages/events/EventDetailPage'));
const SettingsPage       = lazy(() => import('@/pages/settings/SettingsPage'));
const ProfilePage        = lazy(() => import('@/pages/profile/ProfilePage'));
const UnauthorizedPage   = lazy(() => import('@/pages/errors/UnauthorizedPage'));
const NotFoundPage       = lazy(() => import('@/pages/errors/NotFoundPage'));
const OnboardingPage     = lazy(() => import('@/pages/onboarding/OnboardingPage'));
const ParentPortalPage   = lazy(() => import('@/pages/parent/ParentPortalPage'));
const JoinSchoolPage     = lazy(() => import('@/pages/public/RegistrationPage'));
const JoinStaffPage      = lazy(() => import('@/pages/auth/JoinStaffPage'));
const PrivacyPage        = lazy(() => import('@/pages/public/PrivacyPage'));
const TermsPage          = lazy(() => import('@/pages/public/TermsPage'));
const SuspendedPage      = lazy(() => import('@/pages/errors/SuspendedPage'));
// const LandingPage = lazy(() => import('@/pages/public/LandingPage')); // unused
const AcademicYearWizard  = lazy(() => import('@/pages/settings/AcademicYearWizard'));
const CostumeOrdersPage   = lazy(() => import('@/pages/costumes/CostumeOrdersPage'));

// ─── Lazy wrapper ─────────────────────────────────────────────────────────────
function Lazy({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ErrorBoundary>{children}</ErrorBoundary>
    </Suspense>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────
const router = createBrowserRouter([
  // ── Auth routes (no layout)
  {
    path: '/login',
    element: (
      <GuestGuard>
        <Lazy><LoginPage /></Lazy>
      </GuestGuard>
    ),
  },
  {
    path: '/register',
    element: <Navigate to='/login' replace />,
  },
  {
    path: '/join/:token',
    element: <Lazy><JoinSchoolPage /></Lazy>,
  },
  {
    path: '/join-staff/:token',
    element: (
      <GuestGuard>
        <Lazy><JoinStaffPage /></Lazy>
      </GuestGuard>
    ),
  },
  {
    path: '/privacy',
    element: <Lazy><PrivacyPage /></Lazy>,
  },
  {
    path: '/terms',
    element: <Lazy><TermsPage /></Lazy>,
  },
  {
    path: '/onboarding',
    element: (
      <AuthGuard>
        <Lazy><OnboardingPage /></Lazy>
      </AuthGuard>
    ),
  },

  // ── Root page: direct to Tropical Style Login / Dashboard
  {
    path: '/',
    element: (
      <GuestGuard>
        <Lazy><LoginPage /></Lazy>
      </GuestGuard>
    ),
  },

  // ── Admin / Teacher routes (with AppLayout, protected)
  {
    element: (
      <AuthGuard>
        <AppLayout>
          <Outlet />
        </AppLayout>
      </AuthGuard>
    ),
    children: [
      { path: 'dashboard', element: <Lazy><DashboardPage /></Lazy> },

      // Students (admin / owner / superadmin only)
      {
        path: 'students',
        element: (
          <RoleGuard allowedRoles={['admin', 'superadmin', 'owner']} redirectTo="/attendance">
            <Lazy><StudentsPage /></Lazy>
          </RoleGuard>
        ),
      },
      {
        path: 'students/:id',
        element: (
          <RoleGuard allowedRoles={['admin', 'superadmin', 'owner']} redirectTo="/attendance">
            <Lazy><StudentDetailPage /></Lazy>
          </RoleGuard>
        ),
      },

      // Courses (admin / owner / superadmin only)
      {
        path: 'courses',
        element: (
          <RoleGuard allowedRoles={['admin', 'superadmin', 'owner']} redirectTo="/attendance">
            <Lazy><CoursesPage /></Lazy>
          </RoleGuard>
        ),
      },
      {
        path: 'courses/:id',
        element: (
          <RoleGuard allowedRoles={['admin', 'superadmin', 'owner']} redirectTo="/attendance">
            <Lazy><CourseDetailPage /></Lazy>
          </RoleGuard>
        ),
      },

      // Payments (admin / owner only)
      {
        path: 'payments',
        element: (
          <RoleGuard allowedRoles={['admin', 'superadmin', 'owner']}>
            <Lazy><PaymentsPage /></Lazy>
          </RoleGuard>
        ),
      },

      // Attendance
      { path: 'attendance',         element: <Lazy><AttendancePage /></Lazy> },

      // Calendar
      { path: 'calendar',           element: <Lazy><CalendarPage /></Lazy> },

      // Messages
      { path: 'messages',           element: <Lazy><MessagesPage /></Lazy> },

      // Events
      { path: 'events',             element: <Lazy><EventsPage /></Lazy> },
      { path: 'events/:id',         element: <Lazy><EventDetailPage /></Lazy> },

      // Costumes
      { path: 'costumes',           element: <Lazy><CostumeOrdersPage /></Lazy> },

      // Settings & Profile (admin only for settings)
      {
        path: 'settings',
        element: (
          <RoleGuard allowedRoles={['admin', 'superadmin', 'owner']}>
            <Lazy><SettingsPage /></Lazy>
          </RoleGuard>
        ),
      },
      {
        path: 'settings/academic-year-wizard',
        element: (
          <RoleGuard allowedRoles={['admin', 'superadmin', 'owner']}>
            <Lazy><AcademicYearWizard /></Lazy>
          </RoleGuard>
        ),
      },
      { path: 'profile',            element: <Lazy><ProfilePage /></Lazy> },
    ],
  },

  // ── Parent portal (separate UI)
  {
    path: '/parent',
    element: (
      <RoleGuard allowedRoles={['parent']}>
        <Lazy><ParentPortalPage /></Lazy>
      </RoleGuard>
    ),
  },

  // ── Suspended tenant warning page
  {
    path: '/suspended',
    element: <Lazy><SuspendedPage /></Lazy>,
  },

  // ── Error pages
  { path: '/unauthorized', element: <Lazy><UnauthorizedPage /></Lazy> },
  { path: '*',             element: <Lazy><NotFoundPage /></Lazy> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
