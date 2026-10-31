import React from 'react';
import './StatusBadge.css';

type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface StatusBadgeProps {
  status: string;
  variant?: StatusVariant;
  labelMap?: Record<string, string>;
}

const DEFAULT_VARIANT_BY_STATUS: Record<string, StatusVariant> = {
  active: 'success',
  paid: 'success',
  approved: 'success',
  completed: 'success',
  present: 'success',
  pending: 'warning',
  processing: 'warning',
  partial: 'warning',
  inactive: 'error',
  rejected: 'error',
  overdue: 'error',
  absent: 'error',
  locked: 'error',
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, variant, labelMap }) => {
  const normalized = status?.toLowerCase?.() ?? '';
  const resolvedVariant = variant ?? DEFAULT_VARIANT_BY_STATUS[normalized] ?? 'neutral';
  const label = labelMap?.[status] ?? status;

  return <span className={`shared-status-badge ${resolvedVariant}`}>{label}</span>;
};

export default StatusBadge;
