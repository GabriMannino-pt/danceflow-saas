import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom';
import { AuthGuard, GuestGuard, RoleGuard, SuperAdminGuard } from '@/components/guards/RoleGuard';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

// ─── Lazy page imports ────────────────────────────────────────────────────────
const LoginPage          = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage       = lazy(() => import('@/pages/auth/RegisterPage'));
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
const SuperAdminDashboardPage = lazy(() => import('@/pages/superadmin/SuperAdminDashboardPage'));
const SuperAdminSchoolsPage   = lazy(() => import('@/pages/superadmin/SuperAdminSchoolsPage'));
const LandingPage        = lazy(() => import('@/pages/public/LandingPage'));

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
    element: (
      <GuestGuard>
        <Lazy><RegisterPage /></Lazy>
      </GuestGuard>
    ),
  },
  {
    path: '/join/:token',
    element: (
      <GuestGuard>
        <Lazy><JoinSchoolPage /></Lazy>
      </GuestGuard>
    ),
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

  // ── Public landing page at root
  {
    path: '/',
    element: <Lazy><LandingPage /></Lazy>,
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

      // Students
      { path: 'students',           element: <Lazy><StudentsPage /></Lazy> },
      { path: 'students/:id',       element: <Lazy><StudentDetailPage /></Lazy> },

      // Courses
      { path: 'courses',            element: <Lazy><CoursesPage /></Lazy> },
      { path: 'courses/:id',        element: <Lazy><CourseDetailPage /></Lazy> },

      // Payments
      { path: 'payments',           element: <Lazy><PaymentsPage /></Lazy> },

      // Attendance
      { path: 'attendance',         element: <Lazy><AttendancePage /></Lazy> },

      // Calendar
      { path: 'calendar',           element: <Lazy><CalendarPage /></Lazy> },

      // Messages
      { path: 'messages',           element: <Lazy><MessagesPage /></Lazy> },

      // Events
      { path: 'events',             element: <Lazy><EventsPage /></Lazy> },
      { path: 'events/:id',         element: <Lazy><EventDetailPage /></Lazy> },

      // Settings & Profile (admin only for settings)
      {
        path: 'settings',
        element: (
          <RoleGuard allowedRoles={['admin', 'superadmin', 'owner']}>
            <Lazy><SettingsPage /></Lazy>
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

  // ── SuperAdmin portal (cabina di regia)
  {
    path: '/superadmin',
    element: (
      <SuperAdminGuard>
        <AppLayout>
          <Outlet />
        </AppLayout>
      </SuperAdminGuard>
    ),
    children: [
      { path: 'dashboard', element: <Lazy><SuperAdminDashboardPage /></Lazy> },
      { path: 'schools', element: <Lazy><SuperAdminSchoolsPage /></Lazy> },
    ],
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
