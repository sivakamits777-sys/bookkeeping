import { NextResponse } from 'next/server';
import { VertexAI } from '@google-cloud/vertexai';
import { ClassificationResult } from '@/types';
import { createRunner, stringifyContent } from '@/lib/agent';
import { getGoogleCredentials } from '@/lib/auth';

export async function POST(request: Request) {
    const credentials = getGoogleCredentials();

    const vertexAI = new VertexAI({
        project: process.env.PROJECT_ID!,
        location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
        googleAuthOptions: credentials ? { credentials } : undefined
    });

    const generativeModel = vertexAI.getGenerativeModel({
        model: process.env.MODEL_NAME || 'gemini-2.5-flash',
    });

    try {
        const { name, description, base64Image, countryName, taxCodes, assignedTaxCode } = await request.json();

        if (assignedTaxCode) {
            const prompt = `
        You are an expert Auditor and Tax Classifier for ${countryName}.
        Situation: An administrator has MANUALLY ASSIGNED an HSN tax code to a product.

        Product Data:
        - Name: "${name}"
        - Description: "${description || "N/A"}"
        
        ASSIGNED HSN CODE:
        - Code: ${assignedTaxCode.code}
        - Category: ${assignedTaxCode.category}
        - Keywords: ${assignedTaxCode.keywords}

        Your Task: Objectively evaluate if this manual assignment follows the HSN Hierarchical Pattern.
        Instructions:
        1. Compare Name, Description, and Image.
        2. Assign a CONFIDENCE score (0-100) using this STRICT RUBRIC:
           - 91-100% (PERFECT ALIGNMENT): Name, Description, and Image all perfectly match.
           - 70-90% (PARTIAL RELATION): Name and Description are related (e.g. Bus vs Bus parts) but not identical.
           - 40-69% (WEAK RELATION): Same industry, different products (e.g. Bed vs Syringe).
           - 0-39% (COMPLETE MISMATCH): Entirely unrelated products (e.g. Bus vs Pigs).
        3. STRICT RULE: If there is a MAJOR MISMATCH or no relation, confidence MUST be below 40%.
        4. Generate the justification in ai_vision_analysis.
      `;

            const responseSchema = {
                type: 'object',
                properties: {
                    confidence: { type: 'number' },
                    ai_vision_analysis: { type: 'string' },
                    confidence_reasoning: { type: 'string' }
                },
                required: ["confidence", "ai_vision_analysis", "confidence_reasoning"]
            };

            const modelResponse = await generativeModel.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    // @ts-ignore
                    responseSchema: responseSchema
                }
            });

            const response = await modelResponse.response;
            const text = response.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                return NextResponse.json({ error: "No response from Vertex AI" }, { status: 500 });
            }

            return NextResponse.json(JSON.parse(text));
        } else {
            // Standard Classification flow - USE NEW AGENT
            if (!name) {
                return NextResponse.json({ error: 'Product name is required' }, { status: 400 });
            }

            const sessionRequest = {
                appName: 'HSN-Classifier',
                userId: 'user-1',
                sessionId: `session-${Date.now()}`,
            };

            const runner = createRunner();
            await runner.sessionService.createSession(sessionRequest);

            const parts: any[] = [{ text: `Product Name: ${name}` }];
            if (description) parts.push({ text: `Product Description: ${description}` });

            if (base64Image) {
                const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
                parts.push({
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: base64Data,
                    },
                });
            }

            const events = runner.runAsync({
                userId: sessionRequest.userId,
                sessionId: sessionRequest.sessionId,
                newMessage: { role: 'user', parts: parts },
            });

            let finalAgentOutput = '';
            for await (const event of events) {
                const eventContent = stringifyContent(event);
                if (eventContent) finalAgentOutput = eventContent;
            }

            if (!finalAgentOutput) {
                return NextResponse.json({ error: "Agent produced no output" }, { status: 500 });
            }

            const result: Partial<ClassificationResult> = {
                tax_code: 'TC-UNKNOWN',
                ai_vision_analysis: '',
                reasoning: '',
                confidence: 0,
                is_flagged: true,
                mismatch_detected: false
            };

            const lines = finalAgentOutput.split('\n');
            let logicStart = false;
            let logicText = '';

            for (const line of lines) {
                if (line.startsWith('FINAL_CODE:')) {
                    result.tax_code = line.replace('FINAL_CODE:', '').trim();
                } else if (line.startsWith('FINAL_DESCRIPTION:')) {
                    const desc = line.replace('FINAL_DESCRIPTION:', '').trim();
                    result.ai_vision_analysis = `Product classified as: ${desc}`;
                } else if (line.startsWith('HIERARCHY:')) {
                    result.hierarchy = line.replace('HIERARCHY:', '').trim();
                } else if (line.startsWith('LOGIC_EXPLANATION:')) {
                    logicStart = true;
                    logicText = line.replace('LOGIC_EXPLANATION:', '').trim();
                } else if (line.startsWith('CONFIDENCE:')) {
                    logicStart = false;
                    result.confidence = parseInt(line.replace('CONFIDENCE:', '').trim()) || 0;
                } else if (line.startsWith('CONFIDENCE_REASONING:')) {
                    result.confidence_reasoning = line.replace('CONFIDENCE_REASONING:', '').trim();
                } else if (line.startsWith('MISMATCH_DETECTED:')) {
                    result.mismatch_detected = line.replace('MISMATCH_DETECTED:', '').trim().toUpperCase() === 'TRUE';
                } else if (logicStart) {
                    logicText += ' ' + line.trim();
                }
            }

            result.reasoning = logicText.trim();
            result.is_flagged = (result.confidence || 0) < 85 || result.mismatch_detected;

            if (result.is_flagged) {
                // Keep the tax_code so user sees the best guess, but flag it
                const prefix = result.mismatch_detected ? "FLAGGED: PRODUCT MISMATCH DETECTED\n" : `FLAGGED DUE TO LOW CONFIDENCE (${result.confidence}%)\n`;
                result.ai_vision_analysis = prefix + result.ai_vision_analysis;
            }

            return NextResponse.json(result);
        }
    } catch (error: any) {
        console.error("ALEX_DEBUG: API CLASSIFY ERROR", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
