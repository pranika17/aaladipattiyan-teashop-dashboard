import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';

const BILLING_API = process.env.REACT_APP_DASHBOARD_API || 'http://localhost:8000/api/dashboard/live/';
const CAMERA_API = process.env.REACT_APP_CAMERA_API || BILLING_API.replace('/dashboard/live/', '/camera/live/');
// The POS integration allows 10,000 requests/day. A 30-second display refresh
// stays live while remaining safely below the documented quota.
const BILLING_REFRESH_MS = 30000;
const CAMERA_REFRESH_MS = 5000;
const CAMERA_STALE_MS = 30000;

function todayInIndia() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function isCameraStale(value) {
  if (!value) return true;
  return Date.now() - new Date(value).getTime() > CAMERA_STALE_MS;
}

function cameraAge(value) {
  if (!value) return 'No camera update';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function simpleCategory(item) {
  const category = String(item.category || item.localCategory || '').toLowerCase();
  if (category.includes('tea') && !category.includes('coffee')) return 'Tea';
  if (category.includes('coffee') && !category.includes('tea')) return 'Coffee';
  if (category.includes('milk') || category.includes('kadusu') || category.includes('beverage')) return 'Beverage';
  return 'Other';
}

function App() {
  const pathname = window.location.pathname.toLowerCase();
  const isCamera = pathname.startsWith('/camera');
  const isComparison = pathname.startsWith('/compare');
  const isBilling = !isCamera && !isComparison;
  const apiUrl = isCamera ? CAMERA_API : BILLING_API;
  const refreshMs = isCamera ? CAMERA_REFRESH_MS : BILLING_REFRESH_MS;
  const [selectedDate, setSelectedDate] = useState(todayInIndia());
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    silent ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const response = await fetch(`${apiUrl}?date=${selectedDate}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Dashboard API failed');
      setSnapshot(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiUrl, selectedDate]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => {
    const timer = setInterval(() => loadDashboard({ silent: true }), refreshMs);
    return () => clearInterval(timer);
  }, [loadDashboard, refreshMs]);

  const groups = snapshot?.groups || [];
  const sortedItems = useMemo(() => [...(snapshot?.items || [])].sort((a, b) =>
    simpleCategory(a).localeCompare(simpleCategory(b)) ||
    String(a.itemName || a.itemCode).localeCompare(String(b.itemName || b.itemCode))), [snapshot]);
  const drinkGroups = groups.filter((group) => group.key !== 'biscuits');
  const drinkQty = groups
    .filter((group) => group.key !== 'biscuits')
    .reduce((sum, group) => sum + group.totalQty, 0);
  const camera = snapshot?.camera;
  const latest = camera?.latest;
  const cameraStale = isCameraStale(latest?.capturedAt);
  const match = snapshot?.reconciliation;
  const matchLabel = {
    matched: 'Exact match', not_matched: 'Mismatch detected',
    not_comparable: 'Cannot compare', waiting_for_camera: 'Waiting for camera',
  }[match?.status] || 'Waiting for data';
  const differenceLabel = {
    camera_over: 'More seen than billed', camera_under: 'Fewer seen than billed', equal: 'No difference',
  }[match?.differenceDirection] || 'Not available';

  return (
    <main className="dashboard-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <section className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <span className="steam steam-one" /><span className="steam steam-two" /><span className="cup-bowl" />
          </div>
          <div><p className="eyebrow">Aaladipattiyan Urapakkam</p><h1>{isCamera ? 'AI Camera Dashboard' : isComparison ? 'Cup Mismatch Dashboard' : 'Billing Dashboard'}</h1></div>
        </div>
        <div className="toolbar">
          <label className="date-control"><span>Date</span><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>
        </div>
      </section>

      <nav className="dashboard-nav" aria-label="Dashboard selection">
        <a className={isBilling ? 'active' : ''} href="/billing">Billing</a>
        <a className={isCamera ? 'active' : ''} href="/camera">AI Camera Data</a>
        <a className={isComparison ? 'active' : ''} href="/compare">Cup Mismatch</a>
      </nav>

      {error && <section className="alert" role="alert"><strong>{isCamera ? 'Camera database issue' : 'POS connection issue'}</strong><span>{error}</span></section>}

      {isBilling && <>
        <section className="summary-grid" aria-label="Sales summary">
          <article className="summary-tile primary"><span>Total cups</span><strong>{loading ? '--' : drinkQty}</strong><small>All billed drink items</small></article>
          <article className="summary-tile"><span>Total bills</span><strong>{loading ? '--' : snapshot?.summary?.totalBills ?? 0}</strong><small>Customer receipts</small></article>
        </section>
        <section className="category-grid" aria-label="Category counts">
          {drinkGroups.map((group) => <article className="category-card" key={group.key}>
            <span className={`category-symbol ${group.key}`} aria-hidden="true" />
            <div><p>{group.label}</p><span>{group.itemCount} item codes</span></div>
            <strong>{loading ? '--' : group.totalQty}</strong><small>items sold across {group.totalBills} bills</small>
          </article>)}
        </section>
        <section className="content-grid single"><article className="panel">
          <div className="panel-heading"><div><h2>Billing Item List</h2><p>Tea, coffee, beverages and other billed products</p></div></div>
          <div className="table-wrap"><table><thead><tr><th>Item</th><th>Category</th><th>Item code</th><th>Quantity</th><th>Bills</th></tr></thead><tbody>
            {sortedItems.map((item) => <tr key={`${item.itemCode}-${item.itemName}`}>
              <td>{item.itemName || 'Name not returned'}</td>
              <td><span className={`item-status category-${simpleCategory(item).toLowerCase()}`}>{simpleCategory(item)}</span></td>
              <td>{item.itemCode}</td><td>{item.totalQty || 0}</td><td>{item.totalBills || 0}</td>
            </tr>)}
            {!loading && sortedItems.length === 0 && <tr><td colSpan="5" className="empty-state">No billing items returned for this date.</td></tr>}
          </tbody></table></div>
        </article></section>
      </>}

      {isCamera && <>
        <section className="camera-panel" aria-label="Live camera counts">
          <div className="camera-heading"><div><p className="eyebrow">AI camera counts</p><h2>Camera Data</h2></div><div className="camera-status"><span className={latest && !cameraStale ? 'status-dot' : 'status-dot offline'} />{latest ? `${cameraStale ? 'Stale' : 'Live'} · ${cameraAge(latest.capturedAt)}` : (camera?.message || 'Waiting for data')}</div></div>
          <div className="camera-grid">
            <article className="camera-tile"><span>Total AI cup count</span><strong>{latest?.cupCount ?? '--'}</strong></article>
            <article className="camera-tile"><span>Staff count</span><strong>{latest?.staffCount ?? '--'}</strong></article>
            <article className="camera-tile"><span>Customer count</span><strong>{latest?.customerCount ?? '--'}</strong></article>
            <article className="camera-tile"><span>Empty count</span><strong>{latest?.emptyCount ?? '--'}</strong></article>
          </div>
        </section>
      </>}

      {isComparison && <section className="match-panel" aria-label="Billing and AI camera mismatch">
        <div className="match-heading"><div><p className="eyebrow">Billing vs AI camera</p><h2>Cup Count Difference</h2></div><span className={`match-badge ${match?.status || 'waiting_for_camera'}`}>{matchLabel}</span></div>
        <div className="match-flow">
          <article><span>Billing cup count</span><strong>{match?.billedDrinkQty ?? '--'}</strong></article>
          <article><span>AI camera cup count</span><strong>{match?.cameraCupTotal ?? '--'}</strong></article>
          <article className="camera-health"><span>Difference</span><strong>{match?.absoluteDifference ?? '--'}</strong><small>{differenceLabel}</small></article>
        </div>
        {match?.message && <p className="match-note">{match.message}</p>}
      </section>}
    </main>
  );
}

export default App;
