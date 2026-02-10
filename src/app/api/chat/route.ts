import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { VertexAI } from '@google-cloud/vertexai';
import { GoogleAuth } from 'google-auth-library';

const vertexAI = new VertexAI({
    project: process.env.PROJECT_ID!,
    location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
});

const generativeModel = vertexAI.getGenerativeModel({
    model: process.env.MODEL_NAME || 'gemini-2.5-flash',
});

const embeddingModel = vertexAI.getGenerativeModel({
    model: 'text-embedding-004',
});

export async function POST(request: Request) {
    try {
        const { message, history, userId, chatId: incomingChatId } = await request.json();

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        let chatId = incomingChatId;
        let sessionSummary = "";

        // Fetch existing session info if chatId is provided
        if (chatId) {
            const rows = await db.query('chat_sessions', {
                where: [['id', '==', parseInt(chatId)]],
                limit: 1
            });
            const session = rows[0];

            if (session) {
                sessionSummary = session.summary || "";

                // Check for expiration
                const lastMessageAt = new Date(session.last_message_at).getTime();
                const now = Date.now();
                const oneHour = 60 * 60 * 1000;
                const isTimedOut = (now - lastMessageAt) > oneHour;

                if (session.is_expired || isTimedOut) {
                    if (!session.is_expired && isTimedOut) {
                        await db.update('chat_sessions', chatId, { is_expired: true });
                    }
                    return NextResponse.json({ error: 'Session has expired due to inactivity. Please start a new chat.', isExpired: true }, { status: 403 });
                }
            }
        }

        // 1. Session Setup
        if (userId && !chatId) {
            chatId = Math.floor(Date.now() / 1000);
            await db.insert('chat_sessions', [{
                id: String(chatId),
                user_id: parseInt(userId),
                title: 'New Chat',
                created_at: new Date().toISOString(),
                last_message_at: new Date().toISOString(),
                is_expired: false
            }]);
        }

        // Save USER message to history
        if (userId && chatId) {
            await db.insert('chat_history', [{
                id: String(Math.floor(Date.now() / 1000) + 1),
                user_id: parseInt(userId),
                chat_id: parseInt(chatId),
                role: 'user',
                message: message,
                created_at: new Date().toISOString()
            }]);
        }

        // 2. Generate title if it's a new session
        if (userId && chatId && !incomingChatId) {
            // ... title gen logic (same)
            try {
                const titleGenPrompt = `Create a professional, concise, and descriptive title (max 5 words) for a technical support chat that begins with this user message: "${message}". Respond ONLY with the title.`;
                const titleResult = await generativeModel.generateContent({
                    contents: [{ role: 'user', parts: [{ text: titleGenPrompt }] }]
                });
                const response = await titleResult.response;
                const generatedTitle = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim().replace(/^["']|["']$/g, '') || "Tax Classification Inquiry";

                await db.update('chat_sessions', chatId, { title: generatedTitle });
            } catch (e) {
                console.error("Title generation error:", e);
            }
        }

        // ... query gen logic (same)
        let searchQuery = message;
        // ... (skipping rephrased query block for target matching)
        if (history && history.length > 0) {
            const queryGenPrompt = `Given the following conversation history and the latest user message, rephrase the user message into a standalone question for 10xClassify support. Respond ONLY with the rephrased query.
            
HISTORY:
${history.map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.parts[0]?.text || ''}`).join('\n')}

LATEST MESSAGE:
${message}`;
            try {
                const queryResult = await generativeModel.generateContent({
                    contents: [{ role: 'user', parts: [{ text: queryGenPrompt }] }]
                });
                const response = await queryResult.response;
                const rephrased = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
                if (rephrased) { searchQuery = rephrased; }
            } catch (e) {
                console.error("Query generation error:", e);
            }
        }

        // 4. In-Memory Vector Search from Firestore
        // Generate embedding using Vertex AI text-embedding-004 via REST API
        const projectId = process.env.PROJECT_ID!;
        const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
        const model = 'text-embedding-004';

        const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

        const auth = new GoogleAuth({
            scopes: 'https://www.googleapis.com/auth/cloud-platform'
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
                        content: searchQuery,
                        task_type: 'RETRIEVAL_QUERY'
                    }
                ]
            })
        });

        if (!embeddingResponse.ok) {
            const errorText = await embeddingResponse.text();
            throw new Error(`Embedding API failed: ${embeddingResponse.status} - ${errorText}`);
        }

        const embeddingData = await embeddingResponse.json();
        const queryEmbedding: number[] = embeddingData.predictions[0].embeddings.values;

        // Fetch all KB entries and calculate cosine similarity manually
        const kbEntries = await db.query('knowledge_base');

        function cosineSimilarity(a: number[], b: number[]) {
            let dotProduct = 0;
            let mA = 0;
            let mB = 0;
            for (let i = 0; i < a.length; i++) {
                dotProduct += a[i] * b[i];
                mA += a[i] * a[i];
                mB += b[i] * b[i];
            }
            return dotProduct / (Math.sqrt(mA) * Math.sqrt(mB));
        }

        const scoredDocs = kbEntries
            .map((doc: any) => ({
                content: doc.content,
                distance: cosineSimilarity(queryEmbedding, doc.embedding || [])
            }))
            .sort((a: any, b: any) => b.distance - a.distance) // Higher is closer for cosine
            .slice(0, 5);

        const context = scoredDocs.map((doc: any) => doc.content).join('\n\n') || "No relevant context found.";

        // 5. Generate final response
        const persona = `You are a helpful AI Assistant for the 10xClassify Admin Dashboard.
Your goal is to answer questions based on the provided Knowledge Base context AND questions about the 10xClassify application itself.

${sessionSummary ? `SUMMARY OF PREVIOUS CONVERSATION: ${sessionSummary}` : ''}

RULES:
1. Answer based on Knowledge Base or application features.
2. If unrelated, politely decline.
3. Be professional and concise.
4. Provide [SUGGESTIONS] Question 1 | Question 2 at the end.`;

        const userPrompt = `${persona}

CONTEXT FROM KNOWLEDGE BASE:
${context}

USER QUESTION: ${message}`;

        const chatResult = await generativeModel.generateContentStream({
            contents: [
                ...(history || []),
                { role: 'user', parts: [{ text: userPrompt }] }
            ]
        });

        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                let fullAiResponse = '';
                try {
                    for await (const chunk of chatResult.stream) {
                        const chunkText = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (chunkText) {
                            fullAiResponse += chunkText;
                            controller.enqueue(encoder.encode(chunkText));
                        }
                    }

                    // Save MODEL response and update summary
                    if (userId && chatId && fullAiResponse) {
                        await db.insert('chat_history', [{
                            id: String(Math.floor(Date.now() / 1000) + 2),
                            user_id: parseInt(userId),
                            chat_id: parseInt(chatId),
                            role: 'model',
                            message: fullAiResponse,
                            created_at: new Date().toISOString()
                        }]);

                        const summaryPrompt = `Provide a concise one-paragraph summary (<100 words) of this conversation:
                        PREVIOUS SUMMARY: ${sessionSummary || 'None'}
                        USER: ${message}
                        AI: ${fullAiResponse.split('[SUGGESTIONS]')[0].trim()}`;

                        const summaryResult = await generativeModel.generateContent({
                            contents: [{ role: 'user', parts: [{ text: summaryPrompt }] }]
                        });
                        const sumResponse = await summaryResult.response;
                        const newSummary = sumResponse.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

                        await db.update('chat_sessions', chatId, {
                            summary: newSummary,
                            last_message_at: new Date().toISOString()
                        });
                    }
                } catch (e) {
                    console.error("Stream error:", e);
                    controller.error(e);
                } finally {
                    controller.close();
                }
            }
        });

        const responseHeaders = new Headers({
            'Content-Type': 'text/plain; charset=utf-8',
            'Transfer-Encoding': 'chunked',
        });

        if (chatId && !incomingChatId) {
            responseHeaders.set('X-Chat-Id', chatId.toString());
        }

        return new Response(stream, { headers: responseHeaders });

    } catch (error: any) {
        console.error("Chat Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
