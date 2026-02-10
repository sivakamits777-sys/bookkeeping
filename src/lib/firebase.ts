import * as admin from 'firebase-admin';
import { getGoogleCredentials } from './auth';

if (!admin.apps.length) {
    const serviceAccount = getGoogleCredentials();

    if (!serviceAccount) {
        throw new Error('No Google Cloud credentials found. Set GOOGLE_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS.');
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.PROJECT_ID
    });
}

export const firestore = admin.firestore();
export default admin;
