import { Badge } from '@/components/ui';
import { isPast, isWithinInterval, addDays } from 'date-fns';
import type { Student } from '@/types';

interface MedicalStatusBadgeProps {
  student: Student;
}

export function MedicalStatusBadge({ student }: MedicalStatusBadgeProps) {
  const info = student.medicalInfo;

  if (!info?.medicalClearance || !info.medicalClearanceExpiry) {
    return (
      <Badge variant="danger" size="sm">
        ✗ Cert. mancante
      </Badge>
    );
  }

  // Handle Firebase Timestamp or standard Date/string
  const expiry = typeof info.medicalClearanceExpiry.toDate === 'function'
    ? info.medicalClearanceExpiry.toDate()
    : new Date(info.medicalClearanceExpiry as any);

  if (isNaN(expiry.getTime())) {
    return (
      <Badge variant="danger" size="sm">
        ✗ Cert. non valido
      </Badge>
    );
  }

  if (isPast(expiry)) {
    return (
      <Badge variant="danger" size="sm">
        ✗ Cert. scaduto
      </Badge>
    );
  }

  const isExpiring = isWithinInterval(expiry, {
    start: new Date(),
    end: addDays(new Date(), 30),
  });

  if (isExpiring) {
    return (
      <Badge variant="warning" size="sm">
        ⚠️ Cert. in scadenza
      </Badge>
    );
  }

  return (
    <Badge variant="success" size="sm">
      ✓ Certificato valido
    </Badge>
  );
}
