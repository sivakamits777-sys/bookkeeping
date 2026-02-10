import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const { email } = await request.json();

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        const users = await db.query('app_users', {
            where: [['email', '==', email]],
            limit: 1
        });

        if (users && users.length > 0) {
            return NextResponse.json({
                exists: true,
                role: users[0].role
            });
        } else {
            return NextResponse.json({ exists: false });
        }

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
