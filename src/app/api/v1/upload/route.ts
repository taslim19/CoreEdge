import { NextRequest, NextResponse } from 'next/server';
import { uploadToTelegram, sendLog } from '@/lib/telegram';
import { uploadToHuggingFace, isHuggingFaceConfigured } from '@/lib/huggingface';
import { saveImage, generateId, rateLimit } from '@/lib/db';

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

        // 2. Generate ID first
        const id = customId ? customId.toLowerCase().replace(/[^a-z0-9-]/g, '-') : generateId();

        // Determine storage based on file size
        const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB
        const isLargeFile = file.size > LARGE_FILE_THRESHOLD;
        const useHFForLargeFiles = isHuggingFaceConfigured() && process.env.USE_HF_FOR_LARGE_FILES === 'true';

        // 1. Upload to storage (HF Hub for large files if configured, else Telegram)
        let storageResult: { file_id: string; file_url?: string };
        let storageType: 'telegram' | 'huggingface' = 'telegram';

        if (useHFForLargeFiles && isLargeFile) {
            // Use HF Hub for large files (>50MB)
            try {
                const fileName = customId || `upload-${id}`;
                const hfResult = await uploadToHuggingFace(file, fileName, id);
                storageResult = {
                    file_id: hfResult.file_id,
                    file_url: hfResult.file_url
                };
                storageType = 'huggingface';
                
                // Also forward to Telegram chat (for backup/notification)
                try {
                    let mediaType: 'photo' | 'animation' | 'video' = 'photo';
                    if (file.type.startsWith('video/')) mediaType = 'video';
                    if (file.type === 'image/gif') mediaType = 'animation';
                    await uploadToTelegram(file, fileName, `📦 <b>Uploaded in web (HF Hub)</b>\n🔗 <b>HF URL:</b> ${hfResult.file_url}`, mediaType);
                } catch (tgError) {
                    console.error('Failed to forward HF upload to Telegram chat:', tgError);
                    // Don't fail the upload if Telegram forwarding fails
                }
            } catch (hfError: any) {
                console.error('HF upload failed, falling back to Telegram:', hfError);
                // Fallback to Telegram
                let mediaType: 'photo' | 'animation' | 'video' = 'photo';
                if (file.type.startsWith('video/')) mediaType = 'video';
                if (file.type === 'image/gif') mediaType = 'animation';
                const telegramResult = await uploadToTelegram(file, 'upload', '📦 <b>Uploaded in web</b>', mediaType);
                storageResult = { file_id: telegramResult.file_id };
            }
        } else {
            // Use Telegram for small files (<50MB) or if HF not configured
            let mediaType: 'photo' | 'animation' | 'video' = 'photo';
            if (file.type.startsWith('video/')) mediaType = 'video';
            if (file.type === 'image/gif') mediaType = 'animation';
            const telegramResult = await uploadToTelegram(file, 'upload', '📦 <b>Uploaded in web</b>', mediaType);
            storageResult = { file_id: telegramResult.file_id };
        }

        const record: any = {
            id,
            telegram_file_id: storageResult.file_id,
            storage_type: storageType,
            storage_url: storageResult.file_url,
            created_at: Date.now(),
            metadata: {
                size: file.size,
                type: file.type,
                version: 'v1'
            }
        };

        // Save to DB
        await saveImage(record);

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
            (req.headers.get('host') ? `http://${req.headers.get('host')}` : '');

        const publicUrl = `${baseUrl}/i/${id}`;

        // Log to Telegram
        await sendLog(`🌐 <b>New Web Upload</b>\n\nType: ${file.type}\nSize: ${(file.size / 1024 / 1024).toFixed(2)} MB\nLink: ${publicUrl}`);

        return NextResponse.json({
            success: true,
            data: {
                id,
                url: `${baseUrl}/i/${id}`,
                direct_url: `${baseUrl}/i/${id}.jpg`,
                timestamp: record.created_at
            }
        });

    } catch (error: any) {
        console.error('Upload API Error:', error);
        await sendLog(`❌ <b>Web Upload Error</b>\n\nError: ${error.message || error}`);
        return NextResponse.json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: error.message || 'Server processed request failed' }
        }, { status: 500 });
    }
}
