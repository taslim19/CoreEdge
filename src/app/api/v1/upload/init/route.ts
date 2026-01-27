import { NextRequest, NextResponse } from 'next/server';
import { createR2PresignedUrl, isR2Configured } from '@/lib/r2';
import { generateId, rateLimit } from '@/lib/db';

export async function POST(req: NextRequest) {
    const ip = req.headers.get('x-forwarded-for') || 'anonymous';
    const limit = await rateLimit(`upload:${ip}`, 20, 60);

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
                'X-RateLimit-Limit': (limit.limit ?? 20).toString(),
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

        // Enforce 2GB limit
        const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
        if (fileSize > MAX_SIZE) {
            return NextResponse.json({
                success: false,
                error: { code: 'FILE_TOO_LARGE', message: 'File too large. Max size is 2GB.' }
            }, { status: 400 });
        }

        // Generate ID
        const id = customId ? customId.toLowerCase().replace(/[^a-z0-9-]/g, '-') : generateId();
        const objectKey = `uploads/v1/${id}`;

        // Create presigned URL (valid for 1 hour)
        const { uploadUrl, publicUrl } = await createR2PresignedUrl(
            objectKey,
            contentType,
            3600 // 1 hour
        );

        return NextResponse.json({
            success: true,
            data: {
                id,
                uploadUrl,
                publicUrl,
                objectKey
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
