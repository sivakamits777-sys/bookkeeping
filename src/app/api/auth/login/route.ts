import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const { email, password, checkOnly, portalType = 'user' } = await request.json();

        const where: [string, any, any][] = [
            ['email', '==', email]
        ];

        if (!checkOnly) {
            where.push(['password', '==', password]);
        }

        const rows = await db.query('app_users', { where });

        if (!rows || rows.length === 0) {
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        const user = rows[0];

        // Role-based portal access control
        if (portalType === 'user' && user.role === 'admin') {
            return NextResponse.json({
                error: 'Admin users must log in through the admin portal'
            }, { status: 403 });
        }

        if (portalType === 'admin' && user.role !== 'admin') {
            return NextResponse.json({
                error: 'Only admin users can access the admin portal'
            }, { status: 403 });
        }

        return NextResponse.json(user);
    } catch (error: any) {
        console.error("Login Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
