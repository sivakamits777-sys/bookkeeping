import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST() {
    try {
        const tableId = process.env.TABLE_ID || 'hsn_codes_table';

        const existing = await db.query('hsn_codes_table', {
            where: [['hsn_cd', '==', 'TC-UNKNOWN']],
            limit: 1
        });

        if (existing.length === 0) {
            await db.insert('hsn_codes_table', [{
                hsn_cd: 'TC-UNKNOWN',
                refinehsn_description: 'Unclassified / Ambiguous'
            }]);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Ensure Unknown Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
