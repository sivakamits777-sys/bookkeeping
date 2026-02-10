import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: Request) {
    // const { searchParams } = new URL(request.url);
    // const country = searchParams.get('country');

    try {
        const rows = await db.query('hsn_codes_table', { limit: 1000 });
        const formatted = rows.map((r: any) => ({
            code: r.hsn_cd,
            category: r.refinehsn_description || 'Unknown',
            country: 'IN',
            rate: 0,
            keywords: ''
        }));

        return NextResponse.json(formatted);
    } catch (error: any) {
        console.error("Tax Codes GET Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
