import { NextRequest, NextResponse } from 'next/server';
import { TelegramUpdate, sendMessage, sendMediaToChannel, sendLog, downloadTelegramFile } from '@/lib/telegram';
import { uploadToR2, isR2Configured } from '@/lib/r2';
import { saveImage, generateId, getStats, registerUser, redisLog, getRecentLogs } from '@/lib/db';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import fs from 'fs/promises';
import crypto from 'crypto';

const execAsync = promisify(exec);

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
                    await redisLog(`👤 New User: ${userLink} (${from.id})`);
                    await sendLog(`👤 <b>New User Started Bot</b>\n\nUser: ${userLink}\nID: ${from.id}`);
                }

                await sendMessage(chatId,
                    `<tg-emoji id="5404363662158738040">✨</tg-emoji> <b>VoltEdge Bot Help</b>\n\n` +
                    `I can host your media at lightning speed using our edge infrastructure.\n\n` +
                    `<tg-emoji id="5283080528818360566">🚀</tg-emoji> <b>How to Upload:</b>\n` +
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
                    `<tg-emoji id="6039459454016032137">📊</tg-emoji> <b>VoltEdge Statistics</b>\n\n` +
                    `<tg-emoji id="5453957997418004470">👥</tg-emoji> <b>Total Users:</b> ${stats.totalUsers}\n` +
                    `🖼️ <b>Images:</b> ${stats.totalImages}\n` +
                    `<tg-emoji id="5375464961822695044">🎬</tg-emoji> <b>Videos/GIFs:</b> ${stats.totalVideos}\n` +
                    `<tg-emoji id="5926853662147088272">🤖</tg-emoji> <b>Bot Uploads:</b> ${stats.botUploads}\n` +
                    `<tg-emoji id="5447410659077661506">🌐</tg-emoji> <b>Web Uploads:</b> ${stats.webUploads}\n` +
                    `<tg-emoji id="5429159556330566179">📶</tg-emoji> <b>Ping:</b> ${stats.ping}ms`,
                    'HTML'
                );
                return new NextResponse('OK');
            }

            if (command === '/ping') {
                const msgDate = body.message.date;
                const latency = Date.now() - (msgDate * 1000);

                // Uptime calculation
                const uptimeSeconds = process.uptime();
                const days = Math.floor(uptimeSeconds / (24 * 3600));
                const hours = Math.floor((uptimeSeconds % (24 * 3600)) / 3600);
                const minutes = Math.floor((uptimeSeconds % 3600) / 60);
                const seconds = Math.floor(uptimeSeconds % 60);

                let uptimeStr = '';
                if (days > 0) uptimeStr += `${days}d `;
                if (hours > 0) uptimeStr += `${hours}h `;
                if (minutes > 0) uptimeStr += `${minutes}m `;
                uptimeStr += `${seconds}s`;

                await sendMessage(chatId,
                    `<tg-emoji id="5269563867305879894">🏓</tg-emoji> <b>Pong!</b>\n\n` +
                    `<tg-emoji id="5429159556330566179">📶</tg-emoji> <b>Latency:</b> <code>${latency}ms</code>\n` +
                    `<tg-emoji id="5364105043907716258">🆙</tg-emoji> <b>Uptime:</b> <code>${uptimeStr}</code>`,
                    'HTML'
                );
                return new NextResponse('OK');
            }

            // --- Admin Commands ---
            const isAdmin = process.env.ADMIN_ID && from.id.toString() === process.env.ADMIN_ID;

            if (command === '/logs') {
                if (!isAdmin) {
                    await sendMessage(chatId, "❌ Unauthorized.");
                    return new NextResponse('OK');
                }

                const logs = await getRecentLogs();
                if (logs.length === 0) {
                    await sendMessage(chatId, "🕒 <b>No recent logs found.</b>", 'HTML');
                } else {
                    const logText = logs.reverse().join('\n');
                    await sendMessage(chatId, `📜 <b>Recent Bot Logs:</b>\n\n<pre>${logText}</pre>`, 'HTML');
                }
                return new NextResponse('OK');
            }

            if (command === '/usage' || command === 'usage') {
                if (!isAdmin) {
                    await sendMessage(chatId, "❌ Unauthorized.");
                    return new NextResponse('OK');
                }
                try {
                    // RAM
                    const totalMem = os.totalmem() / (1024 ** 3); // in GB
                    const freeMem = os.freemem() / (1024 ** 3);
                    const usedMem = totalMem - freeMem;

                    // Disk space 
                    const stat = await fs.statfs(process.cwd());
                    const totalDisk = (stat.blocks * stat.bsize) / (1024 ** 3);
                    const freeDisk = (stat.bfree * stat.bsize) / (1024 ** 3);
                    const usedDisk = totalDisk - freeDisk;

                    await sendMessage(chatId,
                        `🖥️ <b>Server Usage</b>\n\n` +
                        `🧠 <b>RAM:</b> ${usedMem.toFixed(2)} GB / ${totalMem.toFixed(2)} GB (${((usedMem / totalMem) * 100).toFixed(1)}%)\n` +
                        `💽 <b>Disk:</b> ${usedDisk.toFixed(2)} GB / ${totalDisk.toFixed(2)} GB (${((usedDisk / totalDisk) * 100).toFixed(1)}%)`,
                        'HTML'
                    );
                } catch (e: any) {
                    await sendMessage(chatId, `❌ Error: ${e.message}`);
                }
                return new NextResponse('OK');
            }

            if (command === '/sh' || command === 'sh') {
                if (!isAdmin) {
                    await sendMessage(chatId, "❌ Unauthorized.");
                    return new NextResponse('OK');
                }

                const cmd = text.slice(command.length + (text.startsWith('/') ? 1 : 0)).trim();
                if (!cmd) {
                    await sendMessage(chatId, "❌ Please provide a command: `/sh echo hi`", 'Markdown');
                    return new NextResponse('OK');
                }

                try {
                    const { stdout, stderr } = await execAsync(cmd);
                    const output = stdout || stderr || 'Command executed with no output.';
                    // Telegram has a 4096 char limit, send truncated if too long
                    const safeOutput = output.length > 4000 ? output.substring(0, 4000) + '... (truncated)' : output;
                    await sendMessage(chatId, `<pre>${safeOutput}</pre>`, 'HTML');
                } catch (e: any) {
                    const errStr = e.message.length > 4000 ? e.message.substring(0, 4000) + '...' : e.message;
                    await sendMessage(chatId, `❌ Error:\n<pre>${errStr}</pre>`, 'HTML');
                }
                return new NextResponse('OK');
            }

            if (command === '/eval' || command === 'eval') {
                if (!isAdmin) {
                    await sendMessage(chatId, "❌ Unauthorized.");
                    return new NextResponse('OK');
                }

                let code = text.slice(command.length + (text.startsWith('/') ? 1 : 0)).trim();
                if (!code) {
                    await sendMessage(chatId, "❌ Please provide code: `/eval print('hello')`", 'Markdown');
                    return new NextResponse('OK');
                }

                // Determine language from markdown block
                let isPython = false;
                if (code.startsWith('```python') || code.startsWith('```py')) {
                    isPython = true;
                    code = code.replace(/^```python\n?|^```py\n?/, '').replace(/```$/, '');
                } else if (code.startsWith('```ts') || code.startsWith('```typescript') || code.startsWith('```js') || code.startsWith('```javascript')) {
                    isPython = false;
                    code = code.replace(/^```(ts|typescript|js|javascript)\n?/, '').replace(/```$/, '');
                } else if (code.startsWith('```')) {
                    // Default to Typescript for generic markdown block
                    isPython = false;
                    code = code.replace(/^```\n?/, '').replace(/```$/, '');
                } else {
                    // No markdown block provided, default to TS
                    isPython = false;
                }

                const fileExt = isPython ? 'py' : 'ts';
                try {
                    const tmpDir = os.tmpdir();
                    const winTmpFile = `${tmpDir}/eval_${crypto.randomBytes(8).toString('hex')}.${fileExt}`;
                    await fs.writeFile(winTmpFile, code);

                    const rawExecCommand = isPython
                        ? `python3 "${winTmpFile}"`
                        : `npx tsx "${winTmpFile}"`;

                    const { stdout, stderr } = await execAsync(rawExecCommand);
                    const output = stdout || stderr || 'Code executed with no output.';
                    const safeOutput = output.length > 4000 ? output.substring(0, 4000) + '... (truncated)' : output;
                    await sendMessage(chatId, `<b>Output (${fileExt}):</b>\n<pre>${safeOutput}</pre>`, 'HTML');

                    // Cleanup
                    await fs.unlink(winTmpFile).catch(() => { });
                } catch (e: any) {
                    const errStr = e.message.length > 4000 ? e.message.substring(0, 4000) + '...' : e.message;
                    await sendMessage(chatId, `❌ Error:\n<pre>${errStr}</pre>`, 'HTML');
                }
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
            created_at: Date.now(),
            metadata: {
                size: fileSize,
                type: mimeType
            }
        };

        // Only set storage_url when we actually have one
        if (storageResult.file_url) {
            record.storage_url = storageResult.file_url;
        }
        await saveImage(record, 'bot', userId);

        const publicUrl = `${baseUrl}/i/${id}`;

        await sendMessage(chatId,
            `✅ <b>File Uploaded Successfully!</b>\n\n` +
            `🔗 <b>Link:</b> ${publicUrl}\n` +
            (storageType === 'r2' ? `📦 <b>Stored in:</b> Cloudflare R2\n` : '') +
            `⚡ <i>Hosted on VoltEdge</i>`,
            'HTML'
        );

        await redisLog(`📤 Upload: ${mimeType} (${(fileSize / 1024 / 1024).toFixed(2)}MB) by ${userLink}`);
        await sendLog(`📤 <b>New Bot Upload</b>\n\nUser: ${userLink}\nType: ${mimeType}\nSize: ${(fileSize / 1024 / 1024).toFixed(2)} MB\nStorage: ${storageType === 'r2' ? 'R2' : 'Telegram'}\nLink: ${publicUrl}`);
    } catch (error) {
        console.error('Processing error:', error);
        await redisLog(`❌ Error: ${error} (User: ${userLink})`);
        await sendLog(`❌ <b>Upload Processing Error</b>\n\nUser: ${userLink}\nError: ${error}`);
        await sendMessage(chatId, "❌ Failed to process your image. Please try again later.");
    }
}
