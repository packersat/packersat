export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { section = 'MATH', limit = 200 } = req.query;

  // Map our section names to the upstream subject filter
  const subjectFilter = section.toUpperCase() === 'MATH' ? 'Math' : 'English';

  try {
    const url = `https://sat-question-bank.vercel.app/api/questions?section=${encodeURIComponent(section)}&limit=${encodeURIComponent(limit)}`;
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });

    if (!response.ok) {
      console.error('Upstream error:', response.status);
      return res.status(502).json({ error: 'Upstream error', status: response.status });
    }

    const data = await response.json();
    const questions = Array.isArray(data) ? data : (data.questions || []);

    // Transform into the format mapOpenSATQuestions() expects:
    // { question: { question, choices:{A,B,C,D}, correct_answer, paragraph, explanation }, domain }
    const transformed = questions
      .filter(q => q.options && q.options.length >= 4 && q.correctAnswer && q.text)
      .map(q => {
        // Build choices object {A: text, B: text, ...}
        const choices = {};
        q.options.forEach(opt => { choices[opt.label] = opt.text; });

        // Split text into passage + question if it contains "QUESTION:"
        let paragraph = null;
        let questionText = q.text;
        const passageSplit = q.text.match(/^PASSAGE:\s*([\s\S]*?)\s*QUESTION:\s*([\s\S]*)$/i);
        if (passageSplit) {
          paragraph   = passageSplit[1].trim();
          questionText = passageSplit[2].trim();
        }

        return {
          domain: q.topic || (q.subject === 'Math' ? 'Math' : 'Reading & Writing'),
          question: {
            question:      questionText,
            choices,
            correct_answer: q.correctAnswer,
            paragraph,
            explanation:   q.explanation || '',
          }
        };
      });

    return res.status(200).json(transformed);
  } catch (err) {
    console.error('Sat-Questions proxy error:', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
}
