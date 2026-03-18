import OpenAI from 'openai';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { providerUrl, model, apiKey } = await req.json();

    if (!providerUrl || !model || !apiKey) {
      return new Response(JSON.stringify({ success: false, message: 'Missing AI provider settings' }), { status: 400 });
    }

    const openai = new OpenAI({
      baseURL: providerUrl,
      apiKey: apiKey,
    });

    // Try a simple text generation to test the connection
    const response = await openai.chat.completions.create({
      model: model,
      messages: [{ role: 'user', content: 'Hello, are you there? Just say "yes".' }],
      max_tokens: 5,
    });

    const text = response.choices[0]?.message?.content;

    if (text) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    } else {
      return new Response(JSON.stringify({ success: false, message: 'No response from AI provider' }), { status: 500 });
    }
  } catch (error: any) {
    console.error('Connection Test Error (OpenAI SDK):', error);
    return new Response(JSON.stringify({ 
      success: false, 
      message: error.message || 'Failed to connect to AI provider' 
    }), { status: 500 });
  }
}
