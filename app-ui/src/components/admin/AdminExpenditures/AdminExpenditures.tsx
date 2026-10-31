import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Wallet, FileText, Check, Plus, Trash2,
  IndianRupee, Users, TrendingUp, TrendingDown, AlertCircle
} from 'lucide-react';
import { Button, PageHeader, Badge, DataTable, Th, Td, Tr, EmptyState, LoadingSpinner, Modal, KpiCard } from '../../ui';
import { API_BASE } from '../../../constants';
import { getLocalToday, getLocalMonth } from '../../../lib/utils';
import { Form } from '../../ui/Form';
import { ActionButton } from '../../ui/ActionButton';

interface AdminExpendituresProps {
  showToast: (message: string, type?: 'success' | 'error') => void;
  user?: any;
}

interface SalaryRow {
  teacherId: string;
  name: string;
  employeeId: string;
  salary: number;
  paid: boolean;
  paidDate: string | null;
}

interface VariableExpenseRow {
  _id: string;
  title: string;
  note?: string;
  amount: number;
  date: string;
  paid: boolean;
  paidDate?: string;
  createdAt: string;
}

interface DashboardSummary {
  month: string;
  income: number;
  salary: { total: number; paid: number; pending: number; paidCount: number; totalCount: number };
  variable: { total: number; paid: number; pending: number; count: number };
  combinedOutflowPaid: number;
  combinedOutflowPending: number;
  netProfit: number;
}

interface TrendPoint {
  month: string;
  monthLabel: string;
  income: number;
  salaryPaid: number;
  variableTotal: number;
  variablePaid: number;
  netProfit: number;
}

const currentMonth = () => getLocalMonth(); // 'YYYY-MM'
const today = () => getLocalToday(); // 'YYYY-MM-DD'
const rupees = (n: number) => `₹${n.toLocaleString()}`;

const TABS = [
  { key: 'dashboard', label: 'Dashboard', Icon: BarChart3 },
  { key: 'salaries', label: 'Salaries', Icon: Wallet },
  { key: 'variable', label: 'Variable Bills', Icon: FileText },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function AdminExpenditures({ showToast }: AdminExpendituresProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [salaryRows, setSalaryRows] = useState<SalaryRow[]>([]);
  const [variableExpenses, setVariableExpenses] = useState<VariableExpenseRow[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseDraft, setExpenseDraft] = useState({ title: '', note: '', amount: '', date: today() });
  const [savingExpense, setSavingExpense] = useState(false);

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(`${API_BASE}/expenditure${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Request failed.');
    return data.data;
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      setSummary(await request(`/dashboard?month=${month}`));
    } catch (err: any) {
      showToast(err.message || 'Failed to load dashboard summary.', 'error');
    }
  }, [request, month, showToast]);

  const loadSalaries = useCallback(async () => {
    try {
      const data = await request(`/salaries?month=${month}`);
      setSalaryRows(data.rows);
    } catch (err: any) {
      showToast(err.message || 'Failed to load salaries.', 'error');
    }
  }, [request, month, showToast]);

  const loadVariable = useCallback(async () => {
    try {
      setVariableExpenses(await request('/variable'));
    } catch (err: any) {
      showToast(err.message || 'Failed to load variable expenses.', 'error');
    }
  }, [request, showToast]);

  const loadTrends = useCallback(async () => {
    try {
      setTrends(await request('/trends?months=6'));
    } catch (err: any) {
      showToast(err.message || 'Failed to load monthly trends.', 'error');
    }
  }, [request, showToast]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadDashboard(), loadSalaries(), loadVariable(), loadTrends()]).finally(() => setLoading(false));
  }, [loadDashboard, loadSalaries, loadVariable, loadTrends]);

  const toggleSalaryPaid = async (row: SalaryRow) => {
    setTogglingId(row.teacherId);
    try {
      await request(`/salaries/${row.teacherId}/${row.paid ? 'unpay' : 'pay'}`, {
        method: 'PATCH',
        body: JSON.stringify({ month }),
      });
      await Promise.all([loadSalaries(), loadDashboard(), loadTrends()]);
      showToast(row.paid ? `Marked ${row.name} as unpaid for ${month}.` : `Marked ${row.name} as paid for ${month}.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update payment status.', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(expenseDraft.amount);
    if (!expenseDraft.title.trim()) {
      showToast('Title is required.', 'error');
      return;
    }
    if (!amount || amount <= 0) {
      showToast('Amount must be greater than zero.', 'error');
      return;
    }
    setSavingExpense(true);
    try {
      await request('/variable', {
        method: 'POST',
        body: JSON.stringify({
          title: expenseDraft.title.trim(),
          note: expenseDraft.note.trim(),
          amount,
          date: expenseDraft.date || today(),
        }),
      });
      setShowAddExpense(false);
      setExpenseDraft({ title: '', note: '', amount: '', date: today() });
      await Promise.all([loadVariable(), loadDashboard(), loadTrends()]);
      showToast('Expense added.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to add expense.', 'error');
    } finally {
      setSavingExpense(false);
    }
  };

  const toggleExpensePaid = async (exp: VariableExpenseRow) => {
    setTogglingId(exp._id);
    try {
      await request(`/variable/${exp._id}/toggle-paid`, {
        method: 'PATCH',
        body: JSON.stringify({ paid: !exp.paid }),
      });
      await Promise.all([loadVariable(), loadDashboard(), loadTrends()]);
    } catch (err: any) {
      showToast(err.message || 'Failed to update expense.', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteExpense = async (exp: VariableExpenseRow) => {
    if (!window.confirm(`Delete "${exp.title}"?`)) return;
    try {
      await request(`/variable/${exp._id}`, { method: 'DELETE' });
      await Promise.all([loadVariable(), loadDashboard(), loadTrends()]);
      showToast('Expense deleted.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete expense.', 'error');
    }
  };

  const PaidTick = ({ paid, busy, onClick }: { paid: boolean; busy: boolean; onClick: () => void }) => (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      title={paid ? 'Mark as unpaid' : 'Mark as paid'}
      className={`w-6 h-6 rounded flex items-center justify-center border-2 transition-colors disabled:opacity-50 ${paid ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-slate-300 hover:border-slate-400'
        }`}
    >
      {paid && <Check size={14} strokeWidth={3} />}
    </button>
  );

  const TrendChart = ({ data }: { data: TrendPoint[] }) => {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const rawMax = Math.max(...data.map((d) => Math.max(d.income || 0, d.salaryPaid || 0, d.variablePaid || 0)), 1000);
    const maxVal = Math.ceil(rawMax * 1.15);

    const formatYAxis = (val: number) => {
      if (val === 0) return '₹0';
      if (val >= 10000000) return `₹${(val / 10000000).toFixed(1).replace(/\.0$/, '')}Cr`;
      if (val >= 100000) return `₹${(val / 100000).toFixed(1).replace(/\.0$/, '')}L`;
      if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`;
      return `₹${val}`;
    };

    const formatCompactCurrency = (val: number) => {
      const abs = Math.abs(val);
      let formatted = '';
      if (abs >= 10000000) formatted = `₹${(abs / 10000000).toFixed(2).replace(/\.00$/, '')}Cr`;
      else if (abs >= 100000) formatted = `₹${(abs / 100000).toFixed(2).replace(/\.00$/, '')}L`;
      else if (abs >= 1000) formatted = `₹${(abs / 1000).toFixed(1).replace(/\.0$/, '')}k`;
      else formatted = `₹${abs.toLocaleString('en-IN')}`;
      return `${val > 0 ? '+' : val < 0 ? '−' : ''}${formatted}`;
    };

    const yTicks = [maxVal, maxVal * 0.66, maxVal * 0.33, 0];

    return (
      <div className="flex flex-col select-none">
        {/* Chart Viewport */}
        <div className="relative h-56 sm:h-60 flex">
          {/* Y-Axis Labels */}
          <div className="flex flex-col justify-between items-end pr-2.5 pb-8 text-[10px] font-bold text-slate-400 w-12 flex-shrink-0 select-none">
            {yTicks.map((tick, i) => (
              <span key={i} className="leading-none">
                {formatYAxis(tick)}
              </span>
            ))}
          </div>

          {/* Chart Grid & Bars */}
          <div className="relative flex-1 flex flex-col justify-between">
            {/* Horizontal Gridlines */}
            <div className="absolute inset-x-0 top-0 bottom-8 flex flex-col justify-between pointer-events-none">
              <div className="border-b border-slate-100 w-full" />
              <div className="border-b border-slate-100 w-full border-dashed" />
              <div className="border-b border-slate-100 w-full border-dashed" />
              <div className="border-b border-slate-200 w-full" />
            </div>

            {/* Month Columns */}
            <div className="relative z-10 flex items-end justify-around h-full pb-8 pt-4 px-2 gap-2">
              {data.map((d, idx) => {
                const isHovered = hoveredIdx === idx;
                const incomeH = d.income > 0 ? Math.min(100, Math.max(4, Math.round((d.income / maxVal) * 100))) : 0;
                const salaryH = d.salaryPaid > 0 ? Math.min(100, Math.max(4, Math.round((d.salaryPaid / maxVal) * 100))) : 0;
                const varH = d.variablePaid > 0 ? Math.min(100, Math.max(4, Math.round((d.variablePaid / maxVal) * 100))) : 0;

                return (
                  <div
                    key={d.month}
                    className="flex-1 flex flex-col items-center justify-end h-full relative group cursor-pointer max-w-[80px]"
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    {/* Tooltip */}
                    {isHovered && (
                      <div className="absolute -top-24 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[11px] rounded-lg shadow-xl z-30 p-2.5 whitespace-nowrap pointer-events-none border border-slate-700 min-w-[150px]">
                        <div className="font-bold text-slate-200 pb-1 border-b border-slate-700 mb-1.5 flex justify-between">
                          <span>{d.monthLabel}</span>
                          <span className={d.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {d.netProfit >= 0 ? 'Profit' : 'Loss'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-[10.5px]">
                          <span className="flex items-center gap-1 text-slate-300">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Income:
                          </span>
                          <span className="font-semibold text-emerald-400">{rupees(d.income)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-[10.5px] mt-0.5">
                          <span className="flex items-center gap-1 text-slate-300">
                            <span className="w-2 h-2 rounded-full bg-blue-500" /> Salaries:
                          </span>
                          <span className="font-semibold text-blue-300">{rupees(d.salaryPaid)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-[10.5px] mt-0.5">
                          <span className="flex items-center gap-1 text-slate-300">
                            <span className="w-2 h-2 rounded-full bg-amber-500" /> Variable:
                          </span>
                          <span className="font-semibold text-amber-300">{rupees(d.variablePaid)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-[10.5px] mt-1 pt-1 border-t border-slate-800">
                          <span className="font-semibold text-slate-400">Net Profit:</span>
                          <span className={`font-bold ${d.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {d.netProfit >= 0 ? '+' : '−'}{rupees(Math.abs(d.netProfit))}
                          </span>
                        </div>
                        <div className="w-2 h-2 bg-slate-900 rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2 border-r border-b border-slate-700" />
                      </div>
                    )}

                    {/* Bars Slot */}
                    <div className="flex items-end justify-center gap-1 h-full w-full">
                      {/* Income Bar */}
                      <div className="w-2.5 sm:w-3.5 h-full flex items-end justify-center">
                        {d.income > 0 ? (
                          <div
                            className="w-full bg-emerald-500 hover:bg-emerald-600 rounded-t transition-all duration-200"
                            style={{ height: `${incomeH}%` }}
                          />
                        ) : (
                          <div className="w-full h-0.5 bg-slate-200 rounded-full" />
                        )}
                      </div>

                      {/* Salary Bar */}
                      <div className="w-2.5 sm:w-3.5 h-full flex items-end justify-center">
                        {d.salaryPaid > 0 ? (
                          <div
                            className="w-full bg-blue-600 hover:bg-blue-700 rounded-t transition-all duration-200"
                            style={{ height: `${salaryH}%` }}
                          />
                        ) : (
                          <div className="w-full h-0.5 bg-slate-200 rounded-full" />
                        )}
                      </div>

                      {/* Variable Bar */}
                      <div className="w-2.5 sm:w-3.5 h-full flex items-end justify-center">
                        {d.variablePaid > 0 ? (
                          <div
                            className="w-full bg-amber-500 hover:bg-amber-600 rounded-t transition-all duration-200"
                            style={{ height: `${varH}%` }}
                          />
                        ) : (
                          <div className="w-full h-0.5 bg-slate-200 rounded-full" />
                        )}
                      </div>
                    </div>

                    {/* X-Axis Month Label & Net Profit */}
                    <div className="absolute -bottom-7 flex flex-col items-center whitespace-nowrap">
                      <span className={`text-[11px] font-bold ${isHovered ? 'text-slate-900' : 'text-slate-600'}`}>
                        {d.monthLabel.split(' ')[0]}
                      </span>
                      <span
                        className={`text-[10px] font-bold ${d.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'
                          }`}
                      >
                        {formatCompactCurrency(d.netProfit)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 sm:gap-6 text-xs font-semibold text-slate-600 mt-5 pt-3 border-t border-slate-100 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Income
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-600" /> Salaries Paid
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Variable Bills Paid
          </span>
          <span className="text-slate-400 font-normal text-[11px]">(net profit/deficit shown below each month)</span>
        </div>
      </div>
    );
  };

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const monthPicker = (
    <input
      type="month"
      value={month}
      onChange={(e) => setMonth(e.target.value)}
      className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
    />
  );

  return (
    <div className="flex flex-col gap-4 font-sans text-slate-900">
      <PageHeader title="Expenditure" subtitle="Staff salaries, variable bills, and monthly cash flow." />

      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-px flex-wrap">
        <div className="flex items-center gap-1 w-full sm:w-auto" role="tablist" aria-label="Expenditure sections">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => setActiveTab(key)}
              className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 min-h-[44px] px-2 sm:px-3.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${activeTab === key
                ? 'border-blue text-blue'
                : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
            >
              <Icon size={15} className="hidden min-[380px]:inline shrink-0" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pb-1">
          <span className="text-xs font-semibold text-slate-500">Selected Month:</span>
          {monthPicker}
        </div>
      </div>

      {loading ? (
        <LoadingSpinner fullPage />
      ) : (
        <>
          {activeTab === 'dashboard' && summary && (
            <div className="flex flex-col gap-4">
              {/* Unpaid / Pending Alert Banner */}
              {(summary.salary.totalCount - summary.salary.paidCount > 0 || summary.variable.pending > 0) && (
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-4 py-2.5 text-xs sm:text-sm font-medium shadow-sm">
                  <AlertCircle size={16} className="text-amber-600 flex-shrink-0" />
                  <div className="flex-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                    {summary.salary.totalCount - summary.salary.paidCount > 0 && (
                      <span>
                        <strong className="font-semibold text-amber-950">{summary.salary.totalCount - summary.salary.paidCount} of {summary.salary.totalCount} staff</strong> unpaid for {monthLabel}.
                      </span>
                    )}
                    {summary.variable.pending > 0 && (
                      <span>
                        <strong className="font-semibold text-amber-950">{rupees(summary.variable.pending)}</strong> pending across {variableExpenses.filter((e) => !e.paid).length} variable bill(s).
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Primary Summary KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">School Income</span>
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <IndianRupee size={16} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 leading-tight">
                      {rupees(summary.income)}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">Fees collected in {monthLabel}</div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">Total Paid Out</span>
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Wallet size={16} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
                      {rupees(summary.combinedOutflowPaid)}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">Salaries + variable bills paid</div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">Net Profit / Balance</span>
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${summary.netProfit >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                        }`}
                    >
                      {summary.netProfit >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                    </div>
                  </div>
                  <div className="mt-2">
                    <div
                      className={`text-2xl sm:text-3xl font-extrabold leading-tight ${summary.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                    >
                      {summary.netProfit >= 0 ? '+' : '−'}{rupees(Math.abs(summary.netProfit))}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">Income minus amount paid out</div>
                  </div>
                </div>
              </div>

              {/* Detailed Breakdown Panels */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                {/* Staff Salaries Card */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                        <Users size={15} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">Staff Salaries Breakdown</h4>
                        <p className="text-[11px] text-slate-400">{summary.salary.paidCount} of {summary.salary.totalCount} staff paid</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab('salaries')}
                      className="text-xs text-blue-600 hover:text-blue-700 font-semibold hover:underline"
                    >
                      Manage &rarr;
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-3">
                    <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                      <div className="text-[11px] font-medium text-slate-500">Total Bill</div>
                      <div className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">{rupees(summary.salary.total)}</div>
                    </div>
                    <div className="bg-emerald-50/70 rounded-lg p-2.5 border border-emerald-100">
                      <div className="text-[11px] font-medium text-emerald-800">Paid</div>
                      <div className="text-base sm:text-lg font-bold text-emerald-700 mt-0.5">{rupees(summary.salary.paid)}</div>
                    </div>
                    <div className="bg-red-50/70 rounded-lg p-2.5 border border-red-100">
                      <div className="text-[11px] font-medium text-red-800">Pending</div>
                      <div className="text-base sm:text-lg font-bold text-red-700 mt-0.5">{rupees(summary.salary.pending)}</div>
                    </div>
                  </div>
                </div>

                {/* Variable Bills Card */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                        <FileText size={15} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">Variable Bills Breakdown</h4>
                        <p className="text-[11px] text-slate-400">{summary.variable.count} bill(s) logged</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab('variable')}
                      className="text-xs text-blue-600 hover:text-blue-700 font-semibold hover:underline"
                    >
                      Manage &rarr;
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-3">
                    <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                      <div className="text-[11px] font-medium text-slate-500">Total Logged</div>
                      <div className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">{rupees(summary.variable.total)}</div>
                    </div>
                    <div className="bg-emerald-50/70 rounded-lg p-2.5 border border-emerald-100">
                      <div className="text-[11px] font-medium text-emerald-800">Paid</div>
                      <div className="text-base sm:text-lg font-bold text-emerald-700 mt-0.5">{rupees(summary.variable.paid)}</div>
                    </div>
                    <div className="bg-red-50/70 rounded-lg p-2.5 border border-red-100">
                      <div className="text-[11px] font-medium text-red-800">Pending</div>
                      <div className="text-base sm:text-lg font-bold text-red-700 mt-0.5">{rupees(summary.variable.pending)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Monthly Trend Chart */}
              {trends.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-2 mb-4 pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                        <BarChart3 size={15} />
                      </div>
                      <div>
                        <span className="text-sm font-bold text-slate-900">Monthly Payout & Cash Flow Trend</span>
                        <span className="text-xs text-slate-400 ml-2">(Last 6 Months)</span>
                      </div>
                    </div>
                  </div>
                  <TrendChart data={trends} />
                </div>
              )}
            </div>
          )}

          {activeTab === 'salaries' && (
            salaryRows.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg shadow-card">
                <EmptyState icon={<Users size={40} />} title="No active staff found."
                  subtitle="Add teachers with a monthly salary from Teachers Management." />
              </div>
            ) : (
              <DataTable
                card
                header={
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-md font-bold text-slate-900">Staff Salaries — {monthLabel}</div>
                    {monthPicker}
                  </div>
                }
              >
                <thead>
                  <tr>
                    <Th>Employee</Th>
                    <Th>Employee ID</Th>
                    <Th className="text-right">Monthly Salary</Th>
                    <Th>Status</Th>
                    <Th className="text-center">Paid</Th>
                  </tr>
                </thead>
                <tbody>
                  {salaryRows.map((row) => (
                    <Tr key={row.teacherId}>
                      <Td><strong className="text-slate-800">{row.name}</strong></Td>
                      <Td>{row.employeeId || '—'}</Td>
                      <Td className="text-right font-semibold">{rupees(row.salary)}</Td>
                      <Td>
                        <Badge variant={row.paid ? 'green' : 'amber'}>{row.paid ? 'Paid' : 'Unpaid'}</Badge>
                      </Td>
                      <Td className="text-center">
                        <div className="flex justify-center">
                          <PaidTick paid={row.paid} busy={togglingId === row.teacherId} onClick={() => toggleSalaryPaid(row)} />
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </DataTable>
            )
          )}

          {activeTab === 'variable' && (
            <div className="flex flex-col gap-4">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setShowAddExpense(true)}><Plus size={14} /> Add Expense</Button>
              </div>

              {variableExpenses.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-lg shadow-card">
                  <EmptyState icon={<FileText size={40} />} title="No variable bills recorded yet."
                    subtitle="Add ad-hoc bills like current, repairs, or supplies." />
                </div>
              ) : (
                <DataTable card>
                  <thead>
                    <tr>
                      <Th>Bill</Th>
                      <Th>Date</Th>
                      <Th>Note</Th>
                      <Th className="text-right">Amount</Th>
                      <Th>Status</Th>
                      <Th className="text-center">Paid</Th>
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {variableExpenses.map((exp) => (
                      <Tr key={exp._id}>
                        <Td><strong className="text-slate-800">{exp.title}</strong></Td>
                        <Td>{new Date(exp.date).toLocaleDateString()}</Td>
                        <Td className="text-slate-500">{exp.note || '—'}</Td>
                        <Td className="text-right font-semibold">{rupees(exp.amount)}</Td>
                        <Td>
                          <Badge variant={exp.paid ? 'green' : 'amber'}>{exp.paid ? 'Paid' : 'Unpaid'}</Badge>
                        </Td>
                        <Td className="text-center">
                          <div className="flex justify-center">
                            <PaidTick paid={exp.paid} busy={togglingId === exp._id} onClick={() => toggleExpensePaid(exp)} />
                          </div>
                        </Td>
                        <Td className="text-right">
                          <ActionButton iconOnly
                            className="text-red hover:bg-red-lt rounded p-1.5 transition-colors"
                            onClick={() => handleDeleteExpense(exp)}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </ActionButton>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={showAddExpense}
        onClose={() => setShowAddExpense(false)}
        title="Add Variable Expense"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowAddExpense(false)}>Cancel</Button>
            <Button onClick={handleAddExpense} loading={savingExpense}>Save Expense</Button>
          </div>
        }
      >
        <Form className="flex flex-col gap-4" onSubmit={handleAddExpense}>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-700">Title *</label>
            <input
              type="text"
              className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="e.g. Current Bill - August"
              value={expenseDraft.title}
              onChange={(e) => setExpenseDraft((p) => ({ ...p, title: e.target.value }))}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-700">Note</label>
            <textarea
              className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              rows={2}
              placeholder="Optional details"
              value={expenseDraft.note}
              onChange={(e) => setExpenseDraft((p) => ({ ...p, note: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-700">Date *</label>
            <input
              type="date"
              className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={expenseDraft.date}
              onChange={(e) => setExpenseDraft((p) => ({ ...p, date: e.target.value }))}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-700">Amount (₹) *</label>
            <input
              type="number"
              min={0}
              className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="e.g. 8500"
              value={expenseDraft.amount}
              onChange={(e) => setExpenseDraft((p) => ({ ...p, amount: e.target.value }))}
              required
            />
          </div>
        </Form>
      </Modal>
    </div>
  );
}
