import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, BookOpen, CreditCard,
  ClipboardCheck, Calendar, MessageSquare, Ticket,
  Settings, ChevronLeft, ChevronRight, LogOut,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { logout } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { NotificationBell } from '@/components/common/NotificationBell';
import toast from 'react-hot-toast';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  roles: string[];
}

const navItems: NavItem[] = [
  { to: '/dashboard',  icon: <LayoutDashboard size={20} />, label: 'Dashboard',   roles: ['owner', 'admin', 'superadmin', 'teacher'] },
  { to: '/students',   icon: <Users size={20} />,           label: 'Allievi',     roles: ['owner', 'admin', 'superadmin', 'teacher'] },
  { to: '/courses',    icon: <BookOpen size={20} />,        label: 'Corsi',       roles: ['owner', 'admin', 'superadmin', 'teacher'] },
  { to: '/payments',   icon: <CreditCard size={20} />,      label: 'Pagamenti',   roles: ['owner', 'admin', 'superadmin'] },
  { to: '/attendance', icon: <ClipboardCheck size={20} />,  label: 'Presenze',    roles: ['owner', 'admin', 'superadmin', 'teacher'] },
  { to: '/calendar',   icon: <Calendar size={20} />,        label: 'Calendario',  roles: ['owner', 'admin', 'superadmin', 'teacher'] },
  { to: '/messages',   icon: <MessageSquare size={20} />,   label: 'Comunicazioni', roles: ['owner', 'admin', 'superadmin'] },
  { to: '/events',     icon: <Ticket size={20} />,          label: 'Eventi',      roles: ['owner', 'admin', 'superadmin', 'teacher'] },
  { to: '/settings',   icon: <Settings size={20} />,        label: 'Impostazioni', roles: ['owner', 'admin', 'superadmin'] },
  { to: '/superadmin/dashboard', icon: <LayoutDashboard size={20} />, label: 'SuperAdmin Panel', roles: ['superadmin'] },
  { to: '/superadmin/schools', icon: <Users size={20} />,           label: 'Gestione Tenant',   roles: ['superadmin'] },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const user = useAuthStore((s) => s.user);

  const visibleItems = navItems.filter((item) => {
    if (!user) return false;
    const isUserSuperAdmin = user.role === 'superadmin' || (user as any).isSuperAdmin === true;
    if (item.roles.includes('superadmin') && isUserSuperAdmin) return true;
    return item.roles.includes(user.role);
  });

  async function handleLogout() {
    try {
      await logout();
    } catch {
      toast.error('Errore durante il logout');
    }
  }

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col h-screen sticky top-0 transition-all duration-300 ease-in-out z-40',
        'glass border-r border-white/8',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center gap-3 px-4 py-5 border-b border-white/8', collapsed && 'justify-center px-0')}>
        <div className='w-9 h-9 rounded-xl btn-primary-gradient flex items-center justify-center flex-shrink-0 animate-pulse-glow'>
          <span className='text-lg'>💃</span>
        </div>
        {!collapsed && (
          <span className='font-display font-bold text-lg gradient-text'>DanceFlow</span>
        )}
      </div>

      {/* Nav */}
      <nav className='flex-1 px-2 py-4 space-y-1 overflow-y-auto'>
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group',
                collapsed && 'justify-center px-0',
                isActive
                  ? 'bg-brand-600/30 text-brand-300 border border-brand-500/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <span className='flex-shrink-0 transition-transform group-hover:scale-110'>
              {item.icon}
            </span>
            {!collapsed && (
              <span className='text-sm font-medium truncate'>{item.label}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + Collapse */}
      <div className='border-t border-white/8 p-2 space-y-1'>
        {!collapsed && user ? (
          <div className='flex items-center justify-between px-3 py-2 mb-1 gap-2'>
            <div className='flex items-center gap-3 min-w-0'>
              <div className='w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0'>
                <span className='text-xs font-bold text-white'>
                  {user.displayName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className='min-w-0'>
                <p className='text-sm font-medium text-white truncate'>{user.displayName}</p>
                <p className='text-xs text-white/40 capitalize'>{user.role}</p>
              </div>
            </div>
            <NotificationBell collapsed={false} />
          </div>
        ) : (
          collapsed && user && (
            <div className='flex justify-center py-2'>
              <NotificationBell collapsed={true} />
            </div>
          )
        )}

        <button
          onClick={handleLogout}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-white/60 hover:text-coral-400 hover:bg-coral-500/10 transition-all duration-200',
            collapsed && 'justify-center px-0'
          )}
          aria-label='Logout'
        >
          <LogOut size={20} />
          {!collapsed && <span className='text-sm font-medium'>Logout</span>}
        </button>

        <button
          onClick={onToggle}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-all duration-200',
            collapsed && 'justify-center px-0'
          )}
          aria-label={collapsed ? 'Espandi sidebar' : 'Comprimi sidebar'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && <span className='text-xs'>Comprimi</span>}
        </button>
      </div>
    </aside>
  );
}
