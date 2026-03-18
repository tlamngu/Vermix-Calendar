'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Plus, Trash2, CheckCircle, Circle, Calendar as CalendarIcon, X, ChevronDown, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { useSearchParams, useRouter } from 'next/navigation';
import { Modal } from './ui/modal';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in-progress' | 'done';
  category: 'personal' | 'work';
  dueDate?: string;
  userId: string;
  color?: string;
}

const PRIORITY_COLORS = [
  { name: 'Default', value: 'gray', class: 'bg-surface-hover text-text-secondary border-border-default', indicator: 'bg-text-tertiary' },
  { name: 'High', value: 'red', class: 'bg-accent-red/10 text-accent-red border-accent-red/20', indicator: 'bg-accent-red' },
  { name: 'Medium', value: 'orange', class: 'bg-orange-500/10 text-orange-500 border-orange-500/20', indicator: 'bg-orange-500' },
  { name: 'Low', value: 'blue', class: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20', indicator: 'bg-accent-blue' },
  { name: 'Optional', value: 'green', class: 'bg-accent-green/10 text-accent-green border-accent-green/20', indicator: 'bg-accent-green' },
];

export function TaskList() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const dateFilter = searchParams.get('date');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskColor, setNewTaskColor] = useState('gray');
  const [isPriorityOpen, setIsPriorityOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'personal' | 'work'>('personal');
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (dateFilter) {
      setNewTaskDueDate(`${dateFilter}T12:00`);
    } else {
      setNewTaskDueDate('');
    }
  }, [dateFilter]);

  useEffect(() => {
    if (!user) return;

    const fetchTasks = async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('userId', user.id);
        
      if (error) {
        console.error("Supabase Error fetching tasks:", error);
      } else if (data) {
        setTasks(data as Task[]);
      }
      setLoading(false);
    };

    fetchTasks();

    const channel = supabase
      .channel('tasks_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `userId=eq.${user.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setTasks(prev => {
            if (prev.find(t => t.id === payload.new.id)) return prev;
            return [...prev, payload.new as Task];
          });
        } else if (payload.eventType === 'UPDATE') {
          setTasks(prev => prev.map(t => t.id === payload.new.id ? payload.new as Task : t));
        } else if (payload.eventType === 'DELETE') {
          setTasks(prev => prev.filter(t => t.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTaskTitle.trim()) return;

    const taskData: any = {
      title: newTaskTitle.trim(),
      status: 'todo',
      category: activeTab,
      userId: user.id,
      color: newTaskColor,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (newTaskDueDate) {
      try {
        taskData.dueDate = new Date(newTaskDueDate).toISOString();
      } catch (e) {
        // ignore invalid date
      }
    }

    try {
      const { error } = await supabase.from('tasks').insert([taskData]);
      if (error) throw error;
      
      setNewTaskTitle('');
      setNewTaskColor('gray');
      if (!dateFilter) {
        setNewTaskDueDate('');
      }
    } catch (error) {
      console.error("Supabase Error creating task:", error);
    }
  };

  const toggleTaskStatus = async (task: Task) => {
    if (!user) return;
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: newStatus,
          category: task.category || 'personal',
          updatedAt: new Date().toISOString(),
        })
        .eq('id', task.id);
        
      if (error) throw error;
    } catch (error) {
      console.error("Supabase Error updating task:", error);
    }
  };

  const handleDeleteTask = async () => {
    if (!user || !taskToDelete) return;
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', taskToDelete);
      if (error) throw error;
      setTaskToDelete(null);
    } catch (error) {
      console.error("Supabase Error deleting task:", error);
    }
  };

  const clearFilter = () => {
    router.push('/tasks');
  };

  const filteredTasks = tasks.filter(t => {
    const matchesTab = (t.category || 'personal') === activeTab;
    let matchesDate = true;
    if (dateFilter) {
      if (!t.dueDate) {
        matchesDate = false;
      } else {
        try {
          const taskDateStr = format(parseISO(t.dueDate), 'yyyy-MM-dd');
          matchesDate = taskDateStr === dateFilter;
        } catch (e) {
          matchesDate = false;
        }
      }
    }
    return matchesTab && matchesDate;
  });

  const todoTasks = filteredTasks.filter(t => t.status !== 'done');
  const doneTasks = filteredTasks.filter(t => t.status === 'done');

  const renderTask = (task: Task) => {
    const isDone = task.status === 'done';
    const priorityColor = PRIORITY_COLORS.find(c => c.value === (task.color || 'gray')) || PRIORITY_COLORS[0];

    return (
      <motion.div
        key={`${task.id}-${task.status}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="relative mb-2 group touch-pan-y"
      >
        <div className="absolute inset-0 bg-accent-red flex items-center justify-end pr-4 rounded-sm">
          <Trash2 className="text-white w-5 h-5" />
        </div>
        <motion.div
          drag="x"
          dragConstraints={{ left: -80, right: 0 }}
          dragElastic={0.2}
          onDragEnd={(e, info) => {
            if (info.offset.x < -60) {
              setTaskToDelete(task.id);
            }
          }}
          className="relative bg-bg-secondary z-10"
        >
          <Card className={cn(
            "flex items-center justify-between p-4 transition-all border-l-4 bg-bg-secondary", 
            isDone ? "opacity-60 border-l-transparent" : `border-l-${priorityColor.value === 'gray' ? 'border-default' : priorityColor.value + '-500'}`
          )}>
            <div className="flex items-center gap-4 flex-1">
              <button 
                onClick={() => toggleTaskStatus(task)} 
                className={cn("transition-colors flex-shrink-0 w-10 h-10 flex items-center justify-center -ml-2 rounded-full active:bg-surface-active", isDone ? "text-accent-green hover:text-text-secondary" : "text-text-tertiary hover:text-accent-blue")}
              >
                {isDone ? <CheckCircle className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
              </button>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className={cn("text-base sm:text-sm text-text-primary", isDone && "text-text-secondary line-through")}>{task.title}</span>
                  {!isDone && task.color && task.color !== 'gray' && (
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-tighter", priorityColor.class)}>
                      {priorityColor.name}
                    </span>
                  )}
                </div>
                {task.dueDate && (
                  <span className={cn("text-xs text-text-tertiary flex items-center mt-1.5", isDone && "line-through")}>
                    <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
                    {format(parseISO(task.dueDate), 'MMM d, yyyy h:mm a')}
                  </span>
                )}
              </div>
            </div>
            <button 
              onClick={() => setTaskToDelete(task.id)} 
              className="text-text-tertiary hover:text-accent-red transition-colors p-2 -mr-2 sm:opacity-0 group-hover:opacity-100 active:scale-110"
            >
              <Trash2 className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>
          </Card>
        </motion.div>
      </motion.div>
    );
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="mb-[var(--space-base)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-[var(--space-base)] gap-4">
          <h2 className="text-[var(--text-2xl)] font-semibold text-text-primary tracking-tight">Tasks & Plans</h2>
          {dateFilter && (
            <div className="flex items-center bg-accent-blue/10 text-accent-blue px-3 py-1.5 rounded-full text-sm font-medium">
              <CalendarIcon className="w-4 h-4 mr-2" />
              {format(parseISO(dateFilter), 'MMMM d, yyyy')}
              <button onClick={clearFilter} className="ml-2 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        
        <div className="flex border-b border-border-subtle mb-6 overflow-x-auto no-scrollbar">
          <button
            className={cn("h-11 sm:h-10 px-6 relative text-[clamp(12px,1.8vw,14px)] font-medium transition-colors whitespace-nowrap", activeTab === 'personal' ? "text-text-primary" : "text-text-secondary hover:bg-surface-hover")}
            onClick={() => setActiveTab('personal')}
          >
            Personal
            {activeTab === 'personal' && <motion.div layoutId="task-tab" className="absolute bottom-0 left-0 right-0 h-[3px] bg-white" />}
          </button>
          <button
            className={cn("h-11 sm:h-10 px-6 relative text-[clamp(12px,1.8vw,14px)] font-medium transition-colors whitespace-nowrap", activeTab === 'work' ? "text-text-primary" : "text-text-secondary hover:bg-surface-hover")}
            onClick={() => setActiveTab('work')}
          >
            Work Plan
            {activeTab === 'work' && <motion.div layoutId="task-tab" className="absolute bottom-0 left-0 right-0 h-[3px] bg-white" />}
          </button>
        </div>

        <form onSubmit={handleCreateTask} className="flex flex-col gap-4 bg-surface-default p-4 border border-border-subtle">
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <Input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder={`Add a new ${activeTab} task...`}
              className="flex-1"
            />
            <Input
              type="datetime-local"
              value={newTaskDueDate}
              onChange={(e) => setNewTaskDueDate(e.target.value)}
              className="w-full sm:w-auto"
              title="Due Date"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <div className="flex-1 flex items-center gap-2 relative">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider whitespace-nowrap">Priority:</label>
              <div className="relative flex-1">
                <button
                  type="button"
                  onClick={() => setIsPriorityOpen(!isPriorityOpen)}
                  className="w-full h-11 sm:h-10 bg-bg-primary border border-border-default rounded-md px-3 text-sm text-text-primary flex items-center justify-between hover:border-border-focus transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2.5 h-2.5 rounded-full", PRIORITY_COLORS.find(c => c.value === newTaskColor)?.indicator)} />
                    {PRIORITY_COLORS.find(c => c.value === newTaskColor)?.name}
                  </div>
                  <ChevronDown className={cn("w-4 h-4 text-text-tertiary transition-transform", isPriorityOpen && "rotate-180")} />
                </button>

                <AnimatePresence>
                  {isPriorityOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setIsPriorityOpen(false)} 
                      />
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-full left-0 right-0 mt-1 bg-surface-default border border-border-default rounded-md shadow-lg z-50 overflow-hidden"
                      >
                        {PRIORITY_COLORS.map(color => (
                          <button
                            key={color.value}
                            type="button"
                            onClick={() => {
                              setNewTaskColor(color.value);
                              setIsPriorityOpen(false);
                            }}
                            className={cn(
                              "w-full px-3 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-surface-hover transition-colors",
                              newTaskColor === color.value && "bg-surface-active font-medium"
                            )}
                          >
                            <div className={cn("w-3 h-3 rounded-full", color.indicator)} />
                            {color.name}
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <Button type="submit" className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Add Task
            </Button>
          </div>
        </form>
      </div>

      <div className="space-y-8">
        {loading ? (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-3">
                <div className="h-4 w-24 bg-surface-hover animate-pulse rounded" />
                <div className="space-y-2">
                  {[1, 2].map((j) => (
                    <div key={j} className="h-16 w-full bg-surface-default border border-border-subtle animate-pulse rounded" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            <div>
              <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">To Do ({todoTasks.length})</h3>
              <div className="space-y-2">
                <AnimatePresence>
                  {todoTasks.map(renderTask)}
                </AnimatePresence>
                {todoTasks.length === 0 && (
                  <div className="text-sm text-text-tertiary italic p-4 border border-dashed border-border-subtle text-center">
                    No pending {activeTab} tasks{dateFilter ? ' for this date' : ''}.
                  </div>
                )}
              </div>
            </div>

            {doneTasks.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">Completed ({doneTasks.length})</h3>
                <div className="space-y-2">
                  <AnimatePresence>
                    {doneTasks.map(renderTask)}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        )}
      </div>

      <Modal 
        isOpen={!!taskToDelete} 
        onClose={() => setTaskToDelete(null)} 
        title="Delete Task"
      >
        <div className="space-y-6">
          <div className="flex items-start gap-4 p-4 bg-accent-red/10 border border-accent-red/20">
            <AlertTriangle className="w-6 h-6 text-accent-red flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-text-primary font-medium">Are you sure you want to delete this task?</p>
              <p className="text-xs text-text-secondary mt-1">This action cannot be undone and the task will be permanently removed.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button 
              variant="ghost" 
              onClick={() => setTaskToDelete(null)}
              className="px-6"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleDeleteTask}
              className="bg-accent-red hover:bg-accent-red/90 text-white border-none px-6"
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
