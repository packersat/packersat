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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fileName, fileType, assignmentId } = req.body;

    if (!fileName || !fileType || !assignmentId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate file type
    const allowed = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/heic', 'image/webp',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];
    if (!allowed.includes(fileType)) {
      return res.status(400).json({ error: 'File type not allowed: ' + fileType });
    }

    // Build a clean unique key
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `submissions/${assignmentId}/${Date.now()}_${safeName}`;

    // Generate a presigned URL — browser uploads directly to R2 (no Vercel size limit)
    const command = new PutObjectCommand({
      Bucket:      process.env.R2_BUCKET_NAME,
      Key:         key,
      ContentType: fileType,
    });

    const presignedUrl = await getSignedUrl(R2, command, { expiresIn: 300 }); // 5 min

    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
    return res.status(200).json({ presignedUrl, publicUrl, key, fileName });

  } catch (err) {
    console.error('R2 presign error:', err);
    return res.status(500).json({ error: 'Failed to generate upload URL', details: err.message });
  }
}
