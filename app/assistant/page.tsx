'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { useChat } from '@/lib/hooks/use-chat';
import { Bot, Send, Settings, Plus, Trash2, Menu, X, Sparkles, Search, Loader2, ChevronDown, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { TaskTable } from '@/components/task-table';

interface AISettings {
  id?: string;
  name: string;
  provider_url: string;
  model: string;
  api_key: string;
  is_active: boolean;
}

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
}

interface ToolActivity {
  toolCallId: string;
  toolName: string;
  status: 'running' | 'completed' | 'failed';
  summary: string;
  args?: any;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

const normalizeToolName = (toolName: string) => {
  const labels: Record<string, string> = {
    createTask: 'Create task',
    getTasks: 'Read tasks',
    updateTask: 'Update task',
    deleteTask: 'Delete task',
    saveMemory: 'Save memory',
    getMemories: 'Read memories',
    getCurrentTime: 'Read current time',
  };

  return labels[toolName] || toolName;
};

const parseToolResult = (result: unknown) => {
  if (typeof result === 'string') {
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }

  return result;
};

const parseTaskTableXml = (xml: string) => {
  const taskRegex = /<task id="([^"]+)" task="([^"]+)" dueTime="([^"]+)" priority="([^"]+)" \/>/g;
  const tasks = [];
  let match;
  while ((match = taskRegex.exec(xml)) !== null) {
    tasks.push({
      id: match[1],
      task: match[2],
      dueTime: match[3],
      priority: match[4],
    });
  }
  return tasks;
};

const renderMessageContent = (text: string) => {
  const tableRegex = /<task-table>([\s\S]*?)<\/task-table>/g;
  const parts = text.split(tableRegex);
  
  return parts.map((part, index) => {
    if (index % 2 === 1) {
      // It's a table
      const tasks = parseTaskTableXml(part);
      return <TaskTable key={index} tasks={tasks} />;
    } else {
      // It's markdown
      return (
        <ReactMarkdown key={index} remarkPlugins={[remarkGfm]}>
          {part}
        </ReactMarkdown>
      );
    }
  });
};

export default function AssistantPage() {
  const { user } = useAuth();
  const [allSettings, setAllSettings] = useState<AISettings[]>([]);
  const [activeSettings, setActiveSettings] = useState<AISettings | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Settings form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [settingName, setSettingName] = useState('Default');
  const [providerUrl, setProviderUrl] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('gpt-4o');
  const [apiKey, setApiKey] = useState('');

  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isQuickSelectOpen, setIsQuickSelectOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  
  // Log console state
  const [logs, setLogs] = useState<{ type: 'info' | 'error' | 'process', message: string, timestamp: Date }[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((type: 'info' | 'error' | 'process', message: string) => {
    setLogs(prev => [...prev, { type, message, timestamp: new Date() }].slice(-50));
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const [input, setInput] = useState('');
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setInput(e.target.value);

  const chatBody = useMemo(() => ({
    userId: user?.id,
    providerUrl: activeSettings?.provider_url,
    model: activeSettings?.model,
    apiKey: activeSettings?.api_key,
    sessionId: currentSessionId,
  }), [user?.id, activeSettings, currentSessionId]);

  const { messages, isLoading, append, setMessages } = useChat({
    api: '/api/chat',
    body: chatBody,
    onFinish: () => {
      setToolActivities(prev =>
        prev.map(item =>
          item.status === 'running'
            ? {
                ...item,
                status: 'completed',
                summary: 'Completed',
                completedAt: new Date().toISOString(),
              }
            : item,
        ),
      );
      addLog('info', 'AI response completed');
      scrollToBottom();
    },
    onError: (err: any) => {
      setToolActivities(prev =>
        prev.map(item =>
          item.status === 'running'
            ? {
                ...item,
                status: 'failed',
                summary: 'Interrupted by API error',
                completedAt: new Date().toISOString(),
              }
            : item,
        ),
      );
      addLog('error', `Chat error: ${err.message || 'Unknown error'}`);
      console.error('Chat error details:', err);
    },
    onToolEvent: (event: any) => {
      const toolCallId = event?.toolCallId;
      const toolName = event?.toolName;

      if (!toolCallId || !toolName) return;

      if (event.phase === 'start') {
        setToolActivities(prev => {
          const existingIndex = prev.findIndex(
            item => item.toolCallId === toolCallId,
          );

          const nextItem: ToolActivity = {
            toolCallId,
            toolName,
            status: 'running',
            summary: 'Running...',
            args: event.args,
            startedAt: event.at || new Date().toISOString(),
          };

          if (existingIndex === -1) {
            return [...prev, nextItem];
          }

          const next = [...prev];
          next[existingIndex] = {
            ...next[existingIndex],
            ...nextItem,
          };
          return next;
        });

        addLog('process', `Tool started: ${normalizeToolName(toolName)}`);
        return;
      }

      const parsedResult = parseToolResult(event.result);
      const isFailure =
        typeof parsedResult === 'object' &&
        parsedResult !== null &&
        (((parsedResult as any).success === false) ||
          !!(parsedResult as any).error);

      setToolActivities(prev => {
        const existingIndex = prev.findIndex(
          item => item.toolCallId === toolCallId,
        );

        const nextItem: ToolActivity = {
          toolCallId,
          toolName,
          status: isFailure ? 'failed' : 'completed',
          summary: isFailure
            ? (parsedResult as any)?.error || 'Tool failed'
            : 'Completed',
          args: event.args,
          startedAt:
            existingIndex >= 0
              ? prev[existingIndex].startedAt
              : event.at || new Date().toISOString(),
          completedAt: event.at || new Date().toISOString(),
          durationMs: event.durationMs,
        };

        if (existingIndex === -1) {
          return [...prev, nextItem];
        }

        const next = [...prev];
        next[existingIndex] = {
          ...next[existingIndex],
          ...nextItem,
        };
        return next;
      });

      addLog(
        isFailure ? 'error' : 'info',
        `${normalizeToolName(toolName)} ${isFailure ? 'failed' : 'completed'}`,
      );
    },
  });

  // Debug log for chat configuration
  useEffect(() => {
    if (user) {
      console.log('Chat Config Debug:', {
        userId: user.id,
        hasActiveSettings: !!activeSettings,
        providerUrl: activeSettings?.provider_url,
        model: activeSettings?.model,
        hasApiKey: !!activeSettings?.api_key,
        sessionId: currentSessionId,
        isAppendFunction: typeof append === 'function'
      });
    }
  }, [user, activeSettings, currentSessionId, append]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    if (!user?.id) {
      addLog('error', 'User session not found. Please refresh.');
      return;
    }

    if (!activeSettings?.api_key) {
      addLog('error', 'No active AI provider with an API key found.');
      setIsSettingsOpen(true);
      return;
    }

    addLog('process', `Sending message to ${activeSettings.name} (${activeSettings.model})...`);
    setToolActivities([]);
    
    append({
      content: input,
      role: 'user',
    });
    
    setInput('');
  };

  const createNewSession = useCallback(async () => {
    const { data, error } = await supabase.from('chat_sessions').insert({
      user_id: user?.id,
      title: 'New Chat'
    }).select().single();
    
    if (data) {
      setSessions(prev => [data as ChatSession, ...prev]);
      setCurrentSessionId(data.id);
      setIsSidebarOpen(false);
    }
  }, [user?.id]);

  const loadSettings = useCallback(async () => {
    addLog('process', 'Loading AI settings...');
    const { data, error } = await supabase.from('ai_settings').select('*').eq('user_id', user?.id).order('name', { ascending: true });
    if (error) {
      addLog('error', `Failed to load settings: ${error.message}`);
      return;
    }
    if (data && data.length > 0) {
      setAllSettings(data as AISettings[]);
      const active = data.find((s: any) => s.is_active) || data[0];
      setActiveSettings(active as AISettings);
      
      // Update form with active settings
      setProviderUrl(active.provider_url);
      setModel(active.model);
      setApiKey(active.api_key);
      setSettingName(active.name);
      addLog('info', `Active provider: ${active.name} (${active.model})`);
    } else {
      addLog('info', 'No AI settings found. Opening configuration.');
      setIsSettingsOpen(true);
    }
  }, [user?.id, addLog]);

  const switchActiveProvider = async (setting: AISettings) => {
    if (!user || !setting.id) return;
    addLog('process', `Switching to provider: ${setting.name}`);
    
    // Optimistic update
    setActiveSettings(setting);
    setAllSettings(prev => prev.map(s => ({ ...s, is_active: s.id === setting.id })));
    
    // Server update
    try {
      await supabase.from('ai_settings').update({ is_active: false }).eq('user_id', user.id);
      await supabase.from('ai_settings').update({ is_active: true }).eq('id', setting.id);
      addLog('info', `Successfully switched to ${setting.name}`);
    } catch (err: any) {
      addLog('error', `Failed to update active provider on server: ${err.message}`);
    }
    
    setIsQuickSelectOpen(false);
  };

  const deleteProvider = async (id: string) => {
    if (!user) return;
    await supabase.from('ai_settings').delete().eq('id', id);
    setAllSettings(prev => prev.filter(s => s.id !== id));
    if (activeSettings?.id === id) {
      const next = allSettings.find(s => s.id !== id);
      if (next) switchActiveProvider(next);
      else setActiveSettings(null);
    }
  };

  const fetchModels = useCallback(async (url: string, key: string) => {
    if (!url || !key) return;
    addLog('process', `Fetching models from ${url}...`);
    setIsFetchingModels(true);
    try {
      const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${key}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.data && Array.isArray(data.data)) {
          const modelIds = data.data.map((m: any) => m.id);
          setAvailableModels(modelIds.sort());
          addLog('info', `Successfully fetched ${modelIds.length} models`);
        }
      } else {
        addLog('error', `Failed to fetch models: ${response.status} ${response.statusText}`);
      }
    } catch (error: any) {
      console.error('Error fetching models:', error);
      addLog('error', `Error fetching models: ${error.message}`);
    } finally {
      setIsFetchingModels(false);
    }
  }, [addLog]);

  useEffect(() => {
    if (isSettingsOpen && providerUrl && apiKey) {
      fetchModels(providerUrl, apiKey);
    }
  }, [isSettingsOpen, providerUrl, apiKey, fetchModels]);

  const loadSessions = useCallback(async () => {
    const { data, error } = await supabase.from('chat_sessions').select('*').eq('user_id', user?.id).order('created_at', { ascending: false });
    if (data) {
      setSessions(data as ChatSession[]);
      if (data.length > 0 && !currentSessionId) {
        setCurrentSessionId(data[0].id);
      } else if (data.length === 0) {
        createNewSession();
      }
    }
  }, [user?.id, currentSessionId, createNewSession]);

  const loadMessages = useCallback(async (sessionId: string) => {
    const { data, error } = await supabase.from('chat_messages').select('*').eq('session_id', sessionId).order('created_at', { ascending: true });
    if (data) {
      const formattedMessages = data.map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content || '',
        parts: msg.parts || [{ type: 'text' as const, text: msg.content || '' }],
      }));
      setMessages(formattedMessages);
    }
  }, [setMessages]);

  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadSettings();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadSessions();
    }
  }, [user, loadSettings, loadSessions]);

  useEffect(() => {
    if (currentSessionId) {
      loadMessages(currentSessionId);
    } else {
      setMessages([]);
    }
  }, [currentSessionId, setMessages, loadMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const testConnection = async () => {
    if (!providerUrl || !apiKey) {
      setTestResult({ success: false, message: 'Provider URL and API Key are required' });
      return;
    }
    
    setIsTestingConnection(true);
    setTestResult(null);
    addLog('process', `Testing connection to ${providerUrl}...`);
    
    try {
      const baseUrl = providerUrl.endsWith('/') ? providerUrl.slice(0, -1) : providerUrl;
      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        addLog('info', 'Connection successful! Models retrieved.');
        setTestResult({ success: true, message: 'Connection successful!' });
        if (data.data && Array.isArray(data.data)) {
          setAvailableModels(data.data.map((m: any) => m.id).sort());
        }
      } else {
        const errorMsg = `Failed: ${response.status} ${response.statusText}`;
        addLog('error', `Connection test failed: ${errorMsg}`);
        setTestResult({ success: false, message: errorMsg });
      }
    } catch (err: any) {
      addLog('error', `Connection test error: ${err.message}`);
      setTestResult({ success: false, message: err.message });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSaving(true);
    setSaveError(null);

    const newSettings = { 
      name: settingName,
      provider_url: providerUrl, 
      model, 
      api_key: apiKey,
      user_id: user.id
    };
    
    try {
      if (editingId) {
        const { data, error } = await supabase.from('ai_settings').update(newSettings).eq('id', editingId).select().single();
        if (error) throw error;
        if (data) {
          setAllSettings(prev => prev.map(s => s.id === editingId ? data as AISettings : s));
          if (activeSettings?.id === editingId) setActiveSettings(data as AISettings);
          
          // Reset form on success
          setEditingId(null);
          setSettingName('Default');
          setProviderUrl('https://api.openai.com/v1');
          setModel('gpt-4o');
          setApiKey('');
        }
      } else {
        // If first one, make it active
        const isFirst = allSettings.length === 0;
        const { data, error } = await supabase.from('ai_settings').insert({ ...newSettings, is_active: isFirst }).select().single();
        if (error) throw error;
        if (data) {
          setAllSettings(prev => [...prev, data as AISettings]);
          if (isFirst) setActiveSettings(data as AISettings);
          
          // Reset form on success
          setEditingId(null);
          setSettingName('Default');
          setProviderUrl('https://api.openai.com/v1');
          setModel('gpt-4o');
          setApiKey('');
        }
      }
    } catch (err: any) {
      console.error('Error saving settings:', err);
      setSaveError(err.message || 'Failed to save settings. Please check if the name is unique.');
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = (s: AISettings) => {
    setEditingId(s.id || null);
    setSettingName(s.name);
    setProviderUrl(s.provider_url);
    setModel(s.model);
    setApiKey(s.api_key);
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from('chat_sessions').delete().eq('id', id);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) {
      setCurrentSessionId(sessions.find(s => s.id !== id)?.id || null);
    }
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeSettings?.api_key) {
      addLog('error', 'Missing API Key in active settings');
      setIsSettingsOpen(true);
      return;
    }
    
    addLog('process', `Sending message to ${activeSettings.model} at ${activeSettings.provider_url}...`);
    console.log('Sending message with settings:', {
      model: activeSettings.model,
      providerUrl: activeSettings.provider_url,
      hasApiKey: !!activeSettings.api_key,
      sessionId: currentSessionId
    });
    
    // Auto-update title for new chat
    if (messages.length === 0 && currentSessionId) {
      const title = input.slice(0, 30) + (input.length > 30 ? '...' : '');
      await supabase.from('chat_sessions').update({ title }).eq('id', currentSessionId);
      setSessions(sessions.map(s => s.id === currentSessionId ? { ...s, title } : s));
    }
    
    handleSubmit(e);
  };

  return (
    <div className="sm:relative h-full sm:w-full bg-bg-primary sm:rounded-xl overflow-hidden border border-border-subtle flex flex-col sm:flex-row">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 sm:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed sm:relative w-64 h-full sm:h-auto bg-bg-secondary border-r border-border-subtle flex flex-col transition-transform duration-300 z-30 top-0 left-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full sm:translate-x-0"
      )}>
        <div className="p-2 sm:p-4 border-b border-border-subtle flex items-center justify-between gap-2">
          <h2 className="font-semibold text-text-primary flex items-center gap-1.5 sm:gap-2 text-sm truncate">
            <Sparkles className="w-3 sm:w-4 h-3 sm:h-4 text-accent-blue shrink-0" />
            <span className="truncate">Chats</span>
          </h2>
          <Button variant="ghost" onClick={createNewSession} className="h-7 sm:h-8 w-7 sm:w-8 p-0 shrink-0">
            <Plus className="w-3 sm:w-4 h-3 sm:h-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5 sm:p-2 space-y-0.5 sm:space-y-1">
          {sessions.map(session => (
            <div 
              key={session.id}
              onClick={() => {
                setCurrentSessionId(session.id);
                setIsSidebarOpen(false);
              }}
              className={cn(
                "flex items-center justify-between p-2 sm:p-3 rounded-lg cursor-pointer transition-colors group",
                currentSessionId === session.id ? "bg-surface-active text-text-primary" : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              )}
            >
              <span className="truncate text-xs sm:text-sm">{session.title}</span>
              <button 
                onClick={(e) => deleteSession(session.id, e)}
                className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-accent-red transition-opacity shrink-0"
              >
                <Trash2 className="w-3 sm:w-4 h-3 sm:h-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="p-2 sm:p-4 border-t border-border-subtle">
          <Button variant="secondary" className="w-full flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm h-9 sm:h-10" onClick={() => setIsSettingsOpen(true)}>
            <Settings className="w-3 sm:w-4 h-3 sm:h-4" />
            <span className="truncate">Settings</span>
          </Button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-h-0 bg-bg-primary relative w-full max-h-full ">
        {/* Chat Header */}
        <div className="h-14 border-b border-border-subtle flex items-center px-3 sm:px-4 justify-between bg-bg-primary/80 backdrop-blur-sm z-10 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button className="sm:hidden text-text-secondary hover:text-text-primary p-1" onClick={() => setIsSidebarOpen(true)}>
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="w-6 sm:w-8 h-6 sm:h-8 rounded-full bg-accent-blue/20 flex items-center justify-center shrink-0">
                <Bot className="w-3 sm:w-4 h-3 sm:h-4 text-accent-blue" />
              </div>
              <div className="min-w-0">
                <h1 className="font-medium text-text-primary text-xs sm:text-sm truncate">Vermix Assistant</h1>
                <p className="text-[9px] sm:text-[10px] text-text-tertiary truncate">Powered by {activeSettings?.model || 'AI'}</p>
              </div>
            </div>
          </div>

          {/* Quick Select Dropdown */}
          <div className="relative">
            <Button 
              variant="ghost" 
              className="h-8 sm:h-9 px-2 sm:px-3 flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
              onClick={() => setIsQuickSelectOpen(!isQuickSelectOpen)}
            >
              <span className="truncate max-w-[60px] sm:max-w-[100px]">{activeSettings?.name || 'Provider'}</span>
              <ChevronDown className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 transition-transform shrink-0", isQuickSelectOpen && "rotate-180")} />
            </Button>

            {isQuickSelectOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsQuickSelectOpen(false)} />
                <div className="absolute right-0 mt-1 w-40 sm:w-48 bg-surface-default border border-border-subtle rounded-lg shadow-xl z-50 py-1 max-h-64 overflow-y-auto">
                  {allSettings.map(s => (
                    <button
                      key={s.id}
                      className={cn(
                        "w-full text-left px-3 sm:px-4 py-1.5 sm:py-2 text-xs hover:bg-surface-hover transition-colors flex items-center justify-between gap-2",
                        activeSettings?.id === s.id ? "text-accent-blue font-medium bg-accent-blue/5" : "text-text-primary"
                      )}
                      onClick={() => switchActiveProvider(s)}
                    >
                      <span className="truncate text-xs">{s.name}</span>
                      {activeSettings?.id === s.id && <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-accent-blue shrink-0" />}
                    </button>
                  ))}
                  <div className="h-px bg-border-subtle my-0.5 sm:my-1" />
                  <button
                    className="w-full text-left px-3 sm:px-4 py-1.5 sm:py-2 text-xs text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors flex items-center gap-2"
                    onClick={() => {
                      setIsSettingsOpen(true);
                      setIsQuickSelectOpen(false);
                    }}
                  >
                    <Settings className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
                    Manage
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-6 w-full h-full">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-3 sm:space-y-4 opacity-50 px-3 sm:px-4">
              <div className="w-12 sm:w-16 h-12 sm:h-16 rounded-full bg-surface-active flex items-center justify-center">
                <Sparkles className="w-6 sm:w-8 h-6 sm:h-8 text-text-secondary" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-medium text-text-primary mb-0.5 sm:mb-1">How can I help you today?</h3>
                <p className="text-xs sm:text-sm text-text-secondary max-w-sm">I can help you manage your calendar, create tasks, and remember important details.</p>
              </div>
            </div>
          ) : (
            messages.map(m => (
              <div key={m.id} className={cn("flex gap-2 sm:gap-4 max-w-3xl mx-auto w-full px-1 sm:px-0", m.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                  m.role === 'user' ? "bg-surface-active" : "bg-accent-blue/20"
                )}>
                  {m.role === 'user' ? <div className="text-xs font-medium">U</div> : <Bot className="w-4 h-4 text-accent-blue" />}
                </div>
                <div className={cn(
                  "px-3 sm:px-4 py-2 sm:py-3 rounded-2xl text-sm break-words",
                  m.role === 'user' ? "bg-surface-active text-text-primary rounded-tr-sm max-w-[85%]" : "bg-surface-default text-text-secondary max-w-[90%]"
                )}>
                  {m.parts?.map((part, i) => {
                    if (part.type === 'text') {
                      return (
                        <div key={i} className="markdown-body text-xs sm:text-sm leading-relaxed">
                          {renderMessageContent(part.text)}
                        </div>
                      );
                    }
                    if (part.type === 'tool-invocation') {
                      return (
                        <div key={i} className="text-xs text-text-tertiary italic flex items-center gap-2">
                          <Sparkles className="w-3 h-3" />
                          Working on it...
                        </div>
                      );
                    }
                    // if (part.type === 'tool_result') {
                    //   return (
                    //     <div key={i} className="text-xs bg-surface-active p-2 rounded-md mt-2">
                    //       <span className="font-medium text-accent-blue">Tool: {part.toolName}</span>
                    //       <pre className="text-[10px] mt-1 overflow-x-auto">{JSON.stringify(part.result, null, 2)}</pre>
                    //     </div>
                    //   );
                    // }
                    return null;
                  })}
                </div>
              </div>
            ))
          )}
          {isLoading && toolActivities.length > 0 && (
            <div className="max-w-3xl mx-auto px-2 sm:px-4 py-3 sm:py-4 rounded-2xl border border-border-subtle bg-surface-default/70 backdrop-blur-sm w-full">
              <div className="flex items-center justify-between mb-2 sm:mb-3 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="w-3 sm:w-4 h-3 sm:h-4 text-accent-blue shrink-0" />
                  <p className="text-xs sm:text-sm font-medium text-text-primary truncate">Agent actions</p>
                </div>
                <span className="text-[10px] sm:text-[11px] text-text-tertiary shrink-0">
                  {toolActivities.filter(t => t.status !== 'running').length}/{toolActivities.length} done
                </span>
              </div>

              <div className="h-1 sm:h-1.5 w-full rounded-full bg-bg-secondary overflow-hidden mb-2 sm:mb-3">
                <div
                  className="h-full bg-accent-blue transition-all duration-300"
                  style={{
                    width: `${
                      toolActivities.length
                        ? Math.round(
                            (toolActivities.filter(t => t.status !== 'running').length /
                              toolActivities.length) * 100,
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                {toolActivities.map(item => (
                  <div
                    key={item.toolCallId}
                    className="flex items-center justify-between gap-2 rounded-lg sm:rounded-xl border border-border-subtle bg-bg-secondary/80 px-2 sm:px-3 py-1.5 sm:py-2"
                  >
                    <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                      {item.status === 'running' && (
                        <Loader2 className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-accent-blue animate-spin shrink-0" />
                      )}
                      {item.status === 'completed' && (
                        <CheckCircle2 className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-accent-green shrink-0" />
                      )}
                      {item.status === 'failed' && (
                        <AlertCircle className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-accent-red shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs sm:text-xs font-medium text-text-primary truncate">
                          {normalizeToolName(item.toolName)}
                        </p>
                        <p className="text-[10px] sm:text-[11px] text-text-tertiary truncate">{item.summary}</p>
                      </div>
                    </div>
                    <span className="text-[9px] sm:text-[10px] text-text-tertiary shrink-0">
                      {typeof item.durationMs === 'number' ? `${item.durationMs}ms` : item.status === 'running' ? 'running' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {isLoading && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex gap-3 sm:gap-4 max-w-3xl mx-auto w-full px-1 sm:px-0">
              <div className="w-6 sm:w-8 h-6 sm:h-8 rounded-full bg-accent-blue/20 flex items-center justify-center shrink-0">
                <Bot className="w-3 sm:w-4 h-3 sm:h-4 text-accent-blue" />
              </div>
              <div className="px-3 sm:px-4 py-2 sm:py-3 text-text-tertiary text-xs sm:text-sm flex items-center gap-2">
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-text-tertiary animate-bounce" />
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-text-tertiary animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-text-tertiary animate-bounce" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-3 sm:p-4 bg-bg-primary border-t border-border-subtle shrink-0 w-full">
          <form onSubmit={onSubmit} className="max-w-3xl mx-auto relative flex items-center">
            <Input
              value={input}
              onChange={handleInputChange}
              placeholder={activeSettings?.api_key ? "Ask Vermix Assistant..." : "Configure AI Settings to start"}
              disabled={isLoading || !activeSettings?.api_key}
              className="w-full pr-12 rounded-full bg-surface-default border-border-subtle focus:border-border-focus h-11 sm:h-12 text-sm"
            />
            <Button 
              type="submit" 
              disabled={isLoading || !input.trim() || !activeSettings?.api_key}
              variant="icon"
              className="absolute right-2 text-accent-blue hover:bg-accent-blue/10 w-9 h-9 sm:w-8 sm:h-8 rounded-full flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
          <div className="flex items-center justify-between gap-2 mt-2 max-w-3xl mx-auto text-[9px] sm:text-[10px]">
            <span className="text-text-tertiary hidden sm:inline">Vermix Assistant can make mistakes. Check important info.</span>
            <button 
              onClick={() => setIsConsoleOpen(!isConsoleOpen)}
              className="text-[9px] sm:text-[10px] font-medium text-text-tertiary hover:text-accent-blue flex items-center gap-1 transition-colors ml-auto"
            >
              <Menu className="w-3 h-3" />
              {isConsoleOpen ? 'Hide Console' : 'Show Console'}
            </button>
          </div>
        </div>

        {/* Log Console */}
        {isConsoleOpen && (
          <div className="h-32 sm:h-48 bg-black/90 border-t border-white/10 flex flex-col font-mono text-[9px] sm:text-[10px] shrink-0 w-full">
            <div className="p-2 border-b border-white/10 flex items-center justify-between bg-white/5">
              <span className="text-white/50 uppercase tracking-widest">Agent Console</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setLogs([])} className="text-white/30 hover:text-white transition-colors">Clear</button>
                <button onClick={() => setIsConsoleOpen(false)} className="text-white/30 hover:text-white transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {logs.map((log, i) => (
                <div key={i} className={cn(
                  "flex gap-2",
                  log.type === 'error' ? "text-red-400" : log.type === 'process' ? "text-blue-400" : "text-green-400"
                )}>
                  <span className="text-white/20 shrink-0">[{log.timestamp.toLocaleTimeString([], { hour12: false })}]</span>
                  <span className="shrink-0 uppercase font-bold">[{log.type}]</span>
                  <span className="break-all">{log.message}</span>
                </div>
              ))}
              {logs.length === 0 && <div className="text-white/20 italic">No logs captured yet...</div>}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      <Modal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="AI Provider Management">
        <div className="space-y-6">
          {/* List of Providers */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Saved Providers</h3>
            <div className="grid gap-2">
              {allSettings.map(s => (
                <div key={s.id} className={cn(
                  "flex items-center justify-between p-3 border border-border-subtle bg-bg-secondary group",
                  activeSettings?.id === s.id && "border-accent-blue/50 bg-accent-blue/5"
                )}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-text-primary truncate">{s.name}</span>
                      {activeSettings?.id === s.id && <span className="text-[9px] bg-accent-blue text-white px-1.5 py-0.5 rounded-full">Active</span>}
                    </div>
                    <p className="text-[10px] text-text-tertiary truncate">{s.model} • {s.provider_url}</p>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => startEditing(s)}>
                      <Settings className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" className="h-8 w-8 p-0 hover:text-accent-red" onClick={() => deleteProvider(s.id!)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              {allSettings.length === 0 && (
                <div className="text-center py-8 border border-dashed border-border-subtle text-text-tertiary text-sm">
                  No providers configured yet.
                </div>
              )}
            </div>
          </div>

          <div className="h-px bg-border-subtle" />

          {/* Add/Edit Form */}
          <form onSubmit={saveSettings} className="space-y-4">
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              {editingId ? 'Edit Provider' : 'Add New Provider'}
            </h3>
            
            {saveError && (
              <div className="p-3 bg-accent-red/10 border border-accent-red/20 rounded-lg text-accent-red text-xs">
                {saveError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Configuration Name</label>
                <Input 
                  value={settingName} 
                  onChange={(e) => {
                    setSettingName(e.target.value);
                    setSaveError(null);
                  }} 
                  placeholder="e.g. OpenAI Pro"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Provider URL</label>
                <Input 
                  value={providerUrl} 
                  onChange={(e) => {
                    setProviderUrl(e.target.value);
                    setSaveError(null);
                  }} 
                  placeholder="https://api.openai.com/v1"
                  required
                />
                <p className="text-[10px] text-text-tertiary mt-1">
                  Base URL for OpenAI-compatible APIs (e.g. <code>https://api.openai.com/v1</code>)
                </p>
              </div>
            </div>
            <div className="relative">
              <label className="block text-xs font-medium text-text-secondary mb-1">Model Name</label>
              <div className="relative">
                <Input 
                  value={model} 
                  onChange={(e) => setModel(e.target.value)} 
                  onFocus={() => setIsDropdownOpen(true)}
                  placeholder="gpt-4o"
                  required
                  className="pr-10"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {isFetchingModels ? (
                    <Loader2 className="w-4 h-4 text-accent-blue animate-spin" />
                  ) : (
                    <button 
                      type="button" 
                      onClick={() => {
                        if (availableModels.length === 0) fetchModels(providerUrl, apiKey);
                        setIsDropdownOpen(!isDropdownOpen);
                      }}
                      className="text-text-tertiary hover:text-text-secondary transition-colors"
                    >
                      <ChevronDown className={cn("w-4 h-4 transition-transform", isDropdownOpen && "rotate-180")} />
                    </button>
                  )}
                </div>
              </div>
              
              {/* Searchable Dropdown */}
              {isDropdownOpen && availableModels.length > 0 && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                  <div className="absolute z-50 w-full mt-1 bg-surface-default border border-border-subtle rounded-lg shadow-xl max-h-40 overflow-y-auto py-1">
                    <div className="sticky top-0 bg-surface-default px-2 py-2 border-b border-border-subtle flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-tertiary" />
                        <input
                          className="w-full bg-bg-secondary border border-border-subtle rounded-md pl-7 pr-2 py-1 text-xs focus:outline-none focus:border-border-focus"
                          placeholder="Filter models..."
                          value={modelSearch}
                          onChange={(e) => setModelSearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        className="h-7 w-7 p-0" 
                        onClick={() => fetchModels(providerUrl, apiKey)}
                      >
                        <RefreshCw className={cn("w-3 h-3", isFetchingModels && "animate-spin")} />
                      </Button>
                    </div>
                    {availableModels
                      .filter(m => m.toLowerCase().includes(modelSearch.toLowerCase()))
                      .map(m => (
                        <button
                          key={m}
                          type="button"
                          className={cn(
                            "w-full text-left px-4 py-2 text-sm hover:bg-surface-hover transition-colors",
                            model === m ? "text-accent-blue font-medium bg-accent-blue/5" : "text-text-primary"
                          )}
                          onClick={() => {
                            setModel(m);
                            setIsDropdownOpen(false);
                            setModelSearch('');
                          }}
                        >
                          {m}
                        </button>
                      ))}
                  </div>
                </>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">API Key</label>
              <Input 
                type="password"
                value={apiKey} 
                onChange={(e) => setApiKey(e.target.value)} 
                placeholder="sk-..."
                required
              />
            </div>
            <div className="flex items-center gap-3 mt-6">
              <Button 
                type="button" 
                variant="secondary" 
                onClick={testConnection} 
                disabled={isTestingConnection || !providerUrl || !apiKey}
                className="flex-1"
              >
                {isTestingConnection ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test Connection'}
              </Button>
              <Button type="submit" variant="default" disabled={isSaving} className="flex-1">
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  editingId ? 'Update Provider' : 'Add Provider'
                )}
              </Button>
            </div>
            
            {testResult && (
              <div className={cn(
                "p-3 rounded-lg flex items-center gap-2 text-xs",
                testResult.success ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"
              )}>
                {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {testResult.message}
              </div>
            )}
          </form>
        </div>
      </Modal>
    </div>
  );
}
