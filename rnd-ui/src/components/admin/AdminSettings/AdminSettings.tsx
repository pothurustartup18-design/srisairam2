import React, { useState, useEffect, useRef } from 'react';
import './AdminSettings.css';
import { Database, HardDrive, RefreshCw, Server, AlertTriangle, ShieldCheck, CheckCircle2, FileText, Download, ShieldAlert, Upload, Check, X, Search, ChevronRight, ArrowLeft, UserPlus, Lock, Unlock, Edit, Wallet, ReceiptText, ScrollText, Plus, Trash2, Loader2, MessageCircle, Building, Users, PenTool } from 'lucide-react';
import { API_BASE } from '../../../constants';
import { getAccessToken } from '../../../services/api';
import { usePhoneOtp } from '../../../hooks/usePhoneOtp';
import { cn } from '../../../lib/utils';
import { Button, Badge, Drawer, Modal } from '../../ui';
import SchoolProfileSettings from './SchoolProfileSettings';
import AdminPrincipalSignature from './AdminPrincipalSignature';
import PermissionPicker from '../../shared/PermissionPicker/PermissionPicker';
import PermissionTemplateManager from '../../shared/PermissionPicker/PermissionTemplateManager';
import {
  fetchPermissionCatalog, fetchRoleDefaults, fetchEffectivePermissions,
  saveEmployeeOverrides, resetEmployeeOverrides,
  type PermissionCatalogEntry,
} from '../../../services/permissionsApi';

interface StorageStats {
  mongo: {
    dbName: string;
    collectionsCount: number;
    objectsCount: number;
    dataSize: number;
    storageSize: number;
    indexSize: number;
    status: string;
  };
  s3: {
    bucketName: string;
    objectsCount: number;
    totalSize: number;
    status: string;
  };
}

interface ExamInfo {
  _id: string;
  examName: string;
  class: string;
}

interface SelectedFile {
  file: File;
  base64: string;
  status: 'matched' | 'unmatched';
  studentName?: string;
  admissionNo?: string;
}

interface SyncLogItem {
  filename: string;
  status: 'synced' | 'failed' | 'unmatched';
  details: string;
  studentName?: string;
}

interface AdminSettingsProps {
  showToast: (message: string, type?: 'success' | 'error') => void;
  students: any[];
  initialViewMode?: 'menu' | 'schoolProfile';
}

const AdminSettings: React.FC<AdminSettingsProps> = ({ showToast, students, initialViewMode = 'menu' }) => {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [disableEventS3Storage, setDisableEventS3Storage] = useState(false);
  const [deletingEvents, setDeletingEvents] = useState(false);
  const [attendanceMode, setAttendanceMode] = useState<'full' | 'half-day'>('full');

  const [viewMode, setViewMode] = useState<'menu' | 'sizing' | 'sync' | 'backups' | 'admin' | 'permissions' | 'feeStructures' | 'collections' | 'auditLogs' | 'schoolProfile' | 'principalSignature'>(initialViewMode);
  
  // Create Admin Form State
  const [newAdmin, setNewAdmin] = useState({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    password: '',
    confirmPassword: '',
    employeeId: '',
    role: 'teacher',
    permissions: [] as string[]
  });
  const [currentAdminPassword, setCurrentAdminPassword] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [submittingAdmin, setSubmittingAdmin] = useState(false);
  const [credentialsModal, setCredentialsModal] = useState<{ name: string; username: string; password: string; whatsappSent?: boolean } | null>(null);

  // Employee/Custom User Management State
  const [employees, setEmployees] = useState<any[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [editingPermissionsUser, setEditingPermissionsUser] = useState<any | null>(null);
  const [editingPermissionsList, setEditingPermissionsList] = useState<string[]>([]);
  const [savingPermissions, setSavingPermissions] = useState(false);
  
  // Custom Employee edit/delete states
  const [editingEmployeeUser, setEditingEmployeeUser] = useState<any | null>(null);
  const [editingEmployeeForm, setEditingEmployeeForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: 'other',
    employeeId: '',
    permissions: [] as string[]
  });
  const [showAddEmployeeDrawer, setShowAddEmployeeDrawer] = useState(false);

  // Phone Number Verification State
  const {
    phoneOtpSent,
    phoneOtpCode,
    setPhoneOtpCode,
    phoneVerified,
    verifiedPhoneNum,
    sendingOtp,
    verifyingOtp,
    handleSendPhoneOtp,
    handleVerifyPhoneOtp,
    resetOtpState,
  } = usePhoneOtp({
    phone: newAdmin.phone,
    showToast,
    verifiedNumberSnapshotAt: 'send',
    requireResOk: true,
    autoResetOnEmptyPhone: false,
  });

  const fetchEmployees = async () => {
    setLoadingEmployees(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/settings/employees`, { headers });
      const data = await res.json();
      if (data.success) {
        setEmployees(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch employees:', err);
    } finally {
      setLoadingEmployees(false);
    }
  };

  // ─── PBAC: permission catalog, role defaults, and per-employee override editing ──
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionCatalogEntry[]>([]);
  const [roleDefaultsMap, setRoleDefaultsMap] = useState<Record<string, string[]>>({});
  const [editingPermissionsRoleDefaults, setEditingPermissionsRoleDefaults] = useState<string[]>([]);
  const [loadingEditingPermissions, setLoadingEditingPermissions] = useState(false);
  const [showTemplateManagerFor, setShowTemplateManagerFor] = useState<'create' | 'edit' | null>(null);
  const [cloneFromEmployeeId, setCloneFromEmployeeId] = useState('');

  const loadPermissionMeta = async () => {
    try {
      const [catalog, roles] = await Promise.all([fetchPermissionCatalog(), fetchRoleDefaults()]);
      setPermissionCatalog(catalog.entries);
      setRoleDefaultsMap(roles);
    } catch (err: any) {
      showToast(err.message || 'Failed to load permission catalog.', 'error');
    }
  };

  const openEditPermissions = async (emp: any) => {
    setEditingPermissionsUser(emp);
    setLoadingEditingPermissions(true);
    try {
      const data = await fetchEffectivePermissions(emp._id);
      setEditingPermissionsRoleDefaults(data.roleDefaults);
      setEditingPermissionsList(data.effective);
    } catch (err: any) {
      showToast(err.message || 'Failed to load this employee\'s permissions.', 'error');
      setEditingPermissionsRoleDefaults([]);
      setEditingPermissionsList(emp.permissions || []);
    } finally {
      setLoadingEditingPermissions(false);
    }
  };

  const handleCloneFromEmployee = async (employeeId: string) => {
    if (!employeeId) return;
    try {
      const data = await fetchEffectivePermissions(employeeId);
      setEditingPermissionsList(data.effective);
      showToast('Cloned permissions — review and save to apply.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to clone permissions.', 'error');
    }
  };

  const handleSavePermissions = async () => {
    if (!editingPermissionsUser) return;
    setSavingPermissions(true);
    try {
      // Diff against role defaults: anything selected-but-not-default → allow:true,
      // anything default-but-now-unselected → allow:false. Permissions that match
      // the role default need no override row at all.
      const overrides: { permission: string; allowed: boolean }[] = [];
      for (const perm of editingPermissionsList) {
        if (!editingPermissionsRoleDefaults.includes(perm)) overrides.push({ permission: perm, allowed: true });
      }
      for (const perm of editingPermissionsRoleDefaults) {
        if (!editingPermissionsList.includes(perm)) overrides.push({ permission: perm, allowed: false });
      }

      await saveEmployeeOverrides(editingPermissionsUser._id, overrides);
      showToast('Permissions updated successfully.', 'success');
      setEditingPermissionsUser(null);
      fetchEmployees();
    } catch (err: any) {
      showToast(err.message || 'Failed to save permissions.', 'error');
    } finally {
      setSavingPermissions(false);
    }
  };

  const handleResetPermissionsToRoleDefault = async () => {
    if (!editingPermissionsUser) return;
    setSavingPermissions(true);
    try {
      await resetEmployeeOverrides(editingPermissionsUser._id);
      showToast('Reset to role default permissions.', 'success');
      setEditingPermissionsUser(null);
      fetchEmployees();
    } catch (err: any) {
      showToast(err.message || 'Failed to reset permissions.', 'error');
    } finally {
      setSavingPermissions(false);
    }
  };


  const handleToggleLockEmployee = async (emp: any) => {
    const nextStatus = emp.isActive ? 'inactive' : 'active';
    try {
      const token = getAccessToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/settings/employees/${emp._id}/toggle-lock`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || 'Login status updated successfully.', 'success');
        fetchEmployees();
      } else {
        showToast(data.message || 'Failed to update login status.', 'error');
      }
    } catch (err) {
      showToast('Error updating login status.', 'error');
    }
  };

  const handleDeleteEmployee = async (empId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this employee account? This action cannot be undone.')) {
      return;
    }
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/settings/employees/${empId}`, {
        method: 'DELETE',
        headers
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Employee account deleted successfully.', 'success');
        fetchEmployees();
      } else {
        showToast(data.message || 'Failed to delete employee.', 'error');
      }
    } catch (err) {
      showToast('Error deleting employee.', 'error');
    }
  };

  const handleUpdateEmployeeDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployeeUser) return;
    try {
      const token = getAccessToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/settings/employees/${editingEmployeeUser._id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(editingEmployeeForm)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Employee details updated successfully.', 'success');
        setEditingEmployeeUser(null);
        fetchEmployees();
      } else {
        showToast(data.message || 'Failed to update employee details.', 'error');
      }
    } catch (err) {
      showToast('Error updating employee details.', 'error');
    }
  };

  // Feature Permissions State
  const [teachersAccess, setTeachersAccess] = useState<any[]>([]);
  const [enabledClasses, setEnabledClasses] = useState<string[]>([]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);

  // WhatsApp Messaging Quota State
  const [whatsappLimit, setWhatsappLimit] = useState<number>(100);
  const [whatsappSentCount, setWhatsappSentCount] = useState<number>(0);

  // â”€â”€â”€ Fee Structures State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [feeStructures, setFeeStructures] = useState<any[]>([]);
  const [loadingFeeStructures, setLoadingFeeStructures] = useState(false);
  const emptyFeeForm = { class: '', totalFee: '', booksFee: '', installments: [{ installmentNo: 1, amount: '', dueDate: '' }] as { installmentNo: number; amount: string; dueDate: string }[] };
  const [feeForm, setFeeForm] = useState(emptyFeeForm);
  const [savingFeeStructure, setSavingFeeStructure] = useState(false);
  const [deletingFeeClass, setDeletingFeeClass] = useState<string | null>(null);

  const fetchFeeStructures = async () => {
    setLoadingFeeStructures(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/fee-structures`, { headers });
      const data = await res.json();
      if (data.success) setFeeStructures(data.data);
    } catch (err) {
      console.error('Failed to fetch fee structures:', err);
    } finally {
      setLoadingFeeStructures(false);
    }
  };

  const handleSaveFeeStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feeForm.class.trim() || !feeForm.totalFee) {
      showToast('Class and total fee are required.', 'error');
      return;
    }
    setSavingFeeStructure(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/fee-structures`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          class: feeForm.class.trim(),
          totalFee: Number(feeForm.totalFee),
          booksFee: Number(feeForm.booksFee || 0),
          installments: feeForm.installments
            .filter(i => i.amount && i.dueDate)
            .map(i => ({ installmentNo: i.installmentNo, amount: Number(i.amount), dueDate: i.dueDate }))
        })
      });
      const resData = await res.json();
      if (res.ok && resData.success) {
        showToast(resData.message || 'Fee structure saved successfully.', 'success');
        setFeeForm(emptyFeeForm);
        fetchFeeStructures();
      } else {
        throw new Error(resData.message || 'Failed to save fee structure.');
      }
    } catch (err: any) {
      showToast(err.message || 'Error saving fee structure.', 'error');
    } finally {
      setSavingFeeStructure(false);
    }
  };

  const handleDeleteFeeStructure = async (className: string) => {
    if (!window.confirm(`Delete the fee structure for Class ${className}?`)) return;
    setDeletingFeeClass(className);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/fee-structures/${encodeURIComponent(className)}`, { method: 'DELETE', headers });
      const resData = await res.json();
      if (res.ok && resData.success) {
        showToast(resData.message || 'Fee structure deleted.', 'success');
        setFeeStructures(prev => prev.filter(f => f.class !== className));
      } else {
        throw new Error(resData.message || 'Failed to delete fee structure.');
      }
    } catch (err: any) {
      showToast(err.message || 'Error deleting fee structure.', 'error');
    } finally {
      setDeletingFeeClass(null);
    }
  };

  useEffect(() => {
    if (viewMode === 'feeStructures') fetchFeeStructures();
    if (viewMode === 'admin') { fetchEmployees(); loadPermissionMeta(); }
  }, [viewMode]);

  // â”€â”€â”€ Daily Collections State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [collectionsDate, setCollectionsDate] = useState(new Date().toISOString().split('T')[0]);
  const [collectionsData, setCollectionsData] = useState<any>(null);
  const [loadingCollections, setLoadingCollections] = useState(false);

  const fetchCollections = async () => {
    setLoadingCollections(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/dashboard/collections?date=${collectionsDate}`, { headers });
      const data = await res.json();
      if (data.success) setCollectionsData(data.data);
    } catch (err) {
      console.error('Failed to fetch collections report:', err);
    } finally {
      setLoadingCollections(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'collections') fetchCollections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, collectionsDate]);


  // â”€â”€â”€ Audit Log State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const AUDIT_PAGE_SIZE = 25;

  const fetchAuditLogs = async () => {
    setLoadingAuditLogs(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const params = new URLSearchParams({ page: String(auditPage), limit: String(AUDIT_PAGE_SIZE) });
      if (auditActionFilter.trim()) params.set('action', auditActionFilter.trim());
      const res = await fetch(`${API_BASE}/settings/audit-logs?${params.toString()}`, { headers });
      const data = await res.json();
      if (data.success) {
        setAuditLogs(data.data);
        setAuditTotal(data.total);
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'auditLogs') fetchAuditLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, auditPage]);

  const settingsOptions = [
    {
      id: 'schoolProfile' as const,
      title: 'School Profile & Settings',
      description: 'Configure school name, branding logo, campus address, academic year, document prefixes, and admin profile.',
      icon: Building,
      colorClass: 'admin-icon-bg'
    },
    {
      id: 'sizing' as const,
      title: 'Storage Sizing',
      description: 'Monitor MongoDB databases, AWS S3 bucket statistics, and free tier limitations.',
      icon: Server,
      colorClass: 'sizing-icon-bg'
    },
    {
      id: 'sync' as const,
      title: 'Upload & Sync Reports',
      description: 'Bulk upload report cards, map students by admission code, and query files.',
      icon: Upload,
      colorClass: 'sync-icon-bg'
    },
    {
      id: 'backups' as const,
      title: 'Storage Backups',
      description: 'Download full student spreadsheets and archive S3 storage media files safely.',
      icon: Download,
      colorClass: 'backups-icon-bg'
    },
    {
      id: 'admin' as const,
      title: 'Employee & Admin Accounts',
      description: 'Register new employee accounts and customize their individual portal access permissions.',
      icon: UserPlus,
      colorClass: 'admin-icon-bg'
    },
    {
      id: 'permissions' as const,
      title: 'Feature Permissions',
      description: 'Manage teacher login access and toggle class-level marks update permissions.',
      icon: Lock,
      colorClass: 'permissions-icon-bg'
    },
    {
      id: 'feeStructures' as const,
      title: 'Fee Structures',
      description: 'Define per-class total fee, books fee, and installment schedules for new admissions.',
      icon: Wallet,
      colorClass: 'admin-icon-bg'
    },
    {
      id: 'collections' as const,
      title: 'Daily Collections',
      description: 'Review fee payments collected on a given day, broken down by payment mode.',
      icon: ReceiptText,
      colorClass: 'backups-icon-bg'
    },
    {
      id: 'principalSignature' as const,
      title: 'Principal Signature',
      description: "Upload and manage the Principal's digital signature for automatic Progress Card embedding.",
      icon: PenTool,
      colorClass: 'permissions-icon-bg'
    },
    {
      id: 'auditLogs' as const,
      title: 'Audit Log',
      description: 'Review a trail of sensitive actions taken across the system by staff accounts.',
      icon: ScrollText,
      colorClass: 'sizing-icon-bg'
    }
  ];

  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = settingsOptions.filter(option =>
    option.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    option.description.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  
  const [downloading, setDownloading] = useState<'students' | 's3' | null>(null);

 
  const [exams, setExams] = useState<ExamInfo[]>([]);
  const [selectedExam, setSelectedExam] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLogItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Download by Admission state
  const [downloadAdmNo, setDownloadAdmNo] = useState('');
  const [downloadExamId, setDownloadExamId] = useState('');
  const [downloadingReport, setDownloadingReport] = useState(false);

  // Restore Student DB state
  const [selectedCsvFile, setSelectedCsvFile] = useState<File | null>(null);
  const [restoringDb, setRestoringDb] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Restore S3 Media state
  const [selectedZipFile, setSelectedZipFile] = useState<File | null>(null);
  const [restoringS3, setRestoringS3] = useState(false);
  const [s3RestoreLogs, setS3RestoreLogs] = useState<SyncLogItem[]>([]);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const fetchStats = async (isRefresh = false) => {
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/settings/storage`, { headers });
      const resData = await res.json();
      if (resData.success && resData.data) {
        setStats(resData.data);
        setDisableEventS3Storage(!!resData.data.disableEventS3Storage);
        if (isRefresh) showToast('Storage statistics updated successfully.', 'success');
      } else {
        throw new Error(resData.message || 'Failed to fetch storage statistics.');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error connecting to the backend metrics service.', 'error');
    }
  };

  const handleToggleEventS3 = async () => {
    const newValue = !disableEventS3Storage;
    // Optimistic UI update
    setDisableEventS3Storage(newValue);

    try {
      const token = getAccessToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/settings/system-config`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ key: 'disableEventS3Storage', value: newValue })
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        showToast(
          newValue 
            ? 'Event S3 uploads disabled to save storage.' 
            : 'Event S3 uploads enabled.', 
          'success'
        );
        fetchStats(false);
      } else {
        throw new Error(resData.message || 'Failed to update storage settings.');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error updating storage settings.', 'error');
      // Rollback
      setDisableEventS3Storage(!newValue);
    }
  };

  const handleDeleteEventMedia = async () => {
    if (!window.confirm('Are you sure you want to permanently delete all event media files from S3 storage? This will also clear media references in all event posts.')) {
      return;
    }

    setDeletingEvents(true);
    showToast('Deleting all S3 event media files...', 'success');

    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/settings/storage/events`, {
        method: 'DELETE',
        headers
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        showToast(resData.message || 'Successfully deleted all S3 event media files.', 'success');
        fetchStats(false);
      } else {
        throw new Error(resData.message || 'Failed to delete S3 event media.');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error occurred while deleting event media.', 'error');
    } finally {
      setDeletingEvents(false);
    }
  };

  const fetchExams = async () => {
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_BASE}/marks/all`, { headers });
      const data = await res.json();
      if (data.success && data.data) {
        setExams(data.data);
        if (data.data.length > 0) {
          setSelectedExam(data.data[0]._id);
          setDownloadExamId(data.data[0]._id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch exams list:', err);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchExams();
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDownloadBackup = async (type: 'students' | 's3') => {
    setDownloading(type);
    showToast(`Generating ${type === 'students' ? 'Excel/CSV' : 'ZIP'} backup package, please wait...`, 'success');
    
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/settings/backup/${type}`, {
        method: 'GET',
        headers
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to download. Server returned status ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = type === 'students' 
        ? `students_backup_${dateStr}.csv` 
        : `s3_backup_${dateStr}.zip`;
        
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      showToast(`${type === 'students' ? 'Student database' : 'Cloud media files'} backup downloaded successfully.`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to download backup files.', 'error');
    } finally {
      setDownloading(null);
    }
  };

  // Upload and Sync Methods
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processFiles(Array.from(files));
  };

  const processFiles = (files: File[]) => {
    const matchedFiles: SelectedFile[] = [];

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        
        let studentName = undefined;
        let admissionNo = undefined;
        let status: 'matched' | 'unmatched' = 'unmatched';

        // Parse filename for 24-character MongoDB Student ID
        const objectIdRegex = /[0-9a-fA-F]{24}/;
        const objectIdMatch = file.name.match(objectIdRegex);

        if (objectIdMatch) {
          const studentId = objectIdMatch[0];
          const found = students.find(s => s._id === studentId || s.id === studentId);
          if (found) {
            studentName = found.name;
            admissionNo = found.admissionNo;
            status = 'matched';
          }
        }

        if (status === 'unmatched') {
          // Parse filename for admission code
          const regex = /adm[-_]?[0-9]+/i;
          const match = file.name.match(regex);
          
          if (match) {
            const admKey = match[0].toLowerCase();
            const found = students.find(s => 
              s.admissionNo?.toLowerCase() === admKey ||
              s.admissionNo?.toLowerCase().replace('-', '') === admKey.replace('-', '')
            );
            if (found) {
              studentName = found.name;
              admissionNo = found.admissionNo;
              status = 'matched';
            }
          }
        }

        matchedFiles.push({
          file,
          base64,
          status,
          studentName,
          admissionNo
        });

        // Trigger react state update when all files are read
        if (matchedFiles.length === files.length) {
          setSelectedFiles(prev => [...prev, ...matchedFiles]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearFiles = () => {
    setSelectedFiles([]);
    setSyncLogs([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSyncUpload = async () => {
    if (selectedFiles.length === 0) return;
    if (!selectedExam) {
      showToast('Please select a target exam first.', 'error');
      return;
    }

    setSyncing(true);
    setSyncLogs([]);
    showToast(`Uploading and synchronizing ${selectedFiles.length} report cards...`, 'success');

    try {
      const payload = selectedFiles.map(sf => ({
        filename: sf.file.name,
        base64: sf.base64
      }));

      const token = getAccessToken();
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/settings/upload-sync`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          files: payload,
          examId: selectedExam
        })
      });

      const resData = await res.json();
      if (resData.success && resData.logs) {
        setSyncLogs(resData.logs);
        const successCount = resData.logs.filter((l: any) => l.status === 'synced').length;
        showToast(`Synchronization complete! ${successCount} reports linked successfully.`, 'success');
        fetchStats(false); // Reload S3 stats
      } else {
        throw new Error(resData.message || 'Synchronization failed.');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error occurred during report card synchronization.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  // Download by Admission Number method
  const handleDownloadByAdmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!downloadAdmNo.trim()) {
      showToast('Please enter an admission number.', 'error');
      return;
    }
    if (!downloadExamId) {
      showToast('Please select an exam.', 'error');
      return;
    }

    setDownloadingReport(true);
    showToast(`Searching for report card of ${downloadAdmNo}...`, 'success');

    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/settings/download-by-admission?admissionNo=${encodeURIComponent(downloadAdmNo.trim())}&examId=${downloadExamId}`, {
        method: 'GET',
        headers
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `No report card found for "${downloadAdmNo}" under selected exam.`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${downloadAdmNo.trim()}_report.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      showToast(`Report card downloaded successfully.`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to download report card.', 'error');
    } finally {
      setDownloadingReport(false);
    }
  };

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      setSelectedCsvFile(files[0]);
    }
  };

  const handleRestoreDatabase = async () => {
    if (!selectedCsvFile) return;
    setRestoringDb(true);
    showToast('Reading backup file content...', 'success');

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        const token = getAccessToken();
        const headers: HeadersInit = {
          'Content-Type': 'application/json'
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(`${API_BASE}/settings/restore-students`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            file: {
              filename: selectedCsvFile.name,
              base64
            }
          })
        });

        const resData = await res.json();
        if (resData.success) {
          showToast(resData.message || 'Database restored successfully.', 'success');
          setSelectedCsvFile(null);
          fetchStats(false); // Update DB sizing state
        } else {
          throw new Error(resData.message || 'Failed to restore student database.');
        }
      } catch (err: any) {
        console.error(err);
        showToast(err.message || 'Error occurred during database restoration.', 'error');
      } finally {
        setRestoringDb(false);
      }
    };
    reader.readAsDataURL(selectedCsvFile);
  };

  const handleZipFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      setSelectedZipFile(files[0]);
    }
  };

  const handleRestoreS3 = async () => {
    if (!selectedZipFile) return;
    setRestoringS3(true);
    setS3RestoreLogs([]);
    showToast('Reading and uploading backup ZIP archive, please wait...', 'success');

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        const token = getAccessToken();
        const headers: HeadersInit = {
          'Content-Type': 'application/json'
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(`${API_BASE}/settings/restore-s3`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            file: {
              filename: selectedZipFile.name,
              base64
            }
          })
        });

        const resData = await res.json();
        if (res.ok && resData.success) {
          showToast(resData.message || 'S3 media backup restored successfully.', 'success');
          if (resData.logs) {
            setS3RestoreLogs(resData.logs);
          }
          setSelectedZipFile(null);
          fetchStats(false); // Update S3 sizing state
        } else {
          throw new Error(resData.message || 'Failed to restore media storage.');
        }
      } catch (err: any) {
        console.error(err);
        showToast(err.message || 'Error occurred during media storage restoration.', 'error');
      } finally {
        setRestoringS3(false);
      }
    };
    reader.readAsDataURL(selectedZipFile);
  };

  const handleCreateAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdmin.firstName.trim() || !newAdmin.lastName.trim() || !newAdmin.phone.trim()) {
      showToast('Please fill out all required fields.', 'error');
      return;
    }

    if (!phoneVerified) {
      showToast('Please verify the employee\'s phone number first.', 'error');
      return;
    }

    if (newAdmin.phone.trim() !== verifiedPhoneNum) {
      showToast('Phone number has changed. Please verify the new number.', 'error');
      return;
    }

    // Strict Email Format check (if entered)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (newAdmin.email.trim() && !emailRegex.test(newAdmin.email.trim())) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }

    // Strict Phone Format check
    const sanitizedPhone = newAdmin.phone.trim().replace(/[\s-()]/g, '');
    const phoneRegex = /^\+?[0-9]{10,15}$/;
    if (!phoneRegex.test(sanitizedPhone)) {
      showToast('Please enter a valid phone number (10-15 digits, e.g. +919392646349).', 'error');
      return;
    }

    // Strict Employee ID Format check (if entered)
    const empIdRegex = /^[a-zA-Z0-9-]{3,20}$/;
    if (newAdmin.employeeId.trim() && !empIdRegex.test(newAdmin.employeeId.trim())) {
      showToast('Employee ID must be 3-20 characters (alphanumeric and hyphens only).', 'error');
      return;
    }

    setShowPasswordModal(true);
  };

  const handleConfirmPasswordAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAdminPassword) {
      showToast('Please enter your admin password to authorize.', 'error');
      return;
    }

    setSubmittingAdmin(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/settings/create-admin`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          currentAdminPassword,
          newAdminEmail: newAdmin.email || undefined,
          newAdminFirstName: newAdmin.firstName,
          newAdminLastName: newAdmin.lastName,
          newAdminPhone: newAdmin.phone,
          employeeId: newAdmin.employeeId || undefined,
          role: newAdmin.role,
          permissions: newAdmin.permissions
        })
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        showToast(resData.message || 'Employee created successfully.', 'success');
        if (resData.credentials) {
          setCredentialsModal({
            name: `${newAdmin.firstName} ${newAdmin.lastName}`.trim(),
            username: resData.credentials.username,
            password: resData.credentials.password,
            whatsappSent: !!resData.credentials.whatsappSent
          });
        }
        setNewAdmin({
          username: '',
          email: '',
          firstName: '',
          lastName: '',
          phone: '',
          password: '',
          confirmPassword: '',
          employeeId: '',
          role: 'teacher',
          permissions: []
        });
        setCurrentAdminPassword('');
        resetOtpState();
        setShowPasswordModal(false);
        fetchEmployees(); // Reload list
        setShowAddEmployeeDrawer(false); // Close drawer
      } else {
        throw new Error(resData.message || 'Failed to create admin.');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error occurred while creating admin.', 'error');
    } finally {
      setSubmittingAdmin(false);
    }
  };

  const fetchPermissionsData = async () => {
    setLoadingPermissions(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // 1. Fetch Teachers Access list
      const teachersRes = await fetch(`${API_BASE}/settings/teachers-access`, { headers });
      const teachersData = await teachersRes.json();
      if (teachersData.success) {
        setTeachersAccess(teachersData.data);
      }

      // 2. Fetch System Config
      const configRes = await fetch(`${API_BASE}/settings/system-config`, { headers });
      const configData = await configRes.json();
      if (configData.success && configData.data) {
        setEnabledClasses(configData.data.marksUpdateEnabledClasses || []);
        setAttendanceMode(configData.data.attendanceMode || 'full');
      }

      // 3. Fetch WhatsApp Quota
      const quotaRes = await fetch(`${API_BASE}/settings/whatsapp-quota`, { headers });
      const quotaData = await quotaRes.json();
      if (quotaData.success) {
        setWhatsappLimit(Number(quotaData.limit) || 100);
        setWhatsappSentCount(Number(quotaData.count) || 0);
      }
    } catch (err) {
      console.error('Failed to fetch permissions configs:', err);
      showToast('Error loading configuration settings.', 'error');
    } finally {
      setLoadingPermissions(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'permissions') {
      fetchPermissionsData();
    }
  }, [viewMode]);

  const handleToggleTeacherLogin = async (teacherId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    
    // Optimistic UI update
    setTeachersAccess(prev => prev.map(t => t._id === teacherId ? { ...t, status: nextStatus } : t));

    try {
      const token = getAccessToken();
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/settings/teachers-access/toggle`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ teacherId, status: nextStatus })
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        showToast(resData.message || 'Teacher access updated successfully.', 'success');
      } else {
        throw new Error(resData.message || 'Failed to toggle access.');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error updating teacher login access.', 'error');
      // Rollback optimistic update
      setTeachersAccess(prev => prev.map(t => t._id === teacherId ? { ...t, status: currentStatus } : t));
    }
  };

  const handleToggleClassMarks = async (className: string) => {
    let nextEnabledClasses = [...enabledClasses];
    const hasClass = enabledClasses.map(c => c.split('-')[0].trim()).includes(className);

    if (hasClass) {
      nextEnabledClasses = nextEnabledClasses.filter(c => c.split('-')[0].trim() !== className);
    } else {
      nextEnabledClasses.push(className);
    }

    // Optimistic UI update
    setEnabledClasses(nextEnabledClasses);

    try {
      const token = getAccessToken();
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/settings/system-config`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ key: 'marksUpdateEnabledClasses', value: nextEnabledClasses })
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        showToast(`Marks update permission updated successfully.`, 'success');
      } else {
        throw new Error(resData.message || 'Failed to update config.');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error updating marks entry config.', 'error');
      // Rollback optimistic update
      setEnabledClasses(enabledClasses);
    }
  };

  const handleUpdateAttendanceMode = async (mode: 'full' | 'half-day') => {
    // Optimistic UI update
    setAttendanceMode(mode);

    try {
      const token = getAccessToken();
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/settings/system-config`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ key: 'attendanceMode', value: mode })
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        showToast(`Attendance mode updated to ${mode === 'full' ? 'Full Day' : 'Half Day'} successfully.`, 'success');
      } else {
        throw new Error(resData.message || 'Failed to update attendance mode.');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error updating attendance mode.', 'error');
      // Rollback
      setAttendanceMode(mode === 'full' ? 'half-day' : 'full');
    }
  };


  // Telemetry stats
  const mongo = stats?.mongo;
  const s3 = stats?.s3;

  const mongoDataMb = mongo ? mongo.dataSize / (1024 * 1024) : 0;
  const s3DataMb = s3 ? s3.totalSize / (1024 * 1024) : 0;

  const MONGO_LIMIT_MB = 512;
  const S3_LIMIT_MB = 5120;

  const mongoUsagePercent = Math.min((mongoDataMb / MONGO_LIMIT_MB) * 100, 100);
  const s3UsagePercent = Math.min((s3DataMb / S3_LIMIT_MB) * 100, 100);


  return (
    <div className="settings-view-wrapper animate-fade-in">
      {viewMode === 'schoolProfile' ? (
        <SchoolProfileSettings showToast={showToast} onBack={() => setViewMode('menu')} />
      ) : viewMode === 'menu' ? (
        <>
          {/* Page heading */}
          <div className="mb-5">
            <h1 className="text-[22px] font-extrabold text-slate-900 dark:text-white tracking-tight">Settings</h1>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-0.5">Manage ERP configuration, storage, employee accounts, and permissions.</p>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search settingsâ€¦"
              className="h-9 pl-9 pr-3 w-full max-w-sm border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all font-[inherit]"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Settings list */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden divide-y divide-slate-100">
            {filteredOptions.map(option => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setViewMode(option.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 dark:bg-slate-900 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                    <Icon size={15} className="text-violet-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{option.title}</div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{option.description}</div>
                  </div>
                  <ChevronRight size={15} className="text-slate-300 flex-shrink-0" />
                </button>
              );
            })}
            {filteredOptions.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                No settings match â€œ{searchQuery}â€
              </div>
            )}
          </div>

        </>
      ) : (
        <>
          {/* Sub-page navigation header */}
          <div className="flex flex-col gap-2 mb-6 animate-fade-in">
            <div>
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-semibold transition-colors shadow-sm"
                onClick={() => setViewMode('menu')}
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Settings</span>
              </button>
            </div>
            {viewMode !== 'admin' && viewMode !== 'principalSignature' && (
              <div>
                <h2 className="text-[22px] font-extrabold text-slate-900 dark:text-white tracking-tight">
                  {viewMode === 'sizing' && 'Storage Sizing Details'}
                  {viewMode === 'sync' && 'Upload & Sync Report Cards'}
                  {viewMode === 'backups' && 'Database & S3 Cloud Backups'}
                  {viewMode === 'feeStructures' && 'Class Fee Structures'}
                  {viewMode === 'collections' && 'Daily Fee Collections'}
                  {viewMode === 'auditLogs' && 'Audit Log'}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {viewMode === 'sizing' && 'Detailed database records capacity, storage sizing, and AWS S3 telemetry.'}
                  {viewMode === 'sync' && 'Upload, verify and associate PDF report cards with active student records.'}
                  {viewMode === 'backups' && 'Safely export student datasets in CSV format or zip complete media archives.'}
                  {viewMode === 'feeStructures' && 'Define default total fee, books fee, and installment due dates per class.'}
                  {viewMode === 'collections' && 'Fee payments recorded on a chosen date, broken down by payment mode.'}
                  {viewMode === 'auditLogs' && 'A trail of sensitive actions â€” payments, deletions, config changes â€” with who did what and when.'}
                </p>
              </div>
            )}
          </div>

          {/* Sizing Tab */}
          {viewMode === 'sizing' && (
            <div className="settings-grid animate-fade-in">
              {/* MongoDB Database Metrics Card */}
              <div className="storage-card mongo-card animate-fade-in">
                <div className="card-header">
                  <div className="card-icon-title">
                    <Database className="card-icon database-icon" />
                    <h3>MongoDB Storage</h3>
                  </div>
                  <span className={`status-badge ${mongo?.status === 'Connected' ? 'success' : 'warning'}`}>
                    {mongo?.status === 'Connected' ? (
                      <CheckCircle2 className="w-3 h-3 inline-icon" />
                    ) : (
                      <AlertTriangle className="w-3 h-3 inline-icon" />
                    )}
                    {mongo?.status}
                  </span>
                </div>

                <div className="card-body">
                  <div className="metric-row">
                    <span className="metric-label">Database Name</span>
                    <span className="metric-value code-text">{mongo?.dbName}</span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-label">Total Collections</span>
                    <span className="metric-value font-highlight">{mongo?.collectionsCount}</span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-label">Total Objects/Records</span>
                    <span className="metric-value font-highlight">{mongo?.objectsCount}</span>
                  </div>

                  <div className="divider" />

                  <div className="visual-progress-section">
                    <div className="progress-labels">
                      <span>Storage Utilization (Free Tier Ref: 512 MB)</span>
                      <span className="percent-text">{mongoUsagePercent.toFixed(4)}%</span>
                    </div>
                    <div className="progress-bar-container">
                      <div className="progress-bar mongo-progress" style={{ width: `${Math.max(mongoUsagePercent, 0.5)}%` }} />
                    </div>
                  </div>

                  <div className="size-stats-grid">
                    <div className="size-stat-box">
                      <span className="box-title">Document Size</span>
                      <span className="box-value">{formatBytes(mongo?.dataSize || 0)}</span>
                    </div>
                    <div className="size-stat-box">
                      <span className="box-title">Index Size</span>
                      <span className="box-value">{formatBytes(mongo?.indexSize || 0)}</span>
                    </div>
                    <div className="size-stat-box">
                      <span className="box-title">Disk Storage</span>
                      <span className="box-value">{formatBytes(mongo?.storageSize || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* AWS S3 Object Storage Card */}
              <div className="storage-card s3-card animate-fade-in">
                <div className="card-header">
                  <div className="card-icon-title">
                    <HardDrive className="card-icon s3-icon" />
                    <h3>AWS S3 Storage</h3>
                  </div>
                  <span className={`status-badge ${s3?.status === 'Connected' ? 'success' : 'warning'}`}>
                    {s3?.status === 'Connected' ? (
                      <CheckCircle2 className="w-3 h-3 inline-icon" />
                    ) : (
                      <AlertTriangle className="w-3 h-3 inline-icon" />
                    )}
                    {s3?.status}
                  </span>
                </div>

                <div className="card-body">
                  <div className="metric-row">
                    <span className="metric-label">Bucket Name</span>
                    <span className="metric-value code-text">{s3?.bucketName}</span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-label">Files Uploaded</span>
                    <span className="metric-value font-highlight">{s3?.objectsCount}</span>
                  </div>

                  <div className="divider" />

                  <div className="visual-progress-section">
                    <div className="progress-labels">
                      <span>Storage Utilization (Free Tier Ref: 5 GB)</span>
                      <span className="percent-text">{s3UsagePercent.toFixed(4)}%</span>
                    </div>
                    <div className="progress-bar-container">
                      <div className="progress-bar s3-progress" style={{ width: `${Math.max(s3UsagePercent, 0.5)}%` }} />
                    </div>
                  </div>

                  <div className="single-stat-section">
                    <div className="main-stat-display">
                      <FileText className="stat-display-icon" />
                      <div className="stat-text-col">
                        <span className="stat-label">Total Allocated S3 Storage</span>
                        <span className="stat-value">{formatBytes(s3?.totalSize || 0)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="divider" />
                  
                  <div className="permission-toggle-item" style={{ margin: 0, padding: '12px 16px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div className="permission-item-details">
                      <span className="permission-item-name" style={{ fontSize: '13.5px' }}>Save Storage: Disable Event S3 Uploads</span>
                      <span className="permission-item-sub" style={{ fontSize: '11.5px', maxWidth: '100%' }}>
                        If enabled, new event images will not consume S3 cloud storage quota.
                      </span>
                    </div>
                    <label className="toggle-switch">
                      <input 
                        type="checkbox" 
                        checked={disableEventS3Storage} 
                        onChange={handleToggleEventS3}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="divider" style={{ margin: '12px 0' }} />
                  
                  <button 
                    className="action-btn"
                    style={{ 
                      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                      border: 'none',
                      color: 'white',
                      fontWeight: '600',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      width: '100%',
                      boxShadow: '0 4px 10px rgba(239, 68, 68, 0.2)'
                    }}
                    onClick={handleDeleteEventMedia}
                    disabled={deletingEvents}
                  >
                    {deletingEvents ? (
                      <>
                        <RefreshCw className="w-4 h-4 spinning" />
                        <span>Purging S3 Media...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>Purge Event Media from S3</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Upload and Sync Tab */}
          {viewMode === 'sync' && (
            <div className="flex flex-col gap-4 animate-fade-in">
              {/* Bulk Upload Card */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center flex-shrink-0">
                    <Upload size={14} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Bulk Report Card Upload &amp; Sync</div>
                  </div>
                </div>
                <div className="p-5 flex flex-col gap-4">
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    Upload multiple student report card PDFs in one go. The system will extract the student's admission number from the filename (e.g.{' '}
                    <code className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded font-mono">adm-001.pdf</code>{' or '}
                    <code className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded font-mono">report_adm-003.pdf</code>), upload it to S3, and link it to the selected exam sheet automatically.
                  </p>

                  <div className="h-px bg-slate-100 dark:bg-slate-700" />

                  {/* Exam selector */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Select Target Exam</label>
                    <select
                      value={selectedExam}
                      onChange={(e) => setSelectedExam(e.target.value)}
                      className="h-10 px-3 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 dark:focus:ring-blue-900 transition-all font-[inherit] w-full sm:w-72"
                    >
                      {exams.map(ex => (
                        <option key={ex._id} value={ex._id}>{ex.examName} (Class {ex.class})</option>
                      ))}
                      {exams.length === 0 && <option value="">No exams found</option>}
                    </select>
                  </div>

                  {/* Dropzone */}
                  <div
                    className="flex flex-col items-center justify-center gap-2 py-10 border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={28} className="text-slate-400 dark:text-slate-500" />
                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Click to browse or drop report card PDFs here</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">Only PDF files containing admission number in name</span>
                    <input type="file" ref={fileInputRef} multiple accept=".pdf" onChange={handleFileChange} style={{ display: 'none' }} />
                  </div>

                  {/* File queue */}
                  {selectedFiles.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Queue ({selectedFiles.length} files)</span>
                        <button
                          className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors"
                          onClick={handleClearFiles} disabled={syncing}
                        >Clear All</button>
                      </div>
                      <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto">
                        {selectedFiles.map((sf, index) => (
                          <div key={index} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-600">
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate block">{sf.file.name}</span>
                              <span className="text-[10px] text-slate-400">({formatBytes(sf.file.size)})</span>
                            </div>
                            <div className="flex-shrink-0">
                              {sf.status === 'matched' ? (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                                  <Check size={10} /> {sf.studentName} ({sf.admissionNo})
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-300 text-[10px] font-bold">
                                  <X size={10} /> No Match
                                </span>
                              )}
                            </div>
                            <button
                              className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400 transition-colors flex-shrink-0"
                              onClick={() => handleRemoveFile(index)} disabled={syncing}
                            ><X size={13} /></button>
                          </div>
                        ))}
                      </div>
                      <button
                        className="flex items-center justify-center gap-2 h-10 px-5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                        onClick={handleSyncUpload}
                        disabled={syncing || selectedFiles.length === 0}
                      >
                        {syncing ? <><RefreshCw size={15} className="animate-spin" /><span>Synchronizing...</span></> : <><CheckCircle2 size={15} /><span>Sync Report Cards</span></>}
                      </button>
                    </div>
                  )}

                  {/* Sync logs */}
                  {syncLogs.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Synchronization Logs</h4>
                      <div className="max-h-48 overflow-y-auto flex flex-col gap-1.5 p-3 bg-slate-900 dark:bg-black rounded-lg">
                        {syncLogs.map((log, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span className={`text-xs font-bold flex-shrink-0 ${log.status === 'synced' ? 'text-emerald-400' : 'text-red-400'}`}>{log.status === 'synced' ? 'âœ“' : 'âœ—'}</span>
                            <div className="text-[11px] text-slate-300 font-mono">
                              <span className="text-white font-semibold">{log.filename}</span>
                              <span className="text-slate-400">: {log.details} {log.studentName && `(${log.studentName})`}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Download by Admission Number Card */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
                    <Search size={14} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Download Report Card by Admission Number</div>
                </div>
                <div className="p-5">
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                    Retrieve a specific student's report card directly by inputting their admission code and selected exam.
                    The system will look up the student in MongoDB and securely proxy the S3 PDF stream.
                  </p>
                  <form onSubmit={handleDownloadByAdmission} className="flex flex-col sm:flex-row gap-3">
                    <div className="flex flex-col gap-1.5 flex-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Admission Number</label>
                      <input
                        type="text" placeholder="e.g. ADM-001"
                        className="h-10 px-3 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 dark:focus:ring-blue-900 transition-all font-[inherit] placeholder:text-slate-300"
                        value={downloadAdmNo} onChange={(e) => setDownloadAdmNo(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 flex-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Select Exam</label>
                      <select
                        value={downloadExamId} onChange={(e) => setDownloadExamId(e.target.value)}
                        className="h-10 px-3 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all font-[inherit]"
                      >
                        {exams.map(ex => <option key={ex._id} value={ex._id}>{ex.examName} (Class {ex.class})</option>)}
                        {exams.length === 0 && <option value="">No exams found</option>}
                      </select>
                    </div>
                    <div className="flex flex-col justify-end">
                      <button type="submit" disabled={downloadingReport}
                        className="flex items-center gap-2 h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 whitespace-nowrap">
                        {downloadingReport ? <><RefreshCw size={14} className="animate-spin" /><span>Fetching...</span></> : <><Download size={14} /><span>Download PDF</span></>}
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Restore Database CSV Card */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  <div className="w-7 h-7 rounded-lg bg-violet-50 dark:bg-violet-950 flex items-center justify-center flex-shrink-0">
                    <Database size={14} className="text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Restore Student Database (CSV)</div>
                </div>
                <div className="p-5 flex flex-col gap-4">
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    Upload a student backup <code className="text-xs bg-slate-100 dark:bg-slate-700 px-1 py-0.5 rounded font-mono">.csv</code> file to restore records.
                    Existing profiles matching the admission key will be updated, and missing profiles will be created.
                  </p>
                  <div
                    className={`flex flex-col items-center justify-center gap-2 py-10 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                      selectedCsvFile
                        ? 'border-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20'
                        : 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 hover:border-emerald-400 hover:bg-emerald-50/20'
                    }`}
                    onClick={() => csvInputRef.current?.click()}
                  >
                    <Upload size={28} className={selectedCsvFile ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-500'} />
                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{selectedCsvFile ? selectedCsvFile.name : 'Click to browse or drop backup CSV here'}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">Accepts only students_backup_*.csv files</span>
                    <input type="file" ref={csvInputRef} accept=".csv" onChange={handleCsvFileChange} style={{ display: 'none' }} />
                  </div>
                  {selectedCsvFile && (
                    <div className="flex items-center gap-3">
                      <button
                        className="flex items-center gap-2 h-10 px-5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                        onClick={handleRestoreDatabase} disabled={restoringDb}
                      >
                        {restoringDb ? <><RefreshCw size={14} className="animate-spin" /><span>Restoring...</span></> : <><CheckCircle2 size={14} /><span>Upload &amp; Restore Database</span></>}
                      </button>
                      <button
                        className="text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                        onClick={() => setSelectedCsvFile(null)} disabled={restoringDb}
                      >Cancel</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Restore Media Storage ZIP Card */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950 flex items-center justify-center flex-shrink-0">
                    <HardDrive size={14} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Restore Media Storage (ZIP)</div>
                </div>
                <div className="p-5 flex flex-col gap-4">
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    Upload an S3 media backup <code className="text-xs bg-slate-100 dark:bg-slate-700 px-1 py-0.5 rounded font-mono">.zip</code> file to restore stored files.
                    All files will be uploaded back to S3 under their original folders, and report cards will be automatically synchronized with database records.
                  </p>
                  <div
                    className={`flex flex-col items-center justify-center gap-2 py-10 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                      selectedZipFile
                        ? 'border-amber-400 bg-amber-50/30 dark:bg-amber-950/20'
                        : 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 hover:border-amber-400 hover:bg-amber-50/20'
                    }`}
                    onClick={() => zipInputRef.current?.click()}
                  >
                    <Upload size={28} className={selectedZipFile ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'} />
                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{selectedZipFile ? selectedZipFile.name : 'Click to browse or drop backup ZIP here'}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">Accepts only s3_backup_*.zip files</span>
                    <input type="file" ref={zipInputRef} accept=".zip" onChange={handleZipFileChange} style={{ display: 'none' }} />
                  </div>
                  {selectedZipFile && (
                    <div className="flex items-center gap-3">
                      <button
                        className="flex items-center gap-2 h-10 px-5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                        onClick={handleRestoreS3} disabled={restoringS3}
                      >
                        {restoringS3 ? <><RefreshCw size={14} className="animate-spin" /><span>Restoring...</span></> : <><CheckCircle2 size={14} /><span>Upload &amp; Restore Media</span></>}
                      </button>
                      <button
                        className="text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                        onClick={() => setSelectedZipFile(null)} disabled={restoringS3}
                      >Cancel</button>
                    </div>
                  )}

                  {/* S3 Restore Sync logs */}
                  {s3RestoreLogs.length > 0 && (
                    <div className="flex flex-col gap-2 mt-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Media Restore Logs</h4>
                      <div className="max-h-48 overflow-y-auto flex flex-col gap-1.5 p-3 bg-slate-900 dark:bg-black rounded-lg">
                        {s3RestoreLogs.map((log, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span className={`text-xs font-bold flex-shrink-0 ${log.status === 'synced' ? 'text-emerald-400' : 'text-red-400'}`}>{log.status === 'synced' ? '✓' : '✗'}</span>
                            <div className="text-[11px] text-slate-300 font-mono">
                              <span className="text-white font-semibold">{log.filename}</span>
                              <span className="text-slate-400">: {log.details} {log.studentName && `(${log.studentName})`}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Backups Tab */}
          {viewMode === 'backups' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
              {/* MongoDB Backup Card */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
                    <Database size={14} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Student Database Backup</div>
                </div>
                <div className="p-5 flex flex-col gap-4">
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    Download the complete active student directory as an Excel-compatible CSV file.
                    This export includes admission IDs, names, classes, contact numbers, transport status, and detailed fee logs.
                  </p>
                  <div className="flex flex-col gap-1.5 py-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">Available Records</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400">{mongo?.objectsCount} Students</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">Export Format</span>
                      <code className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-mono">CSV (MS Excel Compatible)</code>
                    </div>
                  </div>
                  <button
                    className="flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full"
                    onClick={() => handleDownloadBackup('students')} disabled={downloading !== null}
                  >
                    <Download size={15} />
                    <span>{downloading === 'students' ? 'Generating CSV...' : 'Download Student Data'}</span>
                  </button>
                </div>
              </div>

              {/* S3 ZIP Backup Card */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950 flex items-center justify-center flex-shrink-0">
                    <HardDrive size={14} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Media Storage Backup</div>
                </div>
                <div className="p-5 flex flex-col gap-4">
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    Generate and download a compressed ZIP archive containing all report cards,
                    teacher uploads, exam attachments, and notice media currently saved on S3.
                  </p>
                  <div className="flex flex-col gap-1.5 py-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">File Count</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">{s3?.objectsCount} files</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">Total Size</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">{formatBytes(s3?.totalSize || 0)}</span>
                    </div>
                  </div>
                  <button
                    className="flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full"
                    onClick={() => handleDownloadBackup('s3')} disabled={downloading !== null}
                  >
                    <Download size={15} />
                    <span>{downloading === 's3' ? 'Archiving S3 ZIP...' : 'Download S3 Files (.zip)'}</span>
                  </button>
                </div>
              </div>

              {/* Safety Notice Banner */}
              <div className="col-span-1 md:col-span-2 flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                <ShieldAlert size={18} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-amber-800 dark:text-amber-300 mb-1">Data Security Notice</h4>
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Backups contain sensitive personal data of students, parent contacts, and official grading records.
                    Please verify that all downloads are stored securely on authorized school devices.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Admin / Employee Management Section â€” Tailwind */}
          {viewMode === 'admin' && (
            <div className="flex flex-col gap-5 animate-fade-in">

              {/* Page header row with Add Employee button */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[20px] font-extrabold text-slate-900 dark:text-white tracking-tight">Employee &amp; Admin Accounts</h2>
                  <p className="text-sm text-blue-600 mt-0.5">Register new employee accounts and customize their individual portal access permissions.</p>
                </div>
                <Button onClick={() => setShowAddEmployeeDrawer(true)}>
                  <UserPlus size={15} /> Add Employee
                </Button>
              </div>

              {/* Employee list card */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  <Users size={15} className="text-blue-600 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 m-0">Manage Existing Employees</h3>
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">View and manage employee permissions and access.</div>
                  </div>
                  <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{employees.length} account{employees.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="p-5">
                  {loadingEmployees ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                      <span className="text-sm text-slate-500 dark:text-slate-400">Loading employees list...</span>
                    </div>
                  ) : employees.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2">
                      <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <Users size={22} className="text-slate-400" />
                      </div>
                      <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">No custom employees found.</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">Click &laquo;Add Employee&raquo; to register the first account.</div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {employees.map((emp) => (
                        <div
                          key={emp._id}
                          className="flex items-start justify-between gap-3 p-4 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:border-slate-200 dark:hover:border-slate-600 transition-colors"
                        >
                          {/* Avatar + info */}
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 flex items-center justify-center text-sm font-bold flex-shrink-0">
                              {(emp.firstName?.[0] || '').toUpperCase()}{(emp.lastName?.[0] || '').toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight">
                                {emp.firstName} {emp.lastName}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {emp.phone} {emp.email && <span>Â· {emp.email}</span>}
                              </div>
                              <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                                ID: {emp.employeeId || 'NOT ASSIGNED'}
                              </div>
                            </div>
                          </div>

                          {/* Right: badges + actions */}
                          <div className="flex flex-col items-end gap-2 flex-shrink-0">
                            <div className="flex items-center gap-1.5">
                              <Badge variant={emp.role === 'admin' ? 'red' : 'blue'} size="sm">
                                {emp.role}
                              </Badge>
                              <Badge variant={emp.isActive ? 'green' : 'gray'} size="sm">
                                {emp.isActive ? 'Active' : 'Locked'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleToggleLockEmployee(emp)}
                                className={cn(
                                  'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors',
                                  emp.isActive
                                    ? 'text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-400'
                                    : 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-400'
                                )}
                              >
                                {emp.isActive ? <Lock size={11} /> : <Unlock size={11} />}
                                {emp.isActive ? 'Lock' : 'Unlock'}
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditPermissions(emp)}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border text-blue-700 border-blue-200 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-400 transition-colors"
                              >
                                <ShieldCheck size={11} />
                                Permissions ({emp.effectivePermissions?.length ?? emp.permissions?.length ?? 0})
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingEmployeeUser(emp);
                                  setEditingEmployeeForm({
                                    firstName: emp.firstName || '',
                                    lastName: emp.lastName || '',
                                    email: emp.email || '',
                                    phone: emp.phone || '',
                                    role: emp.role || 'other',
                                    employeeId: emp.employeeId || '',
                                    permissions: emp.permissions || []
                                  });
                                }}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border text-slate-600 border-slate-200 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300 transition-colors"
                              >
                                <Edit size={11} /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteEmployee(emp._id)}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border text-red-600 border-red-200 bg-red-50 hover:bg-red-100 dark:bg-red-950 dark:border-red-800 dark:text-red-400 transition-colors"
                              >
                                <Trash2 size={11} /> Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Add Employee Drawer */}
              <Drawer
                isOpen={showAddEmployeeDrawer}
                onClose={() => setShowAddEmployeeDrawer(false)}
                title="Register New Employee"
                subtitle="Create an employee profile with custom permissions. Credentials sent via WhatsApp."
                width="580px"
                footer={
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      form="add-employee-form"
                      className="flex items-center gap-2 h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      <UserPlus size={15} /> Create Employee Account
                    </button>
                    <Button type="button" variant="secondary" onClick={() => setShowAddEmployeeDrawer(false)}>Cancel</Button>
                  </div>
                }
              >
                <form id="add-employee-form" onSubmit={handleCreateAdminSubmit} className="flex flex-col gap-5">

                  {/* Basic Info */}
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 m-0">1 Â· Basic Information</h4>
                    </div>
                    <div className="p-5 flex flex-col gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">First Name <span className="text-red-500 normal-case font-normal">*</span></label>
                          <input
                            type="text" required placeholder="e.g. John"
                            className="h-9 px-3 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 transition-colors font-[inherit]"
                            value={newAdmin.firstName}
                            onChange={(e) => setNewAdmin(prev => ({ ...prev, firstName: e.target.value }))}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Last Name <span className="text-red-500 normal-case font-normal">*</span></label>
                          <input
                            type="text" required placeholder="e.g. Doe"
                            className="h-9 px-3 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 transition-colors font-[inherit]"
                            value={newAdmin.lastName}
                            onChange={(e) => setNewAdmin(prev => ({ ...prev, lastName: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Phone Number <span className="text-red-500 normal-case font-normal">*</span></label>
                          <div className="flex gap-2">
                            <input
                              type="text" required placeholder="e.g. +919392646349"
                              className="flex-1 h-9 px-3 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 transition-colors font-[inherit]"
                              value={newAdmin.phone}
                              disabled={phoneVerified}
                              onChange={(e) => setNewAdmin(prev => ({ ...prev, phone: e.target.value }))}
                            />
                            {!phoneVerified ? (
                              <button
                                type="button"
                                onClick={handleSendPhoneOtp}
                                disabled={sendingOtp || !newAdmin.phone.trim()}
                                className="h-9 px-3 text-sm font-semibold border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg whitespace-nowrap transition-colors disabled:opacity-50"
                              >
                                {sendingOtp ? 'Sending...' : phoneOtpSent ? 'Resend' : 'Verify'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={resetOtpState}
                                className="h-9 px-3 text-sm font-semibold border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg whitespace-nowrap transition-colors"
                              >
                                Change
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Email Address <span className="text-slate-300 normal-case font-normal">(Optional)</span></label>
                          <input
                            type="email" placeholder="e.g. john@school.edu"
                            className="h-9 px-3 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 transition-colors font-[inherit]"
                            value={newAdmin.email}
                            onChange={(e) => setNewAdmin(prev => ({ ...prev, email: e.target.value }))}
                          />
                        </div>
                      </div>

                      {/* OTP field */}
                      {phoneOtpSent && !phoneVerified && (
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold uppercase tracking-wider text-blue-600">WhatsApp Verification OTP <span className="text-red-500 normal-case font-normal">*</span></label>
                          <div className="flex gap-2">
                            <input
                              type="text" required placeholder="Enter 6-digit code sent via WhatsApp"
                              className="flex-1 h-9 px-3 border border-blue-300 bg-blue-50 dark:bg-blue-950 dark:border-blue-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 transition-colors font-[inherit]"
                              value={phoneOtpCode}
                              onChange={(e) => setPhoneOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            />
                            <button
                              type="button"
                              onClick={handleVerifyPhoneOtp}
                              disabled={verifyingOtp || phoneOtpCode.length < 6}
                              className="h-9 px-4 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg whitespace-nowrap transition-colors disabled:opacity-50"
                            >
                              {verifyingOtp ? 'Verifying...' : 'Confirm OTP'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Status notice */}
                      {!phoneOtpSent && !phoneVerified && (
                        <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                          <AlertTriangle size={13} /> Phone number must be verified via WhatsApp before creation.
                        </div>
                      )}
                      {phoneVerified && (
                        <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
                          <CheckCircle2 size={13} /> Phone number verified successfully.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Role */}
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 m-0">2 Â· Account Role</h4>
                    </div>
                    <div className="p-5">
                      <select
                        className="w-full h-9 px-3 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 transition-colors font-[inherit]"
                        value={newAdmin.role}
                        onChange={(e) => setNewAdmin(prev => ({ ...prev, role: e.target.value as 'admin' | 'teacher' | 'parent' | 'other' }))}
                      >
                        <option value="teacher">Standard Teacher (teacher â€” Employee Portal)</option>
                        <option value="other">Custom Employee (other â€” Employee Portal)</option>
                      </select>
                    </div>
                  </div>

                  {/* Permissions */}
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 m-0">3 · Custom Permissions</h4>
                      <button
                        type="button"
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-800 transition-colors"
                        onClick={() => setShowTemplateManagerFor('create')}
                      >
                        Apply Template…
                      </button>
                    </div>
                    <div className="p-5">
                      <PermissionPicker
                        catalog={permissionCatalog}
                        roleDefaults={roleDefaultsMap[newAdmin.role] || []}
                        selected={newAdmin.permissions}
                        onChange={(perms) => setNewAdmin(prev => ({ ...prev, permissions: perms }))}
                      />
                    </div>
                  </div>

                </form>
              </Drawer>

            </div>
          )}


          {/* Feature Permissions View â€” Tailwind */}
          {viewMode === 'permissions' && (
            <div className="grid gap-4 animate-fade-in" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
              {/* Teacher Login Control */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  <UserPlus size={15} className="text-violet-600 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Teacher Login Controls</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Enable or disable teacher portal access.</div>
                  </div>
                </div>
                <div className="p-0 divide-y divide-slate-100 max-h-80 overflow-y-auto">
                  {loadingPermissions ? (
                    <div className="flex items-center justify-center gap-2 py-12">
                      <Loader2 size={16} className="animate-spin text-violet-500" />
                      <span className="text-sm text-slate-500 dark:text-slate-500">Loading teachersâ€¦</span>
                    </div>
                  ) : teachersAccess.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-slate-400 dark:text-slate-500">No teachers registered.</div>
                  ) : teachersAccess.map(teacher => (
                    <div key={teacher._id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 dark:bg-slate-900 transition-colors">
                      <div>
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{teacher.name}</div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500">ID: {teacher.employeeId || 'N/A'} Â· Class: {teacher.assignedClass}</div>
                      </div>
                      <label className="relative flex-shrink-0 cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={teacher.status === 'active'}
                          onChange={() => handleToggleTeacherLogin(teacher._id, teacher.status)} />
                        <div className="w-9 h-5 rounded-full bg-slate-200 peer-checked:bg-violet-600 transition-colors" />
                        <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white dark:bg-slate-800 shadow transition-transform peer-checked:translate-x-4" />
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Class Marks Lock */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  <Lock size={15} className="text-rose-500 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Marks Entry Lock by Class</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Unlock classes to allow teachers to submit marks.</div>
                  </div>
                </div>
                <div className="p-0 divide-y divide-slate-100 max-h-80 overflow-y-auto">
                  {loadingPermissions ? (
                    <div className="flex items-center justify-center gap-2 py-12">
                      <Loader2 size={16} className="animate-spin text-violet-500" />
                      <span className="text-sm text-slate-500 dark:text-slate-500">Loading configâ€¦</span>
                    </div>
                  ) : Array.from(new Set(students.map(s => s.class))).sort().length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-slate-400 dark:text-slate-500">No classes found.</div>
                  ) : Array.from(new Set(students.map(s => s.class))).sort().map(className => {
                    const isEnabled = enabledClasses.map(c => c.split('-')[0].trim()).includes(className);
                    return (
                      <div key={className} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 dark:bg-slate-900 transition-colors">
                        <div>
                          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Class {className}</div>
                          <div className={`text-[11px] font-semibold ${isEnabled ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {isEnabled ? 'âœ“ Open for Mark Entry' : 'âœ— Locked'}
                          </div>
                        </div>
                        <label className="relative flex-shrink-0 cursor-pointer">
                          <input type="checkbox" className="sr-only peer" checked={isEnabled}
                            onChange={() => handleToggleClassMarks(className)} />
                          <div className="w-9 h-5 rounded-full bg-slate-200 peer-checked:bg-violet-600 transition-colors" />
                          <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white dark:bg-slate-800 shadow transition-transform peer-checked:translate-x-4" />
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Attendance Mode */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  <RefreshCw size={15} className="text-emerald-600 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Attendance Mode</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Full Day or Morning &amp; Afternoon sessions.</div>
                  </div>
                </div>
                <div className="px-5 py-4 flex flex-col gap-3">
                  {(['full', 'half-day'] as const).map(mode => (
                    <label key={mode} className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border transition-all"
                      style={{
                        borderColor: attendanceMode === mode ? '#8b5cf6' : '#e2e8f0',
                        background: attendanceMode === mode ? '#f5f3ff' : '#fff'
                      }}>
                      <input type="radio" name="attendanceMode" className="mt-0.5 accent-violet-600" value={mode}
                        checked={attendanceMode === mode} onChange={() => handleUpdateAttendanceMode(mode)} />
                      <div>
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{mode === 'full' ? 'Full Day Attendance' : 'Half Day (Morning & Afternoon)'}</div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                          {mode === 'full' ? 'Single toggle per student per day.' : 'Separate AM and PM session toggles.'}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* WhatsApp Quota */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  <div className="flex items-center gap-3">
                    <MessageCircle size={15} style={{ color: '#25D366' }} className="flex-shrink-0" />
                    <div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100">WhatsApp Messaging Quota</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Monitor broadcast usage and limits.</div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${whatsappSentCount >= whatsappLimit ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                    {whatsappSentCount >= whatsappLimit ? 'âš  Limit Reached' : 'Active'}
                  </span>
                </div>
                <div className="px-5 py-4 flex flex-col gap-3">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Messages Sent</span>
                    <span className="text-[18px] font-extrabold text-slate-900 dark:text-white">
                      {whatsappSentCount} <span className="text-sm font-medium text-slate-400 dark:text-slate-500">/ {whatsappLimit}</span>
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${Math.min((whatsappSentCount / whatsappLimit) * 100, 100)}%`,
                      background: whatsappSentCount >= whatsappLimit ? '#ef4444' : whatsappSentCount / whatsappLimit >= 0.8 ? '#f59e0b' : '#25D366'
                    }} />
                  </div>
                  {whatsappSentCount >= whatsappLimit && (
                    <div className="text-[11px] text-red-600 font-semibold flex items-center gap-1">
                      <AlertTriangle size={11} /> Messaging locked â€” reset counter or raise the limit.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Fee Structures Tab */}
          {viewMode === 'feeStructures' && (
            <div className="animate-fade-in flex flex-col gap-5">
              <div>
                <h2 className="text-[20px] font-extrabold text-slate-900 dark:text-white tracking-tight">Class Fee Structures</h2>
                <p className="text-sm text-blue-600 mt-0.5">Define default total fee, books fee, and installment due dates per class.</p>
              </div>
              <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
                      <Wallet size={14} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Define / Update Fee Structure</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Set class-wide defaults for tuition and books.</div>
                    </div>
                  </div>
                  <form onSubmit={handleSaveFeeStructure} className="p-5 flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Class *</label>
                        <input type="text" required placeholder="e.g. 10" value={feeForm.class} onChange={(e) => setFeeForm(f => ({ ...f, class: e.target.value }))}
                          className="h-9 px-3 w-full border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all font-[inherit] placeholder:text-slate-300 dark:placeholder:text-slate-500" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Total Fee (&#8377;) *</label>
                        <input type="number" required min={0} placeholder="20000" value={feeForm.totalFee} onChange={(e) => setFeeForm(f => ({ ...f, totalFee: e.target.value }))}
                          className="h-9 px-3 w-full border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all font-[inherit] placeholder:text-slate-300 dark:placeholder:text-slate-500" />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Books Fee (&#8377;) <span className="font-normal normal-case text-slate-400">(optional)</span></label>
                      <input type="number" min={0} placeholder="2000" value={feeForm.booksFee} onChange={(e) => setFeeForm(f => ({ ...f, booksFee: e.target.value }))}
                        className="h-9 px-3 w-full border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all font-[inherit] placeholder:text-slate-300 dark:placeholder:text-slate-500" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Installments</label>
                        <button type="button" className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors"
                          onClick={() => setFeeForm(f => ({ ...f, installments: [...f.installments, { installmentNo: f.installments.length + 1, amount: '', dueDate: '' }] }))}>
                          <Plus size={12} /> Add
                        </button>
                      </div>
                      <div className="flex flex-col gap-2">
                        {feeForm.installments.map((inst, idx) => (
                          <div key={idx} className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-700">
                            <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{inst.installmentNo}</span>
                            <input type="number" min={0} placeholder="Amount" value={inst.amount}
                              className="h-8 px-2.5 flex-1 min-w-0 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-700 outline-none focus:border-blue-500 transition-all font-[inherit] placeholder:text-slate-300"
                              onChange={(e) => setFeeForm(f => { const list = [...f.installments]; list[idx] = { ...list[idx], amount: e.target.value }; return { ...f, installments: list }; })} />
                            <input type="date" value={inst.dueDate}
                              className="h-8 px-2.5 flex-1 min-w-0 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-700 outline-none focus:border-blue-500 transition-all font-[inherit]"
                              onChange={(e) => setFeeForm(f => { const list = [...f.installments]; list[idx] = { ...list[idx], dueDate: e.target.value }; return { ...f, installments: list }; })} />
                            {feeForm.installments.length > 1 && (
                              <button type="button" onClick={() => setFeeForm(f => ({ ...f, installments: f.installments.filter((_, i) => i !== idx) }))}
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-500 transition-colors flex-shrink-0">
                                <X size={13} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <button type="submit" disabled={savingFeeStructure}
                      className="h-10 w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-1">
                      {savingFeeStructure
                        ? (<><RefreshCw size={14} className="animate-spin" /><span>Saving...</span></>)
                        : (<><CheckCircle2 size={14} /><span>Save Fee Structure</span></>)}
                    </button>
                  </form>
                </div>
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center flex-shrink-0">
                        <ReceiptText size={14} className="text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Configured Structures</div>
                        <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Click any card to pre-fill the form for editing.</div>
                      </div>
                    </div>
                    {feeStructures.length > 0 && <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{feeStructures.length} class{feeStructures.length !== 1 ? 'es' : ''}</span>}
                  </div>
                  <div className="p-4">
                    {loadingFeeStructures ? (
                      <div className="flex flex-col items-center justify-center gap-2 py-12">
                        <RefreshCw size={20} className="animate-spin text-slate-300 dark:text-slate-600" />
                        <span className="text-sm text-slate-400 dark:text-slate-500">Loading fee structures...</span>
                      </div>
                    ) : feeStructures.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                          <Wallet size={20} className="text-slate-300 dark:text-slate-500" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">No structures configured</div>
                          <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Use the form on the left to add one.</div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {feeStructures.map((fs) => (
                          <div key={fs.class} className="group p-4 rounded-xl border border-slate-100 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-700 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-all cursor-pointer"
                            onClick={() => setFeeForm({ class: fs.class, totalFee: String(fs.totalFee), booksFee: String(fs.booksFee), installments: fs.installments.length > 0 ? fs.installments.map((i: any) => ({ installmentNo: i.installmentNo, amount: String(i.amount), dueDate: i.dueDate?.slice(0, 10) || '' })) : [{ installmentNo: 1, amount: '', dueDate: '' }] })}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className="px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-bold flex-shrink-0">Class {fs.class}</span>
                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">&#8377;{Number(fs.totalFee).toLocaleString()} total</span>
                                {fs.booksFee > 0 && <span className="px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300 text-[11px] font-semibold">&#8377;{Number(fs.booksFee).toLocaleString()} books</span>}
                                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-semibold">{fs.installments.length} instalment{fs.installments.length !== 1 ? 's' : ''}</span>
                              </div>
                              <button type="button" disabled={deletingFeeClass === fs.class}
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-500 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                                onClick={(e) => { e.stopPropagation(); handleDeleteFeeStructure(fs.class); }}>
                                {deletingFeeClass === fs.class ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                              </button>
                            </div>
                            {fs.installments.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-3">
                                {fs.installments.map((inst: any, i: number) => (
                                  <div key={i} className="flex items-center gap-1.5 text-[11px]">
                                    <span className="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-700 text-[9px] font-bold flex items-center justify-center text-slate-500">{inst.installmentNo}</span>
                                    <span className="font-semibold text-slate-700 dark:text-slate-300">&#8377;{Number(inst.amount).toLocaleString()}</span>
                                    {inst.dueDate && <span className="text-slate-400">Â· {new Date(inst.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Daily Collections Tab */}
          {viewMode === 'collections' && (
            <div className="settings-grid animate-fade-in" style={{ gridTemplateColumns: '1fr' }}>
              <div className="storage-card mongo-card animate-fade-in" style={{ width: '100%' }}>
                <div className="card-header">
                  <div className="card-icon-title">
                    <ReceiptText className="card-icon database-icon" />
                    <h3>Fee Collections</h3>
                  </div>
                  <input
                    type="date"
                    className="form-input"
                    style={{ width: '170px' }}
                    value={collectionsDate}
                    onChange={(e) => setCollectionsDate(e.target.value)}
                  />
                </div>
                <div className="card-body">
                  {loadingCollections ? (
                    <div className="settings-loading-container" style={{ height: '180px' }}>
                      <div className="spinner" />
                      <span>Loading collections...</span>
                    </div>
                  ) : !collectionsData ? (
                    <span className="no-records-text">Failed to load collections report.</span>
                  ) : (
                    <>
                      <div className="size-stats-grid">
                        <div className="size-stat-box">
                          <span className="box-title">Total Collected</span>
                          <span className="box-value">â‚¹{collectionsData.totalCollected.toLocaleString()}</span>
                        </div>
                        <div className="size-stat-box">
                          <span className="box-title">Payments</span>
                          <span className="box-value">{collectionsData.paymentsCount}</span>
                        </div>
                        {Object.entries(collectionsData.byMode || {}).map(([mode, amt]: [string, any]) => (
                          <div className="size-stat-box" key={mode}>
                            <span className="box-title" style={{ textTransform: 'capitalize' }}>{mode}</span>
                            <span className="box-value">â‚¹{Number(amt).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>

                      <div className="divider" />

                      <div className="responsive-table-container">
                        <table className="student-table">
                          <thead>
                            <tr>
                              <th>Receipt No</th>
                              <th>Student</th>
                              <th>Class</th>
                              <th style={{ textAlign: 'center' }}>Amount</th>
                              <th style={{ textAlign: 'center' }}>Mode</th>
                            </tr>
                          </thead>
                          <tbody>
                            {collectionsData.payments.length === 0 ? (
                              <tr><td colSpan={5} className="empty-state">No payments recorded on {collectionsDate}.</td></tr>
                            ) : (
                              collectionsData.payments.map((p: any) => (
                                <tr key={p.receiptNo}>
                                  <td><strong>{p.receiptNo}</strong></td>
                                  <td>{p.studentName} ({p.admissionNo})</td>
                                  <td>Class {p.class}-{p.section}</td>
                                  <td style={{ textAlign: 'center', fontWeight: 700 }}>â‚¹{p.amount.toLocaleString()}</td>
                                  <td style={{ textAlign: 'center', textTransform: 'capitalize' }}>{p.paymentMode}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}


          {/* Audit Log Tab */}
          {viewMode === 'auditLogs' && (
            <div className="animate-fade-in flex flex-col gap-4">
              {/* Card */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                {/* Card header */}
                <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center flex-shrink-0">
                      <ScrollText size={14} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Sensitive Action Trail</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{auditTotal} recorded event{auditTotal !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  {/* Search bar */}
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Filter by action (e.g. exam:delete)"
                        value={auditActionFilter}
                        onChange={(e) => setAuditActionFilter(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { setAuditPage(1); fetchAuditLogs(); } }}
                        className="h-9 pl-8 pr-3 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all font-[inherit] placeholder:text-slate-300 dark:placeholder:text-slate-500 w-64"
                      />
                    </div>
                    <button
                      onClick={() => { setAuditPage(1); fetchAuditLogs(); }}
                      className="h-9 px-3 flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                    >
                      <Search size={14} />
                    </button>
                  </div>
                </div>

                {/* Body */}
                {loadingAuditLogs ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16">
                    <RefreshCw size={20} className="animate-spin text-slate-300 dark:text-slate-600" />
                    <span className="text-sm text-slate-400 dark:text-slate-500">Loading audit trail...</span>
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                    <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                      <ScrollText size={20} className="text-slate-300 dark:text-slate-500" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">No audit log entries found</div>
                      {auditActionFilter && <div className="text-xs text-slate-400 mt-0.5">for &ldquo;{auditActionFilter}&rdquo;</div>}
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-700">
                          <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Action</th>
                          <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">User</th>
                          <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Method</th>
                          <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Path</th>
                          <th className="text-center px-5 py-3 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Status</th>
                          <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">When</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                        {auditLogs.map((log) => (
                          <tr key={log._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-700/30 transition-colors">
                            <td className="px-5 py-3.5">
                              <code className="text-[12px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono">{log.action}</code>
                            </td>
                            <td className="px-5 py-3.5 text-sm">
                              <span className="font-semibold text-slate-800 dark:text-slate-100">{log.username || 'N/A'}</span>
                              <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">({log.role || 'n/a'})</span>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded font-mono ${
                                log.method === 'GET' ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300' :
                                log.method === 'POST' ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' :
                                log.method === 'PUT' || log.method === 'PATCH' ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300' :
                                'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
                              }`}>{log.method}</span>
                            </td>
                            <td className="px-5 py-3.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono max-w-xs truncate">{log.path}</td>
                            <td className="px-5 py-3.5 text-center">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                log.statusCode < 400 ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                              }`}>{log.statusCode}</span>
                            </td>
                            <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{new Date(log.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination */}
                {!loadingAuditLogs && auditLogs.length > 0 && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      Page {auditPage} of {Math.max(1, Math.ceil(auditTotal / AUDIT_PAGE_SIZE))} &middot; {auditTotal} total
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        disabled={auditPage <= 1}
                        onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                      >Previous</button>
                      <button
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        disabled={auditPage >= Math.ceil(auditTotal / AUDIT_PAGE_SIZE)}
                        onClick={() => setAuditPage(p => p + 1)}
                      >Next</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {viewMode === 'principalSignature' && (
            <AdminPrincipalSignature onShowToast={(msg, type) => showToast(msg, type === 'error' ? 'error' : 'success')} />
          )}
        </>
      )}

      {/* Password Confirmation Overlay Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-fade-in">
            <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 dark:border-slate-700">
              <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
                <Lock size={16} className="text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 m-0">Confirm Administrator Password</h3>
            </div>
            <form onSubmit={handleConfirmPasswordAndSubmit} className="p-6 flex flex-col gap-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Creating an administrative account requires verification. Please enter <strong className="text-slate-700 dark:text-slate-200">your current admin password</strong> to confirm authorization.
              </p>
              <input
                type="password" required
                placeholder="Enter your password"
                className="h-10 px-3 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 dark:focus:ring-blue-900 transition-all font-[inherit] w-full placeholder:text-slate-300"
                value={currentAdminPassword}
                onChange={(e) => setCurrentAdminPassword(e.target.value)}
                autoFocus
              />
              <div className="flex items-center justify-end gap-3 pt-1">
                <button type="button" disabled={submittingAdmin}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  onClick={() => { setShowPasswordModal(false); setCurrentAdminPassword(''); }}
                >Cancel</button>
                <button type="submit" disabled={submittingAdmin}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {submittingAdmin ? <><RefreshCw size={13} className="animate-spin" /><span>Creating...</span></> : <span>Authorize &amp; Create</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CREDENTIALS MODAL ───────────────────────────────────────────────── */}
      <Modal
        isOpen={!!credentialsModal}
        onClose={() => setCredentialsModal(null)}
        title="🎉 Employee Registered"
        maxWidth="480px"
        footer={<Button className="w-full justify-center" onClick={() => setCredentialsModal(null)}><Check size={14} /> Done — Credentials Noted</Button>}
      >
        {credentialsModal && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600 dark:text-slate-400"><strong>{credentialsModal.name}</strong> can log in using the Employee Portal.</p>
            <div className={cn('flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-semibold border', credentialsModal.whatsappSent ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800')}>
              {credentialsModal.whatsappSent ? '✅ Credentials sent via WhatsApp.' : '⚠️ WhatsApp blocked (sandbox). Share manually.'}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-lt rounded-md p-3 border border-blue-200">
                <div className="text-2xs font-bold uppercase text-slate-500 mb-1">Login ID (Employee ID)</div>
                <div className="text-sm font-bold font-mono text-blue">{credentialsModal.username}</div>
              </div>
              <div className="bg-amber-lt rounded-md p-3 border border-amber-200">
                <div className="text-2xs font-bold uppercase text-slate-500 mb-1">Temporary Password</div>
                <div className="text-sm font-bold font-mono text-amber">{credentialsModal.password}</div>
              </div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-md p-3 text-xs text-green-800 leading-relaxed">
              <strong>📋 Instructions:</strong><br />
              1. Open login → Employee Portal<br />
              2. Enter Employee ID + temporary password<br />
              3. You will be prompted to set a new password on first login
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Permissions Modal Overlay */}
      {editingPermissionsUser && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full mx-4 overflow-hidden animate-fade-in" style={{ maxWidth: 650 }}>
            <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 dark:border-slate-700">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center flex-shrink-0">
                <ShieldCheck size={16} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 m-0">Custom User Module Permissions</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Toggle granular module access for <strong className="text-slate-600 dark:text-slate-300">{editingPermissionsUser.firstName} {editingPermissionsUser.lastName}</strong></p>
              </div>
            </div>
            <div className="p-6 flex flex-col gap-4">
              {loadingEditingPermissions ? (
                <div className="text-center text-sm text-slate-400 py-10">Loading current permissions…</div>
              ) : (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      className="h-9 px-2 border border-slate-200 dark:border-slate-600 rounded-md text-xs bg-white dark:bg-slate-700 dark:text-white outline-none"
                      value={cloneFromEmployeeId}
                      onChange={(e) => {
                        setCloneFromEmployeeId(e.target.value);
                        if (e.target.value) handleCloneFromEmployee(e.target.value);
                      }}
                    >
                      <option value="">Clone from existing employee…</option>
                      {employees.filter((e: any) => e._id !== editingPermissionsUser._id).map((e: any) => (
                        <option key={e._id} value={e._id}>{e.firstName} {e.lastName} ({e.username})</option>
                      ))}
                    </select>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setShowTemplateManagerFor('edit')}>Apply Template…</Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setEditingPermissionsList(editingPermissionsRoleDefaults)}>Reset to Role Default</Button>
                  </div>
                  <PermissionPicker
                    catalog={permissionCatalog}
                    roleDefaults={editingPermissionsRoleDefaults}
                    selected={editingPermissionsList}
                    onChange={setEditingPermissionsList}
                  />
                </>
              )}
              <div className="flex items-center justify-end gap-3">
                <button type="button" disabled={savingPermissions}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  onClick={() => setEditingPermissionsUser(null)}
                >Cancel</button>
                <button type="button" disabled={savingPermissions}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm font-semibold transition-colors disabled:opacity-50"
                  onClick={handleResetPermissionsToRoleDefault}
                >Clear All Overrides</button>
                <button type="button" disabled={savingPermissions}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                  onClick={handleSavePermissions}
                >{savingPermissions ? 'Saving...' : 'Save Permissions'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PermissionTemplateManager
        isOpen={showTemplateManagerFor !== null}
        onClose={() => setShowTemplateManagerFor(null)}
        showToast={showToast}
        currentSelection={showTemplateManagerFor === 'create' ? newAdmin.permissions : editingPermissionsList}
        onApply={(perms) => {
          if (showTemplateManagerFor === 'create') {
            setNewAdmin(prev => ({ ...prev, permissions: Array.from(new Set([...prev.permissions, ...perms])) }));
          } else if (showTemplateManagerFor === 'edit') {
            setEditingPermissionsList(prev => Array.from(new Set([...prev, ...perms])));
          }
        }}
      />
      {/* Edit Employee Details Modal Overlay */}
      {editingEmployeeUser && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full mx-4 overflow-hidden animate-fade-in" style={{ maxWidth: 500 }}>
            <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 dark:border-slate-700">
              <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-950 flex items-center justify-center flex-shrink-0">
                <Edit size={16} className="text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 m-0">Edit Employee Profile</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Modify account details for <strong className="text-slate-600 dark:text-slate-300">{editingEmployeeUser.firstName} {editingEmployeeUser.lastName}</strong></p>
              </div>
            </div>
            <form onSubmit={handleUpdateEmployeeDetails} className="p-6 flex flex-col gap-4">
              {/* shared input class */}
              {(() => {
                const inp = 'h-10 px-3 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 dark:focus:ring-blue-900 transition-all font-[inherit] w-full';
                const lbl = 'text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';
                return (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className={lbl}>First Name *</label>
                        <input type="text" required className={inp}
                          value={editingEmployeeForm.firstName}
                          onChange={(e) => setEditingEmployeeForm(prev => ({ ...prev, firstName: e.target.value }))} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className={lbl}>Last Name *</label>
                        <input type="text" required className={inp}
                          value={editingEmployeeForm.lastName}
                          onChange={(e) => setEditingEmployeeForm(prev => ({ ...prev, lastName: e.target.value }))} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className={lbl}>Phone Number *</label>
                      <input type="text" required className={inp}
                        value={editingEmployeeForm.phone}
                        onChange={(e) => setEditingEmployeeForm(prev => ({ ...prev, phone: e.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className={lbl}>Email Address (Optional)</label>
                      <input type="email" className={inp}
                        value={editingEmployeeForm.email}
                        onChange={(e) => setEditingEmployeeForm(prev => ({ ...prev, email: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className={lbl}>Account Role</label>
                        <select className={inp}
                          value={editingEmployeeForm.role}
                          onChange={(e) => setEditingEmployeeForm(prev => ({ ...prev, role: e.target.value }))}>
                          <option value="admin">Administrator (Admin Portal)</option>
                          <option value="teacher">Standard Teacher (Employee Portal)</option>
                          <option value="other">Custom Employee (Employee Portal)</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className={lbl}>Employee ID</label>
                        <input type="text" disabled className={`${inp} opacity-60 cursor-not-allowed`}
                          value={editingEmployeeForm.employeeId} />
                      </div>
                    </div>
                  </>
                );
              })()}
              <div className="flex items-center justify-end gap-3 pt-1">
                <button type="button"
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  onClick={() => setEditingEmployeeUser(null)}
                >Cancel</button>
                <button type="submit"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
                >Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSettings;

