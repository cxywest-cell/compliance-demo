// ═══ Case 5: Custodian Agents ═══
// EA: Register address with Custodian A → Create (full PII) → Authorize → Broadcast → Settle
// EB: Review → Add Custodian B → Authorize → Match
// CA/CB: View transfers + PII (read-only)

var caSelectedTxId = null;
var cbSelectedTxId = null;

// ─── EB Step 7: Add Custodian Agent ───
async function addCustodianAgent() {
  var s = await loadSettings();
  if (!selectedTxId) {
    alert('No transfer selected. Go to Entity B → Step 2 and select an incoming transfer first.');
    return;
  }

  var btn = document.getElementById('eb-add-custodian-btn');
  var result = document.getElementById('eb-custodian-result');
  btn.disabled = true; btn.textContent = 'Adding...';

  try {
    var res = await fetch('/api/notabene/transfer/agents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: s.ebApikey, clientSecret: s.ebApisecret,
        did: s.ebDid, txId: selectedTxId,
        agent: {
          '@id': s.cbDid,
          'role': 'Custodian',
          'for': s.ebDid
        }
      })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    result.style.display = 'block';
    result.innerHTML =
      '<div style="background:#d1fae5;color:#047857;padding:10px;border-radius:6px;font-size:12px">' +
        '<div style="font-weight:600;margin-bottom:4px">✓ Custodian B Added</div>' +
        '<div style="font-size:11px">Custodian B (' + esc(s.cbDid) + ') has been added as an agent.</div>' +
        '<div style="font-size:11px;margin-top:4px">They will receive the transfer and webhook notifications.</div>' +
      '</div>';
    btn.textContent = '✓ Added'; btn.className = 'btn btn-success';
  } catch(e) {
    btn.disabled = false; btn.textContent = 'Add Custodian B';
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
  }
}

// ─── Fill custodian DIDs on load ───
async function fillCustodianDids() {
  var s = await loadSettings();
  var cbDidEl = document.getElementById('eb-custodian-did');
  if (cbDidEl && s.cbDid) cbDidEl.textContent = s.cbDid;
}

// ─── Fetch transfers for custodian (CA or CB) ───
async function fetchCustodianTransfers(role) {
  var s = await loadSettings();
  var roleKey = role === 'ca' ? 'ca' : 'cb';
  var listId = roleKey + '-transfers-list';
  var list = document.getElementById(listId);
  if (!list) return;

  list.innerHTML = '<div class="placeholder" style="padding:20px"><p>Loading...</p></div>';

  try {
    var params = new URLSearchParams({
      clientId: s[roleKey + 'Apikey'],
      clientSecret: s[roleKey + 'Apisecret'],
      did: s[roleKey + 'Did']
    });
    var res = await fetch('/api/notabene/transfers?' + params.toString());
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var txs = data.data || data.transactions || data || [];
    if (!Array.isArray(txs)) txs = txs ? [txs] : [];

    if (txs.length === 0) {
      list.innerHTML = '<div class="placeholder" style="padding:20px"><p>No transfers found. Custodian agents appear after Entity A registers their address with a custodian, or Entity B adds the custodian.</p></div>';
      return;
    }

    list.innerHTML = txs.map(function(tx, i) {
      var txId = tx['@id'] || tx.id || tx.txId || '?';
      var status = tx.status || '?';
      var amount = tx.amount || '?';
      var ref = tx.ref || '—';
      var direction = tx.direction || '—';
      return '<div style="padding:10px 12px;border-bottom:1px solid #f0f0f0;cursor:pointer" onclick="selectCustodianTransfer(\'' + roleKey + '\', \'' + txId + '\')">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<span class="mono" style="font-size:10px">' + esc(txId.substring(0, 20)) + '...</span>' +
          '<span class="transfer-status ts-' + esc(status.toLowerCase()) + '">' + esc(status) + '</span>' +
        '</div>' +
        '<div style="font-size:11px;color:#666;margin-top:2px">' + esc(amount) + ' · ' + esc(direction) + ' · ' + esc(ref) + '</div>' +
      '</div>';
    }).join('');
  } catch(e) {
    list.innerHTML = '<div class="placeholder" style="padding:20px"><p style="color:#dc2626">✗ ' + esc(e.message) + '</p></div>';
  }
}

// ─── Select a transfer on custodian side ───
function selectCustodianTransfer(role, txId) {
  if (role === 'ca') caSelectedTxId = txId;
  else cbSelectedTxId = txId;

  // Highlight selected
  var items = document.querySelectorAll('#' + role + '-transfers-list > div[onclick]');
  items.forEach(function(el) { el.style.background = ''; });
  event.currentTarget.style.background = '#f0efff';

  // Unlock details section
  fetchCustodianTransferDetails(role);
}

// ─── Fetch transfer details for custodian (with PII) ───
async function fetchCustodianTransferDetails(role) {
  var s = await loadSettings();
  var roleKey = role === 'ca' ? 'ca' : 'cb';
  var txId = roleKey === 'ca' ? caSelectedTxId : cbSelectedTxId;
  var bodyId = roleKey + '-details-body';

  var body = document.getElementById(bodyId);
  if (!body) return;
  if (!txId) {
    body.innerHTML = '<p class="hint">Select a transfer above first.</p>';
    return;
  }

  body.innerHTML = '<div style="color:#888;padding:8px">Fetching...</div>';

  try {
    var params = new URLSearchParams({
      clientId: s[roleKey + 'Apikey'],
      clientSecret: s[roleKey + 'Apisecret'],
      did: s[roleKey + 'Did'],
      txId: txId,
      decrypt: 'true',
      sanitize: 'false'
    });
    var res = await fetch('/api/notabene/transfer?' + params.toString());
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var t = data.transfer || data;
    var status = t.status || '—';
    var amount = t.amount || '—';
    var direction = t.direction || '—';

    var html = '<div class="tx-summary">' +
      '<div class="tx-id mono">' + esc(txId) + '</div>' +
      '<div class="tx-amount">' + esc(amount) + '</div>' +
      '<div class="tx-route">Direction: ' + esc(direction) + '</div>' +
      '<div style="margin-top:8px"><span class="transfer-status ts-' + esc(status.toLowerCase()) + '">' + esc(status) + '</span></div>' +
    '</div>';

    // Agent chain (show custodian's role)
    var agents = t.agents || [];
    html += '<div style="margin-top:10px;font-size:10px;font-weight:600;color:#888;text-transform:uppercase;margin-bottom:4px">Agent Chain</div>';
    for (var j = 0; j < agents.length; j++) {
      var a = agents[j];
      var aDid = (a.agent && a.agent['@id']) || a['@id'] || '—';
      var aName = a.name || String(aDid).split(':').slice(-2)[0];
      var aRole = a.role || '—';
      var aStatus = a.status || '—';
      var highlight = aRole === 'Custodian' ? 'background:#f0efff;' : '';
      html += '<div class="cred-row" style="' + highlight + '">' +
        '<span class="k">' + esc(aRole) + '</span>' +
        '<span class="v">' + esc(aName) + ' <span style="font-size:10px;color:#888">(' + esc(aStatus) + ')</span></span>' +
      '</div>';
    }

    // PII data (if available)
    var pii = t.ivms101 || t.originator;
    if (pii) {
      html += '<div style="margin-top:10px;font-size:10px;font-weight:600;color:#888;text-transform:uppercase;margin-bottom:4px">PII Data</div>';
      var origPii = extractPII(t.originator, 'originator');
      var benePii = extractPII(t.beneficiary, 'beneficiary');
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
        piiBlock('Originator', '#5b4cdb', origPii) +
        piiBlock('Beneficiary', '#06b6d4', benePii) +
      '</div>';
    } else {
      html += '<div style="margin-top:10px;font-size:11px;color:#999">No PII data available (transfer may not include PII, or custodian may not have decryption keys).</div>';
    }

    body.innerHTML = html;
  } catch(e) {
    body.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
  }
}

// Initialize on load
fillCustodianDids();
