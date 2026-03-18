'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Plus, Trash2, CheckCircle, Circle, Calendar as CalendarIcon, X, ChevronDown, AlertTriangle, Edit2, XCircle, CheckSquare, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { useSearchParams, useRouter } from 'next/navigation';
import { Modal } from './ui/modal';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in-progress' | 'done' | 'cancelled';
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

interface TaskItemProps {
  task: Task;
  isSelectMode: boolean;
  isSelected: boolean;
  toggleTaskSelection: (id: string) => void;
  toggleTaskStatus: (task: Task) => void;
  setTaskToEdit: (task: Task) => void;
  setTaskToDelete: (id: string) => void;
  setContextMenu: (menu: { x: number, y: number, taskId: string } | null) => void;
}

const TaskItem = ({ 
  task, 
  isSelectMode, 
  isSelected, 
  toggleTaskSelection, 
  toggleTaskStatus, 
  setTaskToEdit, 
  setTaskToDelete,
  setContextMenu
}: TaskItemProps) => {
  const isDone = task.status === 'done';
  const isCancelled = task.status === 'cancelled';
  const priorityColor = PRIORITY_COLORS.find(c => c.value === (task.color || 'gray')) || PRIORITY_COLORS[0];

  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const startPos = useRef<{ x: number, y: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    setContextMenu({ x: clientX, y: clientY, taskId: task.id });
  };

  const startLongPress = (e: React.PointerEvent) => {
    if (!e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startPos.current = { x: e.clientX, y: e.clientY };
    longPressTimer.current = setTimeout(() => {
      setContextMenu({ x: e.clientX, y: e.clientY, taskId: task.id });
      longPressTimer.current = null;
    }, 500);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startPos.current) return;
    const dist = Math.sqrt(
      Math.pow(e.clientX - startPos.current.x, 2) + 
      Math.pow(e.clientY - startPos.current.y, 2)
    );
    if (dist > 20) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
  };

  const clearLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    startPos.current = null;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="relative mb-2 group touch-pan-y"
    >
      <div className="absolute inset-0 flex items-center justify-between rounded-sm overflow-hidden">
        <div className="bg-accent-green w-full h-full flex items-center justify-start pl-4">
          {isCancelled ? <RotateCcw className="text-white w-5 h-5" /> : <CheckCircle className="text-white w-5 h-5" />}
        </div>
        <div className="bg-accent-red w-full h-full flex items-center justify-end pr-4">
          <Trash2 className="text-white w-5 h-5" />
        </div>
      </div>
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.7}
        onDragEnd={(e, info) => {
          if (info.offset.x < -100) {
            setTaskToDelete(task.id);
          } else if (info.offset.x > 100) {
            toggleTaskStatus(task);
          }
        }}
        onContextMenu={handleContextMenu}
        onPointerDownCapture={startLongPress}
        onPointerMove={handlePointerMove}
        onPointerUp={clearLongPress}
        onPointerLeave={clearLongPress}
        onPointerCancel={clearLongPress}
        className="relative bg-bg-secondary z-10 cursor-pointer"
      >
        <Card className={cn(
          "flex items-center justify-between p-4 transition-all border-l-4 bg-bg-secondary", 
          isDone ? "opacity-60 border-l-transparent" : 
          isCancelled ? "opacity-40 border-l-transparent grayscale" :
          `border-l-${priorityColor.value === 'gray' ? 'border-default' : priorityColor.value + '-500'}`
        )}>
          <div className="flex items-center gap-4 flex-1">
            <div className="flex items-center gap-3">
              <AnimatePresence>
                {isSelectMode && (
                  <motion.div
                    initial={{ opacity: 0, width: 0, x: -10 }}
                    animate={{ opacity: 1, width: 'auto', x: 0 }}
                    exit={{ opacity: 0, width: 0, x: -10 }}
                    className="overflow-hidden"
                  >
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={() => toggleTaskSelection(task.id)}
                      className="w-5 h-5 rounded-sm border-2 border-border-default bg-bg-primary text-accent-blue focus:ring-accent-blue focus:ring-offset-bg-primary transition-all cursor-pointer"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
              <button 
                onClick={() => toggleTaskStatus(task)} 
                className={cn(
                  "transition-colors flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full active:bg-surface-active", 
                  isDone ? "text-accent-green hover:text-text-secondary" : 
                  isCancelled ? "text-text-tertiary" :
                  "text-text-tertiary hover:text-accent-blue"
                )}
                disabled={isCancelled}
              >
                {isDone ? <CheckCircle className="w-6 h-6" /> : isCancelled ? <X className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
              </button>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-base sm:text-sm text-text-primary", 
                  isDone && "text-text-secondary line-through",
                  isCancelled && "text-text-tertiary line-through italic"
                )}>
                  {task.title}
                </span>
                {!isDone && !isCancelled && task.color && task.color !== 'gray' && (
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-tighter", priorityColor.class)}>
                    {priorityColor.name}
                  </span>
                )}
                {isCancelled && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-tighter bg-surface-hover text-text-tertiary">
                    Cancelled
                  </span>
                )}
              </div>
              {task.dueDate && (
                <span className={cn("text-xs text-text-tertiary flex items-center mt-1.5", (isDone || isCancelled) && "line-through")}>
                  <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
                  {format(parseISO(task.dueDate), 'MMM d, yyyy h:mm a')}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setTaskToEdit(task)} 
              className="text-text-tertiary hover:text-accent-blue transition-colors p-2 sm:opacity-0 group-hover:opacity-100 active:scale-110"
              title="Edit Task"
            >
              <Edit2 className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>
            <button 
              onClick={() => setTaskToDelete(task.id)} 
              className="text-text-tertiary hover:text-accent-red transition-colors p-2 -mr-2 sm:opacity-0 group-hover:opacity-100 active:scale-110"
              title="Delete Task"
            >
              <Trash2 className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
};

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
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [showCreateConfirm, setShowCreateConfirm] = useState<any | null>(null);
  const [isBulkActionOpen, setIsBulkActionOpen] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, taskId: string } | null>(null);

  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => setContextMenu(null);
      window.addEventListener('click', handleClick);
      return () => window.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);
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

  const handleCreateTask = (e: React.FormEvent) => {
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

    setShowCreateConfirm(taskData);
  };

  const confirmCreateTask = async () => {
    if (!user || !showCreateConfirm) return;

    try {
      const { error } = await supabase.from('tasks').insert([showCreateConfirm]);
      if (error) throw error;
      
      setNewTaskTitle('');
      setNewTaskColor('gray');
      if (!dateFilter) {
        setNewTaskDueDate('');
      }
      setShowCreateConfirm(null);
    } catch (error) {
      console.error("Supabase Error creating task:", error);
    }
  };

  const toggleTaskStatus = async (task: Task) => {
    if (!user) return;
    let newStatus: Task['status'] = task.status === 'done' ? 'todo' : 'done';
    if (task.status === 'cancelled') {
      newStatus = 'todo';
    }
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
      
      // Manual state update for immediate feedback
      setTasks(prev => prev.filter(t => t.id !== taskToDelete));
      setSelectedTasks(prev => prev.filter(id => id !== taskToDelete));
      
      setTaskToDelete(null);
    } catch (error) {
      console.error("Supabase Error deleting task:", error);
    }
  };

  const handleEditTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !taskToEdit) return;

    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          title: taskToEdit.title,
          description: taskToEdit.description,
          dueDate: taskToEdit.dueDate,
          color: taskToEdit.color,
          status: taskToEdit.status,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', taskToEdit.id);
        
      if (error) throw error;
      setTaskToEdit(null);
    } catch (error) {
      console.error("Supabase Error editing task:", error);
    }
  };

  const handleBulkDelete = async () => {
    if (!user || selectedTasks.length === 0) return;
    try {
      const { error } = await supabase.from('tasks').delete().in('id', selectedTasks);
      if (error) throw error;
      
      // Manual state update
      setTasks(prev => prev.filter(t => !selectedTasks.includes(t.id)));
      setSelectedTasks([]);
    } catch (error) {
      console.error("Supabase Error bulk deleting tasks:", error);
    }
  };

  const handleBulkStatusChange = async (newStatus: Task['status']) => {
    if (!user || selectedTasks.length === 0) return;
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus, updatedAt: new Date().toISOString() })
        .in('id', selectedTasks);
        
      if (error) throw error;
      
      // Manual state update
      setTasks(prev => prev.map(t => 
        selectedTasks.includes(t.id) ? { ...t, status: newStatus, updatedAt: new Date().toISOString() } : t
      ));
      setSelectedTasks([]);
    } catch (error) {
      console.error("Supabase Error bulk updating tasks:", error);
    }
  };

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTasks(prev => 
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
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

  const activeTasks = filteredTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
  const doneTasks = filteredTasks.filter(t => t.status === 'done');
  const cancelledTasks = filteredTasks.filter(t => t.status === 'cancelled');

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="mb-[var(--space-base)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-[var(--space-base)] gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-[var(--text-2xl)] font-semibold text-text-primary tracking-tight">Tasks & Plans</h2>
            <Button 
              variant="ghost" 
              onClick={() => {
                const newMode = !isSelectMode;
                setIsSelectMode(newMode);
                if (!newMode) setSelectedTasks([]);
              }}
              className={cn(
                "h-8 px-3 text-xs font-medium rounded-full transition-all",
                isSelectMode ? "bg-accent-blue text-white hover:bg-accent-blue/90" : "bg-surface-hover text-text-secondary hover:text-text-primary"
              )}
            >
              {isSelectMode ? 'Done Selecting' : 'Select'}
            </Button>
          </div>
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

        <AnimatePresence>
          {selectedTasks.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-accent-blue/10 border border-accent-blue/20 p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-md"
            >
              <div className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-accent-blue" />
                <span className="text-sm font-medium text-text-primary">{selectedTasks.length} tasks selected</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <Button 
                  variant="ghost" 
                  onClick={() => handleBulkStatusChange('done')}
                  className="text-accent-green hover:bg-accent-green/10"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Mark Done
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={() => handleBulkStatusChange('cancelled')}
                  className="text-text-tertiary hover:bg-surface-hover"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={handleBulkDelete}
                  className="text-accent-red hover:bg-accent-red/10"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
                <div className="w-px h-4 bg-border-subtle mx-1 hidden sm:block" />
                <Button 
                  variant="ghost" 
                  onClick={() => setSelectedTasks([])}
                >
                  Clear
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
              className="space-y-8"
            >
              {activeTasks.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">Active Tasks ({activeTasks.length})</h3>
                  <div className="space-y-2">
                    <AnimatePresence>
                      {activeTasks.map(task => (
                        <TaskItem 
                          key={task.id}
                          task={task}
                          isSelectMode={isSelectMode}
                          isSelected={selectedTasks.includes(task.id)}
                          toggleTaskSelection={toggleTaskSelection}
                          toggleTaskStatus={toggleTaskStatus}
                          setTaskToEdit={setTaskToEdit}
                          setTaskToDelete={setTaskToDelete}
                          setContextMenu={setContextMenu}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {doneTasks.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">Completed ({doneTasks.length})</h3>
                  <div className="space-y-2">
                    <AnimatePresence>
                      {doneTasks.map(task => (
                        <TaskItem 
                          key={task.id}
                          task={task}
                          isSelectMode={isSelectMode}
                          isSelected={selectedTasks.includes(task.id)}
                          toggleTaskSelection={toggleTaskSelection}
                          toggleTaskStatus={toggleTaskStatus}
                          setTaskToEdit={setTaskToEdit}
                          setTaskToDelete={setTaskToDelete}
                          setContextMenu={setContextMenu}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {cancelledTasks.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">Cancelled ({cancelledTasks.length})</h3>
                  <div className="space-y-2">
                    <AnimatePresence>
                      {cancelledTasks.map(task => (
                        <TaskItem 
                          key={task.id}
                          task={task}
                          isSelectMode={isSelectMode}
                          isSelected={selectedTasks.includes(task.id)}
                          toggleTaskSelection={toggleTaskSelection}
                          toggleTaskStatus={toggleTaskStatus}
                          setTaskToEdit={setTaskToEdit}
                          setTaskToDelete={setTaskToDelete}
                          setContextMenu={setContextMenu}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {filteredTasks.length === 0 && (
                <div className="text-sm text-text-tertiary italic p-4 border border-dashed border-border-subtle text-center">
                  No {activeTab} tasks{dateFilter ? ' for this date' : ''}.
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

      <Modal
        isOpen={!!showCreateConfirm}
        onClose={() => setShowCreateConfirm(null)}
        title="Confirm New Task"
      >
        <div className="space-y-6">
          <div className="p-4 bg-surface-default border border-border-subtle rounded-md">
            <h4 className="font-medium text-text-primary mb-2">{showCreateConfirm?.title}</h4>
            <div className="flex items-center gap-4 text-xs text-text-secondary">
              <span className="flex items-center">
                <div className={cn("w-2 h-2 rounded-full mr-1.5", PRIORITY_COLORS.find(c => c.value === showCreateConfirm?.color)?.indicator)} />
                {PRIORITY_COLORS.find(c => c.value === showCreateConfirm?.color)?.name}
              </span>
              {showCreateConfirm?.dueDate && (
                <span className="flex items-center">
                  <CalendarIcon className="w-3 h-3 mr-1.5" />
                  {format(parseISO(showCreateConfirm.dueDate), 'MMM d, yyyy h:mm a')}
                </span>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowCreateConfirm(null)}>Cancel</Button>
            <Button onClick={confirmCreateTask}>Confirm & Create</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!taskToEdit}
        onClose={() => setTaskToEdit(null)}
        title="Edit Task"
      >
        {taskToEdit && (
          <form onSubmit={handleEditTask} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Title</label>
              <Input 
                value={taskToEdit.title} 
                onChange={(e) => setTaskToEdit({...taskToEdit, title: e.target.value})}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Due Date</label>
              <Input 
                type="datetime-local"
                value={taskToEdit.dueDate ? format(parseISO(taskToEdit.dueDate), "yyyy-MM-dd'T'HH:mm") : ''} 
                onChange={(e) => setTaskToEdit({...taskToEdit, dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Priority</label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {PRIORITY_COLORS.map(color => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setTaskToEdit({...taskToEdit, color: color.value})}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-2 border rounded-md transition-all",
                      taskToEdit.color === color.value ? "border-accent-blue bg-accent-blue/5" : "border-border-default hover:border-border-focus"
                    )}
                  >
                    <div className={cn("w-3 h-3 rounded-full", color.indicator)} />
                    <span className="text-[10px] font-medium">{color.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="ghost" onClick={() => setTaskToEdit(null)}>Cancel</Button>
              <Button type="submit">Save Changes</Button>
            </div>
          </form>
        )}
      </Modal>

      <AnimatePresence>
        {contextMenu && (
          <>
            <div 
              className="fixed inset-0 z-[100]" 
              onClick={() => setContextMenu(null)}
              onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ 
                position: 'fixed', 
                left: Math.min(contextMenu.x, typeof window !== 'undefined' ? window.innerWidth - 160 : contextMenu.x), 
                top: Math.min(contextMenu.y, typeof window !== 'undefined' ? window.innerHeight - 160 : contextMenu.y),
                zIndex: 101 
              }}
              className="bg-surface-default border border-border-default rounded-md shadow-xl overflow-hidden min-w-[160px]"
            >
              <button
                onClick={() => {
                  const task = tasks.find(t => t.id === contextMenu.taskId);
                  if (task) setTaskToEdit(task);
                  setContextMenu(null);
                }}
                className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-surface-hover transition-colors text-text-primary"
              >
                <Edit2 className="w-4 h-4 text-accent-blue" />
                Edit Task
              </button>
              <button
                onClick={() => {
                  const task = tasks.find(t => t.id === contextMenu.taskId);
                  if (task) {
                    const newStatus = task.status === 'cancelled' ? 'todo' : 'cancelled';
                    supabase.from('tasks').update({ status: newStatus, updatedAt: new Date().toISOString() }).eq('id', task.id).then(() => {
                      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
                    });
                  }
                  setContextMenu(null);
                }}
                className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-surface-hover transition-colors text-text-primary"
              >
                {tasks.find(t => t.id === contextMenu.taskId)?.status === 'cancelled' ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-accent-green" />
                    Recover Task
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-text-tertiary" />
                    Mark Cancelled
                  </>
                )}
              </button>
              <div className="h-px bg-border-subtle mx-2" />
              <button
                onClick={() => {
                  setTaskToDelete(contextMenu.taskId);
                  setContextMenu(null);
                }}
                className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-surface-hover transition-colors text-accent-red font-medium"
              >
                <Trash2 className="w-4 h-4" />
                Delete Task
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
