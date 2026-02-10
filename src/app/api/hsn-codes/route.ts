import { NextResponse } from 'next/server';
import { firestore } from '@/lib/firebase';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const searchQuery = searchParams.get('search')?.toLowerCase() || '';

        // Fetch all HSN codes from Firestore
        const snapshot = await firestore
            .collection('10xclassify')
            .doc('hsn_codes_table')
            .collection('records')
            .get();

        let codes = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                hsn_cd: data.hsn_cd || '',
                refinehsn_description: data.refinehsn_description || '',
                country: data.country || 'IN'
            };
        });

        // Apply search filter if provided
        if (searchQuery) {
            codes = codes.filter((code) => {
                const hsnMatch = code.hsn_cd.toLowerCase().includes(searchQuery);
                const descMatch = code.refinehsn_description.toLowerCase().includes(searchQuery);
                return hsnMatch || descMatch;
            });
        }

        // Sort by HSN code
        codes.sort((a, b) => a.hsn_cd.localeCompare(b.hsn_cd));

        return NextResponse.json({
            success: true,
            data: codes,
            total: codes.length
        });
    } catch (error: any) {
        console.error('Error fetching HSN codes:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
