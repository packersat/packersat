import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin (only once)
if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const payload = req.body;

    // Brevo sends these fields for inbound emails
    const senderEmail = payload.sender?.email || payload.from || '';
    const senderName  = payload.sender?.name  || senderEmail;
    const subject     = payload.subject || '(No subject)';
    const rawBody     = payload.text   || payload.html || '';
    const toAddress   = payload.to?.[0]?.address || payload.to || '';

    // Strip quoted reply text (everything after the first "On ... wrote:" or "> " block)
    const body = stripQuotedText(rawBody);

    if (!senderEmail || !body.trim()) {
      console.log('Inbound email ignored: missing sender or body');
      return res.status(200).json({ ok: true, ignored: true });
    }

    // Look up the sender in Firestore users collection
    const usersSnap = await db.collection('users')
      .where('email', '==', senderEmail.toLowerCase())
      .limit(1)
      .get();

    if (usersSnap.empty) {
      console.log('Inbound email from unknown sender:', senderEmail, '— ignored');
      return res.status(200).json({ ok: true, ignored: true });
    }

    const userDoc  = usersSnap.docs[0];
    const userData = userDoc.data();

    // Try to extract a target UID from the To address
    // e.g. replies+uid_abc123@packersat.org -> toId = 'abc123'
    let toId   = null;
    let toName = 'Admin';
    const uidMatch = toAddress.match(/\+uid_([^@]+)@/);
    if (uidMatch) {
      toId = uidMatch[1];
      try {
        const toDoc = await db.collection('users').doc(toId).get();
        if (toDoc.exists) toName = toDoc.data().name || toDoc.data().email || 'Admin';
      } catch(e) { toId = null; }
    }

    // Default: route to admin if no specific target found
    if (!toId) {
      const adminSnap = await db.collection('users')
        .where('role', '==', 'admin')
        .limit(1)
        .get();
      if (!adminSnap.empty) {
        toId   = adminSnap.docs[0].id;
        toName = adminSnap.docs[0].data().name || 'Admin';
      }
    }

    // Write the inbound reply as a message in Firestore
    await db.collection('messages').add({
      fromId:    userDoc.id,
      fromName:  userData.name || senderEmail,
      fromRole:  userData.role || 'student',
      fromEmail: senderEmail,
      toId:      toId || 'admin',
      toName,
      subject,
      body:      body.trim(),
      read:      false,
      inbound:   true,   // marks this as an email reply, not a portal DM
      createdAt: new Date().toISOString(),
    });

    console.log('Inbound email saved from:', senderEmail);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Inbound email handler error:', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
}

function stripQuotedText(text) {
  if (!text) return '';
  // Remove HTML tags if it's an HTML body
  text = text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s{2,}/g, ' ');
  // Split into lines and remove everything from the first quote marker onward
  const lines = text.split('\n');
  const clean = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Stop at common reply quote patterns
    if (
      /^On .+ wrote:/.test(trimmed) ||
      /^From:/.test(trimmed) ||
      /^-----Original Message-----/.test(trimmed) ||
      trimmed.startsWith('>') ||
      /^Sent from/.test(trimmed)
    ) break;
    clean.push(line);
  }
  return clean.join('\n').trim();
}
