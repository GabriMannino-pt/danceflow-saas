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
