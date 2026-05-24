// Domain codes for practicesat.vercel.app/api/get-questions
const MATH_DOMAINS    = ['H', 'P', 'Q', 'S'];   // Algebra, Advanced Math, Problem Solving, Geometry
const ENGLISH_DOMAINS = ['INI', 'CAS', 'EOI', 'SEC']; // Info&Ideas, Craft&Structure, Expr of Ideas, Std English

const BASE = 'https://practicesat.vercel.app/api';

// Strip HTML tags for plain-text rendering (MathJax handles math)
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&rsquo;/g, "'").replace(/&ldquo;/g, '"').replace(/&rdquo;/g, '"')
    .replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<')
    .replace(/&nbsp;/g, ' ').replace(/&#62;/g, '>').replace(/&#60;/g, '<')
    .replace(/&#8804;/g, '≤').replace(/&#8805;/g, '≥').replace(/&#8800;/g, '≠')
    .replace(/&#8734;/g, '∞').replace(/&#177;/g, '±').replace(/&#x2264;/g, '≤')
    .replace(/&le;/g, '≤').replace(/&ge;/g, '≥').replace(/&ne;/g, '≠')
    .replace(/&pi;/g, 'π').replace(/&times;/g, '×').replace(/&divide;/g, '÷')
    .replace(/\s+/g, ' ').trim();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { section = 'MATH', limit = 50 } = req.query;
  const isMath  = section.toUpperCase() === 'MATH';
  const domains = isMath ? MATH_DOMAINS : ENGLISH_DOMAINS;

  try {
    // 1. Fetch question list for all domains in this section (MCQ only)
    const listResults = await Promise.all(
      domains.map(d =>
        fetch(`${BASE}/get-questions?domains=${d}`)
          .then(r => r.json())
          .then(j => (j.data || []).map(q => ({ ...q, domain_code: d })))
          .catch(() => [])
      )
    );

    // Flatten, keep only MCQ-likely entries (most are MCQ), shuffle, take sample
    let allMeta = listResults.flat()
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(Number(limit) * 4, 200)); // fetch extra to allow for SPR filtering

    // 2. Fetch full details in parallel (batched to avoid rate limiting)
    const BATCH = 20;
    const questions = [];
    for (let i = 0; i < allMeta.length && questions.length < Number(limit); i += BATCH) {
      const batch = allMeta.slice(i, i + BATCH);
      const details = await Promise.all(
        batch.map(meta =>
          fetch(`${BASE}/question/${meta.external_id}`)
            .then(r => r.json())
            .then(j => ({ meta, detail: j.data }))
            .catch(() => null)
        )
      );

      for (const item of details) {
        if (!item || !item.detail) continue;
        const { meta, detail } = item;

        // Skip free-response (SPR) — only use MCQ
        if (detail.type !== 'mcq') continue;
        if (!detail.answerOptions || !detail.correct_answer?.[0]) continue;

        const opts = detail.answerOptions;
        // Must have all 4 options A-D
        if (!opts.A || !opts.B || !opts.C || !opts.D) continue;

        const answer = detail.correct_answer[0]; // 'A'|'B'|'C'|'D'
        if (!['A','B','C','D'].includes(answer)) continue;

        questions.push({
          domain: meta.primary_class_cd_desc || meta.skill_desc || meta.domain_code,
          question: {
            question:       stripHtml(detail.stem),
            choices: {
              A: stripHtml(opts.A),
              B: stripHtml(opts.B),
              C: stripHtml(opts.C),
              D: stripHtml(opts.D),
            },
            correct_answer: answer,
            paragraph:      detail.stimulus ? stripHtml(detail.stimulus) : null,
            explanation:    detail.rationale ? stripHtml(detail.rationale) : '',
          }
        });

        if (questions.length >= Number(limit)) break;
      }
    }

    if (questions.length === 0) {
      return res.status(502).json({ error: 'No questions retrieved from upstream' });
    }

    return res.status(200).json(questions);
  } catch (err) {
    console.error('Sat-Questions error:', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
}
