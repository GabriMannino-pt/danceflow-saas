import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard, Users, BookOpen, CreditCard,
  ClipboardCheck, Calendar, MessageSquare, Ticket,
  Settings, ChevronLeft, ChevronRight, LogOut, Shirt,
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
  { to: '/dashboard',  icon: <LayoutDashboard size={20} />, label: 'Dashboard',   roles: ['owner', 'admin', 'teacher'] },
  { to: '/students',   icon: <Users size={20} />,           label: 'Allievi',     roles: ['owner', 'admin'] },
  { to: '/courses',    icon: <BookOpen size={20} />,        label: 'Corsi',       roles: ['owner', 'admin'] },
  { to: '/payments',   icon: <CreditCard size={20} />,      label: 'Pagamenti',   roles: ['owner', 'admin'] },
  { to: '/attendance', icon: <ClipboardCheck size={20} />,  label: 'Presenze',    roles: ['owner', 'admin', 'teacher'] },
  { to: '/calendar',   icon: <Calendar size={20} />,        label: 'Calendario',  roles: ['owner', 'admin', 'teacher'] },
  { to: '/costumes',   icon: <Shirt size={20} />,           label: 'Costumi',     roles: ['owner', 'admin'] },
  { to: '/tickets',    icon: <Ticket size={20} />,          label: 'Saggio/Biglietti', roles: ['owner', 'admin'] },
  { to: '/messages',   icon: <MessageSquare size={20} />,   label: 'Comunicazioni', roles: ['owner', 'admin'] },
  { to: '/settings',   icon: <Settings size={20} />,        label: 'Impostazioni', roles: ['owner', 'admin'] },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const user = useAuthStore((s) => s.user);

  const visibleItems = navItems.filter(
    (item) => !user?.role || item.roles.includes(user.role)
  );

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
      {/* Logo Header */}
      <div className={cn('border-b border-white/8 transition-all duration-200', collapsed ? 'p-3 flex justify-center' : 'p-4')}>
        <Link
          to='/dashboard'
          className='flex flex-col items-center justify-center w-full group focus:outline-none'
          title='Tropical Style Caribbean School'
        >
          {collapsed ? (
            <div className='w-11 h-11 rounded-2xl bg-white p-1.5 flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-105 transition-transform duration-200'>
              <img
                src='/tropical_logo.png'
                alt='Tropical Style'
                className='w-full h-full object-contain'
              />
            </div>
          ) : (
            <div className='w-full flex flex-col items-center text-center'>
              {/* Logo in bella vista */}
              <div className='w-full bg-white rounded-2xl py-3 px-2 shadow-lg flex items-center justify-center group-hover:shadow-brand-500/20 group-hover:scale-[1.02] transition-all duration-200'>
                <img
                  src='/tropical_logo.png'
                  alt='Tropical Style'
                  className='h-14 w-auto max-w-full object-contain'
                />
              </div>
              {/* Scritta sotto */}
              <div className='mt-2.5'>
                <span className='font-display font-bold text-sm text-white tracking-tight block'>
                  Tropical Style
                </span>
                <span className='text-[10px] text-brand-400 font-semibold tracking-wider uppercase block'>
                  Caribbean School
                </span>
              </div>
            </div>
          )}
        </Link>
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
