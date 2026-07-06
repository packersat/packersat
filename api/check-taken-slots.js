// check-taken-slots.js — no dependencies, uses Firestore REST API
// Public endpoint (confirm.html runs unauthenticated) that checks whether
// specific tutor/date/time combinations already have a confirmed session,
// regardless of which picker link (or the admin portal directly) created it.
// Returns only the taken date|time keys — never session/student details.

const PROJECT_ID = 'packer-sat';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function getAccessToken() {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore'
  }));
  const signingInput = `${header}.${payload}`;
  const key = await importPrivateKey(sa.private_key);
  const signature = await signJWT(signingInput, key);
  const jwt = `${signingInput}.${signature}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(data));
  return data.access_token;
}

function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function importPrivateKey(pem) {
  const pemContents = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binaryDer = Buffer.from(pemContents, 'base64');
  return crypto.subtle.importKey(
    'pkcs8', binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
}

async function signJWT(input, key) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, data);
  return Buffer.from(sig).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function parseValue(v) {
  if (!v) return null;
  if (v.stringValue  !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue);
  if (v.booleanValue !== undefined) return v.booleanValue;
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tutorId, slots } = req.body || {};
  if (!tutorId || !Array.isArray(slots) || !slots.length) {
    return res.status(400).json({ error: 'tutorId and slots[] are required' });
  }

  try {
    const token = await getAccessToken();

    const runQueryRes = await fetch(`${FIRESTORE_BASE}:runQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'sessions' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'tutorId' },
              op: 'EQUAL',
              value: { stringValue: tutorId },
            },
          },
        },
      }),
    });
    const rows = await runQueryRes.json();

    const takenSet = new Set();
    (Array.isArray(rows) ? rows : []).forEach(r => {
      const fields = r.document?.fields;
      if (!fields) return;
      const date = parseValue(fields.date);
      const time = parseValue(fields.time);
      if (date && time) takenSet.add(`${date}|${time}`);
    });

    const taken = slots
      .map(s => `${s.date}|${s.time}`)
      .filter(key => takenSet.has(key));

    return res.status(200).json({ taken });

  } catch(e) {
    console.error('check-taken-slots error:', e);
    return res.status(500).json({ error: e.message });
  }
}
