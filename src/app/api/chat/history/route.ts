import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const chatId = searchParams.get('chatId');

        if (!chatId) {
            return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
        }

        const rows = await db.query('chat_history', {
            where: [['chat_id', '==', parseInt(chatId)]]
        });

        // Sort in-memory instead of database-level to avoid composite index requirements
        const sortedRows = rows.sort((a: any, b: any) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return dateA - dateB;
        });

        // Map back to format expected by UI (use 'message' field from DB)
        const messages = sortedRows.map((r: any) => ({
            role: r.role,
            parts: [{ text: r.message }]
        }));

        return NextResponse.json(messages);
    } catch (error: any) {
        console.error("Fetch History Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
