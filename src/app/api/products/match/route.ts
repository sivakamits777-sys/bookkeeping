import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const country = searchParams.get('country');

    if (!name || !country) {
        return NextResponse.json({ error: 'name and country are required' }, { status: 400 });
    }

    try {
        const rows = await db.query('products', {
            where: [
                ['name', '==', name],
                ['country', '==', country],
                ['confidence', '>=', 90]
            ],
            orderBy: [['confidence', 'desc']],
            limit: 1
        });

        return NextResponse.json(rows[0] || null);
    } catch (error: any) {
        console.error("Match Product Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
