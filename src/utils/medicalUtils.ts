import { addYears } from 'date-fns';

/**
 * Calculates the medical clearance expiry date, which is exactly 1 year after the visit/examination date.
 * @param visitDate The date of the medical visit.
 * @returns The expiry Date object.
 */
export function calculateMedicalClearanceExpiry(visitDate: Date | string | number): Date {
  const date = new Date(visitDate);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid visitDate provided');
  }
  return addYears(date, 1);
}
