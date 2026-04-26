import { NextRequest, NextResponse } from 'next/server';
import { createR2PresignedUrl, isR2Configured } from '@/lib/r2';
import { generateId, rateLimit } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    // Authenticate request (optional - supports both API key and JWT)
    const auth = await authenticateRequest(req);

    // Determine rate limit based on authentication
    const ip = req.headers.get('x-forwarded-for') || 'anonymous';
    let rateLimitKey: string;
    let rateLimitValue: number;
    let rateLimitWindow: number;

    if (auth?.apiKey) {
        rateLimitKey = `upload:apikey:${auth.apiKey.id}`;
        rateLimitValue = auth.apiKey.rate_limit || 100;
        rateLimitWindow = 60;
    } else if (auth?.userId) {
        rateLimitKey = `upload:user:${auth.userId}`;
        rateLimitValue = 50;
        rateLimitWindow = 60;
    } else {
        rateLimitKey = `upload:${ip}`;
        rateLimitValue = 20;
        rateLimitWindow = 60;
    }

    const limit = await rateLimit(rateLimitKey, rateLimitValue, rateLimitWindow);

    if (!limit.success) {
        return NextResponse.json({
            success: false,
            error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: `Too many uploads. Try again in ${limit.remaining === 0 ? 'a minute' : 'a moment'}.`
            }
        }, {
            status: 429,
            headers: {
                'X-RateLimit-Limit': (limit.limit ?? rateLimitValue).toString(),
                'X-RateLimit-Remaining': (limit.remaining ?? 0).toString()
            }
        });
    }

    if (!isR2Configured()) {
        return NextResponse.json({
            success: false,
            error: { code: 'R2_NOT_CONFIGURED', message: 'Direct uploads are not available. R2 is not configured.' }
        }, { status: 503 });
    }

    try {
        const body = await req.json();
        const { fileName, fileSize, contentType, customId } = body;

        if (!fileName || !fileSize || !contentType) {
            return NextResponse.json({
                success: false,
                error: { code: 'MISSING_PARAMS', message: 'fileName, fileSize, and contentType are required' }
            }, { status: 400 });
        }

        const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
        if (fileSize > MAX_SIZE) {
            return NextResponse.json({
                success: false,
                error: { code: 'FILE_TOO_LARGE', message: 'File too large. Max size is 2GB.' }
            }, { status: 400 });
        }

        const id = customId ? String(customId).toLowerCase().replace(/[^a-z0-9-]/g, '-') : generateId();
        const objectKey = `uploads/v2/${id}`;

        const { uploadUrl, publicUrl } = await createR2PresignedUrl(objectKey, contentType, 3600);

        return NextResponse.json({
            success: true,
            data: {
                id,
                uploadUrl,
                publicUrl,
                objectKey
            }
        }, {
            headers: {
                'X-RateLimit-Limit': (limit.limit ?? rateLimitValue).toString(),
                'X-RateLimit-Remaining': (limit.remaining ?? 0).toString()
            }
        });
    } catch (error: any) {
        console.error('Upload init error:', error);
        return NextResponse.json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to initialize upload' }
        }, { status: 500 });
    }
}
