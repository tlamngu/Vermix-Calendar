import { useState, useCallback } from 'react';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  parts?: any[];
}

export interface UseChatOptions {
  api?: string;
  body?: any;
  onFinish?: (message: Message) => void;
  onError?: (error: Error) => void;
  onToolEvent?: (event: any) => void;
  initialMessages?: Message[];
}

export function useChat({
  api = '/api/chat',
  body = {},
  onFinish,
  onError,
  initialMessages = [],
}: UseChatOptions = {}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);

  const append = useCallback(async (message: Omit<Message, 'id'>) => {
    const userMessage: Message = {
      ...message,
      id: Date.now().toString(),
      parts: [{ type: 'text', text: message.content }],
    };

    const outboundMessages = [...messages, userMessage].filter(
      m => m.role !== 'tool'
    );

    // Optimistic user update
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
          messages: outboundMessages,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }
      
      const data = await response.json();
      
      // Wait a short moment to allow the backend to initialize the reply
      // before turning off isLoading. Or rely on Realtime.
      setTimeout(() => setIsLoading(false), 500);
      
    } catch (error: any) {
      console.error('Chat API Error:', error);
      onError?.(error);
      setIsLoading(false);
    }
  }, [api, body, messages, onError]);

  return {
    messages,
    setMessages,
    isLoading,
    setIsLoading,
    append,
    input: '',
    handleInputChange: () => {},
    handleSubmit: () => {},
  };
}
