import { NextRequest, NextResponse } from 'next/server';
import { saveImage, rateLimit } from '@/lib/db';
import { sendLog, uploadToTelegram } from '@/lib/telegram';
import { downloadFromR2 } from '@/lib/r2';

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

    try {
        const body = await req.json();
        const { id, objectKey, fileSize, contentType, storageUrl } = body;

        if (!id || !objectKey || !fileSize || !contentType) {
            return NextResponse.json({
                success: false,
                error: { code: 'MISSING_PARAMS', message: 'id, objectKey, fileSize, and contentType are required' }
            }, { status: 400 });
        }

        // Create record
        const record: any = {
            id,
            telegram_file_id: objectKey, // Store objectKey in telegram_file_id field for compatibility
            storage_type: 'r2',
            storage_url: storageUrl,
            created_at: Date.now(),
            metadata: {
                size: fileSize,
                type: contentType,
                version: 'v1'
            }
        };

        // Save to DB
        await saveImage(record, 'web');

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
            (req.headers.get('host') ? `http://${req.headers.get('host')}` : '');

        const publicUrl = `${baseUrl}/i/${id}`;

        // Forward to Telegram chat (download from R2 and upload to Telegram)
        // Do this asynchronously so it doesn't block the API response
        // Even for large files, we'll try - if it times out, it times out, but we attempt it
        Promise.resolve().then(async () => {
            try {
                console.log(`[Telegram Forward] Starting for ${id}, size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
                const fileBlob = await downloadFromR2(objectKey);
                let mediaType: 'photo' | 'animation' | 'video' = 'photo';
                if (contentType.startsWith('video/')) mediaType = 'video';
                if (contentType === 'image/gif') mediaType = 'animation';
                
                await uploadToTelegram(
                    fileBlob,
                    `upload_${id}`,
                    `📦 <b>Uploaded via Web (R2)</b>\n\nType: ${contentType}\nSize: ${(fileSize / 1024 / 1024).toFixed(2)} MB\nLink: ${publicUrl}`,
                    mediaType
                );
                console.log(`[Telegram Forward] Success for ${id}`);
            } catch (telegramError: any) {
                console.error(`[Telegram Forward] Failed for ${id}:`, telegramError);
                await sendLog(`⚠️ <b>R2 Upload Complete</b> (Telegram forward failed)\n\nID: ${id}\nType: ${contentType}\nSize: ${(fileSize / 1024 / 1024).toFixed(2)} MB\nError: ${telegramError.message}\nLink: ${publicUrl}`);
            }
        }).catch(err => {
            console.error('[Telegram Forward] Promise error:', err);
        });

        return NextResponse.json({
            success: true,
            data: {
                id,
                url: publicUrl,
                direct_url: `${baseUrl}/i/${id}.jpg`,
                timestamp: record.created_at
            }
        });

    } catch (error: any) {
        console.error('Upload complete error:', error);
        await sendLog(`❌ <b>Web Upload Complete Error</b>\n\nError: ${error.message || error}`);
        return NextResponse.json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to complete upload' }
        }, { status: 500 });
    }
}
