import { NextResponse } from 'next/server';
import { VertexAI } from '@google-cloud/vertexai';

const vertexAI = new VertexAI({
    project: process.env.PROJECT_ID!,
    location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
});

const generativeModel = vertexAI.getGenerativeModel({
    model: process.env.MODEL_NAME || 'gemini-2.5-flash',
});

export async function POST(request: Request) {
    try {
        const { pdfBase64, defaultCountry, taxCodes } = await request.json();

        const codesContext = JSON.stringify(taxCodes.map((tc: any) => ({
            code: tc.code,
            category: tc.category,
            keywords: tc.keywords
        })), null, 2);

        const prompt = `
        You are an advanced AI Document Parser and Tax Classifier.
        TASK: Read PDF, provide summary, document_type, and extract line items with visual analysis and tax classification.
        RULES: If Confidence < 90, set tax_code to 'TC-UNKNOWN'.
        
        Tax Code List:
        ${codesContext}
    `;

        const base64Data = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;

        const responseSchema = {
            type: 'object',
            properties: {
                document_type: { type: 'string' },
                summary: { type: 'string' },
                products: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            description: { type: 'string' },
                            country: { type: 'string' },
                            visual_analysis: { type: 'string' },
                            tax_code: { type: 'string' },
                            confidence: { type: 'number' }
                        },
                        required: ["name", "visual_analysis", "tax_code", "confidence"]
                    }
                }
            },
            required: ["document_type", "summary", "products"]
        };

        const result = await generativeModel.generateContent({
            contents: [
                {
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType: 'application/pdf', data: base64Data } },
                        { text: prompt }
                    ]
                }
            ],
            generationConfig: {
                responseMimeType: "application/json",
                // @ts-ignore
                responseSchema: responseSchema
            }
        });

        const respText = (await result.response).candidates?.[0]?.content?.parts?.[0]?.text;
        if (!respText) throw new Error("Empty response from Vertex AI");

        const parsed = JSON.parse(respText);

        if (parsed.products && Array.isArray(parsed.products)) {
            parsed.products = parsed.products.map((p: any) => {
                if (p.confidence < 90) {
                    p.tax_code = 'TC-UNKNOWN';
                    p.visual_analysis = `FLAGGED DUE TO LOW CONFIDENCE (${p.confidence}%)\n` + p.visual_analysis;
                }
                return p;
            });
        }
        return NextResponse.json({
            ...parsed,
            raw_results: parsed.products
        });
    } catch (error: any) {
        console.error("ALEX_DEBUG: API DOCUMENT ERROR", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
