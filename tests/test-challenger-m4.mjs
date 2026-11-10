import fs from 'node:fs';
import path from 'node:path';

// Load PaymentsPage.tsx to ensure we extract the EXACT filtering code or replicate it faithfully
const paymentsPageSource = fs.readFileSync(path.resolve('src/pages/payments/PaymentsPage.tsx'), 'utf8');

const mockStudents = [
  { id: 'stud_1', firstName: 'Marco', lastName: 'Bianchi', isActive: true, isDeleted: false },
  { id: 'stud_2', firstName: 'Zoe', lastName: 'Wu', isActive: true, isDeleted: false },
  { id: 'stud_3', firstName: 'Luigi', lastName: 'Verdi', isActive: true, isDeleted: false },
];

const mockPayments = [
  {
    id: 'pay_1',
    studentId: 'stud_2', // Zoe Wu (no 'r', no 'a', no 'salsa')
    description: 'Quota HipHop',
    receiptNumber: 142,
    status: 'paid',
    courseId: 'hiphop',
    month: 5,
    payments: [{ amount: 50, date: {}, method: 'cash', receiptEmitted: true, receiptUrl: 'generated://receipt/142' }],
  },
  {
    id: 'pay_2',
    studentId: 'stud_2', // Zoe Wu
    description: 'Quota HipHop senza ricevuta',
    receiptNumber: null,
    status: 'pending',
    courseId: 'hiphop',
    month: 5,
    payments: [],
  },
  {
    id: 'pay_3',
    studentId: 'stud_1', // Marco Bianchi
    description: 'Salsa Cubana',
    receiptNumber: 200,
    status: 'paid',
    courseId: 'salsa',
    month: 10,
    payments: [{ amount: 60, date: {}, method: 'cash', receiptEmitted: true, receiptUrl: 'generated://receipt/200' }],
  }
];

// Exact function from PaymentsPage.tsx
function filterPayments(payments, students, searchQuery, statusFilter = 'all', courseFilter = 'all', monthFilter = 0) {
  return payments.filter((p) => {
    const student = students.find(s => s.id === p.studentId);
    const studentName = student ? `${student.firstName} ${student.lastName}`.toLowerCase() : '';

    const isSearching = searchQuery.trim().length > 0;
    const q = searchQuery.toLowerCase().trim();
    const qDigits = q.replace(/\D/g, '');
    const isReceiptQuery = /ricevuta|n°|n\.|\bric\b|#/i.test(q);

    // Collect all receipt references on payment and installments
    const receiptNums = [];
    if (p.receiptNumber !== undefined && p.receiptNumber !== null) {
      receiptNums.push(String(p.receiptNumber).trim());
    }
    if (p.payments && Array.isArray(p.payments)) {
      p.payments.forEach((inst) => {
        if (inst.receiptUrl) {
          const match = inst.receiptUrl.match(/(\d+)/);
          if (match) receiptNums.push(match[1]);
          const lastPart = inst.receiptUrl.split('/').pop();
          if (lastPart) receiptNums.push(lastPart.trim());
        }
        if (inst.receiptNumber) {
          receiptNums.push(String(inst.receiptNumber).trim());
        }
      });
    }

    const matchesReceipt = receiptNums.some((r) => {
      if (!r) return false;
      const rLower = r.toLowerCase();

      // 1. Direct contains (e.g. typing "142" matches receipt "142")
      if (rLower.includes(q)) return true;

      // 2. Formatted variants: "ricevuta 142", "ricevuta n° 142", "ricevuta n. 142", "n° 142", etc.
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

      // 3. Receipt prefix query with digits (e.g. "ricevuta n. 142")
      if (isReceiptQuery && qDigits && (rLower === qDigits || rLower.includes(qDigits))) {
        return true;
      }

      // 4. Pure numeric query matching receipt number
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

console.log('Testing query "r":');
const resultsR = filterPayments(mockPayments, mockStudents, 'r');
console.log('Results for "r":', resultsR.map(p => ({ id: p.id, desc: p.description, receipt: p.receiptNumber })));

console.log('\nTesting query "e":');
const resultsE = filterPayments(mockPayments, mockStudents, 'e');
console.log('Results for "e":', resultsE.map(p => ({ id: p.id, desc: p.description, receipt: p.receiptNumber })));

console.log('\nTesting query "1":');
const results1 = filterPayments(mockPayments, mockStudents, '1');
console.log('Results for "1":', results1.map(p => ({ id: p.id, desc: p.description, receipt: p.receiptNumber })));
