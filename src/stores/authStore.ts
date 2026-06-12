import { create } from 'zustand';
import type { AppUser } from '@/types';

interface AuthState {
  user: AppUser | null;
  firebaseUser: { uid: string; email: string | null } | null;
  isLoading: boolean;
  isInitialized: boolean;

  // Actions
  setUser: (user: AppUser | null) => void;
  setFirebaseUser: (user: { uid: string; email: string | null } | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  reset: () => void;
}

const initialState = {
  user: null,
  firebaseUser: null,
  isLoading: true,
  isInitialized: false,
};

export const useAuthStore = create<AuthState>()(
  (set) => ({
    ...initialState,

    setUser: (user) => set({ user }),
    setFirebaseUser: (firebaseUser) => set({ firebaseUser }),
    setLoading: (isLoading) => set({ isLoading }),
    setInitialized: (isInitialized) => set({ isInitialized }),
    reset: () => set({
      user: null,
      firebaseUser: null,
      isLoading: false,
      isInitialized: true,
    }),
  })
);

// ─── Selectors ────────────────────────────────────────────────────────────────
export const selectRole    = (s: AuthState) => s.user?.role;
export const selectSchoolId = (s: AuthState) => s.user?.schoolId;
export const selectIsAdmin  = (s: AuthState) =>
  s.user?.role === 'admin' || s.user?.role === 'superadmin' || s.user?.role === 'owner';
