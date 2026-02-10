import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const { email, newPassword } = await request.json();

        // Find user by email first
        const users = await db.query('app_users', {
            where: [['email', '==', email]],
            limit: 1
        });

        if (!users || users.length === 0) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const userId = users[0].id;
        await db.update('app_users', userId, { password: newPassword });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Reset Password Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
