import React from 'react';
import { Inbox } from 'lucide-react';
import './EmptyState.css';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => {
  return (
    <div className="shared-empty-state">
      <div className="shared-empty-icon">{icon ?? <Inbox size={32} />}</div>
      <h4 className="shared-empty-title">{title}</h4>
      {description && <p className="shared-empty-description">{description}</p>}
      {action && <div className="shared-empty-action">{action}</div>}
    </div>
  );
};

export default EmptyState;
