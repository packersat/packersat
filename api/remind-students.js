// remind-students.js — no dependencies, uses Firestore REST API + Brevo
// Runs nightly via GitHub Actions cron (same run as remind-log) to email
// students the evening before an upcoming session. Skips cancelled sessions
// and respects the admin's "Student Session Reminders" toggle
// (settings/studentReminders).

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

    // Check if student reminders are enabled (default: enabled)
    const settingsRes = await fetch(`${FIRESTORE_BASE}/settings/studentReminders`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (settingsRes.ok) {
      const settingsData = await settingsRes.json();
      const enabled = settingsData.fields?.enabled?.booleanValue;
      if (enabled === false) {
        return res.status(200).json({ ok: true, skipped: true, reason: 'Student reminders disabled by admin' });
      }
    }

    // "Tomorrow" in Eastern time — the cron fires in the ET evening
    const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const tom = new Date(etNow);
    tom.setDate(tom.getDate() + 1);
    const tomorrowStr = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, '0')}-${String(tom.getDate()).padStart(2, '0')}`;

    const [sessions, users] = await Promise.all([
      getCollection(token, 'sessions'),
      getCollection(token, 'users')
    ]);

    const usersMap = {};
    users.forEach(u => { usersMap[u.id] = u; });

    const tomorrowSessions = sessions.filter(s =>
      s.date === tomorrowStr && s.status !== 'cancelled' && s.studentId
    );

    // Group by student so a student with multiple sessions gets one email
    const byStudent = {};
    tomorrowSessions.forEach(s => {
      if (!byStudent[s.studentId]) byStudent[s.studentId] = [];
      byStudent[s.studentId].push(s);
    });

    const results = [];

    for (const [studentId, studentSessions] of Object.entries(byStudent)) {
      const student = usersMap[studentId];
      if (!student?.email) continue;
      const studentName = student.name || student.email;
      studentSessions.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

      const detailRows = studentSessions.map((s, i) => {
        const tutorName = usersMap[s.tutorId]?.name || 'Your tutor';
        const bg1 = i % 2 ? '#fffdf7' : '#f4ecd9';
        return '<tr><td style="padding:12px 16px;background:' + bg1 + ';border-bottom:1px solid rgba(26,23,21,0.08)">'
          + '<div style="font-size:10px;color:#6b6258;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:3px">Time</div>'
          + '<div style="font-size:15px;color:#a31621;font-weight:600">' + (s.time ? formatTime(s.time) + ' Eastern' : 'Time TBD') + '</div>'
          + '<div style="font-size:13px;color:#1a1715;margin-top:6px">' + (s.location || 'Packer Collegiate Institute') + ' &middot; with ' + tutorName + '</div>'
          + '</td></tr>';
      }).join('');

      const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>'
        + '<body style="margin:0;padding:0;background:#f4ecd9;font-family:\'Inter\',Arial,sans-serif">'
        + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4ecd9;padding:40px 20px">'
        + '<tr><td align="center"><table width="560" style="max-width:560px;width:100%">'
        + '<tr><td style="background:#1a1715;padding:28px 36px;text-align:center">'
        + '<div style="font-family:Georgia,serif;font-size:22px;color:#fffdf7;font-style:italic">Packer<span style="color:#a31621">&middot;</span>SAT</div>'
        + '<div style="font-size:10px;color:rgba(255,253,247,0.5);letter-spacing:0.18em;text-transform:uppercase;margin-top:6px">Session Reminder</div>'
        + '</td></tr>'
        + '<tr><td style="background:#fffdf7;padding:32px 36px;border:1px solid rgba(26,23,21,0.1);border-top:none">'
        + '<p style="margin:0 0 12px;color:#1a1715;font-size:15px;line-height:1.6">Hi <strong>' + studentName + '</strong>,</p>'
        + '<p style="margin:0 0 24px;color:#6b6258;font-size:14px;line-height:1.75">Just a reminder — you have '
        + (studentSessions.length > 1 ? studentSessions.length + ' SAT tutoring sessions' : 'an SAT tutoring session')
        + ' <strong>tomorrow, ' + formatDate(tomorrowStr) + '</strong>.</p>'
        + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">' + detailRows + '</table>'
        + '<p style="margin:0;color:#6b6258;font-size:13px;line-height:1.6">Can\'t make it? Reply to this email as soon as you can so we can reschedule.</p>'
        + '</td></tr>'
        + '<tr><td style="background:#f4ecd9;padding:16px 36px;border:1px solid rgba(26,23,21,0.1);border-top:none;text-align:center">'
        + '<p style="margin:0;color:#8a8278;font-size:11px">Questions? Reply to this email &middot; packersat.org</p>'
        + '</td></tr></table></td></tr></table></body></html>';

      const firstTime = studentSessions[0].time ? ` at ${formatTime(studentSessions[0].time)}` : '';
      const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
        body: JSON.stringify({
          sender: { name: 'Packer SAT Tutoring', email: 'noreply@packersat.org' },
          to: [{ email: student.email, name: studentName }],
          replyTo: { email: 'jack@packersat.org' },
          subject: `Reminder: SAT tutoring tomorrow${firstTime}`,
          htmlContent: html
        })
      });

      results.push({ student: student.email, sessions: studentSessions.length, status: emailRes.status });
    }

    return res.status(200).json({ ok: true, date: tomorrowStr, studentsNotified: results.length, details: results });

  } catch (err) {
    console.error('remind-students error:', err);
    return res.status(500).json({ error: err.message });
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [yr, mo, dy] = dateStr.split('-').map(Number);
  return new Date(yr, mo - 1, dy).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
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
