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
    return <Navigate to='/dashboard' replace />;
  }

  return <>{children}</>;
}

// ─── Full-screen loading skeleton ─────────────────────────────────────────────
function AppLoadingScreen() {
  return (
    <div className='fixed inset-0 flex items-center justify-center bg-surface-950'>
      <div className='flex flex-col items-center gap-4'>
        <div className='w-16 h-16 rounded-2xl btn-primary-gradient flex items-center justify-center animate-pulse-glow'>
          <span className='text-3xl'>💃</span>
        </div>
        <p className='text-white/50 text-sm font-body'>Caricamento DanceFlow…</p>
        <div className='flex gap-1'>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className='w-2 h-2 rounded-full bg-brand-500 animate-bounce'
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
