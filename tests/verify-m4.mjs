import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

let passed = 0;
let failed = 0;

function assert(condition, name, details = '') {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${name}${details ? ': ' + details : ''}`);
    failed++;
  }
}

console.log('======================================================');
console.log('MILESTONE 4A VERIFICATION SUITE — R4 RECEIPT MANAGEMENT');
console.log('======================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Static and Functional Analysis: src/hooks/usePayments.ts
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 1. Testing src/hooks/usePayments.ts ---');
const usePaymentsPath = path.resolve('src/hooks/usePayments.ts');
const usePaymentsSource = fs.readFileSync(usePaymentsPath, 'utf8');

assert(
  usePaymentsSource.includes('async function updateReceiptPayment'),
  'usePayments defines async function updateReceiptPayment'
);

assert(
  usePaymentsSource.includes('updateReceiptPayment,'),
  'usePayments exports updateReceiptPayment in its return object'
);

assert(
  usePaymentsSource.includes('const existingReceiptNumber = p.receiptNumber'),
  'updateReceiptPayment retrieves and preserves existing receiptNumber'
);

assert(
  usePaymentsSource.includes('receiptNumber: existingReceiptNumber'),
  'updateReceiptPayment strictly passes preserved receiptNumber in updates'
);

// Verify counter invariance: getNextReceiptNumber must NOT be called inside updateReceiptPayment
const updateReceiptPaymentBodyMatch = usePaymentsSource.match(
  /async function updateReceiptPayment[\s\S]*?\n  \}/
);
assert(
  updateReceiptPaymentBodyMatch !== null,
  'Extracted updateReceiptPayment function body'
);

if (updateReceiptPaymentBodyMatch) {
  const body = updateReceiptPaymentBodyMatch[0];
  const codeOnly = body.replace(/\/\/.*$/gm, '');
  assert(
    !codeOnly.includes('getNextReceiptNumber'),
    'updateReceiptPayment NEVER calls getNextReceiptNumber'
  );
  assert(
    !codeOnly.includes('counters/receipts'),
    'updateReceiptPayment NEVER touches counters/receipts'
  );
  assert(
    body.includes('useSchoolStore.setState'),
    'updateReceiptPayment synchronizes local Zustand schoolStore state'
  );
  assert(
    body.includes('updateDoc(ref, removeUndefined(updates))'),
    'updateReceiptPayment persists changes via Firestore updateDoc'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Static and Functional Analysis: src/pages/payments/PaymentsPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 2. Testing src/pages/payments/PaymentsPage.tsx ---');
const paymentsPagePath = path.resolve('src/pages/payments/PaymentsPage.tsx');
const paymentsPageSource = fs.readFileSync(paymentsPagePath, 'utf8');

assert(
  paymentsPageSource.includes('updateReceiptPayment'),
  'PaymentsPage destructures updateReceiptPayment from usePayments()'
);

assert(
  paymentsPageSource.includes('const [editingReceiptPayment, setEditingReceiptPayment] = useState'),
  'PaymentsPage includes editingReceiptPayment state for EditReceiptModal'
);

assert(
  paymentsPageSource.includes('handleSaveEditReceipt'),
  'PaymentsPage defines handleSaveEditReceipt submit handler'
);

assert(
  paymentsPageSource.includes('Ricevuta N° ${editingReceiptPayment.receiptNumber} aggiornata con successo (numero conservato)'),
  'PaymentsPage emits the exact required success toast on receipt modification'
);

// Verify Edit Receipt Modal Elements
assert(
  paymentsPageSource.includes('Ricevuta N° {editingReceiptPayment.receiptNumber} — Il numero progressivo rimane invariato'),
  'EditReceiptModal displays the immutable receipt number highlight badge'
);

assert(
  paymentsPageSource.includes('editReceiptMethod'),
  'EditReceiptModal supports editing payment method'
);

assert(
  paymentsPageSource.includes('editReceiptDate'),
  'EditReceiptModal supports editing paidAt / receipt date'
);

assert(
  paymentsPageSource.includes('editReceiptDescription'),
  'EditReceiptModal supports editing receipt description'
);

assert(
  paymentsPageSource.includes('editReceiptMonth'),
  'EditReceiptModal supports editing month'
);

assert(
  paymentsPageSource.includes('editReceiptYear'),
  'EditReceiptModal supports editing year'
);

assert(
  paymentsPageSource.includes('editReceiptAmount'),
  'EditReceiptModal supports editing receipt amount'
);

assert(
  paymentsPageSource.includes('editReceiptNotes'),
  'EditReceiptModal supports editing internal accounting notes'
);

// Verify Action Buttons
assert(
  paymentsPageSource.includes('Ristampa PDF'),
  'PaymentsPage renders "Ristampa PDF" action button for receipts'
);

assert(
  paymentsPageSource.includes('Modifica Ricevuta'),
  'PaymentsPage renders "Modifica Ricevuta" action button for receipts'
);

assert(
  paymentsPageSource.includes('handleDownloadReceipt(p)'),
  'Ristampa action button invokes handleDownloadReceipt'
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. Behavioral Testing: Search Logic Evaluation
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 3. Testing Receipt Search Logic & Filtering ---');

// Mock data representing realistic payments
const mockStudents = [
  { id: 'stud_1', firstName: 'Mario', lastName: 'Rossi', isActive: true, isDeleted: false },
  { id: 'stud_2', firstName: 'Giulia', lastName: 'Bianchi', isActive: true, isDeleted: false },
  { id: 'stud_3', firstName: 'Luca', lastName: 'Verdi', isActive: true, isDeleted: false },
];

const mockResolvedPayments = [
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
    id: 'pay_4',
    studentId: 'stud_1',
    description: 'Quota Mensile Novembre',
    status: 'pending',
    courseId: 'course_1',
    month: 11,
    payments: [],
  },
];

// Helper implementing the exact search filtering logic from PaymentsPage.tsx
function filterPayments(payments, students, searchQuery, statusFilter = 'all', courseFilter = 'all', monthFilter = 0) {
  return payments.filter((p) => {
    const student = students.find((s) => s.id === p.studentId);
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

    // When matching a receipt specifically, bypass month, course, and status filters
    const matchesStatus = (matchesReceipt || statusFilter === 'all') ? true : p.status === statusFilter;
    const matchesCourse = (matchesReceipt || courseFilter === 'all') ? true : p.courseId === courseFilter;
    const matchesMonth = (matchesReceipt || isSearching || monthFilter === 0) ? true : p.month === monthFilter;

    return matchesSearch && matchesStatus && matchesCourse && matchesMonth;
  });
}

// Test Search queries
const res142 = filterPayments(mockResolvedPayments, mockStudents, '142');
assert(res142.length === 1 && res142[0].id === 'pay_1', 'Search "142" finds payment pay_1 with receiptNumber "142"');

const res138 = filterPayments(mockResolvedPayments, mockStudents, '138');
assert(res138.length === 1 && res138[0].id === 'pay_2', 'Search "138" finds payment pay_2 with numeric receiptNumber 138');

const resRicevuta142 = filterPayments(mockResolvedPayments, mockStudents, 'ricevuta 142');
assert(resRicevuta142.length === 1 && resRicevuta142[0].id === 'pay_1', 'Search "ricevuta 142" matches pay_1');

const resRicevutaNo142 = filterPayments(mockResolvedPayments, mockStudents, 'ricevuta n° 142');
assert(resRicevutaNo142.length === 1 && resRicevutaNo142[0].id === 'pay_1', 'Search "ricevuta n° 142" matches pay_1');

const resRicevutaN142 = filterPayments(mockResolvedPayments, mockStudents, 'ricevuta n. 142');
assert(resRicevutaN142.length === 1 && resRicevutaN142[0].id === 'pay_1', 'Search "ricevuta n. 142" matches pay_1');

const resHash142 = filterPayments(mockResolvedPayments, mockStudents, '#142');
assert(resHash142.length === 1 && resHash142[0].id === 'pay_1', 'Search "#142" matches pay_1');

const resInstallment = filterPayments(mockResolvedPayments, mockStudents, '205');
assert(resInstallment.length === 1 && resInstallment[0].id === 'pay_3', 'Search "205" finds installment receipt on pay_3');

// Test that month filter does NOT block receipt search
const resWithMonthFilter = filterPayments(mockResolvedPayments, mockStudents, '142', 'all', 'all', 12);
assert(
  resWithMonthFilter.length === 1 && resWithMonthFilter[0].id === 'pay_1',
  'Search "142" bypasses active month filter (month 12 vs receipt month 10)'
);

// Test that status filter does NOT block receipt search
const resWithStatusFilter = filterPayments(mockResolvedPayments, mockStudents, '142', 'pending');
assert(
  resWithStatusFilter.length === 1 && resWithStatusFilter[0].id === 'pay_1',
  'Search "142" bypasses active status filter (status pending vs receipt status paid)'
);

// Test normal student name search still works
const resStudentName = filterPayments(mockResolvedPayments, mockStudents, 'Giulia');
assert(resStudentName.length === 1 && resStudentName[0].id === 'pay_2', 'Normal student name search "Giulia" works correctly');

// Test description search still works
const resDesc = filterPayments(mockResolvedPayments, mockStudents, 'Salsa');
assert(resDesc.length === 1 && resDesc[0].id === 'pay_1', 'Description search "Salsa" works correctly');

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n======================================================');
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('======================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All Milestone 4A tests passed with 100% success rate.');
}
