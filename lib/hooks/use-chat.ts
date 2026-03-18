'use client';

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

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
          messages: [...messages, userMessage],
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      const assistantMessageId = (Date.now() + 1).toString();

      setMessages(prev => [...prev, { 
        id: assistantMessageId, 
        role: 'assistant', 
        content: '',
        parts: [{ type: 'text', text: '' }]
      }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('0:')) {
            try {
              const content = JSON.parse(line.slice(2));
              assistantContent += content;
              setMessages(prev => prev.map(m => 
                m.id === assistantMessageId ? { 
                  ...m, 
                  content: assistantContent,
                  parts: [{ type: 'text', text: assistantContent }]
                } : m
              ));
            } catch (e) {
              console.error('Error parsing chunk', e);
            }
          } else if (line.startsWith('a:')) {
            try {
              const toolResult = JSON.parse(line.slice(2));
              setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'tool',
                content: JSON.stringify(toolResult.result),
                parts: [{ type: 'tool_result', toolName: toolResult.toolName, result: toolResult.result }]
              }]);
            } catch (e) {
              console.error('Error parsing tool result', e);
            }
          }
        }
      }

      const finalMessage: Message = { id: assistantMessageId, role: 'assistant', content: assistantContent };
      onFinish?.(finalMessage);
    } catch (error: any) {
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [api, body, messages, onFinish, onError]);

  return {
    messages,
    setMessages,
    isLoading,
    append,
    input: '', // Not used in this simplified version as the component manages its own input
    handleInputChange: () => {},
    handleSubmit: () => {},
  };
}
