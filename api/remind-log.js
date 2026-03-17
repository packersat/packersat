import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin once (Vercel may reuse the instance)
if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

export default async function handler(req, res) {

  // Only allow GET or POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Security check — must include the secret
  const authHeader = req.headers['authorization'] || '';
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = getFirestore();
    const now = new Date();

    // Fetch everything we need
    const [sessionsSnap, logsSnap, usersSnap] = await Promise.all([
      db.collection('sessions').get(),
      db.collection('sessionLogs').get(),
      db.collection('users').get()
    ]);

    // Build a set of session IDs that have already been logged
    const loggedSessionIds = new Set();
    logsSnap.forEach(d => {
      const sid = d.data().sessionId;
      if (sid) loggedSessionIds.add(sid);
    });

    // Build a users map
    const users = {};
    usersSnap.forEach(d => { users[d.id] = d.data(); });

    // Find all sessions that ended 30+ min ago and haven't been logged
    const unlogged = [];
    sessionsSnap.forEach(d => {
      const s = { id: d.id, ...d.data() };
      if (loggedSessionIds.has(s.id)) return;
      if (!s.date) return;

      let sessionStart;
      const [yr, mo, dy] = s.date.split('-').map(Number);
      if (s.time && /^\d{1,2}:\d{2}$/.test(s.time.trim())) {
        const [h, m] = s.time.trim().split(':').map(Number);
        sessionStart = new Date(yr, mo - 1, dy, h, m, 0);
      } else {
        sessionStart = new Date(yr, mo - 1, dy, 0, 0, 0);
      }

      const cutoff = new Date(sessionStart.getTime() + 30 * 60 * 1000);
      if (now >= cutoff) unlogged.push(s);
    });

    // Group unlogged sessions by tutor
    const byTutor = {};
    unlogged.forEach(s => {
      if (!s.tutorId) return;
      if (!byTutor[s.tutorId]) byTutor[s.tutorId] = [];
      byTutor[s.tutorId].push(s);
    });

    // Send one reminder email per tutor
    const results = [];
    for (const [tutorId, sessions] of Object.entries(byTutor)) {
      const tutor = users[tutorId];
      if (!tutor?.email) continue;

      const tutorName = tutor.name || tutor.email;

      const sessionRows = sessions
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(s => {
          const studentName = users[s.studentId]?.name || users[s.studentId]?.email || 'Unknown student';
          const timeStr = s.time ? ` at ${formatTime(s.time)}` : '';
          return `
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid rgba(250,250,248,0.07);color:rgba(250,250,248,0.9);font-size:14px">${formatDate(s.date)}${timeStr}</td>
              <td style="padding:10px 0;border-bottom:1px solid rgba(250,250,248,0.07);color:rgba(250,250,248,0.6);font-size:14px">${studentName}</td>
            </tr>`;
        }).join('');

      const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#1A0508;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A0508;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

        <tr><td style="background:linear-gradient(135deg,#6B0F1A,#C0182B);padding:36px 40px;border-radius:8px 8px 0 0;text-align:center">
          <h1 style="margin:0;font-family:Georgia,serif;font-size:26px;font-weight:700;color:#FAFAF8;letter-spacing:0.02em">Packer <span style="color:#C8A96E">SAT</span> Prep</h1>
          <p style="margin:8px 0 0;color:rgba(250,250,248,0.75);font-size:13px;letter-spacing:0.1em;text-transform:uppercase">Session Log Reminder</p>
        </td></tr>

        <tr><td style="background:#2A0A10;padding:40px;border-left:1px solid rgba(192,24,43,0.2);border-right:1px solid rgba(192,24,43,0.2)">
          <p style="margin:0 0 8px;color:#FAFAF8 !important;font-size:16px;line-height:1.6" color="#FAFAF8">Hi <strong>${tutorName}</strong>,</p>
          <p style="margin:0 0 24px;color:#FAFAF8 !important;font-size:15px;line-height:1.7" color="#FAFAF8">
            You have <strong>${sessions.length} past session${sessions.length > 1 ? 's' : ''}</strong> that ${sessions.length > 1 ? 'have' : 'has'} not been logged yet.
            You'll receive this reminder each night until ${sessions.length > 1 ? 'they are' : 'it is'} logged.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px">
            <thead>
              <tr>
                <th style="text-align:left;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#C8A96E;padding-bottom:8px;border-bottom:1px solid rgba(192,24,43,0.3)">Date</th>
                <th style="text-align:left;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#C8A96E;padding-bottom:8px;border-bottom:1px solid rgba(192,24,43,0.3)">Student</th>
              </tr>
            </thead>
            <tbody>
              ${sessionRows}
            </tbody>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
            <tr><td align="center">
              <a href="https://www.packersat.org/portal" style="display:inline-block;background:#C0182B;color:#FAFAF8;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:4px;letter-spacing:0.03em">Go to Session Log</a>
            </td></tr>
          </table>

          <p style="margin:0;color:rgba(250,250,248,0.4) !important;font-size:13px;line-height:1.6" color="rgba(250,250,248,0.4)">
            Log your sessions from the Session Log page in the portal. Once a session is logged, it will no longer appear in these reminders.
          </p>
        </td></tr>

        <tr><td style="background:#0F0305;padding:24px 40px;border-radius:0 0 8px 8px;border:1px solid rgba(192,24,43,0.15);border-top:none;text-align:center">
          <p style="margin:0;color:rgba(250,250,248,0.25);font-size:12px">Packer SAT Tutoring &middot; The Packer Collegiate Institute &middot; Brooklyn, NY</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

      const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': process.env.BREVO_API_KEY
        },
        body: JSON.stringify({
          sender: { name: 'Packer SAT', email: 'noreply@packersat.org' },
          to: [{ email: tutor.email, name: tutorName }],
          subject: `Reminder: ${sessions.length} unlogged session${sessions.length > 1 ? 's' : ''} — Packer SAT`,
          htmlContent: html
        })
      });

      results.push({
        tutor: tutor.email,
        sessions: sessions.length,
        emailStatus: emailRes.status
      });
    }

    return res.status(200).json({
      ok: true,
      tutorsNotified: results.length,
      totalUnlogged: unlogged.length,
      details: results
    });

  } catch (err) {
    console.error('remind-log error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Helpers (mirrors the portal's formatDate/formatTime)
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
