import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';

const API_URL = process.env.REACT_APP_DASHBOARD_API || 'http://localhost:8000/api/dashboard/live/';
const REFRESH_MS = 5000;

function todayInIndia() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatTime(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function App() {
  const [selectedDate, setSelectedDate] = useState(todayInIndia());
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const response = await fetch(`${API_URL}?date=${selectedDate}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Dashboard API failed');
      }

      setSnapshot(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadDashboard({ silent: true });
    }, REFRESH_MS);

    return () => clearInterval(timer);
  }, [loadDashboard]);

  const sortedItems = useMemo(() => {
    if (!snapshot?.items) return [];
    return [...snapshot.items].sort((a, b) => {
      const qtyDiff = (b.totalQty || 0) - (a.totalQty || 0);
      return qtyDiff || String(a.itemName || a.itemCode).localeCompare(String(b.itemName || b.itemCode));
    });
  }, [snapshot]);

  const topGroups = snapshot?.groups || [];
  const totalQty = topGroups.reduce((sum, group) => sum + group.totalQty, 0);

  return (
    <main className="dashboard-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <section className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <span className="steam steam-one" />
            <span className="steam steam-two" />
            <span className="cup-bowl" />
          </div>
          <div>
            <p className="eyebrow">Aaladipattiyan Urapakkam</p>
            <h1>AI Tea Shop Count Dashboard</h1>
          </div>
        </div>

        <div className="toolbar">
          <label className="date-control">
            <span>Date</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>
        </div>
      </section>

      {error && (
        <section className="alert" role="alert">
          <strong>POS connection issue</strong>
          <span>{error}</span>
        </section>
      )}

      <section className="summary-grid" aria-label="Sales summary">
        <article className="summary-tile primary">
          <span>Total Quantity</span>
          <strong>{loading ? '--' : totalQty}</strong>
          <small>Items sold today</small>
        </article>
        <article className="summary-tile">
          <span>Total Bills</span>
          <strong>{loading ? '--' : snapshot?.summary?.totalBills ?? 0}</strong>
          <small>POS bill count</small>
        </article>
        <article className="summary-tile">
          <span>Outlet</span>
          <strong>{snapshot?.outlet?.code || 'UPK'}</strong>
          <small>{snapshot?.outlet?.name || 'Urapakkam'}</small>
        </article>
        <article className="summary-tile">
          <span>Last Update</span>
          <strong>{formatTime(snapshot?.meta?.lastUpdated)}</strong>
          <small>Auto refresh</small>
        </article>
      </section>

      <section className="category-grid" aria-label="Category counts">
        {topGroups.map((group) => (
          <article className="category-card" key={group.key}>
            <span className={`category-symbol ${group.key}`} aria-hidden="true" />
            <div>
              <p>{group.label}</p>
              <span>{group.itemCount} item codes</span>
            </div>
            <strong>{loading ? '--' : group.totalQty}</strong>
            <small>{group.totalBills} item bill entries</small>
          </article>
        ))}
      </section>

      <section className="content-grid single">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Item Wise Count</h2>
              <p>{snapshot?.meta?.itemCodesRequested || 0} POS item codes requested</p>
            </div>
            <span className={refreshing ? 'status-dot active' : 'status-dot'} />
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Qty</th>
                  <th>Bills</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => (
                  <tr key={`${item.itemCode}-${item.itemName}`}>
                    <td>{item.itemCode}</td>
                    <td>{item.itemName || 'Name not returned'}</td>
                    <td>{item.category || item.localCategory || 'Not mapped'}</td>
                    <td>{item.totalQty || 0}</td>
                    <td>{item.totalBills || 0}</td>
                  </tr>
                ))}
                {!loading && sortedItems.length === 0 && (
                  <tr>
                    <td colSpan="5" className="empty-state">No POS item rows returned for this date.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}

export default App;
