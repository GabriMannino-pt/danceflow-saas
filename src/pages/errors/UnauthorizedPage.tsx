import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { Home } from 'lucide-react';

export default function UnauthorizedPage() {
  return (
    <div className='min-h-screen flex items-center justify-center p-4 bg-surface-950'>
      <div className='text-center animate-fade-in-up'>
        <div className='text-7xl mb-6'>🔒</div>
        <h1 className='text-4xl font-display font-bold text-white mb-3'>Accesso Negato</h1>
        <p className='text-white/50 mb-8 max-w-sm'>
          Non hai i permessi necessari per visualizzare questa pagina.
        </p>
        <Link to='/dashboard'>
          <Button icon={<Home size={18} />}>Torna alla Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
