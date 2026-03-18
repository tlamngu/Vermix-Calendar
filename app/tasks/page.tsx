import { Suspense } from 'react';
import { TaskList } from '@/components/task-list';

export default function TasksPage() {
  return (
    <Suspense fallback={<div className="p-6 text-text-secondary">Loading tasks...</div>}>
      <TaskList />
    </Suspense>
  );
}
