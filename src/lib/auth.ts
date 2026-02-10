import fs from 'fs';
import path from 'path';
import os from 'os';

export function getGoogleCredentials() {
    console.log('[AUTH] Checking for credentials...');

    // Check for individual environment variables
    if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
        console.log('[AUTH] Found individual credential environment variables');
        try {
            const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
            const creds = {
                type: 'service_account',
                project_id: process.env.PROJECT_ID || process.env.GOOGLE_PROJECT_ID,
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                private_key: privateKey,
            };

            // Write to temp file for libraries requiring file path
            const tempPath = path.join(os.tmpdir(), 'service_account_temp.json');
            // Check if file exists and content matches to avoid unnecessary writes/logs
            if (!fs.existsSync(tempPath)) {
                console.log(`[AUTH] Writing constructed credentials to temporary file: ${tempPath}`);
                fs.writeFileSync(tempPath, JSON.stringify(creds));
                console.log('[AUTH] Temp file created successfully');
            }

            process.env.GOOGLE_APPLICATION_CREDENTIALS = tempPath;
            return creds;
        } catch (e: any) {
            console.error('[AUTH] ERROR constructing credentials from env vars:', e.message);
        }
    }

    const jsonEnv = process.env.GOOGLE_CREDENTIALS_JSON;
    if (jsonEnv) {
        console.log(`[AUTH] Found GOOGLE_CREDENTIALS_JSON (Prefix: "${jsonEnv.substring(0, 20)}...")`);
        try {
            const creds = JSON.parse(jsonEnv);
            console.log('[AUTH] Successfully parsed GOOGLE_CREDENTIALS_JSON');

            // On Vercel or environments where we only have the JSON string, 
            // write it to a temp file to support libraries that strictly require a file path.
            const tempPath = path.join(os.tmpdir(), 'service_account_temp.json');
            console.log(`[AUTH] Writing credentials to temporary file: ${tempPath}`);

            if (!fs.existsSync(tempPath)) {
                fs.writeFileSync(tempPath, jsonEnv);
                console.log('[AUTH] Temp file created successfully');
            } else {
                console.log('[AUTH] Temp file already exists');
            }

            // Set the environment variable to point to our newly created temp file
            process.env.GOOGLE_APPLICATION_CREDENTIALS = tempPath;

            return creds;
        } catch (e: any) {
            console.error('[AUTH] ERROR: Failed to parse GOOGLE_CREDENTIALS_JSON:', e.message);
            throw new Error('Invalid GOOGLE_CREDENTIALS_JSON environment variable: ' + e.message);
        }
    }

    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credentialsPath) {
        console.warn('[AUTH] WARNING: No credential environment variables found');
        return null;
    }

    const absolutePath = path.isAbsolute(credentialsPath)
        ? credentialsPath
        : path.join(process.cwd(), credentialsPath);

    if (fs.existsSync(absolutePath)) {
        return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    }

    return null;
}
