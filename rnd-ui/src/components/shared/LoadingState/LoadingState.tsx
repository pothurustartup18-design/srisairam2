import React from 'react';
import './LoadingState.css';

interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

const LoadingState: React.FC<LoadingStateProps> = ({ message = 'Loading…', size = 'md' }) => {
  return (
    <div className={`shared-loading-state size-${size}`}>
      <div className="shared-loading-spinner" />
      {message && <span className="shared-loading-message">{message}</span>}
    </div>
  );
};

export default LoadingState;
