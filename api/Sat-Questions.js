const MATH_DOMAINS    = ['H', 'P', 'Q', 'S'];
const ENGLISH_DOMAINS = ['INI', 'CAS', 'EOI', 'SEC'];
const BASE = 'https://practicesat.vercel.app/api';

// Sanitize HTML: keep math/formatting tags, strip dangerous ones, clean up styles
function sanitizeHtml(html) {
  if (!html) return '';
  return html
    // Remove inline style attributes (they use dark colors, will clash with portal theme)
    .replace(/ style="[^"]*"/g, '')
    // Remove figure/image wrappers but keep SVG (handled below)
    .replace(/<figure[^>]*>/gi, '').replace(/<\/figure>/gi, '')
    // Keep <p>, <math>, <mfrac>, <mn>, <mi>, <mo>, <mrow>, <mfenced>, <msup>, <msub>,
    //      <munder>, <mover>, <mtable>, <mtr>, <mtd>, <em>, <strong>, <sup>, <sub>, <br>, SVG
    // Strip only truly unsafe tags
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    // Decode common HTML entities that survive tag stripping
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;/g, '\u2019').replace(/&lsquo;/g, '\u2018')
    .replace(/&ldquo;/g, '\u201C').replace(/&rdquo;/g, '\u201D')
    .replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<')
    .trim();
}

// For plain text fields (explanation) — strip all HTML
function stripHtml(html) {
  if (!html) return '';
  return sanitizeHtml(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
    // 1. Fetch metadata for all domains in this section
    const listResults = await Promise.all(
      domains.map(d =>
        fetch(`${BASE}/get-questions?domains=${d}`)
          .then(r => r.json())
          .then(j => (j.data || []).map(q => ({ ...q, domain_code: d })))
          .catch(() => [])
      )
    );

    // Shuffle and cap to avoid huge upstream request count
    let allMeta = listResults.flat()
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(Number(limit) * 5, 250));

    // 2. Fetch full details in batches
    const BATCH  = 20;
    const target = Number(limit);
    const questions = [];

    for (let i = 0; i < allMeta.length && questions.length < target; i += BATCH) {
      const batch   = allMeta.slice(i, i + BATCH);
      const details = await Promise.all(
        batch.map(meta =>
          fetch(`${BASE}/question/${meta.external_id}`)
            .then(r => r.json())
            .then(j => ({ meta, detail: j.data }))
            .catch(() => null)
        )
      );

      for (const item of details) {
        if (!item?.detail) continue;
        const { meta, detail } = item;

        // MCQ only; must have all 4 options
        if (detail.type !== 'mcq') continue;
        const opts = detail.answerOptions;
        if (!opts?.A || !opts?.B || !opts?.C || !opts?.D) continue;
        const answer = detail.correct_answer?.[0];
        if (!['A','B','C','D'].includes(answer)) continue;

        // Skip questions that are purely SVG-graph (no readable text/math)
        const stemText = stripHtml(detail.stem || '');
        if (!stemText && /<svg/i.test(detail.stem)) continue;

        questions.push({
          domain: meta.primary_class_cd_desc || meta.skill_desc || '',
          question: {
            // Pass HTML directly so MathML renders in the browser
            question:       sanitizeHtml(detail.stem),
            choices: {
              A: sanitizeHtml(opts.A),
              B: sanitizeHtml(opts.B),
              C: sanitizeHtml(opts.C),
              D: sanitizeHtml(opts.D),
            },
            correct_answer: answer,
            paragraph:      detail.stimulus ? sanitizeHtml(detail.stimulus) : null,
            // Explanation as plain text (used in hint tooltips)
            explanation:    stripHtml(detail.rationale || ''),
          }
        });

        if (questions.length >= target) break;
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
