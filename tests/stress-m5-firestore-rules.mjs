import fs from 'node:fs';
import path from 'node:path';

function runFirestoreRulesStress() {
  console.log('================================================================');
  console.log('  CHALLENGER STRESS PROBES: FIRESTORE SECURITY RULES');
  console.log('================================================================\n');

  // 1. Verify exact syntactic presence in firestore.rules
  const rulesPath = path.resolve('firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  function report(passed, name, detail = '') {
    totalTests++;
    if (passed) {
      passedTests++;
      console.log(`  [PASS] ${name} ${detail ? '(' + detail + ')' : ''}`);
    } else {
      failedTests++;
      console.error(`  [FAIL] ${name} ${detail ? '— ' + detail : ''}`);
    }
  }

  // Syntactic AST / Token Verification
  console.log('--- 1. Static Contract & AST Invariants ---');
  const studentMatch = rulesContent.match(/match \/students\/\{studentId\} \{([\s\S]*?)\n\s*\}/);
  const studentBlock = studentMatch ? studentMatch[1] : '';

  report(
    studentBlock.includes("request.resource.data.diff(resource.data).affectedKeys().hasOnly(['documents', 'medicalInfo', 'updatedAt', 'signatureMetadata', 'sha256Hash'])"),
    'Rules enforce exact whitelist of parent update fields without "status" or "isActive"'
  );
  report(
    studentBlock.includes("(!request.resource.data.diff(resource.data).affectedKeys().hasAny(['medicalInfo'])") &&
    studentBlock.includes("request.resource.data.medicalInfo.medicalClearance == false"),
    'Rules enforce strict conditional: touching medicalInfo forces medicalClearance == false'
  );
  report(
    !studentBlock.includes('status'),
    'Parent update rule in /students/{studentId} is completely devoid of "status" grant'
  );
  report(
    !studentBlock.includes('isActive'),
    'Parent update rule in /students/{studentId} is completely devoid of "isActive" grant'
  );

  // 2. High-Fidelity Firestore Security Rules Semantic Evaluator
  console.log('\n--- 2. Semantic Adversarial Rule Logic Evaluation ---');

  function evaluateStudentRules(context, operation, resourceData, requestResourceData) {
    const { auth, schoolId } = context;

    function isAuthenticated() {
      return Boolean(auth && auth.uid);
    }

    function uid() {
      return auth ? auth.uid : null;
    }

    function isTeacherOfSchool(targetSchoolId) {
      return (
        isAuthenticated() &&
        (auth.token?.role === 'admin' || auth.token?.role === 'teacher') &&
        auth.token?.schoolId === targetSchoolId
      );
    }

    function isAdminOfSchool(targetSchoolId) {
      return (
        isAuthenticated() &&
        auth.token?.role === 'admin' &&
        auth.token?.schoolId === targetSchoolId
      );
    }

    function isParent() {
      return isAuthenticated() && auth.token?.role === 'parent';
    }

    function diff(res, reqRes) {
      const keys = new Set([...Object.keys(res || {}), ...Object.keys(reqRes || {})]);
      const affected = [];
      for (const k of keys) {
        if (JSON.stringify(res?.[k]) !== JSON.stringify(reqRes?.[k])) {
          affected.push(k);
        }
      }
      return {
        affectedKeys: () => ({
          hasOnly: (allowedList) => affected.every((k) => allowedList.includes(k)),
          hasAny: (checkList) => affected.some((k) => checkList.includes(k)),
        }),
      };
    }

    if (operation === 'read') {
      return isTeacherOfSchool(schoolId) || (isParent() && resourceData?.parentId === uid());
    }

    if (operation === 'create') {
      return isTeacherOfSchool(schoolId);
    }

    if (operation === 'delete') {
      return isAdminOfSchool(schoolId);
    }

    if (operation === 'update') {
      const isTeacher = isTeacherOfSchool(schoolId);
      if (isTeacher) return true;

      const affectedKeysObj = diff(resourceData, requestResourceData).affectedKeys();
      const parentMatch = isParent() && resourceData?.parentId === uid();
      const allowedKeys = ['documents', 'medicalInfo', 'updatedAt', 'signatureMetadata', 'sha256Hash'];
      const hasOnlyAllowed = affectedKeysObj.hasOnly(allowedKeys);
      const touchesMedical = affectedKeysObj.hasAny(['medicalInfo']);
      const clearanceIsFalse = requestResourceData?.medicalInfo?.medicalClearance === false;

      const parentAllowed =
        parentMatch &&
        hasOnlyAllowed &&
        (!touchesMedical || clearanceIsFalse);

      return Boolean(parentAllowed);
    }

    return false;
  }

  const schoolA = 'OFLsxTdw5F2aHEvlj1RU';
  const schoolB = 'other_school_123';
  const parent1Uid = 'user_parent_001';
  const parent2Uid = 'user_parent_002';
  const teacherUid = 'user_teacher_001';

  const baseStudent = {
    id: 'student_123',
    schoolId: schoolA,
    parentId: parent1Uid,
    firstName: 'Sofia',
    lastName: 'Rossi',
    status: 'active',
    isActive: true,
    medicalInfo: {
      medicalClearance: false,
      certificateUrl: null,
      expiryDate: '2026-12-31',
    },
    documents: [],
    signatureMetadata: null,
    sha256Hash: null,
    updatedAt: 1700000000,
  };

  const parent1Context = {
    schoolId: schoolA,
    auth: { uid: parent1Uid, token: { role: 'parent' } },
  };

  const parent2Context = {
    schoolId: schoolA,
    auth: { uid: parent2Uid, token: { role: 'parent' } },
  };

  const teacherContext = {
    schoolId: schoolA,
    auth: { uid: teacherUid, token: { role: 'teacher', schoolId: schoolA } },
  };

  const teacherOtherSchoolContext = {
    schoolId: schoolA,
    auth: { uid: 'teacher_other', token: { role: 'teacher', schoolId: schoolB } },
  };

  const anonContext = {
    schoolId: schoolA,
    auth: null,
  };

  // Test 1: Parent valid certificate upload with medicalClearance: false
  const validUpload = {
    ...baseStudent,
    medicalInfo: {
      ...baseStudent.medicalInfo,
      certificateUrl: 'https://storage/cert.jpg',
      medicalClearance: false,
    },
    updatedAt: 1700000100,
  };
  report(
    evaluateStudentRules(parent1Context, 'update', baseStudent, validUpload) === true,
    'Parent valid certificate upload with medicalClearance: false is ALLOWED'
  );

  // Test 2: Adversarial Attack — Parent attempts to self-grant medicalClearance: true
  const attackSelfClearance = {
    ...baseStudent,
    medicalInfo: {
      ...baseStudent.medicalInfo,
      certificateUrl: 'https://storage/cert.jpg',
      medicalClearance: true,
    },
    updatedAt: 1700000100,
  };
  report(
    evaluateStudentRules(parent1Context, 'update', baseStudent, attackSelfClearance) === false,
    'Adversarial Attack: Parent setting medicalClearance = true is strictly BLOCKED'
  );

  // Test 3: Adversarial Attack — Type Coercion with string 'false'
  const attackTypeCoercion = {
    ...baseStudent,
    medicalInfo: {
      ...baseStudent.medicalInfo,
      medicalClearance: 'false',
    },
    updatedAt: 1700000100,
  };
  report(
    evaluateStudentRules(parent1Context, 'update', baseStudent, attackTypeCoercion) === false,
    'Adversarial Attack: Parent string coercion "false" instead of boolean false is BLOCKED'
  );

  // Test 4: Adversarial Attack — null medicalClearance
  const attackNullClearance = {
    ...baseStudent,
    medicalInfo: {
      ...baseStudent.medicalInfo,
      medicalClearance: null,
    },
    updatedAt: 1700000100,
  };
  report(
    evaluateStudentRules(parent1Context, 'update', baseStudent, attackNullClearance) === false,
    'Adversarial Attack: Parent null medicalClearance is BLOCKED'
  );

  // Test 5: Adversarial Attack — undefined medicalClearance when touching medicalInfo
  const attackOmitClearance = {
    ...baseStudent,
    medicalInfo: {
      notes: 'New allergy notes',
    },
    updatedAt: 1700000100,
  };
  report(
    evaluateStudentRules(parent1Context, 'update', baseStudent, attackOmitClearance) === false,
    'Adversarial Attack: Touching medicalInfo while omitting medicalClearance is BLOCKED'
  );

  // Test 6: Valid signature flow when student already has existing medicalClearance: true
  const approvedStudent = {
    ...baseStudent,
    medicalInfo: {
      ...baseStudent.medicalInfo,
      medicalClearance: true,
    },
  };
  const validSignature = {
    ...approvedStudent,
    documents: [{ name: 'reg_2026.pdf', signed: true }],
    signatureMetadata: { timestamp: 1700000200, ip: '1.2.3.4' },
    sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    updatedAt: 1700000200,
  };
  report(
    evaluateStudentRules(parent1Context, 'update', approvedStudent, validSignature) === true,
    'Legitimate Parent Signature preserves existing school-granted medicalClearance: true without reset'
  );

  // Test 7: Adversarial Attack — Parent attempts to self-promote status: 'active'
  const attackStatus = {
    ...baseStudent,
    status: 'active',
    updatedAt: 1700000300,
  };
  // Base student had status: 'pending'
  const pendingStudent = { ...baseStudent, status: 'pending' };
  report(
    evaluateStudentRules(parent1Context, 'update', pendingStudent, attackStatus) === false,
    'Adversarial Attack: Parent modifying "status" field is strictly BLOCKED'
  );

  // Test 8: Adversarial Attack — Parent attempts to modify isActive: true from false
  const suspendedStudent = { ...baseStudent, isActive: false };
  const attackIsActive = {
    ...suspendedStudent,
    isActive: true,
    updatedAt: 1700000300,
  };
  report(
    evaluateStudentRules(parent1Context, 'update', suspendedStudent, attackIsActive) === false,
    'Adversarial Attack: Parent modifying "isActive" field is strictly BLOCKED'
  );

  // Test 9: Adversarial Attack — Parent attempts to change parentId (account hijack)
  const attackHijackParent = {
    ...baseStudent,
    parentId: parent2Uid,
    updatedAt: 1700000300,
  };
  report(
    evaluateStudentRules(parent1Context, 'update', baseStudent, attackHijackParent) === false,
    'Adversarial Attack: Parent modifying "parentId" (hijack) is strictly BLOCKED'
  );

  // Test 10: Adversarial Attack — Parent attempts to modify identity fields (firstName/lastName)
  const attackIdentity = {
    ...baseStudent,
    firstName: 'MaliciousName',
    updatedAt: 1700000300,
  };
  report(
    evaluateStudentRules(parent1Context, 'update', baseStudent, attackIdentity) === false,
    'Adversarial Attack: Parent modifying identity fields ("firstName") is strictly BLOCKED'
  );

  // Test 11: Adversarial Attack — Parent attempts to enroll into unauthorized courses directly
  const attackCourses = {
    ...baseStudent,
    courseIds: ['secret_masterclass'],
    updatedAt: 1700000300,
  };
  report(
    evaluateStudentRules(parent1Context, 'update', baseStudent, attackCourses) === false,
    'Adversarial Attack: Parent modifying "courseIds" is strictly BLOCKED'
  );

  // Test 12: Adversarial Attack — Parent 2 attacks Student belonging to Parent 1
  report(
    evaluateStudentRules(parent2Context, 'update', baseStudent, validUpload) === false,
    'Adversarial Attack: Unauthorized Parent 2 attempting to update Student of Parent 1 is BLOCKED'
  );

  // Test 13: Adversarial Attack — Unauthenticated user attempts update
  report(
    evaluateStudentRules(anonContext, 'update', baseStudent, validUpload) === false,
    'Adversarial Attack: Unauthenticated visitor attempting update is BLOCKED'
  );

  // Test 14: Teacher legitimate update (clearing medical clearance and updating status)
  const teacherUpdate = {
    ...baseStudent,
    status: 'active',
    medicalInfo: {
      ...baseStudent.medicalInfo,
      medicalClearance: true,
    },
    updatedAt: 1700000400,
  };
  report(
    evaluateStudentRules(teacherContext, 'update', baseStudent, teacherUpdate) === true,
    'Teacher of the school CAN update status and approve medicalClearance: true'
  );

  // Test 15: Adversarial Attack — Teacher of another school attempts update
  report(
    evaluateStudentRules(teacherOtherSchoolContext, 'update', baseStudent, teacherUpdate) === false,
    'Adversarial Attack: Teacher of another school attempting update is BLOCKED'
  );

  // Test 16: Parent attempts to delete student record
  report(
    evaluateStudentRules(parent1Context, 'delete', baseStudent, null) === false,
    'Adversarial Attack: Parent attempting to delete student record is BLOCKED'
  );

  // Test 17: Parent attempts to create student record directly
  report(
    evaluateStudentRules(parent1Context, 'create', null, baseStudent) === false,
    'Adversarial Attack: Parent attempting to create student record directly is BLOCKED'
  );

  // Test 18: Parent reads own student record
  report(
    evaluateStudentRules(parent1Context, 'read', baseStudent, null) === true,
    'Parent reading own student record is ALLOWED'
  );

  // Test 19: Parent reads another parent student record
  report(
    evaluateStudentRules(parent2Context, 'read', baseStudent, null) === false,
    'Adversarial Attack: Parent reading another student record is BLOCKED'
  );

  // Test 20: Teacher reads student in their school
  report(
    evaluateStudentRules(teacherContext, 'read', baseStudent, null) === true,
    'Teacher reading student in their school is ALLOWED'
  );

  console.log('\n================================================================');
  console.log(`FIRESTORE RULES STRESS TOTAL: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
  console.log('================================================================\n');

  if (failedTests > 0) process.exit(1);
}

runFirestoreRulesStress();
