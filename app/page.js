'use client';
import { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const STATUS_LABELS = {
  email_sent: { label: 'Email sent', color: '#185FA5' },
  connection_sent: { label: 'Sent connection', color: '#0D9488' },
  linkedin_connected: { label: 'LI connected', color: '#0F6E56' },
  linkedin_messaged: { label: 'LI messaged', color: '#3B6D11' },
  replied: { label: 'Replied!', color: '#BA7517' },
  interview_scheduled: { label: 'Interview 🎯', color: '#533AB7' },
  offer_received: { label: 'Offer 🏆', color: '#1D9E75' },
  rejected: { label: 'Rejected', color: '#A32D2D' },
  no_response: { label: 'No response', color: '#5F5E5A' },
  not_found: { label: 'Not found', color: '#737373' },
};

export default function OutreachTracker() {
  const [contacts, setContacts] = useState([]);
  const [logs, setLogs] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [logging, setLogging] = useState(null);
  const [action, setAction] = useState('email_sent');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const maxRank = contacts.reduce((max, c) => Math.max(max, c.rank || 0), 0);
          
          const newContacts = results.data
            .filter(row => row.prospect_full_name || (row.profile_first_name && row.profile_last_name))
            .map((row, index) => {
              let linkedinUrl = row.prospect_linkedin;
              if (!linkedinUrl && row.profile_linkedin_url_array) {
                try {
                  const arr = JSON.parse(row.profile_linkedin_url_array.replace(/""/g, '"'));
                  if (arr && arr.length > 0) linkedinUrl = arr[0];
                } catch (e) {}
              }

              return {
                name: row.prospect_full_name || `${row.profile_first_name || ''} ${row.profile_last_name || ''}`.trim(),
                title: row.prospect_job_title,
                linkedin: linkedinUrl,
                company: row.prospect_company_name,
                website: row.prospect_company_website,
                email: row.contact_professions_email || null,
                city: row.profile_city,
                state: row.profile_region_name,
                rank: maxRank + index + 1,
                fit_for_resume: 'Medium',
                actively_hiring: false,
                has_network_intro: false,
              };
            });

          if (newContacts.length > 0) {
            const { error } = await supabase.from('contacts').insert(newContacts);
            if (error) {
              console.error("Error inserting contacts:", error);
              alert("Error importing contacts: " + error.message);
            } else {
              alert(`Successfully imported ${newContacts.length} contacts!`);
              load();
            }
          } else {
             alert('No valid contacts found in the CSV.');
          }
        } catch (err) {
          console.error("Error during import:", err);
          alert("Error during import: " + err.message);
        } finally {
          setUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: (error) => {
        console.error("PapaParse error:", error);
        alert("Error parsing CSV");
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  };

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const { data: c, error: cErr } = await supabase
        .from('contacts_with_status')
        .select('*')
        .order('rank');
      if (cErr) console.error("Error fetching contacts:", cErr);

      const { data: l, error: lErr } = await supabase
        .from('outreach_log')
        .select('*')
        .order('logged_at', { ascending: false });
      if (lErr) console.error("Error fetching logs:", lErr);

      setContacts(c || []);
      const logMap = {};
      (l || []).forEach(entry => {
        if (!logMap[entry.contact_id]) logMap[entry.contact_id] = [];
        logMap[entry.contact_id].push(entry);
      });
      setLogs(logMap);
    } catch (err) {
      console.error("Unexpected error during load:", err);
    } finally {
      setLoading(false);
    }
  }

  async function logAction(contactId) {
    setSaving(true);
    const { error } = await supabase.from('outreach_log').insert({
      contact_id: contactId,
      action,
      notes: note || null,
    });
    
    if (error) {
      console.error("Error logging action:", error);
      alert("Error logging action: " + error.message);
    } else {
      setLogging(null);
      setNote('');
      load();
    }
    setSaving(false);
  }

  const filtered = contacts.filter(c => {
    const matchSearch = !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.company.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === 'intro') return c.has_network_intro;
    if (filter === 'hiring') return c.actively_hiring;
    if (filter === 'contacted') return c.latest_action;
    if (filter === 'pending') return !c.latest_action;
    return true;
  });

  const stats = {
    total: contacts.length,
    contacted: contacts.filter(c => c.latest_action).length,
    replied: contacts.filter(c =>
      ['replied', 'interview_scheduled', 'offer_received'].includes(c.latest_action)).length,
    pending: contacts.filter(c => !c.latest_action).length,
  };

  if (loading) return (
    <div style={{ fontFamily: 'monospace', padding: 48, textAlign: 'center', color: '#888' }}>
      Loading contacts...
    </div>
  );

  return (
    <div style={{ fontFamily: 'monospace', maxWidth: 1100, margin: '0 auto', padding: '24px 20px', background: '#faf7f2', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ borderBottom: '3px double #1a1814', paddingBottom: 16, marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 36, fontWeight: 800, margin: 0, letterSpacing: -1 }}>
          The Outreach Ledger
        </h1>
        <p style={{ color: '#5b554d', fontSize: 13, margin: '4px 0 0' }}>
          Live tracker · Gokulnaath Govindaraj · {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          ['Total contacts', stats.total, '#1a1814'],
          ['Contacted', stats.contacted, '#185FA5'],
          ['Replied / Interview', stats.replied, '#533AB7'],
          ['Pending outreach', stats.pending, '#c63d1f'],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #e0d8c9', padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: '#8b8378', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'Georgia,serif', color: col }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name or company..."
          style={{ fontFamily: 'monospace', fontSize: 12, padding: '8px 12px', border: '1px solid #1a1814', background: '#fff', flex: 1, minWidth: 180 }}
        />
        {[
          ['all', `All (${stats.total})`],
          ['intro', '⭐ Network'],
          ['hiring', '🔥 Hiring'],
          ['contacted', 'Contacted'],
          ['pending', 'Pending'],
        ].map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            fontFamily: 'monospace', fontSize: 11, padding: '8px 14px',
            border: '1px solid #1a1814',
            background: filter === f ? '#1a1814' : '#fff',
            color: filter === f ? '#fff' : '#1a1814',
            cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em'
          }}>
            {label}
          </button>
        ))}
        
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <input 
            type="file" 
            accept=".csv" 
            style={{ display: 'none' }} 
            ref={fileInputRef}
            onChange={handleImport} 
          />
          <button 
            onClick={() => fileInputRef.current?.click()} 
            disabled={uploading}
            style={{
              fontFamily: 'monospace', fontSize: 11, padding: '8px 14px',
              border: '1px solid #1a1814',
              background: '#1a1814',
              color: '#fff',
              cursor: uploading ? 'wait' : 'pointer', 
              textTransform: 'uppercase', 
              letterSpacing: '0.08em'
            }}>
            {uploading ? 'Importing...' : 'Import CSV'}
          </button>
        </div>
      </div>

      {/* Cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {filtered.map(c => {
          const status = c.latest_action ? STATUS_LABELS[c.latest_action] : null;
          const history = logs[c.id] || [];
          const isLogging = logging === c.id;

          return (
            <div key={c.id} style={{
              background: c.has_network_intro
                ? 'linear-gradient(180deg,#d4e4d4 0%,#fff 20%)'
                : '#fff',
              border: c.has_network_intro
                ? '2px solid #1f4d3a'
                : '1px solid #e0d8c9',
              padding: 18, position: 'relative',
            }}>
              {/* Warm intro banner */}
              {c.has_network_intro && (
                <div style={{ fontSize: 10, background: '#1f4d3a', color: '#fff', padding: '3px 10px', display: 'inline-block', marginBottom: 10, letterSpacing: '0.1em' }}>
                  ⭐ WARM INTRO — {c.network_intro_via}
                </div>
              )}

              {/* Name + company */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'Georgia,serif' }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: '#5b554d', marginTop: 2 }}>{c.title}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#c63d1f' }}>{c.company}</div>
                  <div style={{ fontSize: 10, color: '#8b8378' }}>#{c.rank}</div>
                </div>
              </div>

              {/* Pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                {c.actively_hiring && (
                  <span style={{ fontSize: 10, background: '#fce8df', color: '#993C1D', padding: '2px 8px', borderRadius: 2 }}>🔥 Active hiring</span>
                )}
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 2,
                  background: c.fit_for_resume === 'High' ? '#e8f0e8' : '#fff3d4',
                  color: c.fit_for_resume === 'High' ? '#2c6b3f' : '#8a6c1a',
                }}>
                  {c.fit_for_resume} fit
                </span>
                <span style={{ fontSize: 10, color: '#8b8378' }}>📍 {c.city}, {c.state}</span>
              </div>

              {/* Note */}
              {c.note && (
                <div style={{ fontSize: 11, fontStyle: 'italic', color: '#5b554d', borderLeft: '2px solid #b8902c', paddingLeft: 8, marginBottom: 10 }}>
                  {c.note}
                </div>
              )}

              {/* Contact buttons */}
              <div style={{ borderTop: '1px dashed #e0d8c9', paddingTop: 10, marginTop: 4 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <a href={`mailto:${c.email}`} style={{
                    flex: 1, fontSize: 11, padding: '7px 10px',
                    border: '1px solid #1a1814', color: '#1a1814',
                    textDecoration: 'none', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    display: 'block'
                  }}>
                    ✉ {c.email}
                  </a>
                  {c.linkedin && (
                    <a
                      href={
                        c.linkedin.trim().startsWith('http')
                          ? c.linkedin.trim()
                          : `https://${c.linkedin.trim()}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: 11, padding: '7px 10px',
                        border: '1px solid #1a1814', color: '#1a1814',
                        textDecoration: 'none', flexShrink: 0,
                        display: 'flex', alignItems: 'center', gap: 4
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                      </svg>
                    </a>
                  )}
                </div>

                {/* Status row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    {status ? (
                      <span style={{
                        fontSize: 10, padding: '3px 10px',
                        background: '#f5f5f5', color: status.color,
                        fontWeight: 700, border: `1px solid ${status.color}`
                      }}>
                        {status.label}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, color: '#8b8378' }}>no outreach yet</span>
                    )}
                    {c.last_contacted && (
                      <span style={{ fontSize: 10, color: '#8b8378', marginLeft: 6 }}>
                        {new Date(c.last_contacted).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <button onClick={() => setLogging(isLogging ? null : c.id)} style={{
                    fontSize: 10, padding: '4px 10px',
                    border: '1px solid #1a1814',
                    background: isLogging ? '#1a1814' : '#fff',
                    color: isLogging ? '#fff' : '#1a1814',
                    cursor: 'pointer', fontFamily: 'monospace'
                  }}>
                    {isLogging ? 'cancel' : '+ log'}
                  </button>
                </div>

                {/* Log form */}
                {isLogging && (
                  <div style={{ background: '#faf7f2', border: '1px solid #e0d8c9', padding: 10 }}>
                    <select value={action} onChange={e => setAction(e.target.value)} style={{
                      width: '100%', fontFamily: 'monospace', fontSize: 11,
                      padding: '6px 8px', marginBottom: 6, border: '1px solid #e0d8c9'
                    }}>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                    <input
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="Optional note..."
                      style={{
                        width: '100%', fontFamily: 'monospace', fontSize: 11,
                        padding: '6px 8px', marginBottom: 6,
                        border: '1px solid #e0d8c9', background: '#fff',
                        boxSizing: 'border-box'
                      }}
                    />
                    <button onClick={() => logAction(c.id)} disabled={saving} style={{
                      width: '100%', fontFamily: 'monospace', fontSize: 11,
                      padding: 7, background: '#1a1814', color: '#fff',
                      border: 'none', cursor: saving ? 'wait' : 'pointer'
                    }}>
                      {saving ? 'saving...' : 'save →'}
                    </button>
                  </div>
                )}

                {/* History line */}
                {history.length > 0 && !isLogging && (
                  <div style={{ fontSize: 10, color: '#8b8378', marginTop: 4 }}>
                    {history.length} action{history.length > 1 ? 's' : ''} logged
                    {history[0]?.notes && (
                      <span style={{ color: '#5b554d' }}> · &quot;{history[0].notes}&quot;</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '3px double #1a1814', marginTop: 40, paddingTop: 20, textAlign: 'center', fontSize: 11, color: '#8b8378' }}>
        Outreach Ledger · powered by Supabase · {contacts.length} contacts loaded
      </div>
    </div>
  );
}