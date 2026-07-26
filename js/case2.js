async function createCounterTransfer() {
  var s = await loadSettings();
  var btn = document.getElementById('eb-counter-btn');
  var result = document.getElementById('eb-counter-result');

  var wallets = {};
  try { var wr = await fetch('/api/wallet/persisted'); wallets = await wr.json(); } catch(e) {}
  var eaWallet = (wallets.ea || {}).address;
  var ebWallet = (wallets.eb || {}).address;
  if (!eaWallet || !ebWallet) {
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ Missing wallet addresses. Generate in Settings first.</div>';
    return;
  }

  var pdUrl = document.getElementById('eb-pd-url').value.trim();
  var amount = (selectedTxData && selectedTxData.amount) ? selectedTxData.amount : '3500';

  btn.disabled = true; btn.textContent = 'Creating...';
  result.style.display = 'block';
  result.innerHTML = '<div style="color:#888;font-size:11px">Creating counter-transfer with your requirements...</div>';

  var ref = 'RFI-' + Date.now().toString(36).toUpperCase();
  var origId = 'urn:uuid:' + crypto.randomUUID();
  var beneId = 'urn:uuid:' + crypto.randomUUID();
  var USDT_TEST = 'eip155:11155111/erc20:0xA2c7341dAdB120aa638795Dc73f7c74Ebd35D868';

  var requirePresentation = {
    '@type': 'REQUIRE_PRESENTATION',
    'from': s.eaDid,
    'for': s.ebDid,
    'presentationDefinition': pdUrl
  };

  var transferBody = {
    ref: ref,
    originator: { '@id': origId },
    beneficiary: { '@id': beneId },
    asset: USDT_TEST,
    amount: String(amount),
    transactionValue: { amount: String(amount), currency: 'USD' },
    agents: [
      { '@id': 'did:pkh:eip155:11155111:' + eaWallet, 'for': s.eaDid, role: 'SourceAddress' },
      { '@id': s.eaDid, 'for': origId, role: 'VASP' },
      { '@id': s.ebDid, 'for': beneId, role: 'VASP', policies: [requirePresentation] },
      { '@id': 'did:pkh:eip155:11155111:' + ebWallet, 'for': s.ebDid, role: 'SettlementAddress' }
    ]
  };

  try {
    var res = await fetch('/api/notabene/transfer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: s.ebApikey, clientSecret: s.ebApisecret, entityDid: s.ebDid, transferBody: transferBody })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    counterTransferTxId = data.transfer ? data.transfer['@id'] : data.id;
    var status = data.transfer ? data.transfer.status : data.status;

    result.innerHTML = '<div style="background:#d1fae5;color:#065f46;padding:8px 10px;border-radius:4px;font-size:12px;font-weight:600">' +
      '✓ Counter-transfer created — ' + esc(counterTransferTxId.slice(0,16)) + '...<br>' +
      '<span style="font-weight:400;font-size:11px">Status: ' + esc(status) + ' · EA will see this as an incoming RFI with actionRequired: true</span></div>';

    // Show review card
    document.getElementById('eb-counter-review-card').style.display = 'block';
    btn.disabled = false; btn.textContent = '✓ Created';
    btn.style.background = '#059669'; btn.style.borderColor = '#059669';
  } catch(e) {
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
    btn.disabled = false; btn.textContent = 'Create Transfer';
  }
}

// EB refreshes counter-transfer status to check if EA appended PII
async function refreshCounterTransfer() {
  var s = await loadSettings();
  if (!counterTransferTxId) return;
  var body = document.getElementById('eb-counter-review-body');
  body.innerHTML = '<div style="color:#888;font-size:11px">Checking...</div>';

  try {
    // Check TAP policies
    var res = await fetch('/api/notabene/transfer/tap-policies?clientId=' + encodeURIComponent(s.ebApikey) +
      '&clientSecret=' + encodeURIComponent(s.ebApisecret) + '&did=' + encodeURIComponent(s.ebDid) + '&txId=' + encodeURIComponent(counterTransferTxId));
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var policies = data.data || data.policies || [];
    policies = policies.filter(function(p) { return (p['@type'] || p.type) !== 'REQUIRE_RELATIONSHIP_CONFIRMATION'; });
    var html = '';
    var allCompleted = policies.length > 0;

    for (var i = 0; i < policies.length; i++) {
      var p = policies[i];
      var pStatus = p.status || 'UNKNOWN';
      var color = pStatus === 'COMPLETED' ? '#059669' : '#d97706';
      var pdUrl = p.presentationDefinition || p.presentation_definition || '';
      var pdName = pdUrl ? String(pdUrl).split('/').pop() : '—';
      html += '<div class="cred-row"><span class="k">' + esc(p.type || 'Policy') + '</span>' +
        '<span class="v"><span style="color:' + color + ';font-weight:600">' + esc(pStatus) + '</span> · PD: ' + esc(pdName) + '</span></div>';
      if (pStatus !== 'COMPLETED') allCompleted = false;
    }

    if (policies.length === 0) {
      html = '<p class="hint">No policies found on this transfer.</p>';
      allCompleted = false;
    }

    if (allCompleted) {
      html += '<div style="background:#d1fae5;color:#065f46;padding:6px 10px;border-radius:4px;margin-top:8px;font-size:12px;font-weight:600">' +
        '✓ All requirements satisfied — EA has submitted compliant PII. You can now wait for on-chain settlement and match the deposit.</div>';
    } else {
      html += '<div style="background:#fef3c7;color:#92400e;padding:6px 10px;border-radius:4px;margin-top:8px;font-size:12px">' +
        '⏳ Waiting for EA to append PII...</div>';
    }

    body.innerHTML = html;
  } catch(e) {
    body.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
  }
}

// EA fetches incoming RFI transfers (created by EB)
var rfiSelectedTxId = null;
var rfiSelectedPDUrl = null;

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

    // Filter: only show transfers initiated by EB (RFI transfers)
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

// EA selects an RFI transfer and views EB's PD requirements
async function selectRFITransfer(txId) {
  var s = await loadSettings();
  rfiSelectedTxId = txId;
  selectedTxId = txId; // also set the global selectedTxId for on-chain/settle steps

  // Re-fetch to highlight selected
  await fetchIncomingRFI();

  // Show detail section
  document.getElementById('ea-rfi-detail').style.display = 'block';

  // Fetch transfer details to extract PD
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

    // Find REQUIRE_PRESENTATION policy and extract PD URL
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

    // Fetch PD JSON via server proxy (CORS workaround)
    var pdName = String(pdUrl).split('/').pop();
    var pdRes = await fetch('/api/pd-proxy?url=' + encodeURIComponent(pdUrl));
    var pdData = await pdRes.json();

    var descriptors = pdData.input_descriptors || [];
    var html = '<div class="cred-row"><span class="k">PD URL</span><span class="v mono" style="font-size:10px">' + esc(pdName) + '</span></div>';
    html += '<div class="cred-row"><span class="k">Descriptors</span><span class="v">' + descriptors.length + ' field groups</span></div>';

    // List required fields
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

    // Unlock on-chain section (transfer is already authorized by EB as initiator)
    document.getElementById('ea-onchain-section').style.display = 'block';
    var onchainTitle = document.getElementById('ea-onchain-title');
    onchainTitle.style.opacity = '1';
    onchainTitle.innerHTML = 'Step 6 · On-Chain Transfer';

  } catch(e) {
    pdBody.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
  }
}

// EA appends PII to the EB-created RFI transfer
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

    // Guard: ensure PII form inputs exist (selectRFITransfer may have failed to render them)
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

    // Build IVMS101 with full originator identity
    // nationalIdentification + geographicAddress go INSIDE naturalPerson, not at person level
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
  } catch(e) {
    btn.disabled = false; btn.textContent = 'Submit PII';
    alert('Failed to submit PII: ' + e.message);
  }
}

// Global variable to store on-chain tx hash for settlement
