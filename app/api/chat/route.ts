import OpenAI from 'openai';
import { getAdminDb } from '@/lib/supabase-admin';
import { after } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, userId, providerUrl, model, apiKey, sessionId } = body;

    console.log(
      'Chat API Request Body (OpenAI SDK):',
      JSON.stringify(
        {
          userId,
          providerUrl: providerUrl ? 'present' : 'missing',
          model,
          hasApiKey: !!apiKey,
          sessionId,
          messageCount: messages?.length,
        },
        null,
        2,
      ),
    );

    if (!userId) {
      return new Response('Unauthorized: User ID is missing from request', {
        status: 401,
      });
    }

    if (!providerUrl || !model || !apiKey) {
      return new Response(
        'Missing AI provider settings. Please check your AI settings.',
        { status: 400 },
      );
    }

    const supabase = getAdminDb();
    const openai = new OpenAI({
      baseURL: providerUrl,
      apiKey,
    });

    // ================= TOOLS DEFINITION =================

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: 'createTask',
          description: 'Create a new task for the user',
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'The title of the task',
              },
              dueDate: {
                type: 'string',
                description: 'The due date in ISO format',
              },
              priority: {
                type: 'string',
                enum: ['high', 'low', 'medium', 'optional', 'default'],
              },
              category: {
                type: 'string',
                enum: ['personal', 'work'],
              },
            },
            required: ['title'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'getTasks',
          description: "Get the user's tasks",
          parameters: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['todo', 'in-progress', 'done', 'cancelled'],
              },
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
              status: {
                type: 'string',
                enum: ['todo', 'in-progress', 'done', 'cancelled'],
              },
              dueDate: { type: 'string' },
              priority: {
                type: 'string',
                enum: ['high', 'low', 'medium', 'optional', 'default'],
              },
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
          description:
            "Get the current time in a specific timezone (defaults to user's configured timezone)",
          parameters: {
            type: 'object',
            properties: {
              timezone: {
                type: 'string',
                description:
                  'The IANA timezone name (e.g., "America/New_York"). If not provided, uses the user default.',
              },
            },
          },
        },
      },
    ];

    // ================ USER SETTINGS / SYSTEM PROMPT ================

    const { data: userSettings } = await (supabase as any)
      .from('user_settings')
      .select('timezone')
      .eq('user_id', userId)
      .single();

    const userTimezone = userSettings?.timezone || 'UTC';

    const systemPrompt = `
You are Vermix Assistant, a helpful AI that manages the user's calendar and tasks.

You can:
- Create, read, update, and delete tasks using the provided tools.
- Store and retrieve long-term memories about the user using the memory tools.
- Read the user's local time via getCurrentTime.

Rules:
- Always be concise, friendly, and helpful.
- If the user asks you to remember something, call the saveMemory tool.
- If the user asks about their tasks, call the getTasks tool.
- When you need to act on data (tasks, memories, time), ALWAYS call the correct tool with proper JSON arguments.
- Do NOT invent tool results; only use what the tools return.
- Tool calls may happen over multiple turns. It is allowed to:
  1) Call several tools in parallel,
  2) Use their results,
  3) Then call tools again if needed,
  4) Finally respond to the user.
- Only answer or asking follow-up questions to the user that you can process with current tools. If you can't help with the user's request, politely decline.

Task list rendering:
When presenting a list of tasks to the user, RETURN the tasks in the following XML format:

<task-table>
  <task id="TASK_ID" task="Task description" dueTime="Due time (or empty)" priority="Priority name" />
  ...
</task-table>

The user's local timezone is: ${userTimezone}.
Current UTC time: ${new Date().toISOString()}.
Only include <task-table> when you actually want the UI to render a task table.
`;

    // ================ TOOL EXECUTION LAYER ================

    const executeTool = async (name: string, args: any) => {
      console.log('[Tool Call]', name, { args });
      try {
        let result;
        switch (name) {
          case 'getCurrentTime': {
            const targetTimezone = args.timezone || userTimezone;
            const now = new Date();
            try {
              const timeString = now.toLocaleString('en-US', {
                timeZone: targetTimezone,
              });
              result = {
                currentTime: timeString,
                timezone: targetTimezone,
                iso: now.toISOString(),
              };
            } catch {
              const timeString = now.toLocaleString('en-US', {
                timeZone: userTimezone,
              });
              result = {
                error: `Invalid timezone: ${targetTimezone}. Returning time in user's default timezone.`,
                currentTime: timeString,
                timezone: userTimezone,
                iso: now.toISOString(),
              };
            }
            break;
          }
          case 'createTask': {
            const { data, error } = await (supabase as any)
              .from('tasks')
              .insert({
                userId,
                title: args.title,
                dueDate: args.dueDate || null,
                priority: args.priority || 'default',
                category: args.category || 'personal',
                status: 'todo',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              })
              .select()
              .single();
            if (error) {
              result = { success: false, error: error.message };
            } else {
              result = { success: true, task: data };
            }
            break;
          }
          case 'getTasks': {
            let query = (supabase as any)
              .from('tasks')
              .select('*')
              .eq('userId', userId);
            if (args.status) query = query.eq('status', args.status);
            const { data, error } = await query;
            if (error) {
              result = { success: false, error: error.message };
            } else {
              result = { tasks: data };
            }
            break;
          }
          case 'updateTask': {
            const { id, ...updates } = args;
            const { data, error } = await (supabase as any)
              .from('tasks')
              .update({
                ...updates,
                updatedAt: new Date().toISOString(),
              })
              .eq('id', id)
              .eq('userId', userId)
              .select()
              .single();
            if (error) {
              result = { success: false, error: error.message };
            } else {
              result = { success: true, task: data };
            }
            break;
          }
          case 'deleteTask': {
            const { error } = await (supabase as any)
              .from('tasks')
              .delete()
              .eq('id', args.id)
              .eq('userId', userId);
            if (error) {
              result = { success: false, error: error.message };
            } else {
              result = { success: true };
            }
            break;
          }
          case 'saveMemory': {
            const { data, error } = await (supabase as any)
              .from('ai_memories')
              .insert({
                user_id: userId,
                content: args.content,
              })
              .select()
              .single();
            if (error) {
              result = { success: false, error: error.message };
            } else {
              result = { success: true, memory: data };
            }
            break;
          }
          case 'getMemories': {
            const { data, error } = await (supabase as any)
              .from('ai_memories')
              .select('*')
              .eq('user_id', userId);
            if (error) {
              result = { success: false, error: error.message };
            } else {
              result = { memories: data };
            }
            break;
          }
          default:
            result = { success: false, error: `Unknown tool: ${name}` };
        }
        const str = JSON.stringify(result);
        console.log('[Tool Result]', name, { result: str });
        return str;
      } catch (err: any) {
        console.error('[Tool Error]', name, { error: err?.message });
        return JSON.stringify({ success: false, error: err?.message });
      }
    };

    // ================ INITIAL MESSAGE HISTORY ================

    const mappedMessages = (messages || [])
      .map((m: any) => {
        const baseContent =
          typeof m.content === 'string'
            ? m.content
            : JSON.stringify(m.content);

        if (m.role === 'tool') {
          if (!m.tool_call_id) return null;

          return {
            role: 'tool',
            tool_call_id: m.tool_call_id,
            content: baseContent || '{}',
          } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
        }

        return {
          role: m.role,
          content: baseContent,
          ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
          ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
          ...(m.name ? { name: m.name } : {}),
        } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
      })
      .filter(Boolean) as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

    const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...mappedMessages,
    ];

    // Lưu message user cuối cùng
    const lastMessage = messages[messages.length - 1];
    if (sessionId && lastMessage?.role === 'user') {
      await (supabase as any).from('chat_messages').insert({
        session_id: sessionId,
        user_id: userId,
        role: 'user',
        content:
          typeof lastMessage.content === 'string'
            ? lastMessage.content
            : JSON.stringify(lastMessage.content),
        parts: [
          {
            type: 'text',
            text:
              typeof lastMessage.content === 'string'
                ? lastMessage.content
                : JSON.stringify(lastMessage.content),
          },
        ],
      });
    }

    // Create placeholder for assistant message
    let assistantMessageId: string | null = null;
    let currentParts: any[] = [];
    let accumulatedContent = '';

    if (sessionId) {
      const { data } = await (supabase as any)
        .from('chat_messages')
        .insert({
          session_id: sessionId,
          user_id: userId,
          role: 'assistant',
          content: '',
          parts: [],
        })
        .select('id')
        .single();
      if (data) assistantMessageId = data.id;
    }

    const updateAssistantMessage = async () => {
      if (!assistantMessageId) return;
      await (supabase as any)
        .from('chat_messages')
        .update({
          content: accumulatedContent,
          parts: currentParts,
        })
        .eq('id', assistantMessageId);
    };

    // ================ DETACHED MULTI-TURN TOOL ORCHESTRATION ================

    after(async () => {
      try {
        let currentMessages = [...chatMessages];

        // Multi-round loop: model -> tools -> model -> ...
        for (let round = 0; round < 5; round++) {
          const stream = await openai.chat.completions.create({
            model,
            messages: currentMessages,
            tools,
            tool_choice: 'auto',
            stream: true,
          });

          let roundAssistantText = '';
          const toolCallsBuffer: { id: string; type: 'function'; function: { name: string; arguments: string } }[] = [];
          let hasToolCalls = false;
          
          let lastDbUpdate = Date.now();
          const DB_THROTTLE_MS = 250;

          let textPartIndex = currentParts.length;
          currentParts.push({ type: 'text', text: '' });

          for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              roundAssistantText += delta.content;
              accumulatedContent += delta.content;
              currentParts[textPartIndex].text = roundAssistantText;
              
              const now = Date.now();
              if (now - lastDbUpdate > DB_THROTTLE_MS) {
                lastDbUpdate = now;
                await updateAssistantMessage();
              }
            }

            if (delta.tool_calls) {
              hasToolCalls = true;
              for (const tc of delta.tool_calls) {
                const index = tc.index;
                if (typeof index !== 'number') continue;
                if (!toolCallsBuffer[index]) {
                  toolCallsBuffer[index] = { id: tc.id || '', type: 'function', function: { name: '', arguments: '' } };
                }
                const buf = toolCallsBuffer[index];
                if (tc.id) buf.id = tc.id;
                if (tc.function?.name) buf.function.name += tc.function.name;
                if (tc.function?.arguments) buf.function.arguments += tc.function.arguments;
              }
            }
          }
          
          // Final flush for this round's text
          if (!roundAssistantText && currentParts[textPartIndex].text === '') {
            currentParts.pop();
          } else {
            await updateAssistantMessage();
          }

          if (roundAssistantText) {
            currentMessages.push({
              role: 'assistant',
              content: roundAssistantText,
            });
          }

          if (!hasToolCalls) {
            break; // No more tools to run, we are done
          }

          const normalizedToolCalls = toolCallsBuffer.filter(tc => tc?.id && tc?.function?.name);
          if (normalizedToolCalls.length === 0) break;

          currentMessages.push({
            role: 'assistant',
            content: '',
            tool_calls: normalizedToolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            })),
          } as any);

          // Execute tools
          for (const tc of normalizedToolCalls) {
            let argsObj: any = {};
            try {
              argsObj = JSON.parse(tc.function.arguments || '{}');
            } catch {
              argsObj = {};
            }

            // Mark tool invocation starting
            currentParts.push({
              type: 'tool-invocation',
              toolCallId: tc.id,
              toolName: tc.function.name,
              args: argsObj,
              status: 'running',
              startedAt: new Date().toISOString(),
            });
            await updateAssistantMessage();

            const toolStart = Date.now();
            const toolResult = await executeTool(tc.function.name, argsObj);

            // Add tool response to history
            currentMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: toolResult,
            } as any);

            // Update part to completed
            const lastPart = currentParts[currentParts.length - 1];
            if (lastPart && lastPart.type === 'tool-invocation' && lastPart.toolCallId === tc.id) {
              lastPart.status = 'completed';
              lastPart.result = parseToolResult(toolResult);
              lastPart.completedAt = new Date().toISOString();
              lastPart.durationMs = Date.now() - toolStart;
            }
            await updateAssistantMessage();
          }
        }
      } catch (err) {
        console.error('Detached loop error:', err);
        if (assistantMessageId) {
          accumulatedContent += '\n\nAn error occurred while processing.';
          currentParts.push({ type: 'text', text: 'An error occurred while processing.' });
          await updateAssistantMessage();
        }
      }
    });

    return new Response(JSON.stringify({ success: true, messageId: assistantMessageId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Chat API Error (OpenAI SDK):', error);
    return new Response(error.message || 'An error occurred', {
      status: 500,
    });
  }
}

function parseToolResult(result: unknown) {
  if (typeof result === 'string') {
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }
  return result;
}
