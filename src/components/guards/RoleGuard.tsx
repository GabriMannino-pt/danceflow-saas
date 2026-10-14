import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useSchoolStore } from '@/stores/schoolStore';
import type { Role } from '@/lib/constants';

interface RoleGuardProps {
  allowedRoles: Role[];
  children: React.ReactNode;
  redirectTo?: string;
}

export function RoleGuard({ allowedRoles, children, redirectTo = '/login' }: RoleGuardProps) {
  const { user, isLoading, isInitialized } = useAuthStore();
  const activeSchool = useSchoolStore((s) => s.activeSchool);
  const location = useLocation();

  if (!isInitialized || isLoading) {
    return <AppLoadingScreen />;
  }

  if (!user) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // Redirect suspended tenant unless user is superadmin (by role or document flag)
  const isUserSuperAdmin = user.role === 'superadmin' || user.isSuperAdmin === true;
  if (activeSchool?.suspended && !isUserSuperAdmin) {
    return <Navigate to="/suspended" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    if (redirectTo && redirectTo !== '/login') {
      return <Navigate to={redirectTo} replace />;
    }
    if (user.role === 'teacher') {
      return <Navigate to='/attendance' replace />;
    }
    return <Navigate to='/unauthorized' replace />;
  }

  return <>{children}</>;
}

// ─── Auth Guard (any logged-in user) ─────────────────────────────────────────
interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, isLoading, isInitialized } = useAuthStore();
  const activeSchool = useSchoolStore((s) => s.activeSchool);
  const location = useLocation();

  if (!isInitialized || isLoading) {
    return <AppLoadingScreen />;
  }

  if (!user) {
    return <Navigate to='/login' state={{ from: location }} replace />;
  }

  // Redirect suspended tenant unless user is superadmin (by role or document flag)
  const isUserSuperAdmin = user.role === 'superadmin' || user.isSuperAdmin === true;
  if (activeSchool?.suspended && !isUserSuperAdmin) {
    return <Navigate to="/suspended" replace />;
  }

  // CRITICAL SECURITY CHECK: Parents must NEVER access admin layout or dashboard
  if (user.role === 'parent') {
    return <Navigate to='/parent' replace />;
  }

  return <>{children}</>;
}

// ─── SuperAdmin Guard (only logged-in superadmins) ───────────────────────────
export function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isInitialized } = useAuthStore();
  const location = useLocation();

  if (!isInitialized || isLoading) {
    return <AppLoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isUserSuperAdmin = user.role === 'superadmin' || user.isSuperAdmin === true;
  if (!isUserSuperAdmin) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}

// ─── Guest Guard (redirect logged-in users away from /login) ──────────────────
export function GuestGuard({ children }: AuthGuardProps) {
  const { user, isLoading, isInitialized } = useAuthStore();

  if (!isInitialized || isLoading) {
    return <AppLoadingScreen />;
  }

  if (user) {
    if (user.role === 'parent') {
      return <Navigate to='/parent' replace />;
    }
    return <Navigate to='/dashboard' replace />;
  }

  return <>{children}</>;
}

// ─── Full-screen loading skeleton ─────────────────────────────────────────────
function AppLoadingScreen() {
  return (
    <div className='fixed inset-0 flex items-center justify-center bg-surface-950 z-50'>
      <div className='flex flex-col items-center gap-4 px-4 text-center'>
        <div className='bg-white rounded-2xl px-6 py-3.5 shadow-2xl flex items-center justify-center animate-pulse'>
          <img
            src='/tropical_logo.png'
            alt='Tropical Style'
            className='h-12 w-auto max-w-[200px] object-contain'
          />
        </div>
        <div>
          <p className='text-white font-display font-semibold text-base tracking-tight'>Tropical Style</p>
          <p className='text-brand-400 text-xs font-medium uppercase tracking-wider mt-0.5'>Caricamento in corso…</p>
        </div>
        <div className='flex gap-1.5 mt-1'>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className='w-2 h-2 rounded-full bg-brand-400 animate-bounce'
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
