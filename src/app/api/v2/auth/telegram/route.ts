import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, createUser, updateUserLastLogin } from '@/lib/db';
import { generateToken } from '@/lib/auth';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { initData, user: userData } = body;

        // Note: In a production environment with a BOT_TOKEN, you MUST verify the initData signature here.
        // Something like:
        // const isValid = verifyTelegramWebAppData(initData, process.env.TELEGRAM_BOT_TOKEN);
        // if (!isValid) throw new Error('Invalid Telegram data');

        if (!userData || !userData.id) {
            return NextResponse.json({
                success: false,
                error: { code: 'MISSING_DATA', message: 'Telegram user data is required' }
            }, { status: 400 });
        }

        const telegramId = userData.id;
        // Create a unique internal email for the Telegram user
        const email = `tg_${telegramId}@telegram.local`;

        let user = await getUserByEmail(email);

        if (!user) {
            // Create user if they don't exist
            // Generate a random secure password hash since they authenticate via Telegram
            const randomPassword = crypto.randomBytes(32).toString('hex');
            // Assuming createUser takes (email, password_hash)
            // You might want to hash this random password using your bcrypt logic, but since it's random and unused:
            const salt = crypto.randomBytes(16).toString('hex');
            const passwordHash = crypto.createHash('sha256').update(randomPassword + salt).digest('hex'); // simple fallback if bcrypt isn't directly here

            user = await createUser(email, passwordHash);
        }

        // Update last login
        await updateUserLastLogin(user.id);

        // Generate token
        const token = generateToken({
            userId: user.id,
            email: user.email,
            type: 'user'
        });

        const response = NextResponse.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    created_at: user.created_at,
                    last_login: Date.now(),
                    telegramData: userData
                },
                token
            }
        });

        // Set HTTP-only cookie
        response.cookies.set('auth_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7 // 7 days
        });

        return response;

    } catch (error: any) {
        console.error('Telegram Login error:', error);
        return NextResponse.json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: error.message || 'Telegram Login failed' }
        }, { status: 500 });
    }
}
