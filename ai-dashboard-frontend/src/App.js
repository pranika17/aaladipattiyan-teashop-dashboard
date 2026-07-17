import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';

const BILLING_API = process.env.REACT_APP_DASHBOARD_API || 'http://localhost:8000/api/dashboard/live/';
const CAMERA_API = process.env.REACT_APP_CAMERA_API || BILLING_API.replace('/dashboard/live/', '/camera/live/');
// The POS integration allows 10,000 requests/day. A 30-second display refresh
// stays live while remaining safely below the documented quota.
const REFRESH_MS = 30000;

function todayInIndia() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function formatTime(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(value));
}

function cameraAge(value) {
  if (!value) return 'No camera update';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function App() {
  const isCamera = window.location.pathname.toLowerCase().startsWith('/camera');
  const apiUrl = isCamera ? CAMERA_API : BILLING_API;
  const [selectedDate, setSelectedDate] = useState(todayInIndia());
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    silent ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const response = await fetch(`${apiUrl}?date=${selectedDate}`);
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
    const timer = setInterval(() => loadDashboard({ silent: true }), REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadDashboard]);

  const sortedItems = useMemo(() => [...(snapshot?.items || [])].sort((a, b) =>
    ((b.totalQty || 0) - (a.totalQty || 0)) ||
    String(a.itemName || a.itemCode).localeCompare(String(b.itemName || b.itemCode))), [snapshot]);
  const groups = snapshot?.groups || [];
  const totalQty = groups.reduce((sum, group) => sum + group.totalQty, 0);
  const camera = snapshot?.camera;
  const latest = camera?.latest;
  const daily = camera?.daily;
  const match = snapshot?.reconciliation;
  const matchLabel = {
    matched: 'Matched', minor_difference: 'Minor difference',
    not_matched: 'Not matched', waiting_for_camera: 'Waiting for camera',
  }[match?.status] || 'Waiting for data';

  return (
    <main className="dashboard-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <section className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <span className="steam steam-one" /><span className="steam steam-two" /><span className="cup-bowl" />
          </div>
          <div><p className="eyebrow">Aaladipattiyan Urapakkam</p><h1>{isCamera ? 'AI Camera Dashboard' : 'Billing Dashboard'}</h1></div>
        </div>
        <div className="toolbar">
          <label className="date-control"><span>Date</span><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>
        </div>
      </section>

      <nav className="dashboard-nav" aria-label="Dashboard selection">
        <a className={!isCamera ? 'active' : ''} href="/billing">Billing Software</a>
        <a className={isCamera ? 'active' : ''} href="/camera">AI Camera Data</a>
      </nav>

      {error && <section className="alert" role="alert"><strong>{isCamera ? 'Camera database issue' : 'POS connection issue'}</strong><span>{error}</span></section>}

      {!isCamera && <>
        <section className="summary-grid" aria-label="Sales summary">
          <article className="summary-tile primary"><span>Total Quantity</span><strong>{loading ? '--' : totalQty}</strong><small>Items sold today</small></article>
          <article className="summary-tile"><span>Total Bills</span><strong>{loading ? '--' : snapshot?.summary?.totalBills ?? 0}</strong><small>POS bill count</small></article>
          <article className="summary-tile"><span>Outlet</span><strong>{snapshot?.outlet?.code || 'UPK'}</strong><small>{snapshot?.outlet?.name || 'Urapakkam'}</small></article>
          <article className="summary-tile"><span>Last Update</span><strong>{formatTime(snapshot?.meta?.lastUpdated)}</strong><small>Auto refresh</small></article>
        </section>
        <section className="category-grid" aria-label="Category counts">
          {groups.map((group) => <article className="category-card" key={group.key}>
            <span className={`category-symbol ${group.key}`} aria-hidden="true" />
            <div><p>{group.label}</p><span>{group.itemCount} item codes</span></div>
            <strong>{loading ? '--' : group.totalQty}</strong><small>{group.totalBills} item bill entries</small>
          </article>)}
        </section>
        <section className="match-panel" aria-label="Billing and AI camera match">
          <div className="match-heading"><div><p className="eyebrow">Billing × AI Camera</p><h2>Daily Cup Reconciliation</h2></div><span className={`match-badge ${match?.status || 'waiting_for_camera'}`}>{matchLabel}</span></div>
          <div className="match-flow">
            <article><span>Billing drink quantity</span><strong>{match?.billedDrinkQty ?? '--'}</strong><small>All configured drink categories</small></article>
            <article><span>AI cumulative cups</span><strong>{match?.cameraCupTotal ?? '--'}</strong><small>Latest Neon total for today</small></article>
            <article><span>Difference</span><strong>{match?.difference ?? '--'}</strong><small>AI minus billing</small></article>
            <article className="camera-health"><span>Match rate</span><strong>{match?.matchRate != null ? `${match.matchRate}%` : '--'}</strong><small>98% or above is matched</small></article>
          </div>
          <p className="match-note">Both totals use outlet <strong>{snapshot?.outlet?.code || 'UPK'}</strong>, date <strong>{snapshot?.date || selectedDate}</strong> and India time.</p>
        </section>
        <section className="content-grid single"><article className="panel">
          <div className="panel-heading"><div><h2>Item Wise Count</h2><p>{snapshot?.meta?.itemCodesRequested || 0} POS item codes · updated {formatTime(snapshot?.meta?.lastUpdated)}</p></div><span className={refreshing ? 'status-dot active' : 'status-dot'} /></div>
          <div className="table-wrap"><table><thead><tr><th>Code</th><th>Item</th><th>Category</th><th>Status</th><th>Qty</th><th>Bills</th></tr></thead><tbody>
            {sortedItems.map((item) => {
              const status = !item.foundInPOS ? 'Code not found' : item.hadSalesToday ? 'Sold' : 'No sales';
              return <tr key={`${item.itemCode}-${item.itemName}`}><td>{item.itemCode}</td><td>{item.itemName || 'Name not returned'}</td><td>{item.category || item.localCategory || 'Not mapped'}</td><td><span className={`item-status ${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span></td><td>{item.totalQty || 0}</td><td>{item.totalBills || 0}</td></tr>;
            })}
            {!loading && sortedItems.length === 0 && <tr><td colSpan="6" className="empty-state">No POS item rows returned for this date.</td></tr>}
          </tbody></table></div>
        </article></section>
      </>}

      {isCamera && <>
        <section className="summary-grid" aria-label="Camera summary">
          <article className="summary-tile primary"><span>Snapshots Today</span><strong>{daily?.sampleCount ?? 0}</strong><small>Neon camera rows received</small></article>
          <article className="summary-tile"><span>AI Cups Today</span><strong>{latest?.cupCount ?? '--'}</strong><small>Latest cumulative count</small></article>
          <article className="summary-tile"><span>Peak Staff</span><strong>{daily?.maxStaff ?? '--'}</strong><small>Highest detection today</small></article>
          <article className="summary-tile"><span>Last Update</span><strong>{formatTime(latest?.capturedAt)}</strong><small>{cameraAge(latest?.capturedAt)}</small></article>
        </section>
        <section className="camera-panel" aria-label="Live camera counts">
          <div className="camera-heading"><div><p className="eyebrow">AI Camera</p><h2>Latest Outlet Snapshot</h2></div><div className="camera-status"><span className={latest ? 'status-dot' : 'status-dot offline'} />{latest ? `Live · ${cameraAge(latest.capturedAt)}` : (camera?.message || 'Waiting for data')}</div></div>
          <div className="camera-grid">
            <article className="camera-tile"><span>Cumulative Cups</span><strong>{latest?.cupCount ?? '--'}</strong><small>AI total for selected date</small></article>
            <article className="camera-tile"><span>Staff</span><strong>{latest?.staffCount ?? '--'}</strong><small>Currently detected</small></article>
            <article className="camera-tile"><span>Customers</span><strong>{latest?.customerCount ?? '--'}</strong><small>Currently detected</small></article>
            <article className="camera-tile"><span>Empty</span><strong>{latest?.emptyCount ?? '--'}</strong><small>Latest camera value</small></article>
          </div>
        </section>
      </>}
    </main>
  );
}

export default App;
