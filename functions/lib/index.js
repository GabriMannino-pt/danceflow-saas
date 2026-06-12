"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onSchoolCreated = exports.checkMedicalExpirations = void 0;
const admin = require("firebase-admin");
// Initialize Firebase Admin SDK
admin.initializeApp();
// Export Cloud Functions
var checkMedicalExpirations_1 = require("./jobs/checkMedicalExpirations");
Object.defineProperty(exports, "checkMedicalExpirations", { enumerable: true, get: function () { return checkMedicalExpirations_1.checkMedicalExpirations; } });
var onSchoolCreated_1 = require("./triggers/onSchoolCreated");
Object.defineProperty(exports, "onSchoolCreated", { enumerable: true, get: function () { return onSchoolCreated_1.onSchoolCreated; } });
//# sourceMappingURL=index.js.map