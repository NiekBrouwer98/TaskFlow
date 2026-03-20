/**
 * One-time Google Calendar OAuth2 setup.
 *
 * Steps:
 *   1. Go to https://console.cloud.google.com/
 *   2. Create a project, enable "Google Calendar API"
 *   3. Create OAuth2 credentials (Desktop app), download as credentials.json
 *   4. Place credentials.json in the backend/ folder
 *   5. Run: node setup-google-auth.js
 *   6. Open the URL, authorize, paste the code back
 *   7. token.json will be saved — restart the backend
 */

import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = join(__dirname, 'credentials.json');
const TOKEN_PATH = join(__dirname, 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

if (!existsSync(CREDENTIALS_PATH)) {
  console.error(`\nError: credentials.json not found at ${CREDENTIALS_PATH}`);
  console.error('\nTo set up Google Calendar:');
  console.error('  1. Go to https://console.cloud.google.com/');
  console.error('  2. Create a project and enable "Google Calendar API"');
  console.error('  3. Create OAuth2 credentials (type: Desktop app)');
  console.error('  4. Download the JSON and save it as backend/credentials.json');
  console.error('  5. Re-run this script\n');
  process.exit(1);
}

const creds = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8'));
const { client_secret, client_id, redirect_uris } = creds.installed || creds.web;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });

console.log('\nOpen this URL in your browser to authorize Google Calendar access:\n');
console.log(authUrl);
console.log('');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Paste the authorization code here: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oAuth2Client.getToken(code.trim());
    writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log(`\nToken saved to ${TOKEN_PATH}`);
    console.log('Google Calendar is now configured. Restart the backend to apply.\n');
  } catch (e) {
    console.error('\nError retrieving token:', e.message);
  }
});
