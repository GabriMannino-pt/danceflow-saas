import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
admin.initializeApp();

// Export Cloud Functions
export { checkMedicalExpirations } from './jobs/checkMedicalExpirations';
export { onSchoolCreated } from './triggers/onSchoolCreated';
