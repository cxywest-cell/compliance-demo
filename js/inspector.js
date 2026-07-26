var whCurrent = [];
var whSelected = -1;

function whToggle() {
  var panel = document.getElementById('wh-panel');
  var arrow = document.getElementById('wh-arrow');
  if (panel.style.display === 'none' || !panel.style.display) {
    panel.style.display = 'flex';
    arrow.style.transform = 'rotate(90deg)';
  } else {
    panel.style.display = 'none';
    arrow.style.transform = 'rotate(0deg)';
  }
}

function whSwitchTab(tab, openPanel) {
  if (openPanel) {
    var panel = document.getElementById('wh-panel');
    var arrow = document.getElementById('wh-arrow');
    panel.style.display = 'flex';
    arrow.style.transform = 'rotate(90deg)';
  }
  document.querySelectorAll('.wh-tab-content').forEach(function(el) { el.style.display = 'none'; });
  document.getElementById('wh-tab-' + tab).style.display = (tab === 'webhooks') ? 'flex' : 'block';
  document.querySelectorAll('.wh-tab').forEach(function(el) { el.classList.remove('active'); });
  document.querySelectorAll('.wh-tab[data-wh-tab="' + tab + '"]').forEach(function(el) { el.classList.add('active'); });
}

// ─── Transaction Inspector ───
async function inspectTransfer() {
  var s = await loadSettings();
  var txId = document.getElementById('tx-inspector-id').value.trim();
  var role = document.getElementById('tx-inspector-role').value;
  var result = document.getElementById('tx-inspector-result');

  if (!txId) {
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">Enter a Transfer ID</div>';
    return;
  }

  var creds = {
    ea: { id: s.eaApikey, secret: s.eaApisecret, did: s.eaDid },
    eb: { id: s.ebApikey, secret: s.ebApisecret, did: s.ebDid },
    ca: { id: s.caApikey, secret: s.caApisecret, did: s.caDid },
    cb: { id: s.cbApikey, secret: s.cbApisecret, did: s.cbDid },
  }[role] || { id: s.eaApikey, secret: s.eaApisecret, did: s.eaDid };

  if (!creds.id || !creds.secret) {
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">No credentials for ' + role.toUpperCase() + '. Configure in Settings.</div>';
    return;
  }

  result.innerHTML = '<div style="color:#888;font-size:11px">Looking up ' + esc(txId) + ' as ' + role.toUpperCase() + '...</div>';

  try {
    var res = await fetch('/api/notabene/transfer?clientId=' + encodeURIComponent(creds.id) +
      '&clientSecret=' + encodeURIComponent(creds.secret) +
      '&did=' + encodeURIComponent(creds.did) +
      '&txId=' + encodeURIComponent(txId) + '&decrypt=true');
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var tx = data.transfer || data;
    result.innerHTML = renderTxDetail(tx, role);
  } catch(e) {
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
  }
}

function renderTxDetail(tx, role) {
  var status = tx.status || '—';
  var statusColor = { SETTLED: '#059669', AUTHORIZED: '#059669', REJECTED: '#dc2626', CANCELLED: '#dc2626', SENT: '#d97706', RECEIVED: '#d97706', INCOMING: '#d97706', OUTGOING: '#d97706' }[status] || '#888';

  var html = '<div style="background:#fff;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden">';

  // Header
  html += '<div style="padding:10px 12px;border-bottom:1px solid #e0e0e0;display:flex;justify-content:space-between;align-items:center">';
  html += '<span style="font-size:12px;font-weight:700;font-family:monospace">' + esc(tx['@id'] || tx.id || '—') + '</span>';
  html += '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:3px;background:' + statusColor + ';color:#fff">' + esc(status) + '</span>';
  html += '</div>';

  // Key-value rows
  var rows = [
    ['Direction', tx.transactionDirection || tx.direction || '—'],
    ['Amount', (tx.amount || '—') + ' ' + (tx.notabeneAsset || '')],
    ['Asset', tx.asset || '—'],
    ['Initiator', tx.initiator || '—'],
    ['isTravelRule', tx.isTravelRule === true ? '✓ Yes' : tx.isTravelRule === false ? '✗ No' : '—'],
    ['Settlement ID', tx.settlementId ? tx.settlementId.substring(0, 30) + '...' : '—'],
    ['Created', tx.createdAt ? new Date(tx.createdAt).toLocaleString() : '—'],
    ['Authorized', tx.authorizedTime ? new Date(tx.authorizedTime).toLocaleString() : '—'],
    ['Settled', tx.settledTime ? new Date(tx.settledTime).toLocaleString() : '—'],
    ['Rejected', tx.rejectedTime ? new Date(tx.rejectedTime).toLocaleString() : '—'],
  ];

  html += '<div style="padding:6px 12px">';
  for (var i = 0; i < rows.length; i++) {
    html += '<div class="cred-row"><span class="k">' + esc(rows[i][0]) + '</span><span class="v" style="font-family:monospace;font-size:10px">' + esc(rows[i][1]) + '</span></div>';
  }
  html += '</div>';

  // Agents
  if (tx.agents && tx.agents.length) {
    html += '<div style="padding:6px 12px;border-top:1px solid #e8e8e8">';
    html += '<div style="font-size:10px;font-weight:600;color:#888;text-transform:uppercase;margin-bottom:4px">Agents & Policies</div>';
    for (var j = 0; j < tx.agents.length; j++) {
      var a = tx.agents[j];
      html += '<div style="font-size:10px;padding:3px 0;border-bottom:1px solid #f0f0f0">';
      html += '<strong>' + esc(a.role || '—') + '</strong>';
      if (a.jurisdiction) html += ' <span style="color:#5b4cdb">[' + esc(a.jurisdiction) + ']</span>';
      html += ' <span style="color:#888">' + esc((a.agent && a.agent['@id'] || '').substring(0, 40)) + '</span>';
      if (a.status) html += ' → <span style="font-weight:600">' + esc(a.status) + '</span>';
      if (a.policies && a.policies.length) {
        for (var k = 0; k < a.policies.length; k++) {
          var p = a.policies[k];
          if (CASE === 'case2' && (p['@type'] || '') === 'REQUIRE_RELATIONSHIP_CONFIRMATION') continue;
          var pColor = p.status === 'COMPLETED' ? '#059669' : '#d97706';
          html += '<div style="margin-left:16px;font-size:9px;color:' + pColor + '">▸ ' + esc(p['@type'].replace('REQUIRE_', '').replace('_', ' ')) + ': ' + esc(p.status) + '</div>';
        }
      }
      html += '</div>';
    }
    html += '</div>';
  }

  // Full JSON
  html += '<details style="border-top:1px solid #e0e0e0"><summary style="cursor:pointer;font-size:10px;font-weight:600;color:#5b4cdb;padding:8px 12px">Raw JSON</summary>';
  html += '<pre class="mono" style="font-size:9px;max-height:300px;overflow:auto;background:#f8f9fa;padding:8px;border-radius:0 0 6px 6px">' + esc(JSON.stringify(tx, null, 2)) + '</pre>';
  html += '</details>';

  html += '</div>';
  return html;
}

function whRoleClass(role) {
  return { ea: 'wh-role-ea', ca: 'wh-role-ca', eb: 'wh-role-eb', cb: 'wh-role-cb' }[role] || '';
}

function whShortType(msgType) {
  return msgType.replace(/^notification\./, '').replace(/^tap\./, '[tap] ');
}

function whExtractBody(ev) {
  var msgType = 'unknown';
  var forDid = '—';
  var txId = '—';
  var fromStatus = '';
  var toStatus = '';
  if (typeof ev.body === 'object' && ev.body) {
    var inner = ev.body.payload && ev.body.payload.payload ? ev.body.payload.payload : (ev.body.payload || {});
    msgType = ev.body.message || (ev.body.payload && ev.body.payload.message) || 'unknown';
    forDid = inner.for || (ev.body.payload && ev.body.payload.for) || '—';
    txId = inner.id || inner['@id'] || (ev.body.payload && ev.body.payload.id) || ev.body.id || '—';
    fromStatus = inner.fromStatus || '';
    toStatus = inner.toStatus || '';
  }
  return { msgType: msgType, forDid: forDid, txId: txId, fromStatus: fromStatus, toStatus: toStatus };
}

function whRender(entries) {
  whCurrent = entries;
  var el = document.getElementById('wh-list');
  var countEl = document.getElementById('wh-count');
  var latestEl = document.getElementById('wh-latest');
  if (!el) return;

  if (!entries || entries.length === 0) {
    el.innerHTML = '<div style="padding:12px;text-align:center;color:#888;font-size:11px">Waiting for Notabene webhooks...</div>';
    if (countEl) countEl.textContent = '0 events';
    if (latestEl) latestEl.textContent = '';
    return;
  }

  var total = entries.length;
  if (countEl) countEl.textContent = total + ' event' + (total !== 1 ? 's' : '');

  var latest = entries[entries.length - 1];
  var latestInfo = whExtractBody(latest);
  if (latestEl) latestEl.textContent = 'Latest: ' + whShortType(latestInfo.msgType);

  // Auto-select latest on first load
  if (whSelected === -1) {
    whSelected = entries.length - 1;
    whShowDetail(entries[whSelected]);
  }

  var html = '';
  for (var i = entries.length - 1; i >= 0; i--) {
    var e = entries[i];
    var info = whExtractBody(e);
    var cls = whSelected === i ? 'wh-item selected' : 'wh-item';
    var time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
    var vIcon = e.verified === true ? '<span class="wh-verify-yes">✓</span>'
              : e.verified === false ? '<span class="wh-verify-no">✗</span>'
              : '<span style="color:#f59e0b">?</span>';
    var role = e.matchedRole || '';
    var roleBadge = role ? '<span class="wh-role ' + whRoleClass(role) + '">' + role.toUpperCase() + '</span>' : '';
    var statusChange = info.fromStatus && info.toStatus
      ? '<span class="wh-status-change">' + esc(info.fromStatus) + '→' + esc(info.toStatus) + '</span>' : '';
    html += '<div class="' + cls + '" onclick="whSelect(' + i + ')">' +
      '<span class="wh-time">' + time + '</span>' +
      vIcon +
      roleBadge +
      '<span class="wh-type">' + esc(whShortType(info.msgType)) + '</span>' +
      statusChange +
      '</div>';
  }
  el.innerHTML = html;
}

function whSelect(idx) {
  whSelected = idx;
  whShowDetail(whCurrent[idx]);
  whRender(whCurrent);
}

function whShowDetail(e) {
  if (!e) return;
  var info = whExtractBody(e);
  var titleEl = document.getElementById('wh-detail-title');
  if (titleEl) titleEl.textContent = info.msgType;
  var viewer = document.getElementById('wh-json');
  if (viewer) viewer.innerHTML = whSyntaxHighlight(JSON.stringify(e, null, 2));
}

function whCopyJSON() {
  if (whSelected < 0 || !whCurrent[whSelected]) return;
  var text = JSON.stringify(whCurrent[whSelected], null, 2);
  if (navigator.clipboard) navigator.clipboard.writeText(text);
}

function whSyntaxHighlight(json) {
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function(match) {
    if (/^"/.test(match)) {
      if (/:$/.test(match)) return '<span class="json-key">' + match.replace(/"/g, '').replace(/:$/, '') + '</span>:';
      return '<span class="json-str">' + match + '</span>';
    }
    if (/true|false/.test(match)) return '<span class="json-bool">' + match + '</span>';
    if (/null/.test(match)) return '<span class="json-null">' + match + '</span>';
    return '<span class="json-num">' + match + '</span>';
  });
}

function whClearLog() {
  fetch('/api/webhooks/clear', { method: 'POST' }).then(function() {
    whSelected = -1;
    document.getElementById('wh-detail-title').textContent = 'Select an event';
    document.getElementById('wh-json').innerHTML = '// Click an event to see full payload';
    whPoll();
  });
}

function whPoll() {
  fetch('/api/webhooks').then(function(r) { return r.json(); }).then(function(data) {
    // Filter to Notabene events only
    var notabeneEvents = data.filter(function(e) { return e.type === 'notabene'; });
    whRender(notabeneEvents);
  }).catch(function() {});
}
setInterval(whPoll, 2000);
whPoll();

// ─── Reset All ───

function resetAll() {
  location.reload();
}
