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
  onToolEvent?: (event: any) => void;
  initialMessages?: Message[];
}

export function useChat({
  api = '/api/chat',
  body = {},
  onFinish,
  onError,
  onToolEvent,
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

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let assistantMessageId: string | null = null;
      let pending = '';

      const upsertAssistantMessage = (nextContent: string) => {
        if (!assistantMessageId) {
          const newAssistantMessageId = (Date.now() + 1).toString();
          assistantMessageId = newAssistantMessageId;
          setMessages(prev => [
            ...prev,
            {
              id: newAssistantMessageId,
              role: 'assistant',
              content: nextContent,
              parts: [{ type: 'text', text: nextContent }],
            },
          ]);
          return;
        }

        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: nextContent,
                  parts: [{ type: 'text', text: nextContent }],
                }
              : m
          )
        );
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        pending += decoder.decode(value, { stream: true });
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';

        for (const line of lines) {
          if (!line) continue;

          if (line.startsWith('0:')) {
            try {
              const content = JSON.parse(line.slice(2));
              assistantContent += content;
              upsertAssistantMessage(assistantContent);
            } catch (e) {
              console.error('Error parsing chunk', e);
            }
          } else if (line.startsWith('a:')) {
            try {
              const toolEvent = JSON.parse(line.slice(2));
              onToolEvent?.(toolEvent);
            } catch (e) {
              console.error('Error parsing tool result', e);
            }
          }
        }
      }

      if (pending.trim()) {
        const line = pending.trim();
        if (line.startsWith('0:')) {
          try {
            const content = JSON.parse(line.slice(2));
            assistantContent += content;
            upsertAssistantMessage(assistantContent);
          } catch (e) {
            console.error('Error parsing trailing chunk', e);
          }
        } else if (line.startsWith('a:')) {
          try {
            const toolEvent = JSON.parse(line.slice(2));
            onToolEvent?.(toolEvent);
          } catch (e) {
            console.error('Error parsing trailing tool event', e);
          }
        }
      }

      if (assistantMessageId) {
        const finalMessage: Message = {
          id: assistantMessageId,
          role: 'assistant',
          content: assistantContent,
          parts: [{ type: 'text', text: assistantContent }],
        };
        onFinish?.(finalMessage);
      }
    } catch (error: any) {
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [api, body, messages, onFinish, onError, onToolEvent]);

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
