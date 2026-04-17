export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { section = 'MATH', limit = 200 } = req.query;

  try {
    const url = `https://pinesat.com/api/questions?section=${encodeURIComponent(section)}&limit=${encodeURIComponent(limit)}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      console.error('OpenSAT error:', response.status);
      return res.status(502).json({ error: 'Upstream error', status: response.status });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('sat-questions proxy error:', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
}
