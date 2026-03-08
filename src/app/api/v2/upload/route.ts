import { NextRequest, NextResponse } from 'next/server';
import { uploadToTelegram, sendLog } from '@/lib/telegram';
import { uploadToR2, isR2Configured } from '@/lib/r2';
import { saveImage, generateId, rateLimit, getUserWebhooks, triggerWebhook } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
    // Authenticate request (optional - supports both API key and JWT)
    const auth = await authenticateRequest(req);

    // Determine rate limit based on authentication
    const ip = req.headers.get('x-forwarded-for') || 'anonymous';
    let rateLimitKey: string;
    let rateLimitValue: number;
    let rateLimitWindow: number;

    if (auth?.apiKey) {
        // API key authenticated - higher limits
        rateLimitKey = `upload:apikey:${auth.apiKey.id}`;
        rateLimitValue = auth.apiKey.rate_limit || 100;
        rateLimitWindow = 60; // 1 minute
    } else if (auth?.userId) {
        // JWT authenticated - medium limits
        rateLimitKey = `upload:user:${auth.userId}`;
        rateLimitValue = 50;
        rateLimitWindow = 60;
    } else {
        // Anonymous - lower limits
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
        const formData = await req.formData();
        const file = formData.get('file') as Blob;
        const customId = formData.get('customId') as string;

        if (!file) {
            return NextResponse.json({
                success: false,
                error: { code: 'MISSING_FILE', message: 'No file provided in request' }
            }, { status: 400 });
        }

        // Enforce 2GB limit
        const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
        if (file.size > MAX_SIZE) {
            return NextResponse.json({
                success: false,
                error: { code: 'FILE_TOO_LARGE', message: 'File too large. Max size is 2GB.' }
            }, { status: 400 });
        }

        // 2. Generate ID
        const id = customId ? customId.toLowerCase().replace(/[^a-z0-9-]/g, '-') : generateId();

        // Determine storage based on file size
        // Large files (>50MB) go to R2 if configured, small files go to Telegram
        const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB
        const isLargeFile = file.size > LARGE_FILE_THRESHOLD;
        const useR2ForLargeFiles = isR2Configured() && process.env.USE_R2_STORAGE === 'true';

        // 1. Upload to storage (R2 for large files if configured, else Telegram)
        let storageResult: { file_id: string; file_url?: string };
        let storageType: 'telegram' | 'r2' = 'telegram';

        if (useR2ForLargeFiles && isLargeFile) {
            // Prefer R2 for large files when enabled
            try {
                const objectKey = `uploads/v2/${id}`;
                const url = await uploadToR2(file, objectKey, file.type);
                storageResult = { file_id: objectKey, file_url: url };
                storageType = 'r2';
            } catch (r2Error: any) {
                console.error('R2 upload failed, falling back to Telegram:', r2Error);
                let mediaType: 'photo' | 'animation' | 'video' = 'photo';
                if (file.type.startsWith('video/')) mediaType = 'video';
                if (file.type === 'image/gif') mediaType = 'animation';
                const telegramResult = await uploadToTelegram(file, 'upload', '📦 <b>Uploaded via API v2</b>', mediaType);
                storageResult = { file_id: telegramResult.file_id };
                storageType = 'telegram';
            }
        } else {
            // Use Telegram (default)
            let mediaType: 'photo' | 'animation' | 'video' = 'photo';
            if (file.type.startsWith('video/')) mediaType = 'video';
            if (file.type === 'image/gif') mediaType = 'animation';
            const telegramResult = await uploadToTelegram(file, 'upload', '📦 <b>Uploaded via API v2</b>', mediaType);
            storageResult = { file_id: telegramResult.file_id };
            storageType = 'telegram';
        }

        const record: any = {
            id,
            telegram_file_id: storageResult.file_id,
            storage_type: storageType,
            created_at: Date.now(),
            metadata: {
                size: file.size,
                type: file.type,
                version: 'v2'
            }
        };

        // Only set storage_url when we actually have one
        if (storageResult.file_url) {
            record.storage_url = storageResult.file_url;
        }

        // Add user_id if authenticated
        if (auth?.userId) {
            record.user_id = auth.userId;
        }

        // Save to DB
        await saveImage(record, 'web', auth?.userId);

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
            (req.headers.get('host') ? `http://${req.headers.get('host')}` : '');

        const publicUrl = `${baseUrl}/i/${id}`;

        // Log to Telegram
        const authInfo = auth?.apiKey ? `API Key: ${auth.apiKey.prefix}...` : auth?.userId ? `User: ${auth.userId}` : 'Anonymous';
        await sendLog(`🌐 <b>New API v2 Upload</b>\n\n${authInfo}\nType: ${file.type}\nSize: ${(file.size / 1024 / 1024).toFixed(2)} MB\nLink: ${publicUrl}`);

        // Trigger webhooks if user has any
        if (auth?.userId) {
            const webhooks = await getUserWebhooks(auth.userId);
            for (const webhook of webhooks) {
                await triggerWebhook(webhook, 'upload', {
                    id,
                    url: publicUrl,
                    size: file.size,
                    type: file.type,
                    created_at: record.created_at
                });
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                id,
                url: `${baseUrl}/i/${id}`,
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
        console.error('Upload API Error:', error);
        await sendLog(`❌ <b>API v2 Upload Error</b>\n\nError: ${error.message || error}`);
        return NextResponse.json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: error.message || 'Server processed request failed' }
        }, { status: 500 });
    }
}
