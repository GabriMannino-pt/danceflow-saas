import fs from 'node:fs';
import path from 'node:path';

const mockStudents = [
  { id: 'stud_1', firstName: 'Fox', lastName: 'Sky', isActive: true, isDeleted: false },
  { id: 'stud_2', firstName: 'Fox', lastName: 'Sky', isActive: true, isDeleted: false },
];

const mockPayments = [
  {
    id: 'pay_paid_with_receipt',
    studentId: 'stud_1', // Fox Sky (no r, no i, no c, no e, no v, no u, no t, no a)
    description: 'Gym', // no r, no i, no c, etc.
    receiptNumber: 142,
    status: 'paid',
    courseId: 'gym',
    month: 5,
    payments: [],
  },
  {
    id: 'pay_pending',
    studentId: 'stud_2', // Fox Sky
    description: 'Gym',
    receiptNumber: null,
    status: 'pending',
    courseId: 'gym',
    month: 5,
    payments: [],
  }
];

function filterPayments(payments, students, searchQuery, statusFilter = 'all', courseFilter = 'all', monthFilter = 0) {
  return payments.filter((p) => {
    const student = students.find(s => s.id === p.studentId);
    const studentName = student ? `${student.firstName} ${student.lastName}`.toLowerCase() : '';

    const isSearching = searchQuery.trim().length > 0;
    const q = searchQuery.toLowerCase().trim();
    const qDigits = q.replace(/\D/g, '');
    const isReceiptQuery = /ricevuta|n°|n\.|\bric\b|#/i.test(q);

    const receiptNums = [];
    if (p.receiptNumber !== undefined && p.receiptNumber !== null) {
      receiptNums.push(String(p.receiptNumber).trim());
    }

    const matchesReceipt = receiptNums.some((r) => {
      if (!r) return false;
      const rLower = r.toLowerCase();

      if (rLower.includes(q)) return true;

      const formattedVariants = [
        `ricevuta ${rLower}`,
        `ricevuta n° ${rLower}`,
        `ricevuta n. ${rLower}`,
        `ricevuta n ${rLower}`,
        `ricevuta n°${rLower}`,
        `n° ${rLower}`,
        `n. ${rLower}`,
        `#${rLower}`,
      ];
      if (formattedVariants.some((v) => v.includes(q) || q.includes(v))) return true;

      if (isReceiptQuery && qDigits && (rLower === qDigits || rLower.includes(qDigits))) {
        return true;
      }

      if (qDigits && q === qDigits && (rLower === qDigits || rLower.includes(qDigits))) {
        return true;
      }

      return false;
    });

    const matchesSearch =
      !isSearching ||
      studentName.includes(q) ||
      p.description.toLowerCase().includes(q) ||
      matchesReceipt;

    const matchesStatus = (matchesReceipt || statusFilter === 'all') ? true : p.status === statusFilter;
    const matchesCourse = (matchesReceipt || courseFilter === 'all') ? true : p.courseId === courseFilter;
    const matchesMonth = (matchesReceipt || isSearching || monthFilter === 0) ? true : p.month === monthFilter;

    return matchesSearch && matchesStatus && matchesCourse && matchesMonth;
  });
}

// User is on "In Attesa" tab (statusFilter = 'pending')
// User starts typing "r" in the search box
const res = filterPayments(mockPayments, mockStudents, 'r', 'pending', 'all', 0);
console.log('Results when statusFilter="pending" and search="r":');
console.log(res.map(p => ({ id: p.id, status: p.status, receipt: p.receiptNumber })));
