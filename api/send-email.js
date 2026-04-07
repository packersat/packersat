export default async function handler(req, res) {
  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to_email, to_name, subject, html_content, from_email, from_name } = req.body;

  if (!to_email || !subject || !html_content) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Allowlist of verified Brevo sender addresses
  const ALLOWED_SENDERS = {
    'noreply@packersat.org': 'Packer SAT Tutoring',
    'jack@packersat.org':    'Jack — Packer SAT Tutoring',
  };

  const senderEmail = (from_email && ALLOWED_SENDERS[from_email])
    ? from_email
    : 'noreply@packersat.org';

  const senderName = from_name || ALLOWED_SENDERS[senderEmail];

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to_email, name: to_name || to_email }],
        subject,
        htmlContent: html_content,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Brevo error:', err);
      return res.status(500).json({ error: 'Failed to send email', details: err });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
