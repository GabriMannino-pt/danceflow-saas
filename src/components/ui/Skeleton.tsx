import { cn } from '@/lib/utils';


// ─── Skeleton ─────────────────────────────────────────────────────────────────
interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
}

export function Skeleton({ className, width, height }: SkeletonProps) {
  return (
    <div
      className={cn('skeleton', className)}
      style={{ width, height }}
      aria-hidden='true'
    />
  );
}

// ─── Full page skeleton ───────────────────────────────────────────────────────
export function PageSkeleton() {
  return (
    <div className='p-4 md:p-6 space-y-6 animate-fade-in-up' aria-busy='true' aria-label='Caricamento pagina'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div className='space-y-2'>
          <Skeleton className='h-7 w-48' />
          <Skeleton className='h-4 w-32' />
        </div>
        <Skeleton className='h-10 w-28 rounded-xl' />
      </div>
      {/* Cards */}
      <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
        {[...Array(4)].map((_, i) => (
          <div key={i} className='glass rounded-2xl p-5 space-y-3'>
            <Skeleton className='h-4 w-24' />
            <Skeleton className='h-8 w-16' />
            <Skeleton className='h-3 w-20' />
          </div>
        ))}
      </div>
      {/* Table */}
      <div className='glass rounded-2xl p-4 space-y-3'>
        {[...Array(5)].map((_, i) => (
          <div key={i} className='flex items-center gap-4'>
            <Skeleton className='h-10 w-10 rounded-full' />
            <Skeleton className='h-4 flex-1' />
            <Skeleton className='h-4 w-20' />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Card skeleton ────────────────────────────────────────────────────────────
export function CardSkeleton() {
  return (
    <div className='glass rounded-2xl p-5 space-y-3' aria-hidden='true'>
      <Skeleton className='h-5 w-32' />
      <Skeleton className='h-4 w-full' />
      <Skeleton className='h-4 w-3/4' />
    </div>
  );
}
