import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Wallet, FileText, Check, Plus, Trash2,
  IndianRupee, Users, TrendingUp, TrendingDown, AlertCircle
} from 'lucide-react';
import { Button, PageHeader, Badge, DataTable, Th, Td, Tr, EmptyState, LoadingSpinner, Modal, KpiCard } from '../../ui';
import { API_BASE } from '../../../constants';

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

const currentMonth = () => new Date().toISOString().slice(0, 7); // 'YYYY-MM'
const today = () => new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
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
      className={`w-6 h-6 rounded flex items-center justify-center border-2 transition-colors disabled:opacity-50 ${
        paid ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-slate-300 hover:border-slate-400'
      }`}
    >
      {paid && <Check size={14} strokeWidth={3} />}
    </button>
  );

  const TrendChart = ({ data }: { data: TrendPoint[] }) => {
    const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
    const maxVal = Math.max(...data.map((d) => Math.max(d.income, d.salaryPaid, d.variablePaid)), 1);
    const chartW = 500;
    const chartH = 220;
    const baseline = 190;
    const barGroupW = chartW / data.length;
    const barW = 13;
    const gap = 4;
    const groupStart = (barGroupW - (barW * 3 + gap * 2)) / 2;

    return (
      <div className="relative">
        <svg viewBox={`0 0 ${chartW} ${chartH + 30}`} className="w-full h-auto">
          <line x1="30" y1={baseline} x2={chartW - 10} y2={baseline} stroke="#e2e8f0" strokeWidth="1.5" />
          {data.map((d, idx) => {
            const groupX = 30 + idx * barGroupW + groupStart;
            const incomeH = (d.income / maxVal) * (baseline - 20);
            const salaryH = (d.salaryPaid / maxVal) * (baseline - 20);
            const varH = (d.variablePaid / maxVal) * (baseline - 20);
            return (
              <g key={d.month}>
                <rect
                  x={groupX} y={baseline - incomeH} width={barW} height={incomeH} rx="2" fill="#16a34a"
                  onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY, text: `Income: ${rupees(d.income)}` })}
                  onMouseLeave={() => setHover(null)}
                />
                <rect
                  x={groupX + barW + gap} y={baseline - salaryH} width={barW} height={salaryH} rx="2" fill="#2563eb"
                  onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY, text: `Salaries Paid: ${rupees(d.salaryPaid)}` })}
                  onMouseLeave={() => setHover(null)}
                />
                <rect
                  x={groupX + (barW + gap) * 2} y={baseline - varH} width={barW} height={varH} rx="2" fill="#f59e0b"
                  onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY, text: `Variable Paid: ${rupees(d.variablePaid)}` })}
                  onMouseLeave={() => setHover(null)}
                />
                <text x={30 + idx * barGroupW + barGroupW / 2} y={baseline + 16} textAnchor="middle" fontSize="10" fontWeight="600" fill="#64748b">
                  {d.monthLabel.split(' ')[0]}
                </text>
                <text
                  x={30 + idx * barGroupW + barGroupW / 2} y={baseline + 30} textAnchor="middle" fontSize="9.5" fontWeight="700"
                  fill={d.netProfit >= 0 ? '#16a34a' : '#dc2626'}
                >
                  {d.netProfit >= 0 ? '+' : '−'}{rupees(Math.abs(d.netProfit)).replace('₹', '')}
                </text>
              </g>
            );
          })}
        </svg>
        {hover && (
          <div
            className="fixed z-50 bg-slate-900 text-white text-xs font-semibold rounded px-2 py-1 pointer-events-none"
            style={{ left: hover.x + 12, top: hover.y - 28 }}
          >
            {hover.text}
          </div>
        )}
        <div className="flex gap-4 justify-center text-xs font-semibold mt-1 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green" /> Income</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue" /> Salaries Paid</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber" /> Variable Bills Paid</span>
          <span className="text-slate-400 font-normal">(net profit shown below each month)</span>
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
      className="border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
    />
  );

  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900">
      <PageHeader title="Expenditure" subtitle="Staff salaries and variable bills." />

      <div className="flex items-center gap-2 border-b border-slate-200">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              activeTab === key
                ? 'border-blue text-blue'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner fullPage />
      ) : (
        <>
          {activeTab === 'dashboard' && summary && (
            <div className="flex flex-col gap-5">
              <div className="flex justify-end">{monthPicker}</div>

              {(summary.salary.totalCount - summary.salary.paidCount > 0 || summary.variable.count > 0 && summary.variable.pending > 0) && (
                <div className="flex flex-col gap-2">
                  {summary.salary.totalCount - summary.salary.paidCount > 0 && (
                    <div className="flex items-center gap-2 bg-amber-lt border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5 text-sm font-semibold">
                      <AlertCircle size={16} className="flex-shrink-0" />
                      {summary.salary.totalCount - summary.salary.paidCount} of {summary.salary.totalCount} staff still unpaid for {monthLabel}.
                    </div>
                  )}
                  {summary.variable.pending > 0 && (
                    <div className="flex items-center gap-2 bg-amber-lt border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5 text-sm font-semibold">
                      <AlertCircle size={16} className="flex-shrink-0" />
                      {variableExpenses.filter((e) => !e.paid).length} variable bill(s) pending — {rupees(summary.variable.pending)} outstanding.
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <KpiCard
                  label={`School Income — ${monthLabel}`}
                  value={rupees(summary.income)}
                  subtext="Fees collected this month"
                  icon={<IndianRupee size={16} />} iconBg="bg-green-lt" iconColor="text-green" valueColor="text-green"
                />
                <KpiCard
                  label={`Total Paid Out — ${monthLabel}`}
                  value={rupees(summary.combinedOutflowPaid)}
                  subtext="Salaries + variable bills paid"
                  icon={<Wallet size={16} />} iconBg="bg-blue-lt" iconColor="text-blue"
                />
                <KpiCard
                  label={`Net Profit — ${monthLabel}`}
                  value={`${summary.netProfit >= 0 ? '' : '−'}${rupees(Math.abs(summary.netProfit))}`}
                  subtext="Income minus amount paid out"
                  icon={summary.netProfit >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  iconBg={summary.netProfit >= 0 ? 'bg-green-lt' : 'bg-red-lt'}
                  iconColor={summary.netProfit >= 0 ? 'text-green' : 'text-red'}
                  valueColor={summary.netProfit >= 0 ? 'text-green' : 'text-red'}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <KpiCard
                  label="Monthly Salary Bill"
                  value={rupees(summary.salary.total)}
                  subtext={`${summary.salary.paidCount} of ${summary.salary.totalCount} staff paid`}
                  icon={<Wallet size={16} />} iconBg="bg-blue-lt" iconColor="text-blue"
                />
                <KpiCard
                  label="Salaries Paid"
                  value={rupees(summary.salary.paid)}
                  icon={<TrendingUp size={16} />} iconBg="bg-green-lt" iconColor="text-green" valueColor="text-green"
                />
                <KpiCard
                  label="Salaries Pending"
                  value={rupees(summary.salary.pending)}
                  icon={<TrendingDown size={16} />} iconBg="bg-red-lt" iconColor="text-red" valueColor="text-red"
                />
                <KpiCard
                  label="Variable Bills Total"
                  value={rupees(summary.variable.total)}
                  subtext={`${summary.variable.count} bill(s) logged`}
                  icon={<FileText size={16} />} iconBg="bg-amber-lt" iconColor="text-amber"
                />
                <KpiCard
                  label="Variable Paid"
                  value={rupees(summary.variable.paid)}
                  icon={<TrendingUp size={16} />} iconBg="bg-green-lt" iconColor="text-green" valueColor="text-green"
                />
                <KpiCard
                  label="Variable Pending"
                  value={rupees(summary.variable.pending)}
                  icon={<TrendingDown size={16} />} iconBg="bg-red-lt" iconColor="text-red" valueColor="text-red"
                />
              </div>

              {trends.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg shadow-card p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 size={18} className="text-blue" />
                    <span className="text-md font-bold text-slate-900">Monthly Payout Trend (Last 6 Months)</span>
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
                          <button
                            className="text-red hover:bg-red-lt rounded p-1.5 transition-colors"
                            onClick={() => handleDeleteExpense(exp)}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
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
        <form className="flex flex-col gap-4" onSubmit={handleAddExpense}>
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
        </form>
      </Modal>
    </div>
  );
}
