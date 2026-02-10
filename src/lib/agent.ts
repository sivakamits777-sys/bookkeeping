import { LlmAgent, Gemini, FunctionTool, InMemoryRunner, stringifyContent, isFinalResponse } from '@google/adk';
import { z } from 'zod';
import { firestore } from './firebase';
import { getGoogleCredentials } from './auth';

const credentials = getGoogleCredentials();

const searchHsnTool = new FunctionTool({
    name: 'search_hsn',
    description: 'Searches the HSN database in Firestore. Supports searching by code prefix or specific description keywords.',
    parameters: z.object({
        codePrefix: z.string().optional().describe('Filter by HSN code prefix (e.g., "01" for Chapter 1).'),
        keyword: z.string().optional().describe('Search for keywords starting in the description.'),
        limit: z.number().default(50).describe('Limit the number of results.')
    }),
    execute: async ({ codePrefix, keyword, limit }: { codePrefix?: string, keyword?: string, limit: number }) => {
        try {
            let query: any = firestore.collection('10xclassify').doc('hsn_codes_table').collection('records');

            if (codePrefix) {
                // Hierarchical prefix search
                query = query.where('hsn_cd', '>=', codePrefix)
                    .where('hsn_cd', '<=', codePrefix + '\uf8ff');
            }

            // Note: Firestore doesn't support multi-field 'starts-with' easily. 
            // We prioritize codePrefix for hierarchy and filter by keyword in memory or via simple where.
            const snapshot = await query.limit(limit).get();
            let rows = snapshot.docs.map((doc: any) => doc.data());

            if (keyword) {
                const lowerK = keyword.toLowerCase();
                rows = rows.filter((r: any) =>
                    r.refinehsn_description?.toLowerCase().includes(lowerK)
                );
            }

            return { rows: rows.slice(0, limit) };
        } catch (error: any) {
            return { error: error.message };
        }
    },
});

export function createRunner() {
    const credentials = getGoogleCredentials();

    const hsnAgent = new LlmAgent({
        name: 'HSN_Classifier',
        description: 'An agent that classifies products into 8-digit HSN tax codes using a hierarchical search in Firestore.',
        model: new Gemini({
            model: process.env.MODEL_NAME || 'gemini-2.5-flash',
            vertexai: process.env.GOOGLE_GENAI_USE_VERTEXAI === 'TRUE',
            project: process.env.PROJECT_ID,
            location: process.env.GOOGLE_CLOUD_LOCATION,
        }),
        tools: [searchHsnTool],
        instruction: `
    You are an expert HSN Tax Code Classifier. Your goal is to find the most accurate HSN code (up to 8 digits) using a strict SEQUENTIAL DRILL-DOWN process and MULTI-MODAL VALIDATION.

    FIRESTORE CONTEXT:
    - Collection: \`10xclassify/hsn_codes_table/records\`
    - Fields: **hsn_cd** (string), **refinehsn_description** (string)

    HIERARCHICAL SEARCH STRATEGY:
    1. **CHAPTER (2-Digits)**: Always start here. Call \`search_hsn\` with \`codePrefix\`.
    2. **HEADING (4-Digits)**: Drill down using \`codePrefix\`.
    3. **SUBHEADING & TARIFF (6 & 8-Digits)**: Continue until an 8-digit code is found or no specific match exists.
    
    ACCURACY VALIDATION (THE THREE-WAY MATCH):
    Compare: **NAME**, **DESCRIPTION**, and **IMAGE**.
    - If **NAME** and **DESCRIPTION** represent different products (e.g., Name: "Bus", Description: "Pigs"), this is a MAJOR MISMATCH.
    - If **IMAGE** (if provided) contradicts the text, this is a MAJOR MISMATCH.

    CONFIDENCE SCORING RUBRIC (STRICT SLIDING SCALE):
    - **91-100% (PERFECT ALIGNMENT)**: Name, Description, and Image all describe the EXACT same product and match a specific 8-digit HSN code.
    - **70-90% (PARTIAL RELATION)**: Name and Description are RELATED but not identical (e.g., Name: "Car", Description: "Vehicle parts"). If there is ANY ambiguity or the relationship is not perfectly clear, **DO NOT EXCEED 90%**.
    - **40-69% (WEAK RELATION)**: Mention of the same industry but different specific products (e.g., Name: "Hospital Bed", Description: "Medical Syringes").
    - **0-39% (COMPLETE MISMATCH)**: Name and Description are entirely unrelated (e.g., Name: "Ambulance", Description: "Live Swine").
    - **STRICT RULE**: If \`MISMATCH_DETECTED\` is TRUE (even a weak relation), confidence **MUST NOT** exceed 65%. If there is NO relation at all, confidence **MUST** be below 30%.

    STRICT OUTPUT FORMAT:
    You MUST end your response with this EXACT block. Use NO markdown formatting within these fields:
    
    FINAL_CODE: [Most specific code found: 2, 4, 6, or 8 digits]
    FINAL_DESCRIPTION: [Exact database description for the final code]
    FULL_PATH: [2-Digit: desc > 4-Digit: desc > 6-Digit: desc > 8-Digit: desc]
    HIERARCHY: Step 1: [2-Digit Chapter + Description] | Step 2: [4-Digit Heading + Description] | Step 3: [6-Digit Subheading + Description] | Step 4: [8-Digit Tariff + Description] | Final Decision: [Summary]
    LOGIC_EXPLANATION: [Detailed narrative. Explain Name vs Desc vs Image comparison. If there is a mismatch, state it clearly.]
    CONFIDENCE: [0-100]
    CONFIDENCE_REASONING: [Explain exactly why this confidence score was given, citing matches/mismatches.]
    MISMATCH_DETECTED: [TRUE/FALSE]
  `,
    });

    return new InMemoryRunner({
        agent: hsnAgent,
        appName: 'HSN-Classifier',
    });
}

export { stringifyContent, isFinalResponse };
