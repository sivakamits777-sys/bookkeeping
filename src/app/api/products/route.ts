import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const role = searchParams.get('role');
    const targetUserId = searchParams.get('targetUserId');

    if (!userId) {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    try {
        const where: [string, any, any][] = [];

        // ADMIN Logic:
        // If Role is Admin AND targetUserId is provided, fetch THAT user's data.
        // If Role is Admin AND NO targetUserId, fetch ALL (default admin view).
        // If Role is User, ALWAYS fetch their own data (ignore targetUserId).

        if (role === 'admin') {
            if (targetUserId) {
                where.push(['user_id', '==', parseInt(targetUserId)]);
            }
        } else {
            // Standard User - strict isolation
            where.push(['user_id', '==', parseInt(userId)]);
        }

        const products = await db.query('products', {
            where,
            orderBy: [['created_at', 'desc']]
        });

        // Manual Join: Fetch category for each product's tax_code
        // To be efficient, we'll cache the hsn descriptions we find
        const hsnCache: Record<string, string> = {};

        const formattedData = await Promise.all(products.map(async (p: any) => {
            let category = 'Unknown';
            if (p.tax_code) {
                if (hsnCache[p.tax_code]) {
                    category = hsnCache[p.tax_code];
                } else {
                    const hsnRows = await db.query('hsn_codes_table', {
                        where: [['hsn_cd', '==', p.tax_code]],
                        limit: 1
                    });
                    if (hsnRows.length > 0) {
                        category = hsnRows[0].refinehsn_description || 'Unknown';
                        hsnCache[p.tax_code] = category;
                    }
                }
            }

            return {
                ...p,
                TaxCodeReference: {
                    category: category,
                    rate: 0 // Default for now
                }
            };
        }));

        return NextResponse.json(formattedData);
    } catch (error: any) {
        console.error("Products GET Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const { product, userId } = await request.json();

        // Prepare payload for Firestore
        const { id, created_at, TaxCodeReference: _, ...dbPayload } = product;

        const payloadWithUser = {
            ...dbPayload,
            id: id ? String(id) : undefined, // Let db handle auto-gen if missing
            user_id: parseInt(userId),
            created_at: new Date().toISOString()
        };

        try {
            await db.insert('products', [payloadWithUser]);
            return NextResponse.json(payloadWithUser);
        } catch (error: any) {
            console.error("Products POST Error:", error);
            // Fallback logic for invalid tax code if needed (Foreign key check in app logic)
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
    } catch (error: any) {
        console.error("Products POST Catch Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
