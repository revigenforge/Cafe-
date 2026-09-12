import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import { Empty, ErrorBox, useToast } from '../components/ui.jsx';

/**
 * Upload → map → preview → import. Nothing is written until the mapping
 * is confirmed, so a wrong guess costs nothing. The result separates
 * imported, duplicate and invalid rows rather than reporting one number.
 */
export default function ImportLeads() {
  const { users, sources } = useApp();
  const { success, error: toastError } = useToast();
  const fileRef = useRef(null);

  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [mapping, setMapping] = useState({});
  const [owner, setOwner] = useState('');
  const [sourceId, setSourceId] = useState(sources.find((s) => s.name === 'CSV Import')?.id ?? '');
  const [skipDupes, setSkipDupes] = useState(true);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const readFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setCsv(text);
    await analyze(text);
  };

  const analyze = async (text) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.importCsv.analyze(text);
      setAnalysis(r);
      setMapping(r.suggested_mapping);
    } catch (err) {
      setError(err.message);
      setAnalysis(null);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.importCsv.commit({
        csv,
        mapping,
        owner_id: owner || null,
        source_id: sourceId || null,
        skip_duplicates: String(skipDupes),
      });
      setResult(r);
      if (r.imported > 0) success(`${r.imported} lead${r.imported === 1 ? '' : 's'} imported`);
      else toastError('Nothing was imported — check the report below');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setCsv('');
    setFileName('');
    setAnalysis(null);
    setMapping({});
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const mappedFields = Object.values(mapping).filter(Boolean);
  const hasName = mappedFields.includes('business_name');

  return (
    <>
      <header className="topbar" style={{ borderTop: 0 }}>
        <div>
          <h1>Import leads</h1>
          <div className="topbar__sub">Generate a CSV with Claude, then bring it in here</div>
        </div>
        <span className="topbar__spacer" />
        {(analysis || result) && <button className="btn" onClick={reset}>Start over</button>}
      </header>

      <div className="page">
        {error && <div className="mb"><ErrorBox error={error} /></div>}

        {/* ── step 1 ── */}
        {!analysis && !result && (
          <div className="panel">
            <div className="panel__head"><h2>1 · Choose a file</h2></div>
            <div className="panel__body">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="input"
                onChange={(e) => readFile(e.target.files?.[0])}
                disabled={busy}
              />
              <p className="muted small mt">
                The first row must be column headings. Common names — Company, Business Name, Mobile,
                Phone, Email, City, State, Business Type — are recognised automatically; anything else
                you map by hand in the next step.
              </p>

              <details style={{ marginTop: 14 }}>
                <summary className="small" style={{ cursor: 'pointer' }}>Or paste CSV text</summary>
                <textarea
                  className="textarea"
                  style={{ marginTop: 8, minHeight: 130, fontFamily: 'var(--mono)', fontSize: 12 }}
                  placeholder={'Company,Contact,Mobile,City\nIron Forge Gym,Rahul,+91 90000 00001,Bangalore'}
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                />
                <button className="btn btn--primary mt" onClick={() => analyze(csv)} disabled={!csv.trim() || busy}>
                  {busy && <span className="spinner" />} Read this CSV
                </button>
              </details>
            </div>
          </div>
        )}

        {/* ── step 2 ── */}
        {analysis && !result && (
          <>
            <div className="panel mb">
              <div className="panel__head">
                <h2>2 · Match the columns</h2>
                <span className="spacer" />
                <span className="muted small">{fileName} · {analysis.total_rows} row{analysis.total_rows === 1 ? '' : 's'}</span>
              </div>
              <div className="panel__body">
                {!hasName && (
                  <div className="errbox mb">
                    Map one column to <strong>Business name</strong> — a lead cannot be created without it.
                  </div>
                )}

                <div className="tablewrap">
                  <table className="data">
                    <thead>
                      <tr><th>Column in your file</th><th>First value</th><th>Import as</th></tr>
                    </thead>
                    <tbody>
                      {analysis.headers.map((h, i) => (
                        <tr key={i}>
                          <td className="cell-main">{h || <span className="muted">(no heading)</span>}</td>
                          <td className="muted truncate">{analysis.preview[0]?.[i] || '—'}</td>
                          <td>
                            <select
                              className="select"
                              style={{ width: 'auto', minWidth: 170 }}
                              value={mapping[i] ?? ''}
                              onChange={(e) => setMapping((m) => ({ ...m, [i]: e.target.value || undefined }))}
                            >
                              <option value="">— skip this column —</option>
                              {analysis.importable_fields.map((f) => (
                                <option
                                  key={f}
                                  value={f}
                                  disabled={mappedFields.includes(f) && mapping[i] !== f}
                                >
                                  {f.replace(/_/g, ' ')}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="panel mb">
              <div className="panel__head"><h2>3 · Preview</h2></div>
              <div className="tablewrap">
                <table className="data">
                  <thead>
                    <tr>
                      {analysis.headers.map((h, i) => (
                        <th key={i} style={mapping[i] ? undefined : { opacity: .4 }}>
                          {mapping[i] ? mapping[i].replace(/_/g, ' ') : `${h} (skipped)`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.preview.map((row, r) => (
                      <tr key={r}>
                        {analysis.headers.map((_, i) => (
                          <td key={i} className="truncate" style={mapping[i] ? undefined : { opacity: .4 }}>
                            {row[i] || <span className="muted">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {analysis.total_rows > analysis.preview.length && (
                <div className="pager"><span className="muted small">Showing the first {analysis.preview.length} of {analysis.total_rows} rows</span></div>
              )}
            </div>

            <div className="panel">
              <div className="panel__head"><h2>4 · Import</h2></div>
              <div className="panel__body">
                <div className="formgrid mb">
                  <div className="field">
                    <label>Assign these leads to</label>
                    <select className="select" value={owner} onChange={(e) => setOwner(e.target.value)}>
                      <option value="">Leave unassigned</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Source</label>
                    <select className="select" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                      <option value="">Unknown</option>
                      {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <span className="hint">A Source column in the file overrides this per row</span>
                  </div>
                </div>

                <label className="checkline mb">
                  <input type="checkbox" checked={skipDupes} onChange={(e) => setSkipDupes(e.target.checked)} />
                  Skip rows whose phone or email already exists
                </label>

                <p className="muted small">
                  Every imported lead starts at the default status. Phone numbers are normalised before
                  the duplicate check, so <code>+91 90000 00001</code> and <code>090000 00001</code> count
                  as the same number.
                </p>

                <button className="btn btn--primary" onClick={commit} disabled={busy || !hasName}>
                  {busy && <span className="spinner" />} Import {analysis.total_rows} row{analysis.total_rows === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── result ── */}
        {result && (
          <div className="panel">
            <div className="panel__head"><h2>Import finished</h2></div>
            <div className="panel__body">
              <div className="grid grid--stats mb">
                <div className="stat"><div className="stat__k">Imported</div><div className="stat__v is-good">{result.imported}</div></div>
                <div className="stat"><div className="stat__k">Duplicates</div><div className="stat__v">{result.duplicates}</div></div>
                <div className="stat"><div className="stat__k">Invalid</div><div className="stat__v">{result.invalid}</div></div>
                <div className="stat"><div className="stat__k">Rows read</div><div className="stat__v">{result.total_rows}</div></div>
              </div>

              {result.imported > 0 && (
                <div className="okbox mb">
                  {result.imported} lead{result.imported === 1 ? '' : 's'} added.{' '}
                  <Link to={owner ? `/leads?owner_id=${owner}` : '/leads?owner_id=unassigned'}>See them →</Link>
                </div>
              )}

              {result.errors.length > 0 && (
                <>
                  <h3 style={{ fontSize: 13, margin: '0 0 8px' }}>Rows that did not import</h3>
                  <div className="tablewrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
                    <table className="data">
                      <thead><tr><th>Line</th><th>Business</th><th>Why</th></tr></thead>
                      <tbody>
                        {result.errors.map((e, i) => (
                          <tr key={i}>
                            <td className="num">{e.line}</td>
                            <td>{e.business || <span className="muted">—</span>}</td>
                            <td>{e.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {result.imported === 0 && result.errors.length === 0 && (
                <Empty title="Nothing to import">The file had no usable rows.</Empty>
              )}

              <div className="btnrow mt">
                <button className="btn" onClick={reset}>Import another file</button>
                <Link className="btn btn--primary" to="/leads">Go to leads</Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
