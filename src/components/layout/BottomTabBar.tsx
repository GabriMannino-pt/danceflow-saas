import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, BookOpen,
  ClipboardCheck, Calendar, User,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

export function BottomTabBar() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  const isTeacher = user.role === 'teacher';

  const tabItems = isTeacher
    ? [
        { to: '/attendance', icon: <ClipboardCheck size={22} />, label: 'Presenze' },
        { to: '/dashboard',  icon: <LayoutDashboard size={22} />, label: 'Lezioni' },
        { to: '/calendar',   icon: <Calendar size={22} />,        label: 'Calendario' },
        { to: '/profile',    icon: <User size={22} />,            label: 'Profilo' },
      ]
    : [
        { to: '/dashboard',  icon: <LayoutDashboard size={22} />, label: 'Home' },
        { to: '/students',   icon: <Users size={22} />,           label: 'Allievi' },
        { to: '/courses',    icon: <BookOpen size={22} />,        label: 'Corsi' },
        { to: '/attendance', icon: <ClipboardCheck size={22} />,  label: 'Presenze' },
        { to: '/calendar',   icon: <Calendar size={22} />,        label: 'Calendario' },
      ];

  return (
    <nav
      className='md:hidden fixed bottom-0 left-0 right-0 pb-safe z-50 glass border-t border-white/8'
      role='navigation'
      aria-label='Navigazione principale'
    >
      <div className='flex items-stretch justify-around'>
        {tabItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 px-1 transition-all duration-200 min-h-[56px]',
                isActive ? 'text-brand-400' : 'text-white/40'
              )
            }
            aria-label={item.label}
          >
            {({ isActive }) => (
              <>
                <span className={cn('transition-transform duration-200', isActive && 'scale-110')}>
                  {item.icon}
                </span>
                <span className='text-[10px] font-medium'>{item.label}</span>
                {isActive && (
                  <span className='absolute top-0 w-8 h-0.5 bg-brand-400 rounded-full' />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
