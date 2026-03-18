'use client';

import { useState, useEffect } from 'react';
import {
  format,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  addDays,
  parseISO,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, CheckSquare } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import { Modal } from './ui/modal';
import { Input } from './ui/input';
import { useRouter } from 'next/navigation';
import { useSwipeable } from 'react-swipeable';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface Event {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  userId: string;
}

interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'done' | 'cancelled';
  category: 'personal' | 'work';
  dueDate?: string;
  userId: string;
  color?: string;
}

const TASK_COLORS: Record<string, string> = {
  gray: 'bg-surface-hover text-text-tertiary',
  red: 'bg-accent-red/20 text-accent-red',
  orange: 'bg-orange-500/20 text-orange-500',
  blue: 'bg-accent-blue/20 text-accent-blue',
  green: 'bg-accent-green/20 text-accent-green',
};

export function CalendarView() {
  const { user } = useAuth();
  const router = useRouter();
  const [baseDate, setBaseDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState<Event[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', description: '', time: '12:00' });
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('userId', user.id);
        
      if (eventsError) console.error("Supabase Error fetching events:", eventsError);
      else if (eventsData) setEvents(eventsData as Event[]);

      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('userId', user.id);
        
      if (tasksError) console.error("Supabase Error fetching tasks:", tasksError);
      else if (tasksData) setTasks(tasksData as Task[]);
      setLoading(false);
    };

    fetchData();

    const eventsChannel = supabase
      .channel('events_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `userId=eq.${user.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setEvents(prev => {
            if (prev.find(e => e.id === payload.new.id)) return prev;
            return [...prev, payload.new as Event];
          });
        }
        else if (payload.eventType === 'UPDATE') setEvents(prev => prev.map(e => e.id === payload.new.id ? payload.new as Event : e));
        else if (payload.eventType === 'DELETE') setEvents(prev => prev.filter(e => e.id !== payload.old.id));
      })
      .subscribe();

    const tasksChannel = supabase
      .channel('tasks_changes_cal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `userId=eq.${user.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setTasks(prev => {
            if (prev.find(t => t.id === payload.new.id)) return prev;
            return [...prev, payload.new as Task];
          });
        }
        else if (payload.eventType === 'UPDATE') setTasks(prev => prev.map(t => t.id === payload.new.id ? payload.new as Task : t));
        else if (payload.eventType === 'DELETE') setTasks(prev => prev.filter(t => t.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(eventsChannel);
      supabase.removeChannel(tasksChannel);
    };
  }, [user]);

  const next = () => viewMode === 'month' ? setBaseDate(addMonths(baseDate, 1)) : setBaseDate(addWeeks(baseDate, 1));
  const prev = () => viewMode === 'month' ? setBaseDate(subMonths(baseDate, 1)) : setBaseDate(subWeeks(baseDate, 1));
  
  const onDateClick = (day: Date) => setSelectedDate(day);

  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => next(),
    onSwipedRight: () => prev(),
    trackMouse: false,
    preventScrollOnSwipe: true,
  });

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newEvent.title) return;

    const startDateTime = new Date(selectedDate);
    const [hours, minutes] = newEvent.time.split(':');
    startDateTime.setHours(parseInt(hours, 10), parseInt(minutes, 10));

    const endDateTime = new Date(startDateTime);
    endDateTime.setHours(startDateTime.getHours() + 1);

    try {
      const { error } = await supabase.from('events').insert([{
        title: newEvent.title,
        description: newEvent.description,
        startDate: startDateTime.toISOString(),
        endDate: endDateTime.toISOString(),
        allDay: false,
        userId: user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }]);
      
      if (error) throw error;
      
      setIsModalOpen(false);
      setNewEvent({ title: '', description: '', time: '12:00' });
    } catch (error) {
      console.error("Supabase Error creating event:", error);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('events').delete().eq('id', eventId);
      if (error) throw error;
    } catch (error) {
      console.error("Supabase Error deleting event:", error);
    }
  };

  const renderHeader = () => {
    return (
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-[var(--space-base)] gap-4">
        <h2 className="text-[var(--text-2xl)] font-semibold text-text-primary tracking-tight">
          {format(baseDate, viewMode === 'month' ? 'MMMM yyyy' : 'MMM d, yyyy')}
        </h2>
        
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex bg-surface-default border border-border-default rounded-md overflow-hidden mr-2">
            <button
              onClick={() => setViewMode('month')}
              className={cn("px-3 py-2 text-xs font-medium transition-colors", viewMode === 'month' ? "bg-surface-active text-text-primary" : "text-text-secondary hover:bg-surface-hover")}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={cn("px-3 py-2 text-xs font-medium transition-colors", viewMode === 'week' ? "bg-surface-active text-text-primary" : "text-text-secondary hover:bg-surface-hover")}
            >
              Week
            </button>
          </div>

          <Button variant="icon" onClick={prev}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Button variant="icon" onClick={next}>
            <ChevronRight className="w-5 h-5" />
          </Button>
          <Button onClick={() => setIsModalOpen(true)} className="ml-auto sm:ml-2">
            <Plus className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">New Event</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>
    );
  };

  const renderDays = () => {
    const days = [];
    const startDate = startOfWeek(baseDate);
    for (let i = 0; i < 7; i++) {
      days.push(
        <div key={i} className="text-center font-medium text-[clamp(10px,1.5vw,12px)] text-text-tertiary uppercase tracking-wider py-2">
          {format(addDays(startDate, i), 'EEE')}
        </div>
      );
    }
    return <div className="grid grid-cols-7 mb-2">{days}</div>;
  };

  const renderCells = () => {
    const monthStart = startOfMonth(baseDate);
    const monthEnd = endOfMonth(monthStart);
    
    const startDate = viewMode === 'month' ? startOfWeek(monthStart) : startOfWeek(baseDate);
    const endDate = viewMode === 'month' ? endOfWeek(monthEnd) : endOfWeek(baseDate);

    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = '';

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, 'd');
        const cloneDay = day;
        const isSelected = isSameDay(day, selectedDate);
        const isCurrentMonth = isSameMonth(day, monthStart);
        
        const dayEvents = events.filter(e => isSameDay(parseISO(e.startDate), cloneDay));
        const dayTasks = tasks.filter(t => t.dueDate && isSameDay(parseISO(t.dueDate), cloneDay));

        days.push(
          <motion.div
            layout
            key={day.toISOString()}
            onClick={() => onDateClick(cloneDay)}
            className={`min-h-[clamp(80px,12vh,140px)] p-1.5 sm:p-2 border border-border-subtle transition-colors cursor-pointer relative flex flex-col ${
              !isCurrentMonth && viewMode === 'month' ? 'bg-bg-secondary/50 text-text-disabled' : 'bg-surface-default text-text-primary hover:bg-surface-hover'
            } ${isSelected ? 'border-border-focus bg-surface-active' : ''}`}
          >
            <div className="flex justify-between items-start">
              <span className={`text-sm font-medium ${isSelected ? 'text-accent-blue' : ''}`}>
                {formattedDate}
              </span>
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  router.push(`/tasks?date=${format(cloneDay, 'yyyy-MM-dd')}`); 
                }}
                className="text-[10px] text-text-tertiary hover:text-accent-primary uppercase tracking-wider flex items-center bg-bg-secondary px-2 py-1 rounded-md transition-colors active:bg-surface-active"
                title="View tasks for this day"
              >
                <CheckSquare className="w-3.5 h-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Tasks</span>
              </button>
            </div>
            
            <div className="mt-2 space-y-1.5 overflow-y-auto flex-1">
              {dayEvents.map(event => (
                <div key={event.id} className="text-xs bg-accent-blue/20 text-accent-blue px-2 py-1.5 truncate flex justify-between items-center group rounded-md">
                  <span className="truncate">{event.title}</span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event.id); }}
                    className="sm:opacity-0 group-hover:opacity-100 hover:text-accent-red ml-1 p-1 -mr-1 active:scale-125 transition-all"
                  >
                    <span className="text-sm leading-none">×</span>
                  </button>
                </div>
              ))}
              {dayTasks.map(task => (
                <div 
                  key={task.id} 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    router.push(`/tasks?date=${format(cloneDay, 'yyyy-MM-dd')}`); 
                  }}
                  className={cn(
                    "text-[10px] px-2 py-1 truncate flex items-center gap-1.5 rounded-md cursor-pointer transition-colors active:opacity-70",
                    task.status === 'done' 
                      ? 'bg-surface-hover text-text-tertiary line-through opacity-50' 
                      : task.status === 'cancelled'
                      ? 'bg-surface-hover text-text-tertiary line-through opacity-30 grayscale'
                      : TASK_COLORS[task.color || 'gray'] || TASK_COLORS.gray
                  )}
                  title={`Go to ${task.category} tasks`}
                >
                  <CheckSquare className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{task.title}</span>
                </div>
              ))}
            </div>
          </motion.div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7" key={`row-${day.toISOString()}`}>
          {days}
        </div>
      );
      days = [];
    }
    return (
      <div {...swipeHandlers} className="touch-pan-y">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={viewMode + baseDate.toISOString()}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {rows}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      {renderHeader()}
      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-7 gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="h-8 bg-surface-hover animate-pulse rounded" />
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-32 bg-surface-default border border-border-subtle animate-pulse rounded" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {renderDays()}
          {renderCells()}
        </>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create Event">
        <form onSubmit={handleCreateEvent} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1 uppercase tracking-wider">Date</label>
            <div className="text-sm text-text-primary p-2 bg-surface-default border border-border-default h-11 sm:h-10 flex items-center">
              {format(selectedDate, 'MMMM d, yyyy')}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1 uppercase tracking-wider">Time</label>
            <Input
              type="time"
              value={newEvent.time}
              onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1 uppercase tracking-wider">Title</label>
            <Input
              value={newEvent.title}
              onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
              placeholder="Event title"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1 uppercase tracking-wider">Description</label>
            <Input
              value={newEvent.description}
              onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
              placeholder="Optional description"
            />
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save Event</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
