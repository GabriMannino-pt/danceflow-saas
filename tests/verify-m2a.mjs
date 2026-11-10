import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { z } from 'zod';

// Extract getStudentFormSchema directly from src/components/students/StudentForm.tsx
const studentFormPath = path.resolve('src/components/students/StudentForm.tsx');
const studentFormSource = fs.readFileSync(studentFormPath, 'utf8');

// Extract the getStudentFormSchema implementation
const schemaMatch = studentFormSource.match(/const getStudentFormSchema = \([\s\S]*?\n\s*\};\n/);
if (!schemaMatch) {
  console.error('FAILED to find getStudentFormSchema in StudentForm.tsx');
  process.exit(1);
}

// Transpile TypeScript to JavaScript
const transpiled = ts.transpileModule(schemaMatch[0], {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Evaluate schema with z and exports in scope
const schemaFactory = new Function('z', 'exports', `${transpiled}; return getStudentFormSchema;`)(z, {});

console.log('Successfully loaded and transpiled getStudentFormSchema from StudentForm.tsx');

let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${testName}${details ? ' - ' + details : ''}`);
    failedTests++;
    failureDetails.push({ testName, details });
  }
}

// Base valid adult student
const validAdultData = {
  firstName: 'Mario',
  lastName: 'Rossi',
  dateOfBirth: '1990-05-15',
  gender: 'M',
  address: {
    street: 'Via Roma 10',
    city: 'Palermo',
    province: 'PA',
    postalCode: '90100',
    country: 'Italia',
  },
  contact: {
    studentPhone: '3331234567',
    studentEmail: 'mario.rossi@example.com',
  },
  medicalInfo: {
    medicalClearance: false,
  },
  isActive: true,
};

// Calculate birth date for a minor (15 years old)
const minorBirthDate = new Date();
minorBirthDate.setFullYear(minorBirthDate.getFullYear() - 15);
const minorDobString = minorBirthDate.toISOString().split('T')[0];

console.log('\n--- TEST SUITE 1: New minor registration with empty parent fields ---');
{
  const schema = schemaFactory(false); // isEditing = false
  const newMinorData = {
    ...validAdultData,
    dateOfBirth: minorDobString,
    contact: {
      studentPhone: '3339998877',
      studentEmail: 'minor@example.com',
      parentName: '',
      parentPhone: '',
      parentEmail: '',
      parentRelation: '',
    },
  };

  const result = schema.safeParse(newMinorData);
  assert(!result.success, 'New minor registration with empty parent fields must fail validation');

  if (!result.success) {
    const issues = result.error.issues;
    const parentNameIssue = issues.find(i => i.path.join('.') === 'contact.parentName');
    const parentPhoneIssue = issues.find(i => i.path.join('.') === 'contact.parentPhone');
    const parentEmailIssue = issues.find(i => i.path.join('.') === 'contact.parentEmail');
    const parentRelationIssue = issues.find(i => i.path.join('.') === 'contact.parentRelation');

    assert(Boolean(parentNameIssue), 'Issue reported for contact.parentName');
    assert(Boolean(parentPhoneIssue), 'Issue reported for contact.parentPhone');
    assert(Boolean(parentEmailIssue), 'Issue reported for contact.parentEmail');
    assert(Boolean(parentRelationIssue), 'Issue reported for contact.parentRelation');
  }
}

console.log('\n--- TEST SUITE 2: Editing existing minor student with empty parent fields ---');
{
  const schema = schemaFactory(true); // isEditing = true
  const editMinorData = {
    ...validAdultData,
    dateOfBirth: minorDobString,
    address: {
      street: 'Nuova Via Libertà 45',
      city: 'Palermo',
      province: 'PA',
      postalCode: '90144',
      country: 'Italia',
    },
    contact: {
      studentPhone: '3331112233', // Updated student phone
      studentEmail: 'minor.updated@example.com',
      parentName: '',
      parentPhone: '',
      parentEmail: '',
      parentRelation: '',
    },
  };

  const result = schema.safeParse(editMinorData);
  assert(result.success, 'Editing existing minor with empty parent fields must pass validation',
    !result.success ? JSON.stringify(result.error.issues) : '');
}

console.log('\n--- TEST SUITE 3: Minor student phone and email inputs ---');
{
  const schemaNew = schemaFactory(false);
  const minorWithContacts = {
    ...validAdultData,
    dateOfBirth: minorDobString,
    contact: {
      studentPhone: '+39 340 1234567',
      studentEmail: 'student.minor@danceflow.it',
      parentName: 'Giuseppe Rossi',
      parentPhone: '348 7654321',
      parentEmail: 'parent@danceflow.it',
      parentRelation: 'padre',
    },
  };

  const resultNew = schemaNew.safeParse(minorWithContacts);
  assert(resultNew.success, 'Valid minor with studentPhone and studentEmail passes registration');

  const schemaEdit = schemaFactory(true);
  const resultEdit = schemaEdit.safeParse(minorWithContacts);
  assert(resultEdit.success, 'Valid minor with studentPhone and studentEmail passes edit');
}

console.log('\n--- TEST SUITE 4: Invalid inputs (bad email format, invalid date) ---');
{
  const schema = schemaFactory(false);

  // 4A: Invalid date
  const invalidDateData = {
    ...validAdultData,
    dateOfBirth: 'invalid-date-string',
  };
  const resultDate = schema.safeParse(invalidDateData);
  assert(!resultDate.success, 'Invalid date of birth must fail validation');
  if (!resultDate.success) {
    const dateIssue = resultDate.error.issues.find(i => i.path.includes('dateOfBirth'));
    assert(Boolean(dateIssue), 'Error specifies invalid date on dateOfBirth');
  }

  // 4B: Bad email format on studentEmail
  const invalidStudentEmailData = {
    ...validAdultData,
    contact: {
      ...validAdultData.contact,
      studentEmail: 'not-an-email',
    },
  };
  const resultStudentEmail = schema.safeParse(invalidStudentEmailData);
  assert(!resultStudentEmail.success, 'Invalid studentEmail ("not-an-email") must fail validation',
    resultStudentEmail.success ? 'Schema permitted invalid student email string!' : '');

  // 4C: Bad email format on parentEmail
  const invalidParentEmailData = {
    ...validAdultData,
    dateOfBirth: minorDobString,
    contact: {
      parentName: 'Giuseppe Rossi',
      parentPhone: '348 7654321',
      parentEmail: 'not-an-email',
      parentRelation: 'padre',
    },
  };
  const resultParentEmail = schema.safeParse(invalidParentEmailData);
  assert(!resultParentEmail.success, 'Invalid parentEmail ("not-an-email") must fail validation',
    resultParentEmail.success ? 'Schema permitted invalid parent email string!' : '');

  // 4D: Invalid Fiscal Code
  const invalidCFData = {
    ...validAdultData,
    fiscalCode: 'INVALID_CF_123',
  };
  const resultCF = schema.safeParse(invalidCFData);
  assert(!resultCF.success, 'Invalid fiscal code pattern must fail validation');

  // 4E: Short first name / last name
  const invalidNameData = {
    ...validAdultData,
    firstName: 'A',
    lastName: '',
  };
  const resultName = schema.safeParse(invalidNameData);
  assert(!resultName.success, 'Short names (<2 chars) must fail validation');
}

console.log('\n--- TEST SUITE 5: Stress & Boundary Conditions ---');
{
  const schemaNew = schemaFactory(false);

  // Exactly 18th birthday today -> adult
  const exactly18Dob = new Date();
  exactly18Dob.setFullYear(exactly18Dob.getFullYear() - 18);
  const exactly18Data = {
    ...validAdultData,
    dateOfBirth: exactly18Dob.toISOString().split('T')[0],
    contact: {
      studentPhone: '3331234567',
    },
  };
  const res18 = schemaNew.safeParse(exactly18Data);
  assert(res18.success, 'Person turning 18 today is treated as adult (no parent required)');

  // 17 years and 364 days -> minor
  const almost18Dob = new Date();
  almost18Dob.setFullYear(almost18Dob.getFullYear() - 18);
  almost18Dob.setDate(almost18Dob.getDate() + 1); // 1 day before 18th birthday
  const almost18Data = {
    ...validAdultData,
    dateOfBirth: almost18Dob.toISOString().split('T')[0],
    contact: {
      studentPhone: '3331234567',
    },
  };
  const resAlmost18 = schemaNew.safeParse(almost18Data);
  assert(!resAlmost18.success, 'Person 1 day before 18th birthday is minor (parent required on new registration)');

  // Medical clearance without expiry date -> must fail
  const medicalClearanceWithoutExpiry = {
    ...validAdultData,
    medicalInfo: {
      medicalClearance: true,
      medicalClearanceExpiry: '',
    },
  };
  const resMed = schemaNew.safeParse(medicalClearanceWithoutExpiry);
  assert(!resMed.success, 'medicalClearance = true without expiry date must fail validation');

  // Medical clearance with valid expiry date -> must pass
  const medicalClearanceWithExpiry = {
    ...validAdultData,
    medicalInfo: {
      medicalClearance: true,
      medicalClearanceExpiry: '2027-12-31',
    },
  };
  const resMedValid = schemaNew.safeParse(medicalClearanceWithExpiry);
  assert(resMedValid.success, 'medicalClearance = true with valid expiry date must pass validation');
}

console.log('\n======================================================');
console.log(`TOTAL PASSED: ${passedTests}`);
console.log(`TOTAL FAILED: ${failedTests}`);
if (failedTests > 0) {
  console.log('\nFAILED TEST SUMMARY:');
  failureDetails.forEach(f => console.log(` - ${f.testName}: ${f.details}`));
}
console.log('======================================================\n');
