import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const { email, password, name } = await request.json();

        // 1. Check if email exists
        const existing = await db.query('app_users', {
            where: [['email', '==', email]],
            limit: 1
        });

        if (existing && existing.length > 0) {
            return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
        }

        // 2. Insert new user
        const newUser = {
            id: String(Math.floor(Date.now() / 1000)),
            email,
            password, // NOTE: Use hashing in production
            name,
            role: 'user',
            created_at: new Date().toISOString()
        };

        await db.insert('app_users', [newUser]);

        return NextResponse.json(newUser);
    } catch (error: any) {
        console.error("Signup Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
