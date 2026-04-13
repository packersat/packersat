export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { context } = req.body;
  if (!context) return res.status(400).json({ error: 'Missing context' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `You write concise, warm newsletter emails for a free student-run SAT tutoring program at The Packer Collegiate Institute in Brooklyn, NY. Tutors are high-scoring Packer upperclassmen. Newsletters go to both students and parents. Tone: friendly, encouraging, professional — like a note from a school program coordinator, not a corporation. Write in plain text, no markdown formatting. Use line breaks between paragraphs. Do not use em dashes. Keep it to 3 short paragraphs. Do not include a greeting line or a sign-off — those are added automatically. Do not invent specific student or tutor names. Return only the email body text, nothing else.`,
        messages: [{
          role: 'user',
          content: `Write a newsletter body based on this real program data from the last 30 days:\n\n${context}\n\nHighlight what has been happening, celebrate progress where the data supports it, and end with an encouraging note about what's ahead. Be specific to the data — no vague filler.`
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Anthropic error:', err);
      return res.status(500).json({ error: 'Anthropic API error', details: err });
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text?.trim();
    if (!text) return res.status(500).json({ error: 'No content returned' });

    return res.status(200).json({ text });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
}
