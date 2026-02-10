import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
    try {
        const users = await db.query('app_users');
        // Filter out sensitive data (passwords)
        const safeUsers = users.map((u: any) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
            created_at: u.created_at
        }));
        return NextResponse.json(safeUsers);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const body = await request.json();
        const { targetUserId, adminId, adminPassword } = body;

        if (!targetUserId || !adminId || !adminPassword) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 1. Verify Admin Credentials
        const adminRows = await db.query('app_users', {
            where: [
                ['id', '==', parseInt(adminId)],
                ['role', '==', 'admin']
            ]
        });

        if (!adminRows || adminRows.length === 0) {
            return NextResponse.json({ error: 'Admin not found or access denied' }, { status: 403 });
        }

        const adminUser = adminRows[0];
        if (adminUser.password !== adminPassword) {
            return NextResponse.json({ error: 'Incorrect admin password' }, { status: 403 });
        }

        // 2. Perform Deletion
        await db.delete('app_users', targetUserId);

        // Optional: Also delete products owned by this user?
        // keeping it simple for now as requested.

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
