// remind-log.js — no dependencies, uses Firestore REST API + Brevo
// Runs nightly via GitHub Actions cron to remind tutors to log their sessions

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

async function getCollection(token, collection) {
  const res = await fetch(`${FIRESTORE_BASE}/${collection}?pageSize=1000`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  return (data.documents || []).map(parseDoc);
}

function parseDoc(doc) {
  const id = doc.name.split('/').pop();
  const fields = {};
  for (const [k, v] of Object.entries(doc.fields || {})) {
    fields[k] = parseValue(v);
  }
  return { id, ...fields };
}

function parseValue(v) {
  if (v.stringValue  !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue);
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.arrayValue   !== undefined) return (v.arrayValue.values || []).map(parseValue);
  if (v.mapValue     !== undefined) {
    const obj = {};
    for (const [k, fv] of Object.entries(v.mapValue.fields || {})) obj[k] = parseValue(fv);
    return obj;
  }
  return null;
}

export default async function handler(req, res) {
  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const token = await getAccessToken();
    const now   = new Date();

    // Check if reminders are enabled
    const settingsRes = await fetch(`${FIRESTORE_BASE}/settings/reminders`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (settingsRes.ok) {
      const settingsData = await settingsRes.json();
      const enabled = settingsData.fields?.enabled?.booleanValue;
      if (enabled === false) {
        return res.status(200).json({ ok: true, skipped: true, reason: 'Reminders disabled by admin' });
      }
    }
    // If doc doesn't exist yet, default to enabled

    const [sessions, logs, users] = await Promise.all([
      getCollection(token, 'sessions'),
      getCollection(token, 'sessionLogs'),
      getCollection(token, 'users')
    ]);

    const usersMap = {};
    users.forEach(u => { usersMap[u.id] = u; });

    const loggedSessionIds = new Set();
    logs.forEach(l => { if (l.sessionId) loggedSessionIds.add(l.sessionId); });

    const unlogged = sessions.filter(s => {
      if (loggedSessionIds.has(s.id)) return false;
      if (!s.date) return false;
      const [yr, mo, dy] = s.date.split('-').map(Number);
      let sessionStart;
      if (s.time && /^\d{1,2}:\d{2}$/.test(s.time.trim())) {
        const [h, m] = s.time.trim().split(':').map(Number);
        sessionStart = new Date(yr, mo - 1, dy, h, m, 0);
      } else {
        sessionStart = new Date(yr, mo - 1, dy, 0, 0, 0);
      }
      return now >= new Date(sessionStart.getTime() + 30 * 60 * 1000);
    });

    const byTutor = {};
    unlogged.forEach(s => {
      if (!s.tutorId) return;
      if (!byTutor[s.tutorId]) byTutor[s.tutorId] = [];
      byTutor[s.tutorId].push(s);
    });

    const results = [];

    for (const [tutorId, tutorSessions] of Object.entries(byTutor)) {
      const tutor = usersMap[tutorId];
      if (!tutor?.email) continue;
      const tutorName = tutor.name || tutor.email;
      const count = tutorSessions.length;

      const sessionRows = tutorSessions
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(s => {
          const student = usersMap[s.studentId];
          const sName   = student?.name || student?.email || 'Unknown student';
          const timeStr = s.time ? ` at ${formatTime(s.time)}` : '';
          return `<tr>
            <td style="padding:10px 0;border-bottom:1px solid rgba(250,250,248,0.07);color:rgba(250,250,248,0.9);font-size:14px">${formatDate(s.date)}${timeStr}</td>
            <td style="padding:10px 0;border-bottom:1px solid rgba(250,250,248,0.07);color:rgba(250,250,248,0.6);font-size:14px">${sName}</td>
          </tr>`;
        }).join('');

      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#1A0508;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#1A0508;padding:40px 20px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
      <tr><td style="background:linear-gradient(135deg,#6B0F1A,#C0182B);padding:36px 40px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="margin:0;font-family:Georgia,serif;font-size:26px;font-weight:700;color:#FAFAF8">Packer <span style="color:#C8A96E">SAT</span> Prep</h1>
        <p style="margin:8px 0 0;color:rgba(250,250,248,0.75);font-size:13px;letter-spacing:0.1em;text-transform:uppercase">Session Log Reminder</p>
      </td></tr>
      <tr><td style="background:#2A0A10;padding:40px;border-left:1px solid rgba(192,24,43,0.2);border-right:1px solid rgba(192,24,43,0.2)">
        <p style="margin:0 0 8px;color:#FAFAF8;font-size:16px;line-height:1.6">Hi <strong>${tutorName}</strong>,</p>
        <p style="margin:0 0 24px;color:#FAFAF8;font-size:15px;line-height:1.7">
          You have <strong>${count} past session${count > 1 ? 's' : ''}</strong> that ${count > 1 ? 'have' : 'has'} not been logged yet.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px">
          <thead>
            <tr>
              <th style="text-align:left;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#C8A96E;padding-bottom:8px;border-bottom:1px solid rgba(192,24,43,0.3)">Date</th>
              <th style="text-align:left;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#C8A96E;padding-bottom:8px;border-bottom:1px solid rgba(192,24,43,0.3)">Student</th>
            </tr>
          </thead>
          <tbody>${sessionRows}</tbody>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
          <tr><td align="center">
            <a href="https://www.packersat.org/portal" style="display:inline-block;background:#C0182B;color:#FAFAF8;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:4px">Go to Session Log</a>
          </td></tr>
        </table>
        <p style="margin:0;color:rgba(250,250,248,0.4);font-size:13px;line-height:1.6">Once a session is logged in the portal, it will no longer appear in these reminders.</p>
      </td></tr>
      <tr><td style="background:#0F0305;padding:24px 40px;border-radius:0 0 8px 8px;border:1px solid rgba(192,24,43,0.15);border-top:none;text-align:center">
        <p style="margin:0;color:rgba(250,250,248,0.25);font-size:12px">Packer SAT Tutoring &middot; The Packer Collegiate Institute &middot; Brooklyn, NY</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

      const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
        body: JSON.stringify({
          sender: { name: 'Packer SAT', email: 'noreply@packersat.org' },
          to: [{ email: tutor.email, name: tutorName }],
          subject: `Reminder: ${count} unlogged session${count > 1 ? 's' : ''} — Packer SAT`,
          htmlContent: html
        })
      });

      results.push({ tutor: tutor.email, sessions: count, status: emailRes.status });
    }

    return res.status(200).json({ ok: true, tutorsNotified: results.length, totalUnlogged: unlogged.length, details: results });

  } catch (err) {
    console.error('remind-log error:', err);
    return res.status(500).json({ error: err.message });
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [yr, mo, dy] = dateStr.split('-').map(Number);
  return new Date(yr, mo - 1, dy).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });
}

function formatTime(t) {
  if (!t) return '';
  const s = t.trim();
  if (/am|pm/i.test(s)) return s;
  const [h, m] = s.split(':');
  const hour = parseInt(h);
  if (isNaN(hour)) return s;
  return `${hour % 12 || 12}:${m} ${hour < 12 ? 'AM' : 'PM'}`;
}
