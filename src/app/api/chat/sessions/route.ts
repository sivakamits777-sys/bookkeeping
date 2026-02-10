import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: 'userId is required' }, { status: 400 });
        }

        const data = await db.query('chat_sessions', {
            where: [['user_id', '==', parseInt(userId)]],
            orderBy: [['created_at', 'desc']]
        });

        return NextResponse.json(data);
    } catch (error: any) {
        console.error("Fetch Sessions Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const chatId = searchParams.get('chatId');

        if (!chatId) {
            return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
        }

        // 1. Delete history records for this chat
        const history = await db.query('chat_history', { where: [['chat_id', '==', parseInt(chatId)]] });
        if (history.length > 0) {
            await db.deleteMany('chat_history', history.map((m: any) => m.id));
        }

        // 2. Delete session
        await db.delete('chat_sessions', chatId);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Delete Session Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
