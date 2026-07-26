// ─── Case 3: Post-Settlement Rule Discovery ───
// EB authorizes → settles → then flags the transfer for missing PII
// Then creates counter-transfer (RFI) like Case 2

// Reuse counter-transfer + RFI functions from case2.js pattern
// These are loaded AFTER shared.js so they have access to all shared functions

// ─── Globals ───
var rfiSelectedTxId = null;
var rfiSelectedPDUrl = null;

// ─── Flag Transfer (Case 3 specific: EB flags AFTER settlement) ───
async function flagTransfer() {
  var s = await loadSettings();
  var btn = document.getElementById('eb-flag-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Flagging...'; }

  try {
    // Show flag confirmation
    if (btn) {
      btn.textContent = '⚠ Flagged';
      btn.style.background = '#f59e0b';
      btn.style.borderColor = '#f59e0b';
    }

    document.getElementById('eb-match-result').insertAdjacentHTML('beforeend',
      '<div style="background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:4px;margin-top:10px;font-size:12px;font-weight:600">' +
      '⚠ Transfer FLAGGED — Originator PII missing. This transfer is settled but non-compliant. Create a counter-transfer (RFI) to request the missing PII from Entity A.</div>');

    // Unlock the counter-transfer section
    var counterSection = document.getElementById('eb-counter-section');
    var counterTitle = document.getElementById('eb-counter-title');
    if (counterSection) {
      counterSection.style.display = 'block';
      counterTitle.style.opacity = '1';
      counterTitle.innerHTML = 'Step 7b · Create Counter-Transfer (RFI)';
    }
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = '⚠ Flag Transfer'; }
    alert('Flag failed: ' + e.message);
  }
}

// ─── Counter-Transfer (same logic as Case 2) ───
async function createCounterTransfer() {
  var s = await loadSettings();
  var btn = document.getElementById('eb-counter-btn');
  btn.disabled = true; btn.textContent = 'Creating...';

  var pdUrl = document.getElementById('eb-pd-url').value.trim() || 'https://pd.notabene.id/ivms101/v2/FA-1000.json';

  // Build the same body as createTransfer but from EB's perspective
  var wallets = {};
  try { var wr = await fetch('/api/wallet/persisted'); wallets = await wr.json(); } catch(e) {}
  var eaWallet = (wallets.ea || {}).address;
  var ebWallet = (wallets.eb || {}).address;

  var eaDid = s.eaDid;
  var ebDid = s.ebDid;

  var ref = 'rfi-' + Date.now().toString(36);
  var amount = '3500';
  var asset = 'eip155:11155111/erc20:0xA2c7341dAdB120aa638795Dc73f7c74Ebd35D868';

  var origId = 'did:pkh:eip155:11155111:' + eaWallet;
  var beneId = 'did:pkh:eip155:11155111:' + ebWallet;

  var requirePresentation = {
    '@type': 'REQUIRE_PRESENTATION',
    'from': eaDid,
    'for': beneId,
    'presentationDefinition': pdUrl
  };

  var ebAgent = { '@id': ebDid, 'for': beneId, role: 'VASP' };
  ebAgent.policies = [requirePresentation];

  var body = {
    ref: ref,
    amount: String(amount),
    asset: asset,
    originator: { '@id': origId },
    beneficiary: { '@id': beneId },
    agents: [
      { '@id': 'did:pkh:eip155:11155111:' + eaWallet, 'for': eaDid, role: 'SourceAddress' },
      { '@id': eaDid, 'for': origId, role: 'VASP' },
      ebAgent,
      { '@id': 'did:pkh:eip155:11155111:' + ebWallet, 'for': ebDid, role: 'SettlementAddress' }
    ]
  };

  try {
    var res = await fetch('/api/notabene/transfer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: s.ebApikey, clientSecret: s.ebApisecret,
        entityDid: ebDid, transferBody: body
      })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var txId = data.transfer ? data.transfer['@id'] : data.id || data['@id'] || 'unknown';
    var status = data.transfer ? data.transfer.status : data.status || 'OUTGOING';

    btn.textContent = '✓ Created'; btn.className = 'btn btn-success btn-sm';

    var resultEl = document.getElementById('eb-counter-result');
    resultEl.style.display = 'block';
    resultEl.innerHTML =
      '<div class="cred-row"><span class="k">Counter-Transfer ID</span><span class="v mono">' + esc(txId) + '</span></div>' +
      '<div class="cred-row"><span class="k">Status</span><span class="v">' + esc(status) + '</span></div>' +
      '<div class="cred-row"><span class="k">Direction</span><span class="v">EA → EB (same as original)</span></div>' +
      '<div class="cred-row"><span class="k">Your PD</span><span class="v mono" style="font-size:10px">' + esc(pdUrl.split('/').pop()) + '</span></div>' +
      '<div class="hint" style="margin-top:8px">EA will see this as an incoming RFI with actionRequired: true. EA can read your REQUIRE_PRESENTATION policy and discover exactly what you need.</div>';

    // Show review card
    document.getElementById('eb-counter-review-card').style.display = 'block';
    window.__counterTxId = txId;

    // Unlock Step 8: EB Approve & Settle
    var settleSection = document.getElementById('eb-rfi-settle-section');
    var settleTitle = document.getElementById('eb-rfi-settle-title');
    if (settleSection) settleSection.style.display = 'block';
    if (settleTitle) { settleTitle.style.opacity = '1'; settleTitle.innerHTML = settleTitle.innerHTML.replace(/ <span.*<\/span>/, ''); }

  } catch(e) {
    btn.disabled = false; btn.textContent = 'Create Transfer';
    alert('Counter-transfer failed: ' + e.message);
  }
}

// ─── Refresh Counter-Transfer (check if EA appended PII) ───
async function refreshCounterTransfer() {
  var s = await loadSettings();
  var txId = window.__counterTxId;
  if (!txId) return;

  var body = document.getElementById('eb-counter-review-body');

  try {
    var res = await fetch('/api/notabene/transfer?clientId=' + encodeURIComponent(s.ebApikey) +
      '&clientSecret=' + encodeURIComponent(s.ebApisecret) + '&did=' + encodeURIComponent(s.ebDid) +
      '&txId=' + encodeURIComponent(txId) + '&decrypt=true');
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var tx = data.transfer || data;
    var status = tx.status || '—';

    // Check agent policies
    var policyStatus = 'UNKNOWN';
    if (tx.agents) {
      for (var i = 0; i < tx.agents.length; i++) {
        var policies = tx.agents[i].policies || [];
        for (var j = 0; j < policies.length; j++) {
          if ((policies[j]['@type'] || policies[j].type) === 'REQUIRE_PRESENTATION') {
            policyStatus = policies[j].status || 'PENDING';
          }
        }
      }
    }

    var pColor = policyStatus === 'COMPLETED' ? '#059669' : '#d97706';
    var html = '<div class="cred-row"><span class="k">Transfer Status</span><span class="v">' + esc(status) + '</span></div>';
    html += '<div class="cred-row"><span class="k">PII Policy</span><span class="v" style="color:' + pColor + ';font-weight:600">' + esc(policyStatus) + '</span></div>';

    if (policyStatus === 'COMPLETED') {
      html += '<div style="background:#d1fae5;color:#065f46;padding:6px 10px;border-radius:4px;margin-top:8px;font-size:12px;font-weight:600">✓ EA has provided the required PII. Transfer is now compliant.</div>';
    } else {
      html += '<div class="hint" style="margin-top:8px">Waiting for EA to append PII. Refresh again to check.</div>';
    }

    body.innerHTML = html;
  } catch(e) {
    body.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
  }
}

// ─── EA: Fetch Incoming RFI Transfers ───
async function fetchIncomingRFI() {
  var s = await loadSettings();
  var listEl = document.getElementById('ea-rfi-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="placeholder" style="padding:20px"><p>Loading...</p></div>';

  try {
    var res = await fetch('/api/notabene/transfers?clientId=' + encodeURIComponent(s.eaApikey) +
      '&clientSecret=' + encodeURIComponent(s.eaApisecret) + '&did=' + encodeURIComponent(s.eaDid));
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var txs = data.data || data.transfers || [];
    if (!Array.isArray(txs)) txs = [txs];

    var rfiTxs = txs.filter(function(t) {
      return t.initiator && t.initiator !== s.eaDid;
    });

    if (rfiTxs.length === 0) {
      listEl.innerHTML = '<div class="placeholder" style="padding:20px"><p>No incoming RFI transfers yet. Wait for EB to create a counter-transfer.</p></div>';
      return;
    }

    var html = '';
    for (var i = 0; i < rfiTxs.length; i++) {
      var t = rfiTxs[i];
      var txId = t['@id'] || t.id;
      var status = t.status || '—';
      var amount = t.amount || '—';
      var initiator = t.initiator ? String(t.initiator).split(':').slice(-2)[0] : '—';
      var isRFI = t.requestForInformation && t.requestForInformation.isRFI;
      var rfiBadge = isRFI ? '<span class="tag" style="background:#fef3c7;color:#92400e;font-size:9px">RFI</span> ' : '';
      var cls = rfiSelectedTxId === txId ? 'wh-item selected' : 'wh-item';
      html += '<div class="' + cls + '" style="padding:8px 10px" onclick="selectRFITransfer(\'' + txId + '\')">' +
        '<div style="flex:1">' +
          '<div style="font-weight:600;font-size:12px">' + rfiBadge + esc(amount) + ' <span style="font-size:10px;color:#888">from ' + esc(initiator) + '</span></div>' +
          '<div style="font-size:10px;color:#888;margin-top:2px">' + esc(String(txId).slice(0, 20)) + '...</div>' +
        '</div>' +
        '<span class="transfer-status ts-' + status.toLowerCase() + '" style="font-size:10px">' + esc(status) + '</span>' +
      '</div>';
    }
    listEl.innerHTML = html;
  } catch(e) {
    listEl.innerHTML = '<div class="placeholder" style="padding:20px"><p style="color:#dc2626">✗ ' + esc(e.message) + '</p></div>';
  }
}

// ─── EA: Select RFI Transfer and View EB's Requirements ───
async function selectRFITransfer(txId) {
  var s = await loadSettings();
  rfiSelectedTxId = txId;
  selectedTxId = txId;
  selectedTxData = null;

  await fetchIncomingRFI();

  document.getElementById('ea-rfi-detail').style.display = 'block';

  var pdBody = document.getElementById('ea-rfi-pd-body');
  var piiBody = document.getElementById('ea-rfi-pii-body');
  pdBody.innerHTML = '<div style="color:#888;font-size:11px">Loading requirements...</div>';
  piiBody.innerHTML = '';

  try {
    var res = await fetch('/api/notabene/transfer?clientId=' + encodeURIComponent(s.eaApikey) +
      '&clientSecret=' + encodeURIComponent(s.eaApisecret) + '&did=' + encodeURIComponent(s.eaDid) + '&txId=' + encodeURIComponent(txId));
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var tx = data.transfer || data;
    selectedTxData = tx;

    var pdUrl = null;
    if (tx.agents) {
      for (var i = 0; i < tx.agents.length; i++) {
        var policies = tx.agents[i].policies || [];
        for (var j = 0; j < policies.length; j++) {
          if (policies[j].type === 'REQUIRE_PRESENTATION' || policies[j]['@type'] === 'REQUIRE_PRESENTATION') {
            pdUrl = policies[j].presentationDefinition || policies[j].presentation_definition || null;
          }
        }
      }
    }

    rfiSelectedPDUrl = pdUrl;

    if (!pdUrl) {
      pdBody.innerHTML = '<p class="hint" style="color:#dc2626">No REQUIRE_PRESENTATION policy found on this transfer.</p>';
      return;
    }

    var pdName = String(pdUrl).split('/').pop();
    var pdRes = await fetch('/api/pd-proxy?url=' + encodeURIComponent(pdUrl));
    var pdData = await pdRes.json();

    var descriptors = pdData.input_descriptors || [];
    var html = '<div class="cred-row"><span class="k">PD URL</span><span class="v mono" style="font-size:10px">' + esc(pdName) + '</span></div>';
    html += '<div class="cred-row"><span class="k">Descriptors</span><span class="v">' + descriptors.length + ' field groups</span></div>';

    html += '<div style="margin-top:8px;font-size:10px;font-weight:600;color:#5b4cdb">REQUIRED FIELDS</div>';
    for (var d = 0; d < descriptors.length; d++) {
      var desc = descriptors[d];
      var fields = (desc.constraints && desc.constraints.fields) || [];
      var fieldPaths = fields.map(function(f) {
        var paths = [];
        if (Array.isArray(f.path)) {
          paths = f.path;
        } else if (f.path && typeof f.path === 'object') {
          if (f.path.natural) paths = paths.concat(f.path.natural);
          if (f.path.legal) paths = paths.concat(f.path.legal);
        }
        return paths.map(function(p) {
          return p.replace('$.originator.originatorPerson[0].naturalPerson.', '')
                  .replace('$.originator.originatorPersons[0].naturalPerson.', '')
                  .replace('$.originator.', '').replace('$.beneficiary.', 'bene.');
        }).join(', ');
      });
      html += '<div class="cred-row"><span class="k" style="font-size:10px">' + esc(desc.name || desc.id) + '</span><span class="v" style="font-size:10px">' + esc(fieldPaths.join('; ')) + '</span></div>';
    }

    pdBody.innerHTML = html;

    // Show PII form
    var eaCustIdx = document.getElementById('ea-customer-select').value;
    var eaCust = eaCustIdx !== '' ? IND_CASES[parseInt(eaCustIdx)] : null;

    piiBody.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
        '<div>' +
          '<div style="font-size:10px;font-weight:600;color:#5b4cdb;text-transform:uppercase;margin-bottom:6px">Originator Identity</div>' +
          '<div class="form-group"><label>First Name</label><input type="text" id="rfi-orig-fn" value="' + (eaCust ? esc(eaCust.firstName) : '') + '" style="font-size:11px"></div>' +
          '<div class="form-group"><label>Last Name</label><input type="text" id="rfi-orig-ln" value="' + (eaCust ? esc(eaCust.lastName) : '') + '" style="font-size:11px"></div>' +
          '<div class="form-group"><label>Date of Birth</label><input type="text" id="rfi-orig-dob" value="' + (eaCust ? esc(eaCust.dob || '') : '') + '" placeholder="1990-01-01" style="font-size:11px"></div>' +
          '<div class="form-group"><label>Place of Birth</label><input type="text" id="rfi-orig-pob" placeholder="AE" style="font-size:11px"></div>' +
        '</div>' +
        '<div>' +
          '<div style="font-size:10px;font-weight:600;color:#5b4cdb;text-transform:uppercase;margin-bottom:6px">Originator Docs</div>' +
          '<div class="form-group"><label>National ID</label><input type="text" id="rfi-orig-nid" placeholder="Passport number" style="font-size:11px"></div>' +
          '<div class="form-group"><label>National ID Type</label><input type="text" id="rfi-orig-nidtype" value="PASSPORT" style="font-size:11px"></div>' +
          '<div class="form-group"><label>ID Country of Issue</label><input type="text" id="rfi-orig-nidcountry" value="AE" style="font-size:11px"></div>' +
          '<div class="form-group"><label>Street Name</label><input type="text" id="rfi-orig-street" value="Sheikh Zayed Road" style="font-size:11px"></div>' +
          '<div class="form-group"><label>Building Number</label><input type="text" id="rfi-orig-building" value="123" style="font-size:11px"></div>' +
          '<div class="form-group"><label>Post Code</label><input type="text" id="rfi-orig-postcode" value="00000" style="font-size:11px"></div>' +
          '<div class="form-group"><label>Town Name</label><input type="text" id="rfi-orig-town" value="Dubai" style="font-size:11px"></div>' +
          '<div class="form-group"><label>Address (full line)</label><input type="text" id="rfi-orig-addr" value="Building 123, Sheikh Zayed Rd, Dubai, AE" style="font-size:11px"></div>' +
        '</div>' +
      '</div>';

    // Unlock on-chain section
    document.getElementById('ea-onchain-section').style.display = 'block';
    var onchainTitle = document.getElementById('ea-onchain-title');
    onchainTitle.style.opacity = '1';
    onchainTitle.innerHTML = 'Step 6 · On-Chain Transfer';

  } catch(e) {
    pdBody.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
  }
}

// ─── EA: Append PII to EB's RFI Transfer ───
async function appendPiiToRFI() {
  var s = await loadSettings();
  if (!rfiSelectedTxId) return;
  var btn = document.getElementById('ea-rfi-append-btn');
  btn.disabled = true; btn.textContent = 'Submitting...';

  try {
    var wallets = {};
    try { var wr = await fetch('/api/wallet/persisted'); wallets = await wr.json(); } catch(e) {}
    var eaWallet = (wallets.ea || {}).address;
    var ebWallet = (wallets.eb || {}).address;

    var fnEl = document.getElementById('rfi-orig-fn');
    if (!fnEl) throw new Error('PII form not loaded. Click an RFI transfer first to load the form.');

    var fn = fnEl.value.trim();
    var ln = document.getElementById('rfi-orig-ln').value.trim();
    var dob = document.getElementById('rfi-orig-dob').value.trim();
    var pob = document.getElementById('rfi-orig-pob').value.trim();
    var nid = document.getElementById('rfi-orig-nid').value.trim();
    var nidtype = document.getElementById('rfi-orig-nidtype').value.trim() || 'PASSPORT';
    var nidcountry = document.getElementById('rfi-orig-nidcountry').value.trim() || 'AE';
    var addr = document.getElementById('rfi-orig-addr').value.trim();

    var natPerson = {
      name: { nameIdentifier: [{ primaryIdentifier: ln, secondaryIdentifier: fn, naturalPersonNameIdentifierType: 'LEGL' }] },
      dateAndPlaceOfBirth: { dateOfBirth: dob, placeOfBirth: pob }
    };
    if (nid) natPerson.nationalIdentification = { nationalIdentifier: nid, nationalIdentifierType: nidtype };
    if (addr) natPerson.geographicAddress = [{
      addressType: 'RES',
      addressLine: [addr],
      streetName: document.getElementById('rfi-orig-street').value.trim() || addr,
      buildingNumber: document.getElementById('rfi-orig-building').value.trim() || '—',
      postCode: document.getElementById('rfi-orig-postcode').value.trim() || '—',
      townName: document.getElementById('rfi-orig-town').value.trim() || '—',
      country: nidcountry
    }];

    var ivms101 = {
      originator: {
        originatorPerson: [{
          naturalPerson: natPerson,
          accountNumber: ['did:pkh:eip155:11155111:' + eaWallet]
        }]
      },
      beneficiary: {
        beneficiaryPerson: [{
          naturalPerson: {
            name: { nameIdentifier: [{ primaryIdentifier: 'Beneficiary', secondaryIdentifier: 'Name', naturalPersonNameIdentifierType: 'LEGL' }] }
          },
          accountNumber: ['did:pkh:eip155:11155111:' + ebWallet]
        }]
      }
    };

    var res = await fetch('/api/notabene/transfer/append', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: s.eaApikey, clientSecret: s.eaApisecret, did: s.eaDid, txId: rfiSelectedTxId, ivms101: ivms101 })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    btn.textContent = '✓ PII Submitted';
    btn.style.background = '#059669'; btn.style.borderColor = '#059669';

    document.getElementById('ea-rfi-pii-body').insertAdjacentHTML('afterbegin',
      '<div style="background:#d1fae5;color:#065f46;padding:6px 10px;border-radius:4px;margin-bottom:8px;font-size:12px;font-weight:600">' +
      '✓ PII submitted to EB\'s transfer. EB can now verify your compliance.</div>');

    // Unlock EA Approve button
    var approveBtn = document.getElementById('ea-rfi-approve-btn');
    if (approveBtn) approveBtn.disabled = false;
  } catch(e) {
    btn.disabled = false; btn.textContent = 'Submit PII';
    alert('Failed to submit PII: ' + e.message);
  }
}

// ─── EB: Approve Counter-Transfer (outgoing) ───
async function ebApproveCounterTransfer() {
  var s = await loadSettings();
  var btn = document.getElementById('eb-rfi-approve-btn');
  var settleBtn = document.getElementById('eb-rfi-settle-btn');
  var result = document.getElementById('eb-rfi-settle-result');
  var txId = window.__counterTxId;
  if (!txId) return;

  btn.disabled = true; btn.textContent = 'Approving...';
  result.style.display = 'block';
  result.innerHTML = '<div style="color:#888;font-size:11px">Approving...</div>';

  try {
    var res = await fetch('/api/notabene/transfer/authorize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: s.ebApikey, clientSecret: s.ebApisecret, did: s.ebDid, txId: txId })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    btn.textContent = '✓ Approved'; btn.className = 'btn btn-success';
    settleBtn.disabled = false;
    result.innerHTML = '<div style="background:#d1fae5;color:#065f46;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:600">✓ Approved — ready to settle</div>';
  } catch(e) {
    btn.disabled = false; btn.textContent = '✓ Approve';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
  }
}

// ─── EB: Settle Counter-Transfer (outgoing) ───
async function ebSettleCounterTransfer() {
  var s = await loadSettings();
  var btn = document.getElementById('eb-rfi-settle-btn');
  var result = document.getElementById('eb-rfi-settle-result');
  var txId = window.__counterTxId;
  if (!txId) return;

  if (!onchainTxHash) {
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ No on-chain tx hash. Broadcast transfer in Step 6 first.</div>';
    return;
  }

  btn.disabled = true; btn.textContent = 'Settling...';

  try {
    var res = await fetch('/api/notabene/transfer/settle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: s.ebApikey, clientSecret: s.ebApisecret, did: s.ebDid, txId: txId, settlementId: onchainTxHash })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    btn.textContent = '✓ Settled'; btn.className = 'btn btn-success';
    result.innerHTML = '<div style="background:#d1fae5;color:#047857;padding:10px;border-radius:6px;font-size:12px">' +
      '<div style="font-weight:600;margin-bottom:4px">✓ Counter-Transfer Settled (EB side)</div>' +
      '<div class="mono" style="font-size:10px;word-break:break-all">Settlement ID: ' + esc(onchainTxHash) + '</div>' +
      '<div style="margin-top:6px;font-size:11px">EA can now approve and settle from their side.</div></div>';
  } catch(e) {
    btn.disabled = false; btn.textContent = 'Settle Transfer';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
  }
}

// ─── EA: Approve Counter-Transfer (incoming) ───
async function eaApproveCounterTransfer() {
  var s = await loadSettings();
  var btn = document.getElementById('ea-rfi-approve-btn');
  var settleBtn = document.getElementById('ea-rfi-settle-btn');
  var result = document.getElementById('ea-rfi-settle-result');
  if (!rfiSelectedTxId) return;

  btn.disabled = true; btn.textContent = 'Approving...';
  result.style.display = 'block';
  result.innerHTML = '<div style="color:#888;font-size:11px">Approving...</div>';

  try {
    var res = await fetch('/api/notabene/transfer/authorize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: s.eaApikey, clientSecret: s.eaApisecret, did: s.eaDid, txId: rfiSelectedTxId })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    btn.textContent = '✓ Approved'; btn.className = 'btn btn-success';
    settleBtn.disabled = false;
    result.innerHTML = '<div style="background:#d1fae5;color:#065f46;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:600">✓ Approved — ready to settle</div>';
  } catch(e) {
    btn.disabled = false; btn.textContent = '✓ Approve';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
  }
}

// ─── EA: Settle Counter-Transfer (incoming) ───
async function eaSettleCounterTransfer() {
  var s = await loadSettings();
  var btn = document.getElementById('ea-rfi-settle-btn');
  var result = document.getElementById('ea-rfi-settle-result');
  if (!rfiSelectedTxId) return;

  if (!onchainTxHash) {
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ No on-chain tx hash. Broadcast transfer in Step 6 first.</div>';
    return;
  }

  btn.disabled = true; btn.textContent = 'Settling...';

  try {
    var res = await fetch('/api/notabene/transfer/settle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: s.eaApikey, clientSecret: s.eaApisecret, did: s.eaDid, txId: rfiSelectedTxId, settlementId: onchainTxHash })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    btn.textContent = '✓ Settled'; btn.className = 'btn btn-success';
    result.innerHTML = '<div style="background:#d1fae5;color:#047857;padding:10px;border-radius:6px;font-size:12px">' +
      '<div style="font-weight:600;margin-bottom:4px">✓ Counter-Transfer Settled (EA side) — Dual Settlement Complete</div>' +
      '<div class="mono" style="font-size:10px;word-break:break-all">Settlement ID: ' + esc(onchainTxHash) + '</div>' +
      '<div style="margin-top:6px;font-size:11px">Both EB and EA have settled the counter-transfer. Compliance achieved.</div></div>';
  } catch(e) {
    btn.disabled = false; btn.textContent = 'Settle Transfer';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
  }
}
