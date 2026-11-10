// Verification that the proposed fix fixes the leak AND passes all tests

const mockStudents = [
  { id: 'stud_1', firstName: 'Mario', lastName: 'Rossi', isActive: true, isDeleted: false },
  { id: 'stud_2', firstName: 'Giulia', lastName: 'Bianchi', isActive: true, isDeleted: false },
  { id: 'stud_3', firstName: 'Luca', lastName: 'Verdi', isActive: true, isDeleted: false },
  { id: 'adv_1', firstName: 'Bob', lastName: 'Fox', isActive: true, isDeleted: false },
];

const mockPayments = [
  {
    id: 'pay_1',
    studentId: 'stud_1',
    description: 'Quota Mensile Ottobre - Salsa',
    receiptNumber: '142',
    status: 'paid',
    courseId: 'course_1',
    month: 10,
    payments: [{ amount: 50, date: {}, method: 'cash', receiptEmitted: true, receiptUrl: 'generated://receipt/142' }],
  },
  {
    id: 'pay_2',
    studentId: 'stud_2',
    description: 'Iscrizione Annuale 2026',
    receiptNumber: 138,
    status: 'paid',
    courseId: 'course_2',
    month: 9,
    payments: [{ amount: 40, date: {}, method: 'card', receiptEmitted: true, receiptUrl: 'generated://receipt/138' }],
  },
  {
    id: 'pay_3',
    studentId: 'stud_3',
    description: 'Acconto Stage Bachata',
    status: 'deposit_paid',
    courseId: 'course_1',
    month: 11,
    payments: [
      { amount: 30, date: {}, method: 'cash', receiptEmitted: true, receiptUrl: 'generated://receipt/205' },
    ],
  },
  {
    id: 'pay_paid_bob',
    studentId: 'adv_1',
    description: 'Box',
    receiptNumber: 999,
    status: 'paid',
    courseId: 'course_1',
    month: 1,
    payments: [],
  },
  {
    id: 'pay_pending_bob',
    studentId: 'adv_1',
    description: 'Box',
    receiptNumber: null,
    status: 'pending',
    courseId: 'course_1',
    month: 1,
    payments: [],
  }
];

function filterPaymentsFixed(payments, students, searchQuery, statusFilter = 'all', courseFilter = 'all', monthFilter = 0) {
  return payments.filter((p) => {
    const student = students.find((s) => s.id === p.studentId);
    const studentName = student ? `${student.firstName} ${student.lastName}`.toLowerCase() : '';

    const isSearching = searchQuery.trim().length > 0;
    const q = searchQuery.toLowerCase().trim();
    const qDigits = q.replace(/\D/g, '');
    const isReceiptQuery = /ricevuta|n°|n\.|\bric\b|#/i.test(q);

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

      // 1. Direct contains (typing "142" matches receipt "142")
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
      // FIX: Only match formatted variants if q contains the variant, or if q has digits and variant contains q
      if (formattedVariants.some((v) => q.includes(v) || (qDigits.length > 0 && v.includes(q)))) return true;

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

// Check standard queries
console.log('Search "142":', filterPaymentsFixed(mockPayments, mockStudents, '142').map(p => p.id));
console.log('Search "ricevuta 142":', filterPaymentsFixed(mockPayments, mockStudents, 'ricevuta 142').map(p => p.id));
console.log('Search "ricevuta n° 142":', filterPaymentsFixed(mockPayments, mockStudents, 'ricevuta n° 142').map(p => p.id));
console.log('Search "#142":', filterPaymentsFixed(mockPayments, mockStudents, '#142').map(p => p.id));
console.log('Search "205":', filterPaymentsFixed(mockPayments, mockStudents, '205').map(p => p.id));

// Check leak queries with statusFilter="pending"
const leakLetters = ['r', 'i', 'c', 'e', 'v', 'u', 't', 'a', 'n', '°', '#'];
let anyLeaked = false;
for (const letter of leakLetters) {
  const matches = filterPaymentsFixed(mockPayments, mockStudents, letter, 'pending', 'all', 0);
  const leaked = matches.some(p => p.id === 'pay_paid_bob');
  if (leaked) {
    console.error(`Leak remains for "${letter}"!`);
    anyLeaked = true;
  }
}

if (!anyLeaked) {
  console.log('SUCCESS: All single-character search filter leaks ELIMINATED with proposed fix!');
}
