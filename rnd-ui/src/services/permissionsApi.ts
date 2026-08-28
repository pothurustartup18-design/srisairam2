import { API_BASE } from '../constants';
import { getAccessToken } from './api';

const authHeaders = (): HeadersInit => {
  const token = getAccessToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

export interface PermissionCatalogEntry {
  _id: string;
  key: string;
  module: string;
  action: string;
  category: 'action' | 'widget';
  displayName: string;
  description?: string;
  active: boolean;
}

export interface PermissionTemplateDTO {
  _id: string;
  name: string;
  description?: string;
  permissions: string[];
}

export interface EffectivePermissionsDTO {
  roleDefaults: string[];
  overrides: { permission: string; allowed: boolean }[];
  effective: string[];
  usingLegacyPermissionsArray: boolean;
}

async function jsonFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders(), ...init });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Request failed.');
  return data;
}

export const fetchPermissionCatalog = () =>
  jsonFetch<{ data: { entries: PermissionCatalogEntry[]; grouped: Record<string, PermissionCatalogEntry[]> } }>(
    '/settings/permissions/catalog'
  ).then((r) => r.data);

export const fetchRoleDefaults = () =>
  jsonFetch<{ data: { roles: Record<string, string[]> } }>('/settings/roles').then((r) => r.data.roles);

export const fetchEffectivePermissions = (employeeId: string) =>
  jsonFetch<{ data: EffectivePermissionsDTO }>(`/settings/employees/${employeeId}/effective-permissions`).then((r) => r.data);

export const saveEmployeeOverrides = (employeeId: string, overrides: { permission: string; allowed: boolean }[], reason?: string) =>
  jsonFetch(`/settings/employees/${employeeId}/permission-overrides`, {
    method: 'PUT',
    body: JSON.stringify({ overrides, reason }),
  });

export const resetEmployeeOverrides = (employeeId: string) =>
  jsonFetch(`/settings/employees/${employeeId}/permission-overrides`, { method: 'DELETE' });

export const fetchPermissionTemplates = () =>
  jsonFetch<{ data: PermissionTemplateDTO[] }>('/settings/permissions/templates').then((r) => r.data);

export const createPermissionTemplate = (name: string, description: string, permissions: string[]) =>
  jsonFetch<{ data: PermissionTemplateDTO }>('/settings/permissions/templates', {
    method: 'POST',
    body: JSON.stringify({ name, description, permissions }),
  }).then((r) => r.data);

export const deletePermissionTemplate = (id: string) =>
  jsonFetch(`/settings/permissions/templates/${id}`, { method: 'DELETE' });
