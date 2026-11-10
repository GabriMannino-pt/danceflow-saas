import fs from 'node:fs';
import path from 'node:path';

let passed = 0;
let failed = 0;
const findings = [];

function assert(condition, testName, failureDetails = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}: ${failureDetails}`);
    failed++;
    findings.push({ testName, failureDetails });
  }
}

console.log('================================================================');
console.log('CHALLENGER DEEP VERIFICATION SUITE — MILESTONE 4A');
console.log('================================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Static Verification of Implementation Code
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 1. Static Code Analysis ---');
const paymentsPagePath = path.resolve('src/pages/payments/PaymentsPage.tsx');
const usePaymentsPath = path.resolve('src/hooks/usePayments.ts');
const paymentsPageSource = fs.readFileSync(paymentsPagePath, 'utf8');
const usePaymentsSource = fs.readFileSync(usePaymentsPath, 'utf8');

// 1.1 usePayments.ts Integrity
assert(
  usePaymentsSource.includes('async function updateReceiptPayment'),
  'updateReceiptPayment defined in usePayments'
);
assert(
  usePaymentsSource.includes('receiptNumber: existingReceiptNumber'),
  'receiptNumber preserved from existing record in updateReceiptPayment'
);

const updateReceiptPaymentBodyMatch = usePaymentsSource.match(
  /async function updateReceiptPayment[\s\S]*?\n  \}/
);
if (updateReceiptPaymentBodyMatch) {
  const body = updateReceiptPaymentBodyMatch[0].replace(/\/\/.*$/gm, '');
  assert(
    !body.includes('getNextReceiptNumber'),
    'updateReceiptPayment NEVER calls getNextReceiptNumber'
  );
  assert(
    !body.includes('counters/receipts'),
    'updateReceiptPayment NEVER accesses counters/receipts'
  );
  assert(
    body.includes('useSchoolStore.setState'),
    'updateReceiptPayment updates local Zustand store'
  );
}

// 1.2 PaymentsPage.tsx UI & Actions
assert(
  paymentsPageSource.includes('handleDownloadReceipt(p)'),
  'handleDownloadReceipt attached to reprint actions'
);
assert(
  paymentsPageSource.includes('Ristampa PDF'),
  '"Ristampa PDF" button rendered'
);
assert(
  paymentsPageSource.includes('Modifica Ricevuta'),
  '"Modifica Ricevuta" button rendered'
);
assert(
  paymentsPageSource.includes('Ricevuta N° {editingReceiptPayment.receiptNumber} — Il numero progressivo rimane invariato'),
  'EditReceiptModal displays immutable receipt number notice badge'
);
assert(
  paymentsPageSource.includes('Ricevuta N° ${editingReceiptPayment.receiptNumber} aggiornata con successo (numero conservato)'),
  'EditReceiptModal shows exact success toast with preserved number'
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Behavioral Testing of Required Match Logic
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 2. Required Search Match Logic ---');

const mockStudents = [
  { id: 's1', firstName: 'Mario', lastName: 'Rossi', isActive: true, isDeleted: false },
  { id: 's2', firstName: 'Giulia', lastName: 'Bianchi', isActive: true, isDeleted: false },
  { id: 's3', firstName: 'Zoe', lastName: 'Wu', isActive: true, isDeleted: false },
];

const mockPayments = [
  {
    id: 'pay_142',
    studentId: 's1',
    description: 'Quota Salsa',
    receiptNumber: 142, // numeric integer
    status: 'paid',
    courseId: 'c_salsa',
    month: 3,
    payments: [{ amount: 50, date: {}, method: 'cash', receiptEmitted: true, receiptUrl: 'generated://receipt/142' }],
  },
  {
    id: 'pay_138',
    studentId: 's2',
    description: 'Quota Bachata',
    receiptNumber: '138', // string representation
    status: 'paid',
    courseId: 'c_bachata',
    month: 4,
    payments: [{ amount: 50, date: {}, method: 'card', receiptEmitted: true, receiptUrl: 'generated://receipt/138' }],
  },
  {
    id: 'pay_inst',
    studentId: 's3',
    description: 'Stage Kizomba',
    receiptNumber: null, // parent payment has no receiptNumber
    status: 'deposit_paid',
    courseId: 'c_kizomba',
    month: 5,
    payments: [
      { amount: 20, date: {}, method: 'cash', receiptEmitted: false },
      { amount: 30, date: {}, method: 'card', receiptEmitted: true, receiptUrl: 'generated://receipt/555' },
    ],
  },
  {
    id: 'pay_pending_unrelated',
    studentId: 's3', // Zoe Wu
    description: 'Privata Yoga',
    receiptNumber: null,
    status: 'pending',
    courseId: 'c_yoga',
    month: 11,
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

// 2.1 Integer match
const rInt = filterPayments(mockPayments, mockStudents, '142');
assert(rInt.length === 1 && rInt[0].id === 'pay_142', 'Matches integer receipt 142');

// 2.2 String match
const rStr = filterPayments(mockPayments, mockStudents, '138');
assert(rStr.length === 1 && rStr[0].id === 'pay_138', 'Matches string receipt "138"');

// 2.3 Prefix variants
const rPref1 = filterPayments(mockPayments, mockStudents, 'ricevuta 142');
assert(rPref1.length === 1 && rPref1[0].id === 'pay_142', 'Matches "ricevuta 142"');

const rPref2 = filterPayments(mockPayments, mockStudents, 'ricevuta n° 142');
assert(rPref2.length === 1 && rPref2[0].id === 'pay_142', 'Matches "ricevuta n° 142"');

const rPref3 = filterPayments(mockPayments, mockStudents, '#142');
assert(rPref3.length === 1 && rPref3[0].id === 'pay_142', 'Matches "#142"');

const rPref4 = filterPayments(mockPayments, mockStudents, 'ricevuta n. 138');
assert(rPref4.length === 1 && rPref4[0].id === 'pay_138', 'Matches "ricevuta n. 138"');

// 2.4 Installment receipt match
const rInst = filterPayments(mockPayments, mockStudents, '555');
assert(rInst.length === 1 && rInst[0].id === 'pay_inst', 'Matches installment receipt 555 on parent payment');

// 2.5 Month filter bypass
const rMonth = filterPayments(mockPayments, mockStudents, '142', 'all', 'all', 12);
assert(rMonth.length === 1 && rMonth[0].id === 'pay_142', 'Month filter 12 does not suppress receipt 142 (month 3)');

// 2.6 Status filter bypass
const rStatus = filterPayments(mockPayments, mockStudents, '142', 'pending', 'all', 0);
assert(rStatus.length === 1 && rStatus[0].id === 'pay_142', 'Status filter pending does not suppress receipt 142 (status paid)');

// ─────────────────────────────────────────────────────────────────────────────
// 3. Stress & Adversarial Edge Cases: The Prefix Leak Bug
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 3. Stress & Adversarial Edge Cases ---');

// Test Case 3.1: Searching with a single character like 'r' while filtering by pending status
// Expectation: Only pending payments whose student name or description matches 'r' should be returned.
// Paid payments with unrelated receipts should NOT be returned!
const leakR = filterPayments(mockPayments, mockStudents, 'r', 'pending', 'all', 0);
const leakedPaidPaymentsR = leakR.filter(p => p.status === 'paid' && p.studentId === 's3');
console.log('Results for search="r", statusFilter="pending":', leakR.map(p => ({ id: p.id, status: p.status, receipt: p.receiptNumber })));

// Let's test with a student whose name has NO letters from 'ricevuta'
const mockAdversarialStudents = [
  { id: 'adv_1', firstName: 'Bob', lastName: 'Fox', isActive: true, isDeleted: false }, // 'b', 'o', 'f', 'x'
];
const mockAdversarialPayments = [
  {
    id: 'pay_paid_bob',
    studentId: 'adv_1', // Bob Fox
    description: 'Box', // no 'r', 'i', 'c', 'e', 'v', 'u', 't', 'a'
    receiptNumber: 999,
    status: 'paid',
    courseId: 'box',
    month: 1,
    payments: [],
  },
  {
    id: 'pay_pending_bob',
    studentId: 'adv_1', // Bob Fox
    description: 'Box',
    receiptNumber: null,
    status: 'pending',
    courseId: 'box',
    month: 1,
    payments: [],
  }
];

// Test letters present in "ricevuta n° #"
const leakLetters = ['r', 'i', 'c', 'e', 'v', 'u', 't', 'a', 'n', '°', '#'];
const leakResults = {};
for (const letter of leakLetters) {
  const matches = filterPayments(mockAdversarialPayments, mockAdversarialStudents, letter, 'pending', 'all', 0);
  const leaked = matches.some(p => p.id === 'pay_paid_bob');
  leakResults[letter] = leaked;
}

console.log('Letter leak check in statusFilter="pending":');
for (const [letter, leaked] of Object.entries(leakResults)) {
  console.log(`  Query "${letter}": paid receipt leaked into pending list = ${leaked}`);
}

const anyLeaked = Object.values(leakResults).some(v => v === true);
if (anyLeaked) {
  console.warn('\n[VULNERABILITY DETECTED]: Formatted variants matching (v.includes(q)) allows single characters in "ricevuta n° #" to match ANY receipt, bypassing status, month, and course filters!');
}

console.log('\n================================================================');
console.log(`TOTAL CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('================================================================');
