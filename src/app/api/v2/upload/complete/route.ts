import { NextRequest, NextResponse } from 'next/server';
import { saveImage, rateLimit, getUserWebhooks, triggerWebhook } from '@/lib/db';
import { sendLog } from '@/lib/telegram';
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

    try {
        const body = await req.json();
        const { id, objectKey, fileSize, contentType, storageUrl } = body;

        if (!id || !objectKey || !fileSize || !contentType) {
            return NextResponse.json({
                success: false,
                error: { code: 'MISSING_PARAMS', message: 'id, objectKey, fileSize, and contentType are required' }
            }, { status: 400 });
        }

        const record: any = {
            id,
            telegram_file_id: objectKey, // Store objectKey in telegram_file_id field for compatibility
            storage_type: 'r2',
            created_at: Date.now(),
            metadata: {
                size: fileSize,
                type: contentType,
                version: 'v2'
            }
        };

        if (storageUrl) {
            record.storage_url = storageUrl;
        }

        if (auth?.userId) {
            record.user_id = auth.userId;
        }

        await saveImage(record, 'web', auth?.userId);

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
            (req.headers.get('host') ? `http://${req.headers.get('host')}` : '');

        const publicUrl = `${baseUrl}/i/${id}`;

        const authInfo = auth?.apiKey ? `API Key: ${auth.apiKey.prefix}...` : auth?.userId ? `User: ${auth.userId}` : 'Anonymous';
        await sendLog(`🌐 <b>New API v2 Direct Upload (R2)</b>\n\n${authInfo}\nType: ${contentType}\nSize: ${(fileSize / 1024 / 1024).toFixed(2)} MB\nLink: ${publicUrl}`);

        // Trigger webhooks if user has any
        if (auth?.userId) {
            const webhooks = await getUserWebhooks(auth.userId);
            for (const webhook of webhooks) {
                await triggerWebhook(webhook, 'upload', {
                    id,
                    url: publicUrl,
                    size: fileSize,
                    type: contentType,
                    created_at: record.created_at
                });
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                id,
                url: publicUrl,
                direct_url: `${baseUrl}/i/${id}.jpg`,
                timestamp: record.created_at,
                authenticated: !!auth
            }
        }, {
            headers: {
                'X-RateLimit-Limit': (limit.limit ?? rateLimitValue).toString(),
                'X-RateLimit-Remaining': (limit.remaining ?? 0).toString()
            }
        });
    } catch (error: any) {
        console.error('Upload complete error:', error);
        await sendLog(`❌ <b>API v2 Direct Upload Complete Error</b>\n\nError: ${error.message || error}`);
        return NextResponse.json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to complete upload' }
        }, { status: 500 });
    }
}
