import { NextRequest, NextResponse } from 'next/server';
import { saveImage, rateLimit } from '@/lib/db';
import { sendLog, uploadToTelegram, sendMessage } from '@/lib/telegram';
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

        // Forward to Telegram chat
        // Telegram has file size limits: Photos 10MB, Videos 50MB, Documents 50MB
        // For files larger than these limits, send a notification message instead
        const TELEGRAM_PHOTO_LIMIT = 10 * 1024 * 1024; // 10MB
        const TELEGRAM_VIDEO_LIMIT = 50 * 1024 * 1024; // 50MB
        const TELEGRAM_ANIMATION_LIMIT = 50 * 1024 * 1024; // 50MB

        let mediaType: 'photo' | 'animation' | 'video' = 'photo';
        if (contentType.startsWith('video/')) mediaType = 'video';
        if (contentType === 'image/gif') mediaType = 'animation';

        const getTelegramLimit = () => {
            if (mediaType === 'photo') return TELEGRAM_PHOTO_LIMIT;
            if (mediaType === 'video') return TELEGRAM_VIDEO_LIMIT;
            if (mediaType === 'animation') return TELEGRAM_ANIMATION_LIMIT;
            return TELEGRAM_VIDEO_LIMIT; // Default
        };

        const telegramLimit = getTelegramLimit();
        const isFileTooLarge = fileSize > telegramLimit;

        const forwardToTelegram = async () => {
            try {
                if (isFileTooLarge) {
                    // File is too large for Telegram - send notification message instead
                    console.log(`[Telegram Forward] File too large (${(fileSize / 1024 / 1024).toFixed(2)} MB > ${(telegramLimit / 1024 / 1024).toFixed(0)} MB), sending notification only`);
                    const chatId = process.env.TELEGRAM_CHAT_ID;
                    if (chatId) {
                        try {
                            console.log(`[Telegram Forward] Sending notification to chat ${chatId}...`);
                            await sendMessage(
                                chatId,
                                `📦 <b>Large File Uploaded via Web (R2)</b>\n\n` +
                                `Type: ${contentType}\n` +
                                `Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB\n` +
                                `ID: <code>${id}</code>\n\n` +
                                `🔗 <a href="${publicUrl}">View File</a>\n\n` +
                                `<i>File too large for Telegram upload (limit: ${(telegramLimit / 1024 / 1024).toFixed(0)}MB). Stored in R2 only.</i>`,
                                'HTML'
                            );
                            console.log(`[Telegram Forward] ✅ Notification sent successfully`);
                        } catch (msgError: any) {
                            console.error(`[Telegram Forward] ❌ Failed to send notification:`, msgError);
                        }
                    } else {
                        console.error(`[Telegram Forward] ❌ TELEGRAM_CHAT_ID not configured`);
                    }
                    await sendLog(`📦 <b>Large File Upload (R2 Only)</b>\n\nID: ${id}\nType: ${contentType}\nSize: ${(fileSize / 1024 / 1024).toFixed(2)} MB\nLink: ${publicUrl}`);
                } else {
                    // File is within Telegram limits - upload it
                    console.log(`[Telegram Forward] Starting for ${id}, size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
                    const result = await downloadFromR2(objectKey);
                    const fileBlob = result.blob;
                    console.log(`[Telegram Forward] Downloaded from R2, size: ${(fileBlob.size / 1024 / 1024).toFixed(2)} MB`);

                    console.log(`[Telegram Forward] Uploading to Telegram as ${mediaType}...`);
                    await uploadToTelegram(
                        fileBlob,
                        `upload_${id}`,
                        `📦 <b>Uploaded via Web (R2)</b>\n\nType: ${contentType}\nSize: ${(fileSize / 1024 / 1024).toFixed(2)} MB\nLink: ${publicUrl}`,
                        mediaType
                    );
                    console.log(`[Telegram Forward] ✅ Success for ${id}`);
                    await sendLog(`✅ <b>R2 Upload & Telegram Forward Complete</b>\n\nID: ${id}\nType: ${contentType}\nSize: ${(fileSize / 1024 / 1024).toFixed(2)} MB\nLink: ${publicUrl}`);
                }
            } catch (telegramError: any) {
                console.error(`[Telegram Forward] ❌ Failed for ${id}:`, telegramError);
                await sendLog(`⚠️ <b>R2 Upload Complete</b> (Telegram forward failed)\n\nID: ${id}\nType: ${contentType}\nSize: ${(fileSize / 1024 / 1024).toFixed(2)} MB\nError: ${telegramError.message || String(telegramError)}\nLink: ${publicUrl}`);
            }
        };

        // For files <50MB, wait for Telegram notification/upload to complete
        // For larger files, do it async (don't block response)
        const shouldWaitForTelegram = fileSize < 50 * 1024 * 1024;

        if (shouldWaitForTelegram) {
            await forwardToTelegram();
        } else {
            forwardToTelegram().catch(err => {
                console.error('[Telegram Forward] Unhandled error:', err);
            });
        }

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
