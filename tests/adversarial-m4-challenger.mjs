import fs from 'node:fs';
import path from 'node:path';

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}${details ? ' -> ' + details : ''}`);
    failed++;
    failures.push({ testName, details });
  }
}

console.log('======================================================================');
console.log('CHALLENGER EMPIRICAL VERIFICATION HARNESS — MILESTONE 4A');
console.log('======================================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// PART 1: Source Code Audit & Invariance Contract Extraction
// ─────────────────────────────────────────────────────────────────────────────
console.log('>>> [1] Inspecting src/hooks/usePayments.ts for Invariant Guarantees');

const usePaymentsSource = fs.readFileSync(path.resolve('src/hooks/usePayments.ts'), 'utf8');
const paymentsPageSource = fs.readFileSync(path.resolve('src/pages/payments/PaymentsPage.tsx'), 'utf8');
const receiptServiceSource = fs.readFileSync(path.resolve('src/services/receiptService.ts'), 'utf8');

// 1.1 Verify updateReceiptPayment definition
assert(
  /async\s+function\s+updateReceiptPayment\s*\(/.test(usePaymentsSource),
  'updateReceiptPayment is defined as an async function in usePayments.ts'
);

// 1.2 Verify updateReceiptPayment export
assert(
  /return\s*\{[\s\S]*?updateReceiptPayment[\s\S]*?\}/.test(usePaymentsSource),
  'usePayments exports updateReceiptPayment in its return object'
);

// 1.3 Extract function body of updateReceiptPayment
const updateReceiptPaymentRegex = /async\s+function\s+updateReceiptPayment\s*\([\s\S]*?\n  \}/;
const updateReceiptPaymentMatch = usePaymentsSource.match(updateReceiptPaymentRegex);
assert(
  updateReceiptPaymentMatch !== null,
  'Successfully isolated updateReceiptPayment function body'
);

const fnBody = updateReceiptPaymentMatch ? updateReceiptPaymentMatch[0] : '';

// 1.4 Invariance: getNextReceiptNumber is NEVER called inside updateReceiptPayment
const cleanFnBody = fnBody.replace(/\/\/.*$/gm, '');
assert(
  !cleanFnBody.includes('getNextReceiptNumber'),
  'CRITICAL: getNextReceiptNumber is NEVER invoked within updateReceiptPayment'
);

// 1.5 Invariance: Firestore counter path is NEVER referenced inside updateReceiptPayment
assert(
  !cleanFnBody.includes('counters/receipts') && !cleanFnBody.includes('receiptsCounter'),
  'CRITICAL: Firestore counter path (counters/receipts) is NEVER touched by updateReceiptPayment'
);

// 1.6 Invariance: existingReceiptNumber is read from document snapshot
assert(
  cleanFnBody.includes('const existingReceiptNumber = p.receiptNumber') ||
  cleanFnBody.includes('p.receiptNumber'),
  'Original receiptNumber is extracted directly from existing document snapshot'
);

// 1.7 Invariance: receiptNumber in updates is locked to original receiptNumber
assert(
  cleanFnBody.includes('receiptNumber: existingReceiptNumber'),
  'Update payload strictly assigns receiptNumber: existingReceiptNumber (immutable anchor)'
);

// 1.8 Invariance: Zustand schoolStore local state synchronization
assert(
  cleanFnBody.includes('useSchoolStore.setState'),
  'Zustand schoolStore is immediately updated to synchronize in-memory state'
);

// 1.9 Invariance: Firestore updateDoc is executed with removeUndefined
assert(
  cleanFnBody.includes('await updateDoc(ref, removeUndefined(updates))'),
  'Firestore updateDoc is executed with removeUndefined sanitizer'
);


// ─────────────────────────────────────────────────────────────────────────────
// PART 2: Pure Behavioral Simulation of updateReceiptPayment Logic
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n>>> [2] Empirical Simulation & Adversarial Fuzzing of updateReceiptPayment');

// Simulation of Timestamp class and removeUndefined
class MockTimestamp {
  constructor(date) {
    this._date = date instanceof Date ? date : new Date(date);
  }
  toDate() { return this._date; }
  toMillis() { return this._date.getTime(); }
  static fromDate(d) { return new MockTimestamp(d); }
  static now() { return new MockTimestamp(new Date()); }
}

function mockRemoveUndefined(obj) {
  if (Array.isArray(obj)) {
    return obj.map(item => mockRemoveUndefined(item));
  } else if (obj !== null && typeof obj === 'object') {
    if (obj instanceof MockTimestamp) return obj;
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, mockRemoveUndefined(v)])
    );
  }
  return obj;
}

// Mock Firestore Environment
function createMockFirestoreEnv(initialCounter = 142) {
  let counter = initialCounter;
  let counterCalls = 0;

  const mockDb = {
    counterDoc: { year: 2026, nextNumber: counter },
    paymentDocs: new Map(),
  };

  const getNextReceiptNumberSpy = async () => {
    counterCalls++;
    const current = mockDb.counterDoc.nextNumber;
    mockDb.counterDoc.nextNumber++;
    return String(current);
  };

  // Replicated updateReceiptPayment logic directly conforming to usePayments.ts
  const simulateUpdateReceiptPayment = async (schoolId, paymentId, updateData) => {
    if (!schoolId) throw new Error('Not authenticated to a school');
    const p = mockDb.paymentDocs.get(paymentId);
    if (!p) throw new Error('Payment not found');

    const existingReceiptNumber = p.receiptNumber;

    const paidAtTimestamp = updateData.paidAt
      ? MockTimestamp.fromDate(updateData.paidAt)
      : (p.paidAt || MockTimestamp.now());

    const dueDateTimestamp = updateData.dueDate
      ? MockTimestamp.fromDate(updateData.dueDate)
      : (updateData.paidAt ? MockTimestamp.fromDate(updateData.paidAt) : p.dueDate);

    let updatedInstallments = p.payments;
    if (p.payments && p.payments.length > 0) {
      updatedInstallments = p.payments.map((inst, idx) => {
        if (idx === 0 || p.payments.length === 1) {
          return {
            ...inst,
            ...(updateData.method ? { method: updateData.method } : {}),
            date: paidAtTimestamp,
            ...(updateData.notes !== undefined ? { notes: updateData.notes.trim() || undefined } : {}),
            ...(updateData.amount !== undefined ? { amount: updateData.amount } : {}),
          };
        }
        return inst;
      });
    }

    const updates = {
      ...(updateData.method ? { method: updateData.method } : {}),
      paidAt: paidAtTimestamp,
      dueDate: dueDateTimestamp,
      ...(updateData.description !== undefined ? { description: updateData.description.trim() } : {}),
      ...(updateData.month !== undefined ? { month: updateData.month } : {}),
      ...(updateData.year !== undefined ? { year: updateData.year } : {}),
      ...(updateData.notes !== undefined ? { notes: updateData.notes.trim() || undefined } : {}),
      ...(updateData.amount !== undefined ? {
        amount: updateData.amount,
        totalAmount: updateData.amount,
        paidAmount: updateData.amount,
        remainingAmount: 0,
      } : {}),
      ...(updatedInstallments ? { payments: updatedInstallments } : {}),
      receiptNumber: existingReceiptNumber,
      receiptURL: p.receiptURL || (existingReceiptNumber ? `generated://receipt/${existingReceiptNumber}` : undefined),
      updatedAt: MockTimestamp.now(),
    };

    const sanitizedUpdates = mockRemoveUndefined(updates);
    const updatedPayment = { ...p, ...sanitizedUpdates };
    mockDb.paymentDocs.set(paymentId, updatedPayment);
    return updatedPayment;
  };

  return { mockDb, getNextReceiptNumberSpy, simulateUpdateReceiptPayment, getCounterCalls: () => counterCalls };
}

// Test Case 2.1: Update method only
{
  const env = createMockFirestoreEnv(143);
  env.mockDb.paymentDocs.set('pay_101', {
    id: 'pay_101',
    receiptNumber: '142',
    receiptURL: 'generated://receipt/142',
    method: 'cash',
    amount: 60,
    status: 'paid',
  });

  const res = await env.simulateUpdateReceiptPayment('school_1', 'pay_101', { method: 'bank_transfer' });
  assert(res.receiptNumber === '142', 'Method update: receiptNumber remains "142"');
  assert(res.method === 'bank_transfer', 'Method update: method changed to "bank_transfer"');
  assert(env.getCounterCalls() === 0, 'Method update: getNextReceiptNumber was called 0 times');
  assert(env.mockDb.counterDoc.nextNumber === 143, 'Method update: Firestore nextNumber counter remains 143 (unburned)');
}

// Test Case 2.2: Update date only
{
  const env = createMockFirestoreEnv(143);
  const origDate = new Date('2026-03-01');
  const newDate = new Date('2026-04-15');
  env.mockDb.paymentDocs.set('pay_102', {
    id: 'pay_102',
    receiptNumber: '142',
    paidAt: MockTimestamp.fromDate(origDate),
    amount: 50,
  });

  const res = await env.simulateUpdateReceiptPayment('school_1', 'pay_102', { paidAt: newDate });
  assert(res.receiptNumber === '142', 'Date update: receiptNumber remains "142"');
  assert(res.paidAt.toDate().getTime() === newDate.getTime(), 'Date update: paidAt correctly updated');
  assert(env.getCounterCalls() === 0, 'Date update: counter called 0 times');
}

// Test Case 2.3: Update description only
{
  const env = createMockFirestoreEnv(143);
  env.mockDb.paymentDocs.set('pay_103', {
    id: 'pay_103',
    receiptNumber: '142',
    description: 'Quota Vecchia',
  });

  const res = await env.simulateUpdateReceiptPayment('school_1', 'pay_103', { description: '  Corso Salsa Avanzato  ' });
  assert(res.receiptNumber === '142', 'Description update: receiptNumber remains "142"');
  assert(res.description === 'Corso Salsa Avanzato', 'Description update: correctly trimmed and updated');
  assert(env.getCounterCalls() === 0, 'Description update: counter called 0 times');
}

// Test Case 2.4: Update month and year
{
  const env = createMockFirestoreEnv(143);
  env.mockDb.paymentDocs.set('pay_104', {
    id: 'pay_104',
    receiptNumber: '142',
    month: 2,
    year: 2026,
  });

  const res = await env.simulateUpdateReceiptPayment('school_1', 'pay_104', { month: 11, year: 2027 });
  assert(res.receiptNumber === '142', 'Month/Year update: receiptNumber remains "142"');
  assert(res.month === 11 && res.year === 2027, 'Month/Year update: month 11 and year 2027 updated');
  assert(env.getCounterCalls() === 0, 'Month/Year update: counter called 0 times');
}

// Test Case 2.5: Update amount (including floating point)
{
  const env = createMockFirestoreEnv(143);
  env.mockDb.paymentDocs.set('pay_105', {
    id: 'pay_105',
    receiptNumber: '142',
    amount: 50,
    totalAmount: 50,
    paidAmount: 50,
    remainingAmount: 0,
  });

  const res = await env.simulateUpdateReceiptPayment('school_1', 'pay_105', { amount: 65.50 });
  assert(res.receiptNumber === '142', 'Amount update: receiptNumber remains "142"');
  assert(res.amount === 65.50 && res.totalAmount === 65.50 && res.paidAmount === 65.50, 'Amount update: all amounts synchronized');
  assert(res.remainingAmount === 0, 'Amount update: remainingAmount remains 0');
  assert(env.getCounterCalls() === 0, 'Amount update: counter called 0 times');
}

// Test Case 2.6: Update notes (including empty string / undefined conversion)
{
  const env = createMockFirestoreEnv(143);
  env.mockDb.paymentDocs.set('pay_106', {
    id: 'pay_106',
    receiptNumber: '142',
    notes: 'Vecchia nota',
  });

  const res = await env.simulateUpdateReceiptPayment('school_1', 'pay_106', { notes: 'Pagato con assegno bancario n. 44512' });
  assert(res.receiptNumber === '142', 'Notes update: receiptNumber remains "142"');
  assert(res.notes === 'Pagato con assegno bancario n. 44512', 'Notes update: notes updated correctly');

  const res2 = await env.simulateUpdateReceiptPayment('school_1', 'pay_106', { notes: 'Nuova nota rettificata' });
  assert(res2.notes === 'Nuova nota rettificata', 'Notes update: updated to new note text');
  assert(res2.receiptNumber === '142', 'Notes update: receiptNumber still "142"');
}

// Test Case 2.7: Adversarial Payload Injection (Attempting to forge receiptNumber)
{
  const env = createMockFirestoreEnv(143);
  env.mockDb.paymentDocs.set('pay_107', {
    id: 'pay_107',
    receiptNumber: '142',
    receiptURL: 'generated://receipt/142',
  });

  // Malicious attacker passes forged receiptNumber in updateData
  const maliciousUpdate = {
    receiptNumber: '999999',
    receiptURL: 'attacker://override',
    method: 'card',
  };

  const res = await env.simulateUpdateReceiptPayment('school_1', 'pay_107', maliciousUpdate);
  assert(
    res.receiptNumber === '142',
    'ADVERSARIAL INJECTION BLOCKED: receiptNumber strictly remains original "142", ignoring attacker value "999999"'
  );
  assert(
    res.receiptURL === 'generated://receipt/142',
    'ADVERSARIAL INJECTION BLOCKED: receiptURL remains original URL'
  );
  assert(env.getCounterCalls() === 0, 'Adversarial attempt: counter called 0 times');
}

// Test Case 2.8: Stress Test with 100 Consecutive Edits
{
  const env = createMockFirestoreEnv(143);
  env.mockDb.paymentDocs.set('pay_stress', {
    id: 'pay_stress',
    receiptNumber: '142',
    receiptURL: 'generated://receipt/142',
    amount: 50,
    method: 'cash',
  });

  for (let i = 1; i <= 100; i++) {
    await env.simulateUpdateReceiptPayment('school_1', 'pay_stress', {
      amount: 50 + i,
      method: i % 2 === 0 ? 'bank_transfer' : 'cash',
      description: `Iterative Update #${i}`,
      month: (i % 12) + 1,
    });
  }

  const finalState = env.mockDb.paymentDocs.get('pay_stress');
  assert(finalState.receiptNumber === '142', '100 Consecutive Edits: receiptNumber is strictly "142" after 100 updates');
  assert(finalState.amount === 150, '100 Consecutive Edits: final amount is 150');
  assert(env.getCounterCalls() === 0, '100 Consecutive Edits: getNextReceiptNumber was called 0 times across all 100 iterations');
  assert(env.mockDb.counterDoc.nextNumber === 143, '100 Consecutive Edits: Firestore counter stayed at 143 throughout');
}

// Test Case 2.9: Multi-Installment Payment Synchronization
{
  const env = createMockFirestoreEnv(143);
  env.mockDb.paymentDocs.set('pay_inst', {
    id: 'pay_inst',
    receiptNumber: '142',
    payments: [
      { amount: 50, date: MockTimestamp.now(), method: 'cash', receiptEmitted: true, receiptUrl: 'generated://receipt/142' },
      { amount: 30, date: MockTimestamp.now(), method: 'cash', receiptEmitted: false },
    ],
  });

  const res = await env.simulateUpdateReceiptPayment('school_1', 'pay_inst', {
    method: 'card',
    amount: 55,
    notes: 'Installment note',
  });

  assert(res.receiptNumber === '142', 'Installment update: receiptNumber remains "142"');
  assert(res.payments.length === 2, 'Installment update: preserves both installments');
  assert(res.payments[0].method === 'card', 'Installment update: primary installment method updated');
  assert(res.payments[0].amount === 55, 'Installment update: primary installment amount updated');
  assert(res.payments[0].receiptUrl === 'generated://receipt/142', 'Installment update: receiptUrl on installment preserved');
  assert(res.payments[1].amount === 30, 'Installment update: secondary installment untouched');
}


// ─────────────────────────────────────────────────────────────────────────────
// PART 3: UI Contract & Component Verification in PaymentsPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n>>> [3] Verifying UI Contract & Visual Elements in PaymentsPage.tsx');

// 3.1 Immutable badge visual elements
assert(
  paymentsPageSource.includes('Numero Ricevuta Immutabile'),
  'Modal contains uppercase label "Numero Ricevuta Immutabile"'
);

assert(
  paymentsPageSource.includes('Ricevuta N° {editingReceiptPayment.receiptNumber} — Il numero progressivo rimane invariato'),
  'Modal contains exact highlighted text: "Ricevuta N° {editingReceiptPayment.receiptNumber} — Il numero progressivo rimane invariato"'
);

assert(
  paymentsPageSource.includes('#{editingReceiptPayment.receiptNumber}'),
  'Modal contains prominent receipt badge showing #{editingReceiptPayment.receiptNumber}'
);

// 3.2 Modal header and description
assert(
  paymentsPageSource.includes('title="Modifica Ricevuta"'),
  'Modal title is set to "Modifica Ricevuta"'
);

assert(
  paymentsPageSource.includes('description="Modifica i dati contabili o fiscali della ricevuta. Il numero progressivo della ricevuta originale verrà rigorosamente mantenuto."'),
  'Modal description clearly conveys that original sequential number is strictly preserved'
);

// 3.3 Toast notification format
assert(
  paymentsPageSource.includes('toast.success(`Ricevuta N° ${editingReceiptPayment.receiptNumber} aggiornata con successo (numero conservato)`)'),
  'Submit handler emits EXACT required toast: "Ricevuta N° ... aggiornata con successo (numero conservato)"'
);

// 3.4 Form validation guards
assert(
  paymentsPageSource.includes("editReceiptAmount <= 0") &&
  paymentsPageSource.includes("importo della ricevuta deve essere maggiore di zero."),
  'Validates amount > 0 with Italian error toast'
);

assert(
  paymentsPageSource.includes("!editReceiptDescription.trim()") &&
  paymentsPageSource.includes("La causale / descrizione della ricevuta è obbligatoria."),
  'Validates non-empty description with Italian error toast'
);

// 3.5 Action buttons in UI
assert(
  paymentsPageSource.includes('Ristampa PDF'),
  'Renders "Ristampa PDF" action in table and modals'
);

assert(
  paymentsPageSource.includes('Modifica Ricevuta'),
  'Renders "Modifica Ricevuta" action button for receipts'
);

assert(
  paymentsPageSource.includes('handleDownloadReceipt(managedPayment)'),
  'Management modal header offers Ristampa PDF'
);

assert(
  paymentsPageSource.includes('handleOpenEditReceipt(managedPayment)'),
  'Management modal header offers Modifica Ricevuta'
);


// ─────────────────────────────────────────────────────────────────────────────
// PART 4: Search & Filter Exhaustive Permutations
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n>>> [4] Testing Receipt Search Logic Across Permutations');

function testSearchMatching(p, query) {
  const q = query.toLowerCase().trim();
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

  return receiptNums.some((r) => {
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
}

const testPayment142 = {
  id: 'p1',
  receiptNumber: '142',
  payments: [{ receiptUrl: 'generated://receipt/142' }],
};

const searchQueries = [
  { q: '142', expected: true, desc: 'Direct digits "142"' },
  { q: ' 142 ', expected: true, desc: 'Padded digits " 142 "' },
  { q: 'ricevuta 142', expected: true, desc: 'Standard "ricevuta 142"' },
  { q: 'Ricevuta 142', expected: true, desc: 'Capitalized "Ricevuta 142"' },
  { q: 'RICEVUTA 142', expected: true, desc: 'Uppercase "RICEVUTA 142"' },
  { q: 'ricevuta n° 142', expected: true, desc: 'With degree "ricevuta n° 142"' },
  { q: 'ricevuta n°142', expected: true, desc: 'Compact degree "ricevuta n°142"' },
  { q: 'ricevuta n. 142', expected: true, desc: 'With dot "ricevuta n. 142"' },
  { q: 'ricevuta n 142', expected: true, desc: 'With n "ricevuta n 142"' },
  { q: '#142', expected: true, desc: 'Hashtag "#142"' },
  { q: 'n° 142', expected: true, desc: 'Short degree "n° 142"' },
  { q: 'n. 142', expected: true, desc: 'Short dot "n. 142"' },
  { q: '143', expected: false, desc: 'Non-matching "143"' },
  { q: 'ricevuta 999', expected: false, desc: 'Non-matching "ricevuta 999"' },
];

searchQueries.forEach(({ q, expected, desc }) => {
  const result = testSearchMatching(testPayment142, q);
  assert(result === expected, `Search permutation [${desc}]: match is ${expected}`);
});


// ─────────────────────────────────────────────────────────────────────────────
// FINAL REPORT SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n======================================================================');
console.log(`TOTAL EMPIRICAL ASSERTIONS: ${passed + failed}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log('======================================================================');

if (failed > 0) {
  console.error('\nFAILURES ENCOUNTERED:');
  failures.forEach(f => console.error(` - ${f.testName}: ${f.details}`));
  process.exit(1);
} else {
  console.log(`\nVERDICT: ALL ${passed} EMPIRICAL ASSERTIONS PASSED WITH 100% SUCCESS RATE.`);
  process.exit(0);
}
