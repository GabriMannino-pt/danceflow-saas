import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { BottomTabBar } from './BottomTabBar';
import { AIChatbotWidget } from '../ai/AIChatbotWidget';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className='flex h-screen overflow-hidden bg-surface-950'>
      {/* Desktop Sidebar */}
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      {/* Main content area */}
      <main className='flex-1 flex flex-col overflow-hidden'>
        {/* Mobile Top Header with Tropical Style Logo */}
        <header className='md:hidden flex items-center justify-between px-4 py-2.5 glass border-b border-white/8 z-30 sticky top-0 bg-surface-950/90 backdrop-blur-md flex-shrink-0'>
          <div className='flex items-center gap-2.5'>
            <div className='bg-white rounded-xl px-2.5 py-1 shadow-sm flex items-center justify-center'>
              <img
                src='/tropical_logo.png'
                alt='Tropical Style'
                className='h-7 w-auto object-contain'
              />
            </div>
            <div>
              <span className='text-xs text-white font-bold block leading-tight'>Tropical Style</span>
              <span className='text-[9px] text-brand-400 font-semibold uppercase tracking-wider block'>Caribbean School</span>
            </div>
          </div>
        </header>

        <div className='flex-1 overflow-y-auto'>
          {/* Subtle grid background */}
          <div className='fixed inset-0 pointer-events-none z-0'>
            <div
              className='absolute inset-0 opacity-[0.03]'
              style={{
                backgroundImage: `
                  linear-gradient(rgba(124,58,237,0.5) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(124,58,237,0.5) 1px, transparent 1px)
                `,
                backgroundSize: '40px 40px',
              }}
            />
            {/* Top gradient glow */}
            <div className='absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-brand-600/10 blur-[120px] rounded-full' />
          </div>

          <div className='relative z-10 p-4 md:p-6 pb-32 md:pb-6'>
            {children}
          </div>
        </div>

        {/* Floating AI Assistant Chatbot */}
        <AIChatbotWidget />

        {/* Mobile Bottom Tab */}
        <BottomTabBar />
      </main>
    </div>
  );
}
