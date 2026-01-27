import { NextRequest, NextResponse } from 'next/server';
import { TelegramUpdate, sendMessage, sendMediaToChannel, sendLog, downloadTelegramFile } from '@/lib/telegram';
import { uploadToR2, isR2Configured } from '@/lib/r2';
import { saveImage, generateId, getStats, registerUser } from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        const body: TelegramUpdate = await req.json();

        if (!body.message) {
            return new NextResponse('OK');
        }

        const chatId = body.message.chat.id;
        const text = body.message.text;
        const photo = body.message.photo;
        const animation = body.message.animation;
        const document = body.message.document;
        const replyTo = body.message.reply_to_message;
        const from = body.message.from;
        const userLink = from.username
            ? `@${from.username}`
            : `${from.first_name} [${from.id}]`;

        if (text) {
            const command = text.split(' ')[0].split('@')[0].toLowerCase();

            if (command === '/start' || command === '/help') {
                if (command === '/start') {
                    await registerUser(from.id);
                    await sendLog(`👤 <b>New User Started Bot</b>\n\nUser: ${userLink}\nID: ${from.id}`);
                }

                await sendMessage(chatId,
                    `✨ <b>VoltEdge Bot Help</b>\n\n` +
                    `I can host your media at lightning speed using our edge infrastructure.\n\n` +
                    `🚀 <b>How to Upload:</b>\n` +
                    `• Send a <b>Photo/Video/GIF</b> directly to me.\n` +
                    `• Send an <b>Image/Video/GIF</b> as a <b>Document</b>.\n` +
                    `• Or <b>Reply</b> to an existing Media with /upload or /tgm.\n\n` +
                    `<b>Commands:</b>\n` +
                    `/stats - Show bot statistics\n` +
                    `/upload or /tgm - Upload a replied Media\n` +
                    `/help - Show this message`,
                    'HTML',
                    {
                        inline_keyboard: [[
                            { text: "🌐 Visit Website", url: "https://hunters.indevs.in/" }
                        ]]
                    }
                );
                return new NextResponse('OK');
            }

            if (command === '/stats') {
                const stats = await getStats();
                await sendMessage(chatId,
                    `📊 <b>VoltEdge Statistics</b>\n\n` +
                    `👥 <b>Total Users:</b> ${stats.totalUsers}\n` +
                    `🖼️ <b>Images:</b> ${stats.totalImages}\n` +
                    `🎬 <b>Videos/GIFs:</b> ${stats.totalVideos}\n` +
                    `🤖 <b>Bot Uploads:</b> ${stats.botUploads}\n` +
                    `🌐 <b>Web Uploads:</b> ${stats.webUploads}\n` +
                    `📶 <b>Ping:</b> ${stats.ping}ms`,
                    'HTML'
                );
                return new NextResponse('OK');
            }

            if (command === '/upload' || command === '/tgm') {
                // Check if it's a reply to an image
                if (replyTo) {
                    if (replyTo.photo && replyTo.photo.length > 0) {
                        const largestPhoto = replyTo.photo[replyTo.photo.length - 1];
                        await processFile(chatId, largestPhoto.file_id, largestPhoto.file_size, 'image/jpeg', userLink, from.id, 'photo');
                        return new NextResponse('OK');
                    }
                    if (replyTo.animation) {
                        await processFile(chatId, replyTo.animation.file_id, replyTo.animation.file_size, replyTo.animation.mime_type || 'image/gif', userLink, from.id, 'animation');
                        return new NextResponse('OK');
                    }
                    if (replyTo.document && (replyTo.document.mime_type?.startsWith('image/') || replyTo.document.mime_type?.startsWith('video/'))) {
                        const type = replyTo.document.mime_type?.startsWith('video/') ? 'animation' : 'photo';
                        await processFile(chatId, replyTo.document.file_id, replyTo.document.file_size, replyTo.document.mime_type, userLink, from.id, type);
                        return new NextResponse('OK');
                    }
                }

                // If not a reply, show instructions
                await sendMessage(chatId,
                    `<b>VoltEdge Upload Mode:</b>\n\n` +
                    `1. Directly send a photo to this bot.\n` +
                    `2. Or send an image as a "File/Document".\n` +
                    `3. Or <b>reply</b> to an image with /upload.\n\n` +
                    `I will instantly return a high-speed VoltEdge link!`
                );
                return new NextResponse('OK');
            }

            // Fallback for unknown text
            if (body.message.chat.type === 'private') {
                await sendMessage(chatId,
                    `❓ <b>I'm not sure what you mean.</b>\n\n` +
                    `Just send me any <b>Photo</b> or <b>Video/GIF</b> and I will host it for you instantly! Or type /help for commands.`,
                    'HTML'
                );
            }
            return new NextResponse('OK');
        }

        // Handle Photo
        if (photo && photo.length > 0) {
            if (body.message.chat.type === 'private') {
                const largestPhoto = photo[photo.length - 1];
                await processFile(chatId, largestPhoto.file_id, largestPhoto.file_size, 'image/jpeg', userLink, from.id, 'photo');
            }
            return new NextResponse('OK');
        }

        // Handle Animation (GIF)
        if (animation) {
            if (body.message.chat.type === 'private') {
                await processFile(chatId, animation.file_id, animation.file_size, animation.mime_type || 'image/gif', userLink, from.id, 'animation');
            }
            return new NextResponse('OK');
        }

        // Handle Document (image or video/gif)
        if (document) {
            // Only process direct documents in PRIVATE chats
            if (body.message.chat.type === 'private') {
                const mimeType = document.mime_type || '';
                if (mimeType.startsWith('image/')) {
                    await processFile(chatId, document.file_id, document.file_size, mimeType, userLink, from.id, 'photo');
                } else if (mimeType.startsWith('video/')) {
                    await processFile(chatId, document.file_id, document.file_size, mimeType, userLink, from.id, 'animation');
                } else {
                    await sendMessage(chatId, "❌ Please send only image or GIF files.");
                }
            }
            return new NextResponse('OK');
        }

        return new NextResponse('OK');
    } catch (error) {
        console.error('Webhook error:', error);
        await sendLog(`⚠️ <b>Webhook Error</b>\n\nError: ${error}`);
        return new NextResponse('OK'); // Always return OK to Telegram
    }
}

async function processFile(chatId: number, fileId: string, fileSize: number, mimeType: string, userLink: string, userId: number | string, mediaType: 'photo' | 'animation' | 'video') {
    try {
        // Enforce 2GB limit
        const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
        if (fileSize > MAX_SIZE) {
            await sendMessage(chatId, "❌ File too large. Max size is 2GB.");
            return;
        }

        const id = generateId();
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://hunters.indevs.in/';

        // Determine storage based on file size
        const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB
        const isLargeFile = fileSize > LARGE_FILE_THRESHOLD;
        const useR2ForLargeFiles = isR2Configured() && process.env.USE_R2_STORAGE === 'true';

        let storageResult: { file_id: string; file_url?: string };
        let storageType: 'telegram' | 'r2' = 'telegram';

        if (useR2ForLargeFiles && isLargeFile) {
            // For large files, download from Telegram and upload to R2
            try {
                const fileBlob = await downloadTelegramFile(fileId);
                const objectKey = `uploads/bot/${id}`;
                const url = await uploadToR2(fileBlob, objectKey, mimeType);
                storageResult = {
                    file_id: objectKey,
                    file_url: url
                };
                storageType = 'r2';

                // Still forward to Telegram chat for backup/notification
                await sendMediaToChannel(fileId, `👤 <b>Uploaded by:</b> ${userLink}\n📦 <b>Stored in R2</b>`, mediaType);
            } catch (r2Error: any) {
                console.error('R2 upload failed for bot, using Telegram:', r2Error);
                // Fallback to Telegram
                await sendMediaToChannel(fileId, `👤 <b>Uploaded by:</b> ${userLink}`, mediaType);
                storageResult = { file_id: fileId };
            }
        } else {
            // Use Telegram for small files
            await sendMediaToChannel(fileId, `👤 <b>Uploaded by:</b> ${userLink}`, mediaType);
            storageResult = { file_id: fileId };
        }

        // Save to DB
        const record: any = {
            id,
            telegram_file_id: storageResult.file_id,
            storage_type: storageType,
            storage_url: storageResult.file_url,
            created_at: Date.now(),
            metadata: {
                size: fileSize,
                type: mimeType
            }
        };
        await saveImage(record, 'bot', userId);

        const publicUrl = `${baseUrl}/i/${id}`;

        await sendMessage(chatId,
            `✅ <b>File Uploaded Successfully!</b>\n\n` +
            `🔗 <b>Link:</b> ${publicUrl}\n` +
            (storageType === 'r2' ? `📦 <b>Stored in:</b> Cloudflare R2\n` : '') +
            `⚡ <i>Hosted on VoltEdge</i>`,
            'HTML'
        );

        await sendLog(`📤 <b>New Bot Upload</b>\n\nUser: ${userLink}\nType: ${mimeType}\nSize: ${(fileSize / 1024 / 1024).toFixed(2)} MB\nStorage: ${storageType === 'r2' ? 'R2' : 'Telegram'}\nLink: ${publicUrl}`);
    } catch (error) {
        console.error('Processing error:', error);
        await sendLog(`❌ <b>Upload Processing Error</b>\n\nUser: ${userLink}\nError: ${error}`);
        await sendMessage(chatId, "❌ Failed to process your image. Please try again later.");
    }
}
