import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { Home } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className='min-h-screen flex items-center justify-center p-4 bg-surface-950'>
      <div className='text-center animate-fade-in-up'>
        <p className='text-8xl font-display font-black gradient-text mb-4'>404</p>
        <h1 className='text-3xl font-display font-bold text-white mb-3'>Pagina non trovata</h1>
        <p className='text-white/50 mb-8 max-w-sm'>
          La pagina che cerchi non esiste o è stata spostata.
        </p>
        <Link to='/dashboard'>
          <Button icon={<Home size={18} />}>Torna alla Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
