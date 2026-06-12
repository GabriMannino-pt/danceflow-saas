import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

export default function Page() {
  return (
    <ErrorBoundary>
      <div className='page-enter'>
        <PageHeader title='Profilo' subtitle='In sviluppo — Phase 2+' />
        <EmptyState
          icon='👤'
          title='Profilo'
          description='Questo modulo sarà disponibile nelle prossime fasi di sviluppo.'
        />
      </div>
    </ErrorBoundary>
  );
}
