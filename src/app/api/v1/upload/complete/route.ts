import { NextRequest, NextResponse } from 'next/server';
import { saveImage, rateLimit } from '@/lib/db';
import { sendLog } from '@/lib/telegram';

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

        // Log to Telegram
        await sendLog(`🌐 <b>New Web Upload (Direct R2)</b>\n\nType: ${contentType}\nSize: ${(fileSize / 1024 / 1024).toFixed(2)} MB\nLink: ${publicUrl}`);

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
