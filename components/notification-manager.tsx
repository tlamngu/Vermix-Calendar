'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './auth-provider';
import { parseISO, differenceInMilliseconds, subMinutes, isAfter } from 'date-fns';

interface ScheduledNotification {
  id: string;
  title: string;
  time: Date;
  type: 'event' | 'task';
}

export function NotificationManager() {
  const { user } = useAuth();
  const scheduledTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const [reminderMinutes, setReminderMinutes] = useState(15);

  const scheduleNotification = useCallback((item: ScheduledNotification, minutes: number) => {
    // Clear existing timeout for this item if any
    if (scheduledTimeouts.current.has(item.id)) {
      clearTimeout(scheduledTimeouts.current.get(item.id)!);
      scheduledTimeouts.current.delete(item.id);
    }

    const now = new Date();
    const reminderTime = subMinutes(item.time, minutes);

    if (isAfter(reminderTime, now)) {
      const delay = differenceInMilliseconds(reminderTime, now);
      
      const timeoutId = setTimeout(() => {
        if (Notification.permission === 'granted') {
          new Notification(`Reminder: ${item.title}`, {
            body: `Starting in ${minutes} minutes at ${item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            icon: '/favicon.ico', // Fallback icon
          });
        }
        scheduledTimeouts.current.delete(item.id);
      }, delay);

      scheduledTimeouts.current.set(item.id, timeoutId);
    }
  }, []);

  const cancelNotification = useCallback((id: string) => {
    if (scheduledTimeouts.current.has(id)) {
      clearTimeout(scheduledTimeouts.current.get(id)!);
      scheduledTimeouts.current.delete(id);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    // Request permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const fetchSettings = async () => {
      const { data, error } = await supabase
        .from('user_settings')
        .select('reminder_minutes')
        .eq('user_id', user.id)
        .single();
      
      if (data && !error) {
        setReminderMinutes(data.reminder_minutes);
      }
    };

    const fetchAndSchedule = async (minutes: number) => {
      const now = new Date();
      
      // Fetch events
      const { data: events } = await supabase
        .from('events')
        .select('*')
        .eq('userId', user.id);

      if (events) {
        events.forEach((event: any) => {
          if (event.startDate) {
            scheduleNotification({
              id: event.id,
              title: event.title,
              time: parseISO(event.startDate),
              type: 'event'
            }, minutes);
          }
        });
      }

      // Fetch tasks
      const { data: tasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('userId', user.id);

      if (tasks) {
        tasks.forEach((task: any) => {
          if (task.dueDate && task.status !== 'done') {
            scheduleNotification({
              id: task.id,
              title: task.title,
              time: parseISO(task.dueDate),
              type: 'task'
            }, minutes);
          }
        });
      }
    };

    const init = async () => {
      await fetchSettings();
      // fetchAndSchedule will be called by the next useEffect when reminderMinutes changes
    };

    init();

    // Listen for settings changes
    const settingsChannel = supabase
      .channel('settings_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_settings', filter: `user_id=eq.${user.id}` }, (payload) => {
        if (payload.new && (payload.new as any).reminder_minutes !== undefined) {
          setReminderMinutes((payload.new as any).reminder_minutes);
        }
      })
      .subscribe();

    // Real-time subscriptions for events/tasks
    const eventsChannel = supabase
      .channel('notifications_events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `userId=eq.${user.id}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          cancelNotification(payload.old.id);
        } else {
          const event = payload.new as any;
          if (event.startDate) {
            scheduleNotification({
              id: event.id,
              title: event.title,
              time: parseISO(event.startDate),
              type: 'event'
            }, reminderMinutes);
          }
        }
      })
      .subscribe();

    const tasksChannel = supabase
      .channel('notifications_tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `userId=eq.${user.id}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          cancelNotification(payload.old.id);
        } else {
          const task = payload.new as any;
          if (task.dueDate && task.status !== 'done') {
            scheduleNotification({
              id: task.id,
              title: task.title,
              time: parseISO(task.dueDate),
              type: 'task'
            }, reminderMinutes);
          } else if (task.status === 'done') {
            cancelNotification(task.id);
          }
        }
      })
      .subscribe();

    return () => {
      settingsChannel.unsubscribe();
      eventsChannel.unsubscribe();
      tasksChannel.unsubscribe();
      // Clear all timeouts on unmount
      const currentTimeouts = scheduledTimeouts.current;
      currentTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
      currentTimeouts.clear();
    };
  }, [user, reminderMinutes, scheduleNotification, cancelNotification]);

  // Re-schedule everything when reminderMinutes changes
  useEffect(() => {
    if (!user) return;
    
    const rescheduleAll = async () => {
      const { data: events } = await supabase
        .from('events')
        .select('*')
        .eq('userId', user.id);

      if (events) {
        events.forEach((event: any) => {
          if (event.startDate) {
            scheduleNotification({
              id: event.id,
              title: event.title,
              time: parseISO(event.startDate),
              type: 'event'
            }, reminderMinutes);
          }
        });
      }

      const { data: tasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('userId', user.id);

      if (tasks) {
        tasks.forEach((task: any) => {
          if (task.dueDate && task.status !== 'done') {
            scheduleNotification({
              id: task.id,
              title: task.title,
              time: parseISO(task.dueDate),
              type: 'task'
            }, reminderMinutes);
          }
        });
      }
    };

    rescheduleAll();
  }, [reminderMinutes, user, scheduleNotification]);

  return null; // This component doesn't render anything
}
