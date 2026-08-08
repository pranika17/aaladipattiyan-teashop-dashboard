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

function formatTime(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(value));
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

function App() {
  const isCamera = window.location.pathname.toLowerCase().startsWith('/camera');
  const apiUrl = isCamera ? CAMERA_API : BILLING_API;
  const refreshMs = isCamera ? CAMERA_REFRESH_MS : BILLING_REFRESH_MS;
  const [selectedDate, setSelectedDate] = useState(todayInIndia());
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [cameraBilling, setCameraBilling] = useState(null);

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

  const loadCameraBilling = useCallback(async () => {
    if (!isCamera) return;
    try {
      const response = await fetch(`${BILLING_API}?date=${selectedDate}`, { cache: 'no-store' });
      const data = await response.json();
      if (response.ok) setCameraBilling(data);
    } catch (_) {
      // The camera remains usable when the separate POS service is unavailable.
    }
  }, [isCamera, selectedDate]);

  useEffect(() => {
    if (!isCamera) return undefined;
    loadCameraBilling();
    const timer = setInterval(loadCameraBilling, BILLING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [isCamera, loadCameraBilling]);

  const sortedItems = useMemo(() => [...(snapshot?.items || [])].sort((a, b) =>
    ((b.totalQty || 0) - (a.totalQty || 0)) ||
    String(a.itemName || a.itemCode).localeCompare(String(b.itemName || b.itemCode))), [snapshot]);
  const groups = snapshot?.groups || [];
  const drinkQty = groups
    .filter((group) => group.key !== 'biscuits')
    .reduce((sum, group) => sum + group.totalQty, 0);
  const camera = snapshot?.camera;
  const latest = camera?.latest;
  const daily = camera?.daily;
  const cameraStale = isCameraStale(latest?.capturedAt);
  const match = snapshot?.reconciliation;
  const cameraPageMatch = cameraBilling?.reconciliation;
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
        <section className="section-intro" aria-labelledby="billing-totals-title">
          <div><p className="eyebrow">Selected date</p><h2 id="billing-totals-title">Billing totals for the day</h2></div>
          <p><strong>Quantity</strong> means items sold. <strong>Bills</strong> means customer receipts. One bill can contain several drinks or products.</p>
        </section>
        <section className="summary-grid" aria-label="Sales summary">
          <article className="summary-tile primary"><span>Drinks sold today</span><strong>{loading ? '--' : drinkQty}</strong><small>Cups/items billed; biscuits not included</small></article>
          <article className="summary-tile"><span>Customer bills today</span><strong>{loading ? '--' : snapshot?.summary?.totalBills ?? 0}</strong><small>Number of receipts, not number of items</small></article>
          <article className="summary-tile"><span>Outlet</span><strong>{snapshot?.outlet?.code || 'UPK'}</strong><small>{snapshot?.outlet?.name || 'Urapakkam'}</small></article>
          <article className="summary-tile"><span>Last Update</span><strong>{formatTime(snapshot?.meta?.lastUpdated)}</strong><small>Auto refresh</small></article>
        </section>
        <section className="category-grid" aria-label="Category counts">
          {groups.map((group) => <article className="category-card" key={group.key}>
            <span className={`category-symbol ${group.key}`} aria-hidden="true" />
            <div><p>{group.label}</p><span>{group.itemCount} item codes</span></div>
            <strong>{loading ? '--' : group.totalQty}</strong><small>items sold across {group.totalBills} bills</small>
          </article>)}
        </section>
        <section className="match-panel" aria-label="Billing and AI camera match">
          <div className="match-heading"><div><p className="eyebrow">Billing vs AI camera</p><h2>Are all drinks billed?</h2><p className="heading-help">This compares only two day totals. It does not add them together.</p></div><span className={`match-badge ${match?.status || 'waiting_for_camera'}`}>{matchLabel}</span></div>
          <div className="match-flow">
            <article><span>1. Drinks billed</span><strong>{match?.billedDrinkQty ?? '--'}</strong><small>Total drink quantity in the POS today</small></article>
            <article><span>2. Cups counted by AI</span><strong>{match?.cameraCupTotal ?? '--'}</strong><small>Camera's running cup total today</small></article>
            <article><span>3. Difference</span><strong>{match?.absoluteDifference ?? '--'}</strong><small>{differenceLabel}</small></article>
            <article className="camera-health"><span>How closely they agree</span><strong>{match?.matchRate != null ? `${match.matchRate}%` : '--'}</strong><small>100% means both totals are equal</small></article>
          </div>
          <p className="match-note">{match?.message} Both totals use outlet <strong>{snapshot?.outlet?.code || 'UPK'}</strong>, date <strong>{snapshot?.date || selectedDate}</strong> and India time.</p>
        </section>
        <section className="content-grid single"><article className="panel">
          <div className="panel-heading"><div><h2>Sales by item</h2><p>{snapshot?.meta?.itemCodesRequested || 0} POS item codes · updated {formatTime(snapshot?.meta?.lastUpdated)}</p></div><span className={refreshing ? 'status-dot active' : 'status-dot'} /></div>
          <div className="table-wrap"><table><thead><tr><th>Code</th><th>Item</th><th>Category</th><th>Status</th><th>Items sold</th><th>Bills containing item</th></tr></thead><tbody>
            {sortedItems.map((item) => {
              const status = !item.foundInPOS ? 'Not in POS master' : item.hadSalesToday ? 'Sold' : 'No sales';
              return <tr key={`${item.itemCode}-${item.itemName}`}><td>{item.itemCode}</td><td>{item.itemName || 'Name not returned'}</td><td>{item.category || item.localCategory || 'Not mapped'}</td><td><span className={`item-status ${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span></td><td>{item.totalQty || 0}</td><td>{item.totalBills || 0}</td></tr>;
            })}
            {!loading && sortedItems.length === 0 && <tr><td colSpan="6" className="empty-state">No POS item rows returned for this date.</td></tr>}
          </tbody></table></div>
        </article></section>
      </>}

      {isCamera && <>
        <section className="section-intro" aria-labelledby="camera-totals-title">
          <div><p className="eyebrow">How to read this page</p><h2 id="camera-totals-title">Today’s total and the current view</h2></div>
          <p><strong>Cups today</strong> is a running day total. Staff, customers and empty positions are only what the latest camera snapshot sees right now.</p>
        </section>
        <section className="match-panel" aria-label="Billing and AI camera cup totals">
          <div className="match-heading"><div><p className="eyebrow">Today’s cup totals</p><h2>Billing and AI camera</h2><p className="heading-help">These are compared with each other; they are not added together.</p></div><span className={`match-badge ${cameraPageMatch?.status || 'waiting_for_camera'}`}>{cameraPageMatch ? ({ matched: 'Exact match', not_matched: 'Mismatch detected', incomplete_billing: 'Billing data incomplete', not_comparable: 'Cannot compare', waiting_for_camera: 'Waiting for camera' }[cameraPageMatch.status] || 'Waiting for data') : 'Loading billing'}</span></div>
          <div className="match-flow camera-total-flow">
            <article><span>Billing cup count</span><strong>{cameraPageMatch?.billedDrinkQty ?? '--'}</strong><small>Drink quantity recorded in the billing software</small></article>
            <article><span>AI camera cup count</span><strong>{latest?.cupCount ?? '--'}</strong><small>Running cup total detected by the camera</small></article>
            <article className="camera-health"><span>Difference</span><strong>{cameraPageMatch?.absoluteDifference ?? '--'}</strong><small>{cameraPageMatch?.differenceDirection === 'camera_over' ? 'More seen than billed' : cameraPageMatch?.differenceDirection === 'camera_under' ? 'Fewer seen than billed' : cameraPageMatch?.differenceDirection === 'equal' ? 'Both totals are equal' : 'Waiting for both totals'}</small></article>
          </div>
        </section>
        <section className="summary-grid" aria-label="Camera summary">
          <article className="summary-tile primary"><span>Cups counted today</span><strong>{latest?.cupCount ?? '--'}</strong><small>Running total; do not add snapshots</small></article>
          <article className="summary-tile"><span>Camera updates today</span><strong>{daily?.sampleCount ?? 0}</strong><small>Number of readings received, not cups</small></article>
          <article className="summary-tile"><span>Most staff seen at once</span><strong>{daily?.maxStaff ?? '--'}</strong><small>Highest staff count in one snapshot</small></article>
          <article className="summary-tile"><span>Last Update (IST)</span><strong>{formatTime(latest?.capturedAt)}</strong><small>{cameraAge(latest?.capturedAt)}</small></article>
        </section>
        <section className="camera-panel" aria-label="Live camera counts">
          <div className="camera-heading"><div><p className="eyebrow">Current view — not day totals</p><h2>What the camera sees now</h2></div><div className="camera-status"><span className={latest && !cameraStale ? 'status-dot' : 'status-dot offline'} />{latest ? `${cameraStale ? 'Stale' : 'Live'} · ${cameraAge(latest.capturedAt)}` : (camera?.message || 'Waiting for data')}</div></div>
          <div className="camera-grid">
            <article className="camera-tile"><span>Running cups total</span><strong>{latest?.cupCount ?? '--'}</strong><small>All cups counted since the day began</small></article>
            <article className="camera-tile"><span>Staff now</span><strong>{latest?.staffCount ?? '--'}</strong><small>People detected in the latest view</small></article>
            <article className="camera-tile"><span>Customers now</span><strong>{latest?.customerCount ?? '--'}</strong><small>People detected in the latest view</small></article>
            <article className="camera-tile"><span>Empty positions now</span><strong>{latest?.emptyCount ?? '--'}</strong><small>Empty detections in the latest view</small></article>
          </div>
        </section>
      </>}
    </main>
  );
}

export default App;
