import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL;

let r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (!r2Client) {
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      throw new Error('Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.');
    }

    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }

  return r2Client;
}

export function isR2Configured(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);
}

export async function uploadToR2(file: Blob, key: string, contentType?: string): Promise<string> {
  if (!R2_BUCKET_NAME) {
    throw new Error('R2_BUCKET_NAME is not set');
  }

  const client = getR2Client();
  const arrayBuffer = await file.arrayBuffer();

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: Buffer.from(arrayBuffer),
      ContentType: contentType || 'application/octet-stream',
    })
  );

  if (R2_PUBLIC_BASE_URL) {
    // If user configured a public base URL (e.g. https://files.example.com)
    return `${R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
  }

  // Fallback: direct R2 URL (requires bucket to be public)
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${key}`;
}

export async function createR2PresignedUrl(
  key: string,
  contentType?: string,
  expiresInSeconds: number = 3600
): Promise<{ uploadUrl: string; publicUrl: string }> {
  if (!R2_BUCKET_NAME) {
    throw new Error('R2_BUCKET_NAME is not set');
  }

  const client = getR2Client();

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType || 'application/octet-stream',
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });

  let publicUrl: string;
  if (R2_PUBLIC_BASE_URL) {
    publicUrl = `${R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
  } else {
    publicUrl = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${key}`;
  }

  return { uploadUrl, publicUrl };
}
