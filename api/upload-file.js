import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Resolve MIME from extension — covers all common student submission types
function guessMime(fileName, provided) {
  // Trust browser if it gave something real
  if (provided && provided !== 'application/octet-stream' && provided !== '') return provided;
  const ext = (fileName || '').split('.').pop().toLowerCase();
  const map = {
    // Images
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif',  webp: 'image/webp', bmp: 'image/bmp',
    tiff: 'image/tiff', tif: 'image/tiff',
    heic: 'image/heic', heif: 'image/heif',
    svg: 'image/svg+xml',
    // Documents
    pdf: 'application/pdf',
    doc:  'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls:  'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt:  'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt:  'text/plain', rtf: 'text/rtf', csv: 'text/csv',
    // Other
    zip: 'application/zip', mp4: 'video/mp4', mov: 'video/quicktime',
    mp3: 'audio/mpeg', m4a: 'audio/mp4',
  };
  return map[ext] || 'application/octet-stream';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fileName, fileType, assignmentId } = req.body;

    if (!fileName || !assignmentId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const resolvedType = guessMime(fileName, fileType);
    const safeName     = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key          = `submissions/${assignmentId}/${Date.now()}_${safeName}`;

    const command = new PutObjectCommand({
      Bucket:      process.env.R2_BUCKET_NAME,
      Key:         key,
      ContentType: resolvedType,
    });

    const presignedUrl = await getSignedUrl(R2, command, { expiresIn: 300 });
    const publicUrl    = `${process.env.R2_PUBLIC_URL}/${key}`;

    return res.status(200).json({ presignedUrl, publicUrl, key, fileName, resolvedType });

  } catch (err) {
    console.error('R2 presign error:', err);
    return res.status(500).json({ error: 'Failed to generate upload URL', details: err.message });
  }
}
