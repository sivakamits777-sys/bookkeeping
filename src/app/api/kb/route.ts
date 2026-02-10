import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { VertexAI } from '@google-cloud/vertexai';
import { GoogleAuth } from 'google-auth-library';
import * as mammoth from 'mammoth';
import { getGoogleCredentials } from '@/lib/auth';

const credentials = getGoogleCredentials();

const vertexAI = new VertexAI({
    project: process.env.PROJECT_ID!,
    location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    googleAuthOptions: credentials ? { credentials } : undefined
});

const generativeModel = vertexAI.getGenerativeModel({
    model: process.env.MODEL_NAME || 'gemini-2.5-flash',
});

const embeddingModel = vertexAI.getGenerativeModel({
    model: 'text-embedding-004',
});

export async function GET() {
    try {
        const rows = await db.query('knowledge_base', {
            orderBy: [['created_at', 'desc']]
        });

        const formattedData = rows.map((r: any) => {
            let metadata = r.metadata;
            if (typeof metadata === 'string') {
                try {
                    metadata = JSON.parse(metadata);
                } catch (e) {
                    console.warn("Failed to parse KB metadata", e);
                    metadata = { error: "Metadata truncated or invalid" };
                }
            }
            return { ...r, metadata };
        });

        return NextResponse.json(formattedData);
    } catch (error: any) {
        console.error("KB GET Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const contentType = request.headers.get('content-type') || '';
        let content = '';
        let metadata: any = {};

        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            const file = formData.get('file') as File;

            if (!file) {
                return NextResponse.json({ error: 'File is required' }, { status: 400 });
            }

            const buffer = await file.arrayBuffer();
            const base64Data = Buffer.from(buffer).toString('base64');
            const fileType = file.type || '';

            if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
                const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
                content = result.value;
            } else if (fileType === 'application/pdf' || file.name.endsWith('.pdf')) {
                const extractionResponse = await generativeModel.generateContent({
                    contents: [{
                        role: 'user',
                        parts: [
                            { text: "Extract all text from this document. Keep the formatting as much as possible, but return ONLY the extracted text. No preamble." },
                            {
                                inlineData: {
                                    data: base64Data,
                                    mimeType: 'application/pdf'
                                }
                            }
                        ]
                    }]
                });
                const response = await extractionResponse.response;
                content = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
            } else {
                return NextResponse.json({
                    error: `Unsupported file type: ${fileType || 'unknown'}. Please upload PDF or DOCX files.`
                }, { status: 400 });
            }

            metadata = {
                filename: file.name,
                type: fileType,
                file_data: base64Data
            };
        } else {
            const body = await request.json();
            content = body.content;
            metadata = body.metadata || {};
        }

        if (!content) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 });
        }

        // Generate embedding using Vertex AI text-embedding-004 via REST API
        const projectId = process.env.PROJECT_ID!;
        const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
        const model = 'text-embedding-004';

        const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

        // Get access token from the Vertex AI client
        const auth = new GoogleAuth({
            scopes: 'https://www.googleapis.com/auth/cloud-platform',
            credentials: credentials || undefined
        });
        const client = await auth.getClient();
        const accessToken = await client.getAccessToken();

        const embeddingResponse = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                instances: [
                    {
                        content: content,
                        task_type: 'RETRIEVAL_DOCUMENT'
                    }
                ]
            })
        });

        if (!embeddingResponse.ok) {
            const errorText = await embeddingResponse.text();
            throw new Error(`Embedding API failed: ${embeddingResponse.status} - ${errorText}`);
        }

        const embeddingData = await embeddingResponse.json();
        const embedding: number[] = embeddingData.predictions[0].embeddings.values;

        const payload = {
            id: String(Math.floor(Date.now() / 1000)),
            content,
            metadata: JSON.stringify(metadata),
            embedding,
            created_at: new Date().toISOString()
        };

        await db.insert('knowledge_base', [payload]);

        return NextResponse.json(payload);
    } catch (error: any) {
        console.error("KB POST Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        await db.delete('knowledge_base', id);

        return NextResponse.json({ success: true, id });
    } catch (error: any) {
        console.error("KB DELETE Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
