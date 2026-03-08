import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { getUserByEmail, createUser, updateUserLastLogin } from '@/lib/db';
import { generateToken } from '@/lib/auth';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { credential } = body;

        if (!credential) {
            return NextResponse.json({
                success: false,
                error: { code: 'MISSING_CREDENTIAL', message: 'No credential provided' }
            }, { status: 400 });
        }

        // Verify the ID token using Google's public keys
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();

        if (!payload || !payload.email) {
            return NextResponse.json({
                success: false,
                error: { code: 'INVALID_TOKEN', message: 'Invalid token payload' }
            }, { status: 401 });
        }

        const { email } = payload;

        let user = await getUserByEmail(email);

        if (!user) {
            // New user registration
            // For social auth, we use a random secure password hash as a placeholder
            const crypto = await import('crypto');
            const placeholderPassword = crypto.randomBytes(32).toString('hex');
            // Assuming createUser handles internal hashing or hashing happens outside
            // Using a simple placeholder since they won't use email/password to login
            user = await createUser(email, `SOCIAL_AUTH_${placeholderPassword}`);
        }

        // Update last login
        await updateUserLastLogin(user.id);

        // Generate our own JWT token
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
                    provider: 'google'
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
        console.error('Google Auth Error:', error);
        return NextResponse.json({
            success: false,
            error: { code: 'AUTH_FAILED', message: error.message || 'Authentication failed' }
        }, { status: 500 });
    }
}
