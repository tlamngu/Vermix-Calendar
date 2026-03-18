import React from 'react';

interface Task {
  id: string;
  task: string;
  dueTime: string;
  priority: string;
}

interface TaskTableProps {
  tasks: Task[];
}

export const TaskTable: React.FC<TaskTableProps> = ({ tasks }) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-text-primary border-collapse">
        <thead>
          <tr className="border-b border-border-default">
            <th className="p-2">#</th>
            <th className="p-2">Task</th>
            <th className="p-2">Due Time</th>
            <th className="p-2">Priority</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, index) => (
            <tr key={task.id} className="border-b border-border-subtle hover:bg-surface-hover">
              <td className="p-2">{index + 1}</td>
              <td className="p-2">{task.task}</td>
              <td className="p-2">{task.dueTime}</td>
              <td className="p-2">
                {task.priority}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
