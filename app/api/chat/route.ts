import OpenAI from 'openai';
import { getAdminDb } from '@/lib/supabase-admin';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, userId, providerUrl, model, apiKey, sessionId } = body;

    console.log('Chat API Request Body (OpenAI SDK):', JSON.stringify({ 
      userId, 
      providerUrl: providerUrl ? 'present' : 'missing', 
      model, 
      hasApiKey: !!apiKey, 
      sessionId,
      messageCount: messages?.length
    }, null, 2));

    if (!userId) {
      return new Response('Unauthorized: User ID is missing from request', { status: 401 });
    }
    
    if (!providerUrl || !model || !apiKey) {
      return new Response('Missing AI provider settings. Please check your AI settings.', { status: 400 });
    }

    const supabase = getAdminDb();
    const openai = new OpenAI({
      baseURL: providerUrl,
      apiKey: apiKey,
    });

    // Save user message to db
    const lastMessage = messages[messages.length - 1];
    if (sessionId && lastMessage.role === 'user') {
      await (supabase as any).from('chat_messages').insert({
        session_id: sessionId,
        user_id: userId,
        role: 'user',
        content: typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content),
        parts: lastMessage.parts || [{ type: 'text', text: lastMessage.content }],
      });
    }

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: 'createTask',
          description: 'Create a new task for the user',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'The title of the task' },
              dueDate: { type: 'string', description: 'The due date in ISO format' },
              priority: { type: 'string', enum: ['high', 'low', 'medium', 'optional', 'default'] },
              category: { type: 'string', enum: ['personal', 'work'] },
            },
            required: ['title'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'getTasks',
          description: 'Get the user\'s tasks',
          parameters: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['todo', 'done', 'cancelled'] },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'updateTask',
          description: 'Update an existing task',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              status: { type: 'string' },
              dueDate: { type: 'string' },
              priority: { type: 'string', enum: ['high', 'low', 'medium', 'optional', 'default'] },
            },
            required: ['id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'deleteTask',
          description: 'Delete a task',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
            required: ['id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'saveMemory',
          description: 'Save a memory or fact about the user',
          parameters: {
            type: 'object',
            properties: {
              content: { type: 'string' },
            },
            required: ['content'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'getMemories',
          description: 'Retrieve all saved memories about the user',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'getCurrentTime',
          description: 'Get the current time in a specific timezone (defaults to user\'s configured timezone)',
          parameters: {
            type: 'object',
            properties: {
              timezone: { 
                type: 'string', 
                description: 'The IANA timezone name (e.g., "America/New_York"). If not provided, uses the user\'s default.' 
              },
            },
          },
        },
      },
    ];

    // Fetch user settings for timezone
    const { data: userSettings } = await (supabase as any)
      .from('user_settings')
      .select('timezone')
      .eq('user_id', userId)
      .single();
    
    const userTimezone = userSettings?.timezone || 'UTC';

    const systemPrompt = `You are Vermix Assistant, a helpful AI that manages the user's calendar and tasks. 
You have access to tools to create, read, update, and delete tasks. You can also store and retrieve memories about the user.
Always be concise, friendly, and helpful. If the user asks you to remember something, use the saveMemory tool.
If the user asks about their tasks, use the getTasks tool.
When you need to perform an action, ALWAYS use the provided tools by calling them with the correct arguments in JSON format. DO NOT use XML tags like <tool_call> or <function> to invoke tools.
When presenting a list of tasks, you MUST use the following XML format to render them as an interactive table:
<task-table>
  <task id="unique-id" task="Task description" dueTime="Due time" priority="Priority name" />
  ...
</task-table>
The user's local timezone is: ${userTimezone}.
Current UTC time: ${new Date().toISOString()}.
Current local time: ${new Date().toLocaleString('en-US', { timeZone: userTimezone })}`;

    const executeTool = async (name: string, args: any) => {
      console.log(`[Tool Call] ${name}`, { args });
      try {
        let result;
        switch (name) {
          case 'getCurrentTime': {
            const targetTimezone = args.timezone || userTimezone;
            const now = new Date();
            try {
              const timeString = now.toLocaleString('en-US', { timeZone: targetTimezone });
              result = JSON.stringify({ 
                currentTime: timeString, 
                timezone: targetTimezone,
                iso: now.toISOString()
              });
            } catch (e) {
              const timeString = now.toLocaleString('en-US', { timeZone: userTimezone });
              result = JSON.stringify({ 
                error: `Invalid timezone: ${targetTimezone}. Returning time in user's default timezone.`,
                currentTime: timeString, 
                timezone: userTimezone,
                iso: now.toISOString()
              });
            }
            break;
          }
          case 'createTask': {
            const { data, error } = await (supabase as any).from('tasks').insert({
              userId: userId,
              title: args.title,
              dueDate: args.dueDate || null,
              priority: args.priority || 'default',
              category: args.category || 'personal',
              status: 'todo',
              created_at: new Date().toISOString()
            }).select().single();
            if (error) return JSON.stringify({ success: false, error: error.message });
            result = JSON.stringify({ success: true, task: data });
            break;
          }
          case 'getTasks': {
            let query = (supabase as any).from('tasks').select('*').eq('userId', userId);
            if (args.status) query = query.eq('status', args.status);
            const { data, error } = await query;
            if (error) return JSON.stringify({ success: false, error: error.message });
            result = JSON.stringify({ tasks: data });
            break;
          }
          case 'updateTask': {
            const { id, ...updates } = args;
            const { data, error } = await (supabase as any).from('tasks').update(updates).eq('id', id).eq('userId', userId).select().single();
            if (error) return JSON.stringify({ success: false, error: error.message });
            result = JSON.stringify({ success: true, task: data });
            break;
          }
          case 'deleteTask': {
            const { error } = await (supabase as any).from('tasks').delete().eq('id', args.id).eq('userId', userId);
            if (error) return JSON.stringify({ success: false, error: error.message });
            result = JSON.stringify({ success: true });
            break;
          }
          case 'saveMemory': {
            const { data, error } = await (supabase as any).from('ai_memories').insert({
              user_id: userId,
              content: args.content
            }).select().single();
            if (error) throw new Error(error.message);
            result = JSON.stringify({ success: true, memory: data });
            break;
          }
          case 'getMemories': {
            const { data, error } = await (supabase as any).from('ai_memories').select('*').eq('user_id', userId);
            if (error) throw new Error(error.message);
            result = JSON.stringify({ memories: data });
            break;
          }
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
        console.log(`[Tool Result] ${name}`, { result });
        return result;
      } catch (error: any) {
        console.error(`[Tool Error] ${name}`, { error: error.message });
        return JSON.stringify({ success: false, error: error.message });
      }
    };

    const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m: any) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      })),
    ];

    const stream = await openai.chat.completions.create({
      model: model,
      messages: chatMessages,
      tools: tools,
      stream: true,
    });

    const encoder = new TextEncoder();
    const customStream = new ReadableStream({
      async start(controller) {
        let fullText = '';
        let toolCalls: any[] = [];

        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            
            if (delta?.content) {
              fullText += delta.content;
              // Format for useChat compatibility (text part)
              controller.enqueue(encoder.encode(`0:${JSON.stringify(delta.content)}\n`));
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (!toolCalls[tc.index]) {
                  toolCalls[tc.index] = { id: tc.id, name: tc.function?.name, arguments: '' };
                }
                if (tc.function?.arguments) {
                  toolCalls[tc.index].arguments += tc.function.arguments;
                }
              }
            }
          }

          // XML Tool Call Handler (Edge Case)
          const xmlRegex = /<tool_call>\s*<function=([^>]+)>(.*?)<\/function>\s*<\/tool_call>/gs;
          let match;
          while ((match = xmlRegex.exec(fullText)) !== null) {
            const functionName = match[1];
            const paramsString = match[2];
            const params: any = {};
            const paramRegex = /<parameter=([^>]+)>(.*?)<\/parameter>/gs;
            let paramMatch;
            while ((paramMatch = paramRegex.exec(paramsString)) !== null) {
              params[paramMatch[1]] = paramMatch[2];
            }
            toolCalls.push({
              id: 'xml_' + Math.random().toString(36).substr(2, 9),
              name: functionName,
              arguments: JSON.stringify(params)
            });
          }

          // If tool calls were made, we need to execute them and potentially call the model again
          // However, for a simple implementation, we'll just handle one level of tool calling
          if (toolCalls.length > 0) {
            const results = [];
            for (const tc of toolCalls) {
              const result = await executeTool(tc.name, typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments);
              results.push({
                tool_call_id: tc.id,
                role: 'tool',
                name: tc.name,
                content: result,
              });
              // Format for useChat compatibility (tool result part)
              controller.enqueue(encoder.encode(`a:${JSON.stringify({ toolCallId: tc.id, toolName: tc.name, args: typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments, result })}\n`));
            }

            // Call model again with tool results
            const secondResponse = await openai.chat.completions.create({
              model: model,
              messages: [
                ...chatMessages,
                { role: 'assistant', content: null, tool_calls: toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments } })) },
                ...results.map(r => ({ role: 'tool', tool_call_id: r.tool_call_id, content: r.content })),
              ] as any,
              stream: true,
            });

            for await (const chunk of secondResponse) {
              const delta = chunk.choices[0]?.delta;
              if (delta?.content) {
                fullText += delta.content;
                controller.enqueue(encoder.encode(`0:${JSON.stringify(delta.content)}\n`));
              }
            }
          }

          // Save assistant message to db
          if (sessionId && fullText) {
            await (supabase as any).from('chat_messages').insert({
              session_id: sessionId,
              user_id: userId,
              role: 'assistant',
              content: fullText,
              parts: [{ type: 'text', text: fullText }],
            });
          }

          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(customStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'x-vercel-ai-data-stream': 'v1',
      },
    });
  } catch (error: any) {
    console.error('Chat API Error (OpenAI SDK):', error);
    return new Response(error.message || 'An error occurred', { status: 500 });
  }
}
