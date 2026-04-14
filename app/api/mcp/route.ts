import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/supabase-admin';

// Define the tools available
const TOOLS = [
  {
    name: 'get_tasks',
    description:
      'Retrieve a list of tasks for the authenticated user. Usage: call with optional filters in the "arguments" payload: { "status": "todo"|"in-progress"|"done", "category": "personal"|"work", "date": "YYYY-MM-DD" }. Returns an array of task objects with fields: id, title, description, status, category, dueDate, priority, userId, createdAt, updatedAt.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['todo', 'in-progress', 'done'], description: 'Optional status filter' },
        category: { type: 'string', enum: ['personal', 'work'], description: 'Optional category filter' },
        date: { type: 'string', description: 'Optional date filter (YYYY-MM-DD) to return tasks due on that day' }
      }
    }
  },
  {
    name: 'get_task',
    description:
      'Retrieve a single task by id for the authenticated user. Usage: arguments: { "id": "<task-id>" }. Returns the task object or null if not found.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task id' }
      },
      required: ['id']
    }
  },
  {
    name: 'create_task',
    description:
      'Create a new task for the authenticated user. Usage: arguments: { "title": "...", "status": "todo"|"in-progress"|"done", "category": "personal"|"work", "description"?: "...", "dueDate"?: "YYYY-MM-DDTHH:mm:ss.sssZ", "priority"?: "high"|"medium"|"low"|"default" }. Returns the created task object.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Optional task description' },
        status: { type: 'string', enum: ['todo', 'in-progress', 'done'], description: 'Task status' },
        category: { type: 'string', enum: ['personal', 'work'], description: 'Task category' },
        dueDate: { type: 'string', description: 'Optional due date (YYYY-MM-DDTHH:mm:ss.sssZ)' },
        priority: { type: 'string', enum: ['high', 'medium', 'low', 'default'], description: 'Optional priority' }
      },
      required: ['title', 'status', 'category']
    }
  },
  {
    name: 'update_task',
    description:
      'Update fields of an existing task. Usage: arguments: { "id": "<task-id>", "title"?: "...", "description"?: "...", "status"?: "todo"|"in-progress"|"done", "category"?: "personal"|"work", "dueDate"?: "YYYY-MM-DDTHH:mm:ss.sssZ", "priority"?: "high"|"medium"|"low"|"default" }. Returns the updated task object.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task id to update' },
        title: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string', enum: ['todo', 'in-progress', 'done'] },
        category: { type: 'string', enum: ['personal', 'work'] },
        dueDate: { type: 'string' },
        priority: { type: 'string', enum: ['high', 'medium', 'low', 'default'] }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_task',
    description:
      'Delete an existing task by id. Usage: arguments: { "id": "<task-id>" }. Returns { success: true } on success.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task id to delete' }
      },
      required: ['id']
    }
  },
  {
    name: 'get_events',
    description:
      'Retrieve calendar events for the authenticated user. Usage: arguments: { "date": "YYYY-MM-DD" } to get events on a specific day. Returns an array of event objects: id, title, description, startDate, endDate, allDay, userId, createdAt, updatedAt.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Optional date filter (YYYY-MM-DD) to get events for a specific day' }
      }
    }
  },
  {
    name: 'get_event',
    description:
      'Retrieve a single event by id for the authenticated user. Usage: arguments: { "id": "<event-id>" }. Returns the event object or null if not found.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Event id' }
      },
      required: ['id']
    }
  },
  {
    name: 'create_event',
    description:
      'Create a new calendar event for the authenticated user. Usage: arguments: { "title": "...", "startDate": "ISO", "endDate": "ISO", "description"?: "...", "allDay"?: true|false }. Returns the created event object.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        description: { type: 'string', description: 'Optional event description' },
        startDate: { type: 'string', description: 'Start date and time (YYYY-MM-DDTHH:mm:ss.sssZ)' },
        endDate: { type: 'string', description: 'End date and time (YYYY-MM-DDTHH:mm:ss.sssZ)' },
        allDay: { type: 'boolean', description: 'Whether it is an all-day event' }
      },
      required: ['title', 'startDate', 'endDate']
    }
  },
  {
    name: 'update_event',
    description:
      'Update an existing calendar event. Usage: arguments: { "id": "<event-id>", "title"?: "...", "startDate"?: "ISO", "endDate"?: "ISO", "description"?: "...", "allDay"?: true|false }. Returns the updated event object.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Event id to update' },
        title: { type: 'string' },
        description: { type: 'string' },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
        allDay: { type: 'boolean' }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_event',
    description:
      'Delete an existing calendar event by id. Usage: arguments: { "id": "<event-id>" }. Returns { success: true } on success.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Event id to delete' }
      },
      required: ['id']
    }
  }
];

export async function POST(req: Request) {
  try {
    // 1. Authenticate the request
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    
    const adminDb = getAdminDb();
    
    // Look up the token in Supabase
    const { data: keysData, error: keysError } = await adminDb
      .from('mcp_keys')
      .select('user_id')
      .eq('key', token)
      .limit(1);
    
    if (keysError || !keysData || keysData.length === 0) {
      return NextResponse.json({ error: 'Invalid API Key' }, { status: 401 });
    }

    const userId = (keysData[0] as any).user_id;

    // 2. Parse the JSON-RPC request
    const body = await req.json();
    const { method, params, id } = body;

    // 3. Handle MCP Methods
    if (method === 'tools/list') {
      return NextResponse.json({
        jsonrpc: "2.0",
        id: id || null,
        result: {
          tools: TOOLS
        }
      });
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      try {
        let resultData;

        if (toolName === 'get_tasks') {
          let query = adminDb.from('tasks').select('*').eq('userId', userId);

          if (toolArgs.status) query = query.eq('status', toolArgs.status);
          if (toolArgs.category) query = query.eq('category', toolArgs.category);

          const { data: tasksData, error: tasksError } = await query;
          if (tasksError) throw tasksError;

          let tasks: any[] = tasksData || [];

          if (toolArgs.date) {
            tasks = tasks.filter(t => t.dueDate && t.dueDate.startsWith(toolArgs.date));
          }

          resultData = tasks;
        } else if (toolName === 'get_task') {
          const { data: taskData, error: taskError } = await adminDb
            .from('tasks')
            .select('*')
            .eq('userId', userId)
            .eq('id', toolArgs.id)
            .single();
          if (taskError) throw taskError;
          resultData = taskData;
        } else if (toolName === 'create_task') {
          const newTask = {
            title: toolArgs.title,
            description: toolArgs.description || '',
            status: toolArgs.status,
            category: toolArgs.category,
            dueDate: toolArgs.dueDate || null,
            priority: toolArgs.priority || 'default',
            userId: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          // Remove null values
          Object.keys(newTask).forEach(key => (newTask as any)[key] === null && delete (newTask as any)[key]);

          const { data: insertedTask, error: insertError } = await (adminDb as any)
            .from('tasks')
            .insert([newTask])
            .select()
            .single();

          if (insertError) throw insertError;
          resultData = insertedTask;
        } else if (toolName === 'update_task') {
          const idToUpdate = toolArgs.id;
          const updates: any = { ...toolArgs };
          delete updates.id;
          updates.updatedAt = new Date().toISOString();
          Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);

          const { data: updatedTask, error: updateError } = await (adminDb as any)
            .from('tasks')
            .update(updates)
            .eq('id', idToUpdate)
            .eq('userId', userId)
            .select()
            .single();
          if (updateError) throw updateError;
          resultData = updatedTask;
        } else if (toolName === 'delete_task') {
          const { error: deleteError } = await adminDb
            .from('tasks')
            .delete()
            .eq('id', toolArgs.id)
            .eq('userId', userId);
          if (deleteError) throw deleteError;
          resultData = { success: true };
        } else if (toolName === 'get_events') {
          const { data: eventsData, error: eventsError } = await adminDb
            .from('events')
            .select('*')
            .eq('userId', userId);

          if (eventsError) throw eventsError;

          let events: any[] = eventsData || [];

          if (toolArgs.date) {
            events = events.filter(e => e.startDate && e.startDate.startsWith(toolArgs.date));
          }

          resultData = events;
        } else if (toolName === 'get_event') {
          const { data: eventData, error: eventError } = await adminDb
            .from('events')
            .select('*')
            .eq('userId', userId)
            .eq('id', toolArgs.id)
            .single();
          if (eventError) throw eventError;
          resultData = eventData;
        } else if (toolName === 'create_event') {
          const newEvent = {
            title: toolArgs.title,
            description: toolArgs.description || '',
            startDate: toolArgs.startDate,
            endDate: toolArgs.endDate,
            allDay: toolArgs.allDay || false,
            userId: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          const { data: insertedEvent, error: insertError } = await (adminDb as any)
            .from('events')
            .insert([newEvent])
            .select()
            .single();

          if (insertError) throw insertError;
          resultData = insertedEvent;
        } else if (toolName === 'update_event') {
          const idToUpdate = toolArgs.id;
          const updates: any = { ...toolArgs };
          delete updates.id;
          updates.updatedAt = new Date().toISOString();
          Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);

          const { data: updatedEvent, error: updateError } = await (adminDb as any)
            .from('events')
            .update(updates)
            .eq('id', idToUpdate)
            .eq('userId', userId)
            .select()
            .single();
          if (updateError) throw updateError;
          resultData = updatedEvent;
        } else if (toolName === 'delete_event') {
          const { error: deleteError } = await adminDb
            .from('events')
            .delete()
            .eq('id', toolArgs.id)
            .eq('userId', userId);
          if (deleteError) throw deleteError;
          resultData = { success: true };
        } else {
          return NextResponse.json({
            jsonrpc: '2.0',
            id: id || null,
            error: { code: -32601, message: `Tool not found: ${toolName}` }
          });
        }

        return NextResponse.json({
          jsonrpc: "2.0",
          id: id || null,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(resultData, null, 2)
              }
            ]
          }
        });

      } catch (err: any) {
        return NextResponse.json({
          jsonrpc: "2.0",
          id: id || null,
          error: { code: -32000, message: err.message || 'Error executing tool' }
        });
      }
    }

    // Fallback for unknown methods
    return NextResponse.json({
      jsonrpc: "2.0",
      id: id || null,
      error: { code: -32601, message: `Method not found: ${method}` }
    });

  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON-RPC request' }, { status: 400 });
  }
}
