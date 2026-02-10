import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const updates = await request.json();

        await db.update('products', id, updates);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Product PATCH Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
