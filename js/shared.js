// ─── Global case identifier (set per-page before shared.js loads) ───
var CASE = typeof CASE !== 'undefined' ? CASE : 'case1';

// ─── Settings & Credentials ───
var IND_CASES = [
  { firstName: 'Joelamltest', lastName: 'Red', dob: '1999-01-24', hit: 'Yes', hitType: 'Any' },
  { firstName: 'Joelamltest', lastName: 'Red', dob: null, hit: 'Yes', hitType: 'Any' },
  { firstName: 'Joelamltest', lastName: 'Yellow', dob: null, hit: 'Yes', hitType: 'Any' },
  { firstName: 'Joelamltest', lastName: 'Testpep', dob: null, hit: 'Yes', hitType: 'PEP' },
  { firstName: 'Joelamltest', lastName: 'Testsanc', dob: null, hit: 'Yes', hitType: 'Sanctions' },
  { firstName: 'John', lastName: 'Doe', dob: '1990-01-01', hit: 'No', hitType: '—' }
];

function populateCustomerSelects() {
  ['ea', 'eb-ea'].forEach(function(key) {
    var selId = key === 'eb-ea' ? 'eb-customer-select-ea' : key + '-customer-select';
    var sel = document.getElementById(selId);
    if (!sel) return;
    sel.innerHTML = '<option value="">— choose —</option>';
    IND_CASES.forEach(function(c, i) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = c.firstName + ' ' + c.lastName + (c.dob ? ' (' + c.dob + ')' : '');
      sel.appendChild(opt);
    });
  });
}

function updateEaCustomer() {
  var idx = document.getElementById('ea-customer-select').value;
  var detail = document.getElementById('ea-customer-detail');
  if (idx === '') { detail.style.display = 'none'; return; }
  detail.style.display = 'block';
  var c = IND_CASES[parseInt(idx)];
  fill('ea-customer-name', c.firstName + ' ' + c.lastName);
  fill('ea-customer-dob', c.dob || '—');
  fill('ea-customer-hit', c.hitType + (c.hit === 'Yes' ? ' ⚠' : ''));
}

function updateEbCustomerEA() {
  var idx = document.getElementById('eb-customer-select-ea').value;
  var detail = document.getElementById('eb-customer-detail-ea');
  if (idx === '') { detail.style.display = 'none'; return; }
  detail.style.display = 'block';
  var c = IND_CASES[parseInt(idx)];
  fill('eb-customer-name-ea', c.firstName + ' ' + c.lastName);
  fill('eb-customer-dob-ea', c.dob || '—');
  fill('eb-customer-hit-ea', c.hitType + (c.hit === 'Yes' ? ' ⚠' : ''));
}

// Load settings from server API (.env) — cached after first fetch
var _settings = null;
async function loadSettings() {
  if (_settings) return _settings;
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    _settings = {
      notabeneBaseUrl: data.config?.notabeneBaseUrl || 'https://api.eu1.notabene.id',
      eaDid: data.notabene?.ea?.did || '',
      eaApikey: data.notabene?.ea?.clientId || '',
      eaApisecret: data.notabene?.ea?.clientSecret || '',
      caDid: data.notabene?.ca?.did || '',
      caApikey: data.notabene?.ca?.clientId || '',
      caApisecret: data.notabene?.ca?.clientSecret || '',
      ebDid: data.notabene?.eb?.did || '',
      ebApikey: data.notabene?.eb?.clientId || '',
      ebApisecret: data.notabene?.eb?.clientSecret || '',
      cbDid: data.notabene?.cb?.did || '',
      cbApikey: data.notabene?.cb?.clientId || '',
      cbApisecret: data.notabene?.cb?.clientSecret || ''
    };
  } catch(e) {
    console.error('Failed to load settings:', e);
    _settings = {
      notabeneBaseUrl: 'https://api.eu1.notabene.id',
      eaDid: '', eaApikey: '', eaApisecret: '',
      caDid: '', caApikey: '', caApisecret: '',
      ebDid: '', ebApikey: '', ebApisecret: '',
      cbDid: '', cbApikey: '', cbApisecret: ''
    };
  }
  return _settings;
}

// Initialize settings on page load
loadSettings();

function fill(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val || '—';
}

// ─── Step 1: Connection Test ───
async function verifyConnection(role) {
  var s = await loadSettings();
  var clientId = s[role + 'Apikey'];
  var clientSecret = s[role + 'Apisecret'];
  var did = s[role + 'Did'];
  var btn = document.getElementById(role + '-verify-btn');
  var result = document.getElementById(role + '-verify-result');

  if (!clientId || !clientSecret || !did) {
    result.style.display = 'block';
    result.innerHTML = '<div class="cred-row"><span class="k">Status</span><span class="v" style="color:#dc2626;font-weight:600">✗ Missing credentials</span></div>' +
                       '<div class="cred-row"><span class="k">Hint</span><span class="v">Configure ' + role.toUpperCase() + ' API key, secret, and DID in Settings.</span></div>';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Verifying...';
  result.style.display = 'block';
  result.innerHTML = '<div class="cred-row"><span class="k">Status</span><span class="v" style="color:#888">Authenticating via OAuth...</span></div>';

  try {
    var url = '/api/notabene/entity?clientId=' + encodeURIComponent(clientId) +
              '&clientSecret=' + encodeURIComponent(clientSecret) +
              '&did=' + encodeURIComponent(did);
    var res = await fetch(url);
    var data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error || ('HTTP ' + res.status));
    }

    result.innerHTML =
      '<div class="cred-row"><span class="k">Status</span><span class="v" style="color:#059669;font-weight:600">✓ Connected</span></div>' +
      '<div class="cred-row"><span class="k">Entity Name</span><span class="v" style="font-weight:600">' + esc(data.name || data.legalName || '—') + '</span></div>' +
      '<div class="cred-row"><span class="k">DID</span><span class="v mono">' + esc(data.did) + '</span></div>' +
      '<div class="cred-row"><span class="k">Jurisdiction</span><span class="v">' + esc(data.jurisdiction || '—') + '</span></div>' +
      '<div class="cred-row"><span class="k">Legal Structure</span><span class="v">' + esc(data.legalStructure || '—') + '</span></div>' +
      '<div class="cred-row"><span class="k">Regulated</span><span class="v">' + esc(data.isRegulated || '—') + '</span></div>' +
      '<div class="cred-row"><span class="k">Sandbox</span><span class="v">' + (data.sandbox ? 'Yes' : 'No') + '</span></div>' +
      '<div class="cred-row"><span class="k">Website</span><span class="v">' + esc(data.website || '—') + '</span></div>';
    btn.textContent = '✓ Verified';
    btn.className = 'btn btn-success';
  } catch(e) {
    result.innerHTML = '<div class="cred-row"><span class="k">Status</span><span class="v" style="color:#dc2626;font-weight:600">✗ Failed</span></div>' +
                       '<div class="cred-row"><span class="k">Error</span><span class="v mono">' + esc(e.message) + '</span></div>';
    btn.disabled = false;
    btn.textContent = 'Retry';
    btn.className = 'btn btn-danger';
  }
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

// ─── Case Selector + Tab Switching ───

function activateTab(tabName) {
  document.querySelectorAll('.role-tab').forEach(function(t) {
    t.classList.remove('active');
    // Keep passive class if it was there
    if (!t.classList.contains('passive')) {
      t.style.pointerEvents = '';
    }
  });
  document.querySelectorAll('.role-page').forEach(function(p) { p.classList.remove('active'); });

  var tab = document.querySelector('.role-tab[data-tab="' + tabName + '"]');
  if (tab && !tab.classList.contains('passive')) {
    tab.classList.add('active');
    document.getElementById('role-' + tabName).classList.add('active');
  }
}

// Click handlers on tabs — block if passive
document.querySelectorAll('.role-tab').forEach(function(tab) {
  tab.addEventListener('click', function(e) {
    if (tab.classList.contains('passive')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    activateTab(tab.dataset.tab);
  });
});

// ─── Transfer Flow Logic ───
var selectedTxId = null;
var selectedTxData = null;

// Auto-fill transfer form from settings + custody wallets
async function autoFillTransferForm() {
  var s = await loadSettings();
  
  // Fetch custody wallets from settings
  var wallets = {};
  try {
    var res = await fetch('/api/wallet/persisted');
    wallets = await res.json();
  } catch(e) {}
  
  var ebDid = s.ebDid || '';
  var ebWallet = wallets.eb ? wallets.eb.address : '';
  var eaWallet = wallets.ea ? wallets.ea.address : '';
  
  var benEl = document.getElementById('ea-tx-beneficiary');
  if (benEl) benEl.value = ebDid;

  var destEl = document.getElementById('ea-tx-destaddr');
  if (destEl) {
    if (typeof CASE !== 'undefined' && CASE === 'case6' && window.case6UnregisteredAddress) {
      destEl.value = window.case6UnregisteredAddress;
    } else {
      destEl.value = ebWallet;
    }
  }
  
  var discEl = document.getElementById('ea-discover-address');
  if (discEl) discEl.value = ebWallet;
  
  // Populate address registration displays
  var eaDisplay = document.getElementById('ea-register-address-display');
  if (eaDisplay) eaDisplay.textContent = eaWallet ? 'did:pkh:eip155:11155111:' + eaWallet : 'No wallet configured';
  
  var ebDisplay = document.getElementById('eb-register-address-display');
  if (ebDisplay) ebDisplay.textContent = ebWallet ? 'did:pkh:eip155:11155111:' + ebWallet : 'No wallet configured';
  
  // Populate match address display (Entity B Step 6)
  var ebMatchDisplay = document.getElementById('eb-match-address');
  if (ebMatchDisplay) ebMatchDisplay.textContent = ebWallet ? ebWallet : 'No wallet configured';
  
  // Case 5: Auto-fill custodian DIDs in address registration
  if (typeof CASE !== 'undefined' && CASE === 'case5') {
    var eaCustEl = document.getElementById('ea-register-custodian');
    if (eaCustEl && !eaCustEl.value && s.caDid) eaCustEl.value = s.caDid;
    var ebCustEl = document.getElementById('eb-register-custodian');
    if (ebCustEl && !ebCustEl.value && s.cbDid) ebCustEl.value = s.cbDid;
  }
}

// ─── Pre-Transfer Validation ───

// 2a: Address Registration (Relationships)
async function registerAddress(role) {
  var s = await loadSettings();
  var btn = document.getElementById(role + '-register-addr-btn');
  var result = document.getElementById(role + '-register-result');
  var custodianEl = document.getElementById(role + '-register-custodian');

  // Fetch custody wallets from settings
  var wallets = {};
  try {
    var res = await fetch('/api/wallet/persisted');
    wallets = await res.json();
  } catch(e) {}

  var walletAddr = wallets[role] ? wallets[role].address : '';
  if (!walletAddr) {
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">No wallet found for ' + role.toUpperCase() + '. Generate one in Settings first.</div>';
    return;
  }

  // Build did:pkh address
  var didPkh = 'did:pkh:eip155:11155111:' + walletAddr;

  // Get entity DID from settings
  var entityDid = s[role + 'Did'];
  var custodian = custodianEl.value.trim() || '';

  // Get role credentials
  var clientId = s[role + 'Apikey'];
  var clientSecret = s[role + 'Apisecret'];

  if (!clientId || !clientSecret || !entityDid) {
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">Missing credentials for ' + role.toUpperCase() + '. Configure in Settings.</div>';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Registering...';
  result.style.display = 'block';
  result.innerHTML = '<div style="color:#888;font-size:11px">Registering address relationship...</div>';

  try {
    var res = await fetch('/api/notabene/register-address', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: clientId,
        clientSecret: clientSecret,
        entityDid: entityDid,
        address: didPkh,
        custodian: custodian || undefined
      })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var html = '<div style="background:#f0fdf4;border-radius:6px;padding:10px;border:1px solid #bbf7d0">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<span style="font-size:10px;font-weight:600;color:#059669;text-transform:uppercase">Address Registered</span>' +
        '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:3px;background:#059669;color:#fff">CONFIRMED</span>' +
      '</div>';
    html += '<div class="cred-row"><span class="k">Address</span><span class="v mono" style="font-size:9px;word-break:break-all">' + esc(didPkh) + '</span></div>';
    html += '<div class="cred-row"><span class="k">Entity</span><span class="v mono" style="font-size:9px">' + esc(entityDid) + '</span></div>';
    if (custodian) {
      html += '<div class="cred-row"><span class="k">Custodian</span><span class="v mono" style="font-size:9px">' + esc(custodian) + '</span></div>';
    }
    if (data.id) {
      html += '<div class="cred-row"><span class="k">Relationship ID</span><span class="v mono" style="font-size:9px">' + esc(data.id) + '</span></div>';
    }
    html += '<details style="margin-top:6px"><summary style="cursor:pointer;font-size:10px;color:#059669;font-weight:600">Raw Response</summary>' +
      '<pre class="mono" style="font-size:9px;max-height:150px;overflow:auto;background:#f8f9fa;padding:8px;border-radius:4px;margin-top:4px;border:1px solid #e8e8e8">' + esc(JSON.stringify(data, null, 2)) + '</pre></details>';
    html += '</div>';

    result.innerHTML = html;
    btn.textContent = '✓ Registered';
    btn.className = 'btn btn-success btn-sm';
  } catch(e) {
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
    btn.disabled = false;
    btn.textContent = 'Retry';
    btn.className = 'btn btn-danger btn-sm';
  }
}

// 2b: Counterparty Discovery
async function discoverCounterparty() {
  var s = await loadSettings();
  var address = document.getElementById('ea-discover-address').value.trim();
  var asset = document.getElementById('ea-discover-asset').value.trim();
  var btn = document.getElementById('ea-discover-btn');
  var result = document.getElementById('ea-discover-result');

  if (!address) {
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">Enter a destination address first.</div>';
    return;
  }

  btn.disabled = true; btn.textContent = 'Discovering...';
  result.style.display = 'block';
  result.innerHTML = '<div style="color:#888;font-size:11px">Querying Notabene network...</div>';

  try {
    var res = await fetch('/api/notabene/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'ea',
        address: address, asset: asset
      })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var ao = data.addressOwnership || {};
    var confidence = ao.confidence || '—';
    var agent = ao.agent || {};
    var custodian = ao.custodian || {};
    var source = ao.source || '—';
    var confColor = confidence === 'CONFIRMED' ? '#059669' : confidence === 'UNCONFIRMED' ? '#d97706' : '#666';

    var html = '<div style="background:#f0f7ff;border-radius:6px;padding:10px;border:1px solid #dbeafe">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<span style="font-size:10px;font-weight:600;color:#1e40af;text-transform:uppercase">Discovered Counterparty</span>' +
        '<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:3px;background:' + confColor + ';color:#fff">' + esc(confidence) + '</span>' +
      '</div>';

    if (agent.did) {
      html += '<div class="cred-row"><span class="k">VASP</span><span class="v" style="font-weight:600">' + esc(agent.name || '—') + '</span></div>';
      html += '<div class="cred-row"><span class="k">DID</span><span class="v mono" style="font-size:10px">' + esc(agent.did) + '</span></div>';
      html += '<div class="cred-row"><span class="k">Jurisdiction</span><span class="v">' + esc(agent.jurisdiction || '—') + '</span></div>';
    } else {
      html += '<div style="font-size:11px;color:#888;padding:4px 0">No VASP found for this address.</div>';
    }

    if (custodian.did) {
      html += '<div class="cred-row" style="border-top:1px solid #e0e0e0;margin-top:4px;padding-top:6px"><span class="k">Custodian</span><span class="v">' + esc(custodian.name || '—') + ' (' + esc(custodian.jurisdiction || '—') + ')</span></div>';
    }

    html += '<div class="cred-row"><span class="k">Source</span><span class="v" style="font-size:10px">' + esc(source) + '</span></div>';
    html += '<div class="cred-row"><span class="k">Response Time</span><span class="v">' + esc(ao.responseTimeMs || '—') + ' ms</span></div>';

    // Raw JSON
    html += '<details style="margin-top:6px"><summary style="cursor:pointer;font-size:10px;color:#5b4cdb;font-weight:600">Raw Response</summary>' +
      '<pre class="mono" style="font-size:9px;max-height:200px;overflow:auto;background:#f8f9fa;padding:8px;border-radius:4px;margin-top:4px;border:1px solid #e8e8e8">' + esc(JSON.stringify(data, null, 2)) + '</pre></details>';
    html += '</div>';

    result.innerHTML = html;
    btn.textContent = '✓ Done'; btn.className = 'btn btn-success btn-sm';
  } catch(e) {
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
    btn.disabled = false; btn.textContent = 'Retry'; btn.className = 'btn btn-danger btn-sm';
  }
}

// 2b: Travel Rule Threshold — implicit, no API call needed (Notabene evaluates on transfer creation)
// 2c: Validate PII
// Global: store the last validated IVMS101 so createTransfer uses exactly what was validated
var lastValidatedIVMS101 = null;

// Validate PII against the presentation definition.
// ALWAYS reads from the PII editor fields — the single source of truth.
// On first call (from Validate button), pre-fills the editor from the selected customer.
// On subsequent calls (from Re-validate button), uses whatever the user typed.
async function validatePII(isRevalidate) {
  var s = await loadSettings();
  var pdUrl = document.getElementById('ea-pd-url').value.trim();
  var btn = document.getElementById('ea-validate-pii-btn');
  var result = document.getElementById('ea-validate-pii-result');

  // Fetch wallets for account numbers
  var wallets = {};
  try {
    var res = await fetch('/api/wallet/persisted');
    wallets = await res.json();
  } catch(e) {}

  var eaWallet = wallets.ea ? wallets.ea.address : '';
  var ebWallet = wallets.eb ? wallets.eb.address : '';

  // On first validation (not re-validate), populate the editor from selected customers
  if (!isRevalidate) {
    var eaCustIdx = document.getElementById('ea-customer-select').value;
    var ebCustIdx = document.getElementById('eb-customer-select-ea').value;
    var eaCust = eaCustIdx !== '' ? IND_CASES[parseInt(eaCustIdx)] : null;
    var ebCust = ebCustIdx !== '' ? IND_CASES[parseInt(ebCustIdx)] : null;

    if (!eaCust && !ebCust) {
      result.style.display = 'block';
      result.innerHTML = '<div style="color:#dc2626;font-size:11px">Select at least an originator or beneficiary customer first.</div>';
      return;
    }

    // Pre-fill editor with customer data (only fields the customer has)
    if (eaCust) {
      setVal('pii-orig-fn', eaCust.firstName || '');
      setVal('pii-orig-ln', eaCust.lastName || '');
      setVal('pii-orig-dob', eaCust.dob || '');
    }
    if (ebCust) {
      setVal('pii-bene-fn', ebCust.firstName || '');
      setVal('pii-bene-ln', ebCust.lastName || '');
      setVal('pii-bene-dob', ebCust.dob || '');
    }

    // Show the editor so user can fill missing fields
    showPIIEditor(eaCust, ebCust, eaWallet, ebWallet, []);
  }

  // Build IVMS101 from the editor — the single source of truth
  var ivms101 = buildIVMS101FromEditor();
  if (ivms101.originator && ivms101.originator.originatorPerson) {
    ivms101.originator.originatorPerson[0].accountNumber = ['did:pkh:eip155:11155111:' + eaWallet];
  }
  if (ivms101.beneficiary && ivms101.beneficiary.beneficiaryPerson) {
    ivms101.beneficiary.beneficiaryPerson[0].accountNumber = ['did:pkh:eip155:11155111:' + ebWallet];
  }

  // Check if editor has any data
  if (!ivms101.originator && !ivms101.beneficiary) {
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">Fill at least originator or beneficiary fields in the PII editor.</div>';
    return;
  }

  btn.disabled = true; btn.textContent = 'Validating...';
  result.style.display = 'block';
  result.innerHTML = '<div style="color:#888;font-size:11px">' + (isRevalidate ? 'Re-validating' : 'Validating') + ' PII against ' + esc(pdUrl) + '...</div>';

  try {
    var res = await fetch('/api/notabene/validate-pii', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'ea',
        presentationDefinitionUrl: pdUrl, ivms101: ivms101
      })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var isValid = data.isValid;
    // Only store IVMS101 if validation PASSED — prevents incomplete PII from being used
    lastValidatedIVMS101 = isValid ? JSON.parse(JSON.stringify(ivms101)) : null;
    var errors = data.errors || [];
    var missing = data.missingFields || [];
    var validPaths = data.validPaths || [];

    var valColor = isValid ? '#059669' : '#dc2626';
    var valBg = isValid ? '#f0fdf4' : '#fef2f2';
    var valBorder = isValid ? '#bbf7d0' : '#fecaca';
    var label = isRevalidate ? 'PII Re-Validation Result' : 'PII Validation Result';

    var html = '<div style="background:' + valBg + ';border-radius:6px;padding:10px;border:1px solid ' + valBorder + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<span style="font-size:10px;font-weight:600;color:' + valColor + ';text-transform:uppercase">' + label + '</span>' +
        '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:3px;background:' + valColor + ';color:#fff">' + (isValid ? 'VALID ✓' : 'INVALID ✗') + '</span>' +
      '</div>';

    if (errors.length > 0) {
      html += '<div style="font-size:10px;font-weight:600;color:#dc2626;margin-bottom:4px">Errors:</div>';
      errors.forEach(function(err) {
        html += '<div style="font-size:10px;color:#991b1b;padding:1px 0">• ' + esc(err) + '</div>';
      });
    }

    if (missing.length > 0) {
      html += '<div style="font-size:10px;font-weight:600;color:#d97706;margin:6px 0 4px">Missing Fields (' + missing.length + '):</div>';
      missing.forEach(function(f) {
        html += '<div class="mono" style="font-size:9px;color:#92400e;padding:1px 0;word-break:break-all">' + esc(f) + '</div>';
      });
    }

    if (validPaths.length > 0) {
      html += '<details style="margin-top:6px"><summary style="cursor:pointer;font-size:10px;color:#059669;font-weight:600">Valid Paths (' + validPaths.length + ')</summary>';
      validPaths.forEach(function(p) {
        html += '<div class="mono" style="font-size:9px;color:#065f46;padding:1px 0;word-break:break-all">' + esc(p) + '</div>';
      });
      html += '</details>';
    }

    html += '<details style="margin-top:6px"><summary style="cursor:pointer;font-size:10px;color:#5b4cdb;font-weight:600">Raw Response</summary>' +
      '<pre class="mono" style="font-size:9px;max-height:200px;overflow:auto;background:#f8f9fa;padding:8px;border-radius:4px;margin-top:4px;border:1px solid #e8e8e8">' + esc(JSON.stringify(data, null, 2)) + '</pre></details>';
    html += '</div>';

    result.innerHTML = html;

    // On invalid, show the editor so user can fix missing fields
    if (!isValid) {
      document.getElementById('ea-pii-editor-card').style.display = 'block';
    } else {
      document.getElementById('ea-pii-editor-card').style.display = 'none';
    }

    btn.textContent = isValid ? '✓ Valid' : '✓ Done'; btn.className = 'btn btn-success btn-sm';
  } catch(e) {
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
    btn.disabled = false; btn.textContent = 'Retry'; btn.className = 'btn btn-danger btn-sm';
  }

  function setVal(id, val) { var el = document.getElementById(id); if (el && !el.value) el.value = val; }
}

// ─── PII Editor helpers ───

function showPIIEditor(eaCust, ebCust, eaWallet, ebWallet, missingFields) {
  var card = document.getElementById('ea-pii-editor-card');
  card.style.display = '';

  // Prefill from customer data
  setVal('pii-orig-fn', eaCust ? eaCust.firstName : '');
  setVal('pii-orig-ln', eaCust ? eaCust.lastName : '');
  setVal('pii-orig-dob', eaCust ? (eaCust.dob || '') : '');
  setVal('pii-orig-pob', '');
  setVal('pii-orig-nid', '');
  setVal('pii-orig-nidtype', 'PASSPORT');
  setVal('pii-orig-addr', '');

  setVal('pii-bene-fn', ebCust ? ebCust.firstName : '');
  setVal('pii-bene-ln', ebCust ? ebCust.lastName : '');
  setVal('pii-bene-dob', ebCust ? (ebCust.dob || '') : '');
  setVal('pii-bene-pob', '');
  setVal('pii-bene-nid', '');
  setVal('pii-bene-nidtype', 'PASSPORT');
  setVal('pii-bene-addr', '');

  // Reset all warnings
  ['pii-warn-orig-fn','pii-warn-orig-ln','pii-warn-orig-dob','pii-warn-orig-pob','pii-warn-orig-nid','pii-warn-orig-addr',
   'pii-warn-bene-fn','pii-warn-bene-ln','pii-warn-bene-dob'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // Highlight missing fields
  var missingStr = missingFields.join(' ').toLowerCase();
  if (missingStr.indexOf('originator') >= 0) {
    if (missingStr.indexOf('primaryidentifier') >= 0 || missingStr.indexOf('nameidentifier') >= 0) {
      var warnEl = document.getElementById('pii-warn-orig-ln'); if (warnEl) warnEl.style.display = '';
    }
    if (missingStr.indexOf('secondaryidentifier') >= 0) {
      var warnEl = document.getElementById('pii-warn-orig-fn'); if (warnEl) warnEl.style.display = '';
    }
    if (missingStr.indexOf('dateofbirth') >= 0 || missingStr.indexOf('date_and_place_of_birth') >= 0) {
      var warnEl = document.getElementById('pii-warn-orig-dob'); if (warnEl) warnEl.style.display = '';
    }
    if (missingStr.indexOf('placeofbirth') >= 0) {
      var warnEl = document.getElementById('pii-warn-orig-pob'); if (warnEl) warnEl.style.display = '';
    }
    if (missingStr.indexOf('nationalidentification') >= 0 || missingStr.indexOf('national_identification') >= 0) {
      var warnEl = document.getElementById('pii-warn-orig-nid'); if (warnEl) warnEl.style.display = '';
    }
    if (missingStr.indexOf('address') >= 0 || missingStr.indexOf('geographic') >= 0) {
      var warnEl = document.getElementById('pii-warn-orig-addr'); if (warnEl) warnEl.style.display = '';
    }
  }
  if (missingStr.indexOf('beneficiary') >= 0) {
    if (missingStr.indexOf('primaryidentifier') >= 0 || missingStr.indexOf('nameidentifier') >= 0) {
      var warnEl = document.getElementById('pii-warn-bene-ln'); if (warnEl) warnEl.style.display = '';
    }
    if (missingStr.indexOf('secondaryidentifier') >= 0) {
      var warnEl = document.getElementById('pii-warn-bene-fn'); if (warnEl) warnEl.style.display = '';
    }
    if (missingStr.indexOf('dateofbirth') >= 0) {
      var warnEl = document.getElementById('pii-warn-bene-dob'); if (warnEl) warnEl.style.display = '';
    }
  }

  function setVal(id, v) { var el = document.getElementById(id); if (el) el.value = v; }
}

function fillPIIDefaults() {
  // Fill empty fields with demo defaults
  fillEmpty('pii-orig-dob', '1990-01-15');
  fillEmpty('pii-orig-pob', 'AE');
  fillEmpty('pii-orig-nid', 'P12345678');
  fillEmpty('pii-orig-nidtype', 'PASSPORT');
  fillEmpty('pii-orig-addr', 'Sheikh Zayed Road, Dubai, AE');
  fillEmpty('pii-bene-dob', '1992-03-22');
  fillEmpty('pii-bene-pob', 'AE');
  fillEmpty('pii-bene-nid', 'P87654321');
  fillEmpty('pii-bene-nidtype', 'PASSPORT');
  fillEmpty('pii-bene-addr', 'Khalifa Street, Abu Dhabi, AE');

  function fillEmpty(id, v) {
    var el = document.getElementById(id);
    if (el && !el.value.trim()) el.value = v;
  }
}

function buildIVMS101FromEditor() {
  var ivms101 = {};
  var eaCustIdx = document.getElementById('ea-customer-select').value;
  var ebCustIdx = document.getElementById('eb-customer-select-ea').value;
  var eaCust = eaCustIdx !== '' ? IND_CASES[parseInt(eaCustIdx)] : null;
  var ebCust = ebCustIdx !== '' ? IND_CASES[parseInt(ebCustIdx)] : null;

  var wallets = {};
  // Use cached wallet addresses if available
  var eaWallet = '';
  var ebWallet = '';

  // Build originator from editor fields
  var origFn = getVal('pii-orig-fn');
  var origLn = getVal('pii-orig-ln');
  if (origLn || origFn) {
    var np = {
      name: { nameIdentifier: [{ primaryIdentifier: origLn, secondaryIdentifier: origFn, naturalPersonNameIdentifierType: 'LEGL' }] }
    };
    var dob = getVal('pii-orig-dob');
    var pob = getVal('pii-orig-pob');
    if (dob || pob) {
      np.dateAndPlaceOfBirth = {};
      if (dob) np.dateAndPlaceOfBirth.dateOfBirth = dob;
      if (pob) np.dateAndPlaceOfBirth.placeOfBirth = pob;
    }
    var nid = getVal('pii-orig-nid');
    if (nid) {
      np.nationalIdentification = {
        nationalIdentifierType: getVal('pii-orig-nidtype') || 'PASSPORT',
        nationalIdentifier: nid
      };
    }
    var addr = getVal('pii-orig-addr');
    if (addr) {
      np.geographicAddress = [{ addressLine: [addr] }];
    }
    ivms101.originator = {
      originatorPerson: [{
        naturalPerson: np,
        accountNumber: ['did:pkh:eip155:11155111:' + eaWallet]
      }]
    };
  }

  // Build beneficiary from editor fields
  var beneFn = getVal('pii-bene-fn');
  var beneLn = getVal('pii-bene-ln');
  if (beneLn || beneFn) {
    var np = {
      name: { nameIdentifier: [{ primaryIdentifier: beneLn, secondaryIdentifier: beneFn, naturalPersonNameIdentifierType: 'LEGL' }] }
    };
    var dob = getVal('pii-bene-dob');
    var pob = getVal('pii-bene-pob');
    if (dob || pob) {
      np.dateAndPlaceOfBirth = {};
      if (dob) np.dateAndPlaceOfBirth.dateOfBirth = dob;
      if (pob) np.dateAndPlaceOfBirth.placeOfBirth = pob;
    }
    var nid = getVal('pii-bene-nid');
    if (nid) {
      np.nationalIdentification = {
        nationalIdentifierType: getVal('pii-bene-nidtype') || 'PASSPORT',
        nationalIdentifier: nid
      };
    }
    var addr = getVal('pii-bene-addr');
    if (addr) {
      np.geographicAddress = [{ addressLine: [addr] }];
    }
    ivms101.beneficiary = {
      beneficiaryPerson: [{
        naturalPerson: np,
        accountNumber: ['did:pkh:eip155:11155111:' + ebWallet]
      }]
    };
  }

  return ivms101;

  function getVal(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
}

// Re-validate is just validatePII in re-validate mode — no duplication.
async function revalidatePII() {
  return validatePII(true);
}

// Create Travel Rule transfer
async function createTransfer() {
  var s = await loadSettings();
  var amount = document.getElementById('ea-tx-amount').value || '3500';
  var btn = document.getElementById('ea-create-btn');
  var result = document.getElementById('ea-tx-result');

  // Enforce Travel Rule minimum threshold
  if (parseFloat(amount) < 3500) {
    result.style.display = 'block';
    result.innerHTML = '<div class="card"><div class="card-body" style="color:#dc2626">✗ Amount must be at least 3,500 USDT-TEST to trigger the Travel Rule. Current: ' + esc(amount) + '</div></div>';
    return;
  }

  // Fetch custody wallets from settings
  var wallets = {};
  try {
    var res = await fetch('/api/wallet/persisted');
    wallets = await res.json();
  } catch(e) {}

  var eaWallet = wallets.ea ? wallets.ea.address : '';
  var ebWallet = wallets.eb ? wallets.eb.address : '';

  if (!eaWallet || !ebWallet) {
    result.style.display = 'block';
    result.innerHTML = '<div class="card"><div class="card-body" style="color:#dc2626">✗ Missing wallet addresses. Generate wallets in Settings first.</div></div>';
    return;
  }

  if (!s.eaApikey || !s.eaApisecret) {
    result.style.display = 'block';
    result.innerHTML = '<div class="card"><div class="card-body" style="color:#dc2626">✗ Missing Entity A credentials. Configure in Settings first.</div></div>';
    return;
  }

  // Block transfer creation if PII validation was not completed successfully
  // (Cases 2,3 skip this — EA doesn't know EB's requirements yet)
  var requiresPII = CASE === 'case1' || CASE === 'case4' || CASE === 'case5' || CASE === 'case6';
  if (requiresPII && !lastValidatedIVMS101) {
    result.style.display = 'block';
    result.innerHTML = '<div class="card"><div class="card-body" style="color:#dc2626">✗ PII Validation incomplete. Complete the PII Validation step above (select customers → fill all fields → click Validate → must show VALID ✓) before creating a transfer.</div></div>';
    return;
  }

  var eaDid = s.eaDid;
  var ebDid = s.ebDid;

  btn.disabled = true; btn.textContent = 'Creating...';
  result.style.display = 'block';
  result.innerHTML = '<div class="card"><div class="card-body" style="color:#888">Creating transfer on Notabene network...</div></div>';

  // Generate unique ref + originator/beneficiary IRIs
  var ref = 'TR-' + Date.now().toString(36).toUpperCase();
  var origId = 'urn:uuid:' + crypto.randomUUID();
  var beneId = 'urn:uuid:' + crypto.randomUUID();
  var USDT_TEST = 'eip155:11155111/erc20:0xA2c7341dAdB120aa638795Dc73f7c74Ebd35D868';

  // Read customer PII from selectors
  var eaCustIdx = document.getElementById('ea-customer-select').value;
  var ebCustIdx = document.getElementById('eb-customer-select-ea').value;
  var eaCust = eaCustIdx !== '' ? IND_CASES[parseInt(eaCustIdx)] : null;
  var ebCust = ebCustIdx !== '' ? IND_CASES[parseInt(ebCustIdx)] : null;

  // Build originator — only @id, PII submitted separately via /append
  var originator = { '@id': origId };

  // Build beneficiary — only @id
  var beneficiary = { '@id': beneId };

  // REQUIRE_PRESENTATION belongs on EB's (beneficiary) agent, not EA's.
  // Semantics: "EB requires EA to present originator PII" — from=EA, for=EB.
  // Attached to EB's agent because EB is the party that needs to receive the PII.
  // Proven by A/B test: with this construction, BOTH EA and EB see status=COMPLETED.
  // Case 2: EA does NOT attach policies — EA doesn't know EB's requirements yet.
  var requirePresentation = null;
  if (CASE === 'case1' || CASE === 'case4' || CASE === 'case5' || CASE === 'case6') {
    requirePresentation = {
      '@type': 'REQUIRE_PRESENTATION',
      'from': eaDid,
      'for': ebDid,
      'presentationDefinition': 'https://pd.notabene.id/ivms101/v2/AE-0.json'
    };
  }

  var ebAgent = { '@id': ebDid, 'for': beneId, role: 'VASP' };
  if (requirePresentation) ebAgent.policies = [requirePresentation];

  var transferBody = {
    ref: ref,
    originator: originator,
    beneficiary: beneficiary,
    asset: USDT_TEST,
    amount: String(amount),
    transactionValue: { amount: String(amount), currency: 'USD' },
    agents: [
      { '@id': 'did:pkh:eip155:11155111:' + eaWallet, 'for': eaDid, role: 'SourceAddress' },
      { '@id': eaDid, 'for': origId, role: 'VASP' },
      ebAgent,
      { '@id': 'did:pkh:eip155:11155111:' + (CASE === 'case6' && window.case6UnregisteredAddress ? window.case6UnregisteredAddress : ebWallet), 'for': ebDid, role: 'SettlementAddress' }
    ]
  };

  // Case 5: Add Custodian A as agent in the transfer (EA side)
  if (CASE === 'case5' && s.caDid) {
    transferBody.agents.splice(2, 0, { '@id': s.caDid, 'for': eaDid, role: 'Custodian' });
  }

  try {
    var res2 = await fetch('/api/notabene/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: s.eaApikey, clientSecret: s.eaApisecret,
        entityDid: eaDid, transferBody: transferBody
      })
    });
    var data = await res2.json();
    if (!res2.ok || data.error) throw new Error(data.error || ('HTTP ' + res2.status));

    var txId = data.transfer ? data.transfer['@id'] : data.id;
    var status = data.transfer ? data.transfer.status : data.status;
    selectedTxId = txId;

    // Submit PII via IVMS101 /append endpoint
    // Always use the exact IVMS101 that was validated by the PII Validation step
    // Case 2: Skip PII — EA sends transfer only, PII comes later after EB's counter-transfer
    var piiStatus = 'skipped';
    var ivms101 = null;

    var skipsPII = CASE !== 'case1' && CASE !== 'case4' && CASE !== 'case5' && CASE !== 'case6';
    if (skipsPII) {
      piiStatus = 'not_sent';
    } else if (lastValidatedIVMS101) {
      // Use the validated IVMS101 — this includes ALL fields that passed validation
      ivms101 = JSON.parse(JSON.stringify(lastValidatedIVMS101));
      // Patch wallet addresses in case they changed
      if (ivms101.originator && ivms101.originator.originatorPerson) {
        ivms101.originator.originatorPerson[0].accountNumber = ['did:pkh:eip155:11155111:' + eaWallet];
      }
      if (ivms101.beneficiary && ivms101.beneficiary.beneficiaryPerson) {
        var beneWallet = (CASE === 'case6' && window.case6UnregisteredAddress) ? window.case6UnregisteredAddress : ebWallet;
        ivms101.beneficiary.beneficiaryPerson[0].accountNumber = ['did:pkh:eip155:11155111:' + beneWallet];
      }
    } else if (eaCust || ebCust) {
      // Fallback: build minimal PII from customer data (should not happen if validation was done)
      ivms101 = {};
      if (eaCust) {
        ivms101.originator = {
          originatorPerson: [{
            naturalPerson: {
              name: { nameIdentifier: [{ primaryIdentifier: eaCust.lastName, secondaryIdentifier: eaCust.firstName, naturalPersonNameIdentifierType: 'LEGL' }] },
              ...(eaCust.dob ? { dateAndPlaceOfBirth: { dateOfBirth: eaCust.dob } } : {})
            },
            accountNumber: ['did:pkh:eip155:11155111:' + eaWallet]
          }]
        };
      }
      if (ebCust) {
        ivms101.beneficiary = {
          beneficiaryPerson: [{
            naturalPerson: {
              name: { nameIdentifier: [{ primaryIdentifier: ebCust.lastName, secondaryIdentifier: ebCust.firstName, naturalPersonNameIdentifierType: 'LEGL' }] },
              ...(ebCust.dob ? { dateAndPlaceOfBirth: { dateOfBirth: ebCust.dob } } : {})
            },
            accountNumber: ['did:pkh:eip155:11155111:' + ebWallet]
          }]
        };
      }
    }

    if (ivms101) {
      try {
        var piiRes = await fetch('/api/notabene/transfer/append', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: s.eaApikey, clientSecret: s.eaApisecret, did: s.eaDid, txId: txId, ivms101: ivms101 })
        });
        var piiData = await piiRes.json();
        if (piiData.error) {
          piiStatus = 'error: ' + piiData.error;
        } else {
          piiStatus = 'success';
        }
      } catch(piiErr) {
        piiStatus = 'error: ' + piiErr.message;
      }
    }

    // Display result
    var piiBadge = piiStatus === 'success'
      ? '<span class="tag" style="background:#d1fae5;color:#065f46">PII Sent ✓</span>'
      : piiStatus === 'not_sent'
      ? '<span class="tag" style="background:#fef3c7;color:#92400e">No PII Sent — Waiting for EB</span>'
      : '<span class="tag" style="background:#fee2e2;color:#991b1b">PII: ' + esc(piiStatus) + '</span>';

    var eaName = eaCust ? eaCust.firstName + ' ' + eaCust.lastName : '—';
    var ebName = ebCust ? ebCust.firstName + ' ' + ebCust.lastName : '—';
    var eaDob = eaCust && eaCust.dob ? eaCust.dob : '—';
    var ebDob = ebCust && ebCust.dob ? ebCust.dob : '—';

    result.innerHTML =
      '<div class="card">' +
        '<div class="card-header">Transfer Created <span class="tag" style="background:#d1fae5;color:#065f46">' + esc(status) + '</span></div>' +
        '<div class="card-body">' +
          '<div class="cred-row"><span class="k">Transfer ID</span><span class="v mono">' + esc(txId) + '</span></div>' +
          '<div class="cred-row"><span class="k">Reference</span><span class="v mono">' + esc(ref) + '</span></div>' +
          '<div class="cred-row"><span class="k">Amount</span><span class="v">' + esc(amount) + ' USDT-TEST</span></div>' +
          '<div class="cred-row"><span class="k">Route</span><span class="v">Entity A <span class="hl">→</span> Entity B</span></div>' +
        '</div>' +
        '<div class="card-header" style="border-top:1px solid #e0e0e0;background:#f8f9fa;font-size:10px">Travel Rule PII Transmitted via IVMS101 ' + piiBadge + '</div>' +
        '<div class="card-body">' +
          '<div style="font-size:10px;font-weight:600;color:#5b4cdb;margin-bottom:4px">ORIGINATOR</div>' +
          '<div class="cred-row"><span class="k">Name</span><span class="v">' + esc(eaName) + '</span></div>' +
          '<div class="cred-row"><span class="k">Account</span><span class="v mono" style="font-size:10px">did:pkh:eip155:11155111:' + esc(eaWallet) + '</span></div>' +
          '<div class="cred-row"><span class="k">DOB</span><span class="v">' + esc(eaDob) + '</span></div>' +
          '<div style="font-size:10px;font-weight:600;color:#06b6d4;margin:8px 0 4px">BENEFICIARY</div>' +
          '<div class="cred-row"><span class="k">Name</span><span class="v">' + esc(ebName) + '</span></div>' +
          '<div class="cred-row"><span class="k">Account</span><span class="v mono" style="font-size:10px">did:pkh:eip155:11155111:' + esc(ebWallet) + '</span></div>' +
          '<div class="cred-row"><span class="k">DOB</span><span class="v">' + esc(ebDob) + '</span></div>' +
        '</div>' +
        '<div class="card-body" style="border-top:1px solid #e0e0e0">' +
          '<div class="hint">Transfer created. Review in Step 4, then make compliance decision in Step 5.</div>' +
        '</div>' +
      '</div>';
    btn.textContent = '✓ Created'; btn.className = 'btn btn-success btn-sm';
    
    // Unlock Step 4: Outgoing Transfers
    var outgoingSection = document.getElementById('ea-outgoing-section');
    var outgoingTitle = document.getElementById('ea-outgoing-title');
    if (outgoingSection) outgoingSection.style.display = 'block';
    if (outgoingTitle) {
      outgoingTitle.style.opacity = '1';
      outgoingTitle.innerHTML = 'Step 4 · Outgoing Transfers';
    }
    // Auto-load the outgoing transfers list
    fetchOutgoingTransfers();

    // Cases 2,3: Unlock Step 4c — Incoming RFI section (for later use after EB creates counter-transfer)
    if (CASE !== 'case1' && CASE !== 'case4' && CASE !== 'case5' && CASE !== 'case6') {
      var rfiSection = document.getElementById('ea-rfi-section');
      var rfiTitle = document.getElementById('ea-rfi-title');
      if (rfiSection) rfiSection.style.display = 'block';
      if (rfiTitle) {
        rfiTitle.style.opacity = '1';
        rfiTitle.innerHTML = 'Step 4c · Incoming RFI from Entity B';
      }
    }
  } catch(e) {
    result.innerHTML = '<div class="card"><div class="card-body" style="color:#dc2626">✗ ' + esc(e.message) + '</div></div>';
    btn.disabled = false; btn.textContent = 'Retry'; btn.className = 'btn btn-danger btn-sm';
  }
}

// Fetch incoming transfers for Entity B
async function fetchIncomingTransfers() {
  var s = await loadSettings();
  var listEl = document.getElementById('eb-incoming-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="placeholder" style="padding:20px"><p>Loading...</p></div>';

  try {
    var res = await fetch('/api/notabene/transfers?clientId=' + encodeURIComponent(s.ebApikey) +
      '&clientSecret=' + encodeURIComponent(s.ebApisecret) + '&did=' + encodeURIComponent(s.ebDid));
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var txs = data.data || data.transfers || [];
    if (!Array.isArray(txs)) txs = [txs];
    if (txs.length === 0) {
      listEl.innerHTML = '<div class="placeholder" style="padding:20px"><p>No incoming transfers.</p></div>';
      return;
    }

    var html = '';
    for (var i = 0; i < txs.length; i++) {
      var t = txs[i];
      var txId = t['@id'] || t.id;
      var status = t.status || '—';
      var amount = t.amount || '—';
      var assetLabel = t.asset ? String(t.asset).split(':').pop().slice(0,8) : 'asset';
      var initiator = t.initiator ? String(t.initiator).split(':').slice(-2)[0] : '—';
      var statusColor = status === 'SETTLED' ? '#059669' : status === 'AUTHORIZED' ? '#2563eb' : status === 'OUTGOING' || status === 'INCOMING' ? '#d97706' : '#666';
      var cls = selectedTxId === txId ? 'wh-item selected' : 'wh-item';
      html += '<div class="' + cls + '" style="padding:8px 10px" onclick="selectIncomingTransfer(\'' + txId + '\')">' +
        '<div style="flex:1">' +
          '<div style="font-weight:600;font-size:12px">' + esc(amount) + ' ' + esc(assetLabel) + ' <span style="font-size:10px;color:#888">from ' + esc(initiator) + '</span></div>' +
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

// Select and review a specific transfer
async function selectIncomingTransfer(txId) {
  selectedTxId = txId;

  // Reveal Steps 3-5, activate titles
  ['eb-details', 'eb-tap', 'eb-review'].forEach(function(prefix) {
    var sec = document.getElementById(prefix + '-section');
    if (!sec) return;
    sec.style.display = 'block';
    var title = document.getElementById(prefix + '-title');
    if (title) { title.style.opacity = '1'; title.innerHTML = title.innerHTML.replace(/ <span.*<\/span>/, ''); }
  });

  // Case 5: Unlock EB Step 7 (Add Custodian) when transfer is selected
  if (typeof CASE !== 'undefined' && CASE === 'case5') {
    var custSection = document.getElementById('eb-custodian-section');
    var custTitle = document.getElementById('eb-custodian-title');
    if (custSection) custSection.style.display = 'block';
    if (custTitle) { custTitle.style.opacity = '1'; custTitle.innerHTML = custTitle.innerHTML.replace(/ <span.*<\/span>/, ''); }
  }

  // Case 6: Unlock EB Step 4 (Confirm Address) when transfer is selected
  if (typeof CASE !== 'undefined' && CASE === 'case6') {
    var confSection = document.getElementById('eb-confirm-section');
    var confTitle = document.getElementById('eb-confirm-title');
    if (confSection) confSection.style.display = 'block';
    if (confTitle) { confTitle.style.opacity = '1'; confTitle.innerHTML = confTitle.innerHTML.replace(/ <span.*<\/span>/, ''); }
    // Populate the address display from the transfer data
    try {
      var res = await fetch('/api/notabene/transfer?clientId=' + encodeURIComponent((await loadSettings()).ebApikey) +
        '&clientSecret=' + encodeURIComponent((await loadSettings()).ebApisecret) +
        '&did=' + encodeURIComponent((await loadSettings()).ebDid) +
        '&txId=' + encodeURIComponent(txId) + '&decrypt=true');
      var data = await res.json();
      if (!data.error) {
        var tx = data.transfer || data;
        var sAddr = null;
        if (tx.agents) {
          for (var i = 0; i < tx.agents.length; i++) {
            if (tx.agents[i].role === 'SettlementAddress') {
              sAddr = tx.agents[i].agent ? tx.agents[i].agent['@id'] : tx.agents[i]['@id'];
              break;
            }
          }
        }
        if (sAddr) {
          var shortAddr = sAddr.replace('did:pkh:eip155:11155111:', '');
          var addrEl = document.getElementById('eb-confirm-address');
          if (addrEl) addrEl.textContent = shortAddr;
        }
        var didEl = document.getElementById('eb-confirm-did');
        var s2 = await loadSettings();
        if (didEl && s2.ebDid) didEl.textContent = s2.ebDid;
      }
    } catch(e) {}
  }

  // Auto-fetch details and policies
  await fetchTransferDetails();
  await fetchTapPolicies();
}

// Helper: render a PII block with all IVMS101 fields
function piiBlock(title, color, pii) {
  var rows = '';
  if (pii.name !== '—') rows += piiRow('Name', pii.name);
  if (pii.dob !== '—') rows += piiRow('DOB', pii.dob);
  if (pii.pob !== '—') rows += piiRow('Place of Birth', pii.pob);
  if (pii.nationalId !== '—') rows += piiRow('National ID (' + pii.nationalIdType + ')', pii.nationalId);
  if (pii.address !== '—') rows += piiRow('Address', pii.address);
  if (pii.account !== '—') rows += piiRow('Account', pii.account, true);
  if (!rows) rows = '<div style="font-size:10px;color:#999;padding:4px 0">No PII data received</div>';
  return '<div>' +
    '<div style="font-size:9px;font-weight:600;color:' + color + ';margin-bottom:4px">' + title + '</div>' +
    rows +
  '</div>';
}
function piiRow(label, value, mono) {
  return '<div style="margin-bottom:3px">' +
    '<div style="font-size:9px;color:#888">' + esc(label) + '</div>' +
    '<div style="font-size:11px' + (mono ? ';font-family:monospace;font-size:9px;word-break:break-all' : '') + '">' + esc(value) + '</div>' +
  '</div>';
}

// Helper: extract PII from IVMS101 or flat format
function extractPII(person, kind) {
  var empty = { name: '—', account: '—', dob: '—', pob: '—', nationalId: '—', nationalIdType: '—', address: '—' };
  if (!person) return empty;

  // Try flat fields first
  var result = {
    name: person.name || person.legalName || '—',
    account: (person.account && person.account[0]) || '—',
    dob: person.dateOfBirth || '—',
    pob: '—',
    nationalId: '—',
    nationalIdType: '—',
    address: '—'
  };

  // Try IVMS101 nested format — handle both singular and plural keys
  var personKey = kind + 'Person';   // originatorPerson (v2)
  var personsKey = kind + 'Persons'; // originatorPersons (v1/legacy)
  var persons = person[personKey] || person[personsKey];

  if (persons && Array.isArray(persons) && persons.length > 0) {
    var np = persons[0].naturalPerson || persons[0].legalPerson || persons[0];
    if (np) {
      // Name
      if (np.name && np.name.nameIdentifier) {
        var ids = np.name.nameIdentifier;
        if (Array.isArray(ids) && ids.length > 0) {
          result.name = [ids[0].secondaryIdentifier, ids[0].primaryIdentifier].filter(Boolean).join(' ') ||
                        ids[0].nameIdentifier || ids[0].primaryIdentifier || '—';
        }
      }
      // Date and place of birth
      if (np.dateAndPlaceOfBirth) {
        result.dob = np.dateAndPlaceOfBirth.dateOfBirth || result.dob;
        result.pob = np.dateAndPlaceOfBirth.placeOfBirth || '—';
      }
      // National identification
      if (np.nationalIdentification) {
        result.nationalId = np.nationalIdentification.nationalIdentifier || '—';
        result.nationalIdType = np.nationalIdentification.nationalIdentifierType || '—';
      }
      // Geographic address
      if (np.geographicAddress && Array.isArray(np.geographicAddress) && np.geographicAddress.length > 0) {
        var addr = np.geographicAddress[0];
        var parts = [];
        if (addr.addressLine) parts.push(Array.isArray(addr.addressLine) ? addr.addressLine.join(', ') : addr.addressLine);
        if (addr.townName) parts.push(addr.townName);
        if (addr.country) parts.push(addr.country);
        if (parts.length) result.address = parts.join(', ');
      }
      // Account number
      if (persons[0].accountNumber && persons[0].accountNumber[0]) {
        result.account = persons[0].accountNumber[0];
      }
    }
  }
  return result;
}

// Fetch full transfer details
async function fetchTransferDetails() {
  if (!selectedTxId) return;
  var s = await loadSettings();
  var body = document.getElementById('eb-details-body');
  body.innerHTML = '<div style="color:#888;padding:8px">Fetching transfer details...</div>';

  try {
    var res = await fetch('/api/notabene/transfer?clientId=' + encodeURIComponent(s.ebApikey) +
      '&clientSecret=' + encodeURIComponent(s.ebApisecret) +
      '&did=' + encodeURIComponent(s.ebDid) + '&txId=' + encodeURIComponent(selectedTxId) +
      '&decrypt=true&sanitize=false');
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var t = data.transfer || data;
    selectedTxData = t;
    var status = t.status || '—';
    var amount = t.amount || '—';
    var asset = t.asset ? String(t.asset).split(':').pop() : 'asset';
    var initiator = t.initiator || '—';
    var direction = t.direction || '—';

    // Case 4: If transfer is REVERT-REQUESTED, unlock refund section
    if (CASE === 'case4' && status === 'REVERT-REQUESTED') {
      var refundSection = document.getElementById('eb-refund-section');
      var refundTitle = document.getElementById('eb-refund-title');
      if (refundSection) refundSection.style.display = 'block';
      if (refundTitle) { refundTitle.style.opacity = '1'; refundTitle.innerHTML = refundTitle.innerHTML.replace(/ <span.*<\/span>/, ''); }
    }

    var summaryHtml =
      '<div class="tx-summary">' +
        '<div class="tx-id mono">' + esc(selectedTxId) + '</div>' +
        '<div class="tx-amount">' + esc(amount) + ' <span style="font-size:14px;color:#888">' + esc(asset) + '</span></div>' +
        '<div class="tx-route">From <span>' + esc(initiator.split(':').slice(-2)[0]) + '</span> · ' + esc(direction) + '</div>' +
        '<div style="margin-top:8px"><span class="transfer-status ts-' + status.toLowerCase() + '">' + esc(status) + '</span></div>' +
      '</div>';

    // Agent chain
    var agents = t.agents || [];
    var detailHtml = '<div style="margin-top:10px;font-size:10px;font-weight:600;color:#888;text-transform:uppercase;margin-bottom:4px">Agent Chain</div>';
    for (var j = 0; j < agents.length; j++) {
      var a = agents[j];
      var aDid = (a.agent && a.agent['@id']) || a['@id'] || '—';
      var aName = a.name || String(aDid).split(':').slice(-2)[0];
      var aRole = a.role || '—';
      var aStatus = a.status || '—';
      detailHtml += '<div class="cred-row">' +
        '<span class="k">' + esc(aRole) + '</span>' +
        '<span class="v">' + esc(aName) + ' <span style="font-size:10px;color:#888">(' + esc(aStatus) + ')</span></span>' +
      '</div>';
    }

    // Collapsible raw JSON
    var rawJson = esc(JSON.stringify(t, null, 2));
    detailHtml += '<details style="margin-top:10px"><summary style="cursor:pointer;font-size:10px;color:#5b4cdb;font-weight:600">Raw API Response (JSON)</summary>' +
      '<pre class="mono" style="font-size:9px;max-height:300px;overflow:auto;background:#f8f9fa;padding:8px;border-radius:4px;margin-top:6px;border:1px solid #e8e8e8">' + rawJson + '</pre></details>';

    body.innerHTML = summaryHtml + detailHtml;

    // Populate PII panel in Step 5 with full IVMS101 data
    var origPii = extractPII(t.originator, 'originator');
    var benePii = extractPII(t.beneficiary, 'beneficiary');
    var reviewBody = document.getElementById('eb-review-body');
    var hasOrigPii = !!(t.originator && t.originator.originatorPerson);
    var hasBenePii = !!(t.beneficiary && t.beneficiary.beneficiaryPerson);
    var reviewHeader = '<div style="padding:10px;background:#f0f7ff;border-radius:6px;border:1px solid #dbeafe">' +
        '<div style="font-size:10px;font-weight:600;color:#1e40af;text-transform:uppercase;margin-bottom:6px">Travel Rule PII Received</div>';
    if (!hasOrigPii && !hasBenePii) {
      reviewBody.innerHTML = reviewHeader +
        '<div style="font-size:11px;color:#d97706;padding:4px 0">No PII received yet — relationship confirmation may still be pending (~4s).</div>' +
        '<button class="btn btn-outline btn-sm" style="margin-top:4px" onclick="fetchTransferDetails()">↻ Retry</button>' +
        '</div>';
    } else {
      reviewBody.innerHTML = reviewHeader +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
          piiBlock('ORIGINATOR', '#5b4cdb', origPii) +
          piiBlock('BENEFICIARY', '#06b6d4', benePii) +
        '</div>' +
      '</div>';
    }

    // Enable beneficiary name matching button if PII is present
    var hasPii = !!(t.originator && t.originator.originatorPerson);
    var nameMatchBtn = document.getElementById('eb-name-match-btn');
    var nameMatchBody = document.getElementById('eb-name-match-body');
    var nameMatchHeader = nameMatchBtn ? document.querySelector('#eb-name-match-btn').closest('.card').querySelector('.card-header') : null;

    // Fetch entity settings to check if name matching policy is ON or OFF
    var ebSettings = {};
    try {
      var sres = await fetch('/api/notabene/entity-settings?clientId=' + encodeURIComponent(s.ebApikey) +
        '&clientSecret=' + encodeURIComponent(s.ebApisecret) + '&did=' + encodeURIComponent(s.ebDid));
      ebSettings = await sres.json();
    } catch(e) {}
    var nameMatchRequired = !!ebSettings.requireBeneficiaryNameMatching;

    if (hasPii && nameMatchBtn) {
      if (status === 'AUTHORIZED' || status === 'SETTLED' || status === 'REJECTED') {
        nameMatchBtn.disabled = true;
        nameMatchBtn.style.display = 'none';
        nameMatchBody.innerHTML = '<div style="color:#888;font-size:11px">Transfer already ' + esc(status) + '</div>';
      } else {
        nameMatchBtn.disabled = false;
        nameMatchBtn.style.display = '';
        if (nameMatchRequired) {
          if (nameMatchHeader) nameMatchHeader.firstChild.textContent = 'Beneficiary Name Matching (Authorization Policy)';
          nameMatchBody.innerHTML = '<p class="hint">Name matching is enabled as authorization policy — confirming the match will authorize this transfer.</p>';
        } else {
          if (nameMatchHeader) nameMatchHeader.firstChild.textContent = 'Beneficiary Name Matching (Optional)';
          nameMatchBody.innerHTML = '<p class="hint">Compare beneficiary name from PII against your KYC database, then confirm. This is a verification step — authorization requires the Authorize button below.</p>';
        }
      }
    } else if (nameMatchBtn) {
      nameMatchBtn.disabled = true;
      nameMatchBody.innerHTML = '<p class="hint" style="color:#d97706">No PII received yet — relationship confirmation may still be pending (~4s). Click retry:</p>' +
        '<button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="fetchTransferDetails()">↻ Retry</button>';
    }

    // Update action bar visibility based on authorization status
    var actionBar = document.getElementById('eb-action-bar');
    var actionHeader = actionBar.closest('.card').querySelector('.card-header');
    var authBtn = actionBar.querySelector('.btn-success');
    var rejectBtn = actionBar.querySelector('.btn-danger');
    // Hide all buttons if already authorized, rejected, or settled
    if (status === 'AUTHORIZED' || status === 'SETTLED' || status === 'REJECTED') {
      actionBar.style.display = 'none';
    } else if (nameMatchRequired) {
      // Name matching = authorization path, but Reject is always available
      actionBar.style.display = 'flex';
      if (authBtn) authBtn.style.display = 'none';
      if (rejectBtn) rejectBtn.style.display = '';
      if (actionHeader) actionHeader.firstChild.textContent = 'Reject Transfer';
    } else {
      actionBar.style.display = 'flex';
      if (authBtn) authBtn.style.display = '';
      if (rejectBtn) rejectBtn.style.display = '';
      if (actionHeader) actionHeader.firstChild.textContent = 'Authorization Decision';
    }
  } catch(e) {
    body.innerHTML = '<div style="color:#dc2626;padding:8px">✗ ' + esc(e.message) + '</div>';
  }
}

// Fetch TAP policies
async function fetchTapPolicies() {
  if (!selectedTxId) return;
  var s = await loadSettings();
  var body = document.getElementById('eb-tap-body');
  body.innerHTML = '<div style="color:#888;padding:8px">Fetching TAP policies...</div>';

  try {
    var res = await fetch('/api/notabene/transfer/tap-policies?clientId=' + encodeURIComponent(s.ebApikey) +
      '&clientSecret=' + encodeURIComponent(s.ebApisecret) +
      '&did=' + encodeURIComponent(s.ebDid) + '&txId=' + encodeURIComponent(selectedTxId));
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var policies = data.policies || [];
    if (CASE === 'case2') policies = policies.filter(function(p) { return (p['@type'] || p.type) !== 'REQUIRE_RELATIONSHIP_CONFIRMATION'; });
    if (policies.length === 0) {
      body.innerHTML = '<div class="hint">No TAP policies for this transfer.</div>';
      return;
    }

    var html = '<div style="display:flex;flex-direction:column;gap:6px">';
    for (var i = 0; i < policies.length; i++) {
      var p = policies[i];
      var pType = (p['@type'] || '—').replace('REQUIRE_', '').replace(/_/g, ' ');
      var pStatus = p.status || '—';
      var statusColor = pStatus === 'COMPLETED' ? '#059669' : (pStatus === 'PENDING' ? '#d97706' : '#888');
      var fromName = String(p.from || '—').split(':').slice(-2)[0];
      var forName = String(p.for || '—').split(':').slice(-2)[0];

      html += '<div style="padding:8px 10px;background:#f8f9fa;border-radius:5px;border:1px solid #e8e8e8">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<span style="font-size:11px;font-weight:600;color:#1a1a1a">' + esc(pType) + '</span>' +
          '<span style="font-size:10px;font-weight:600;color:' + statusColor + '">' + esc(pStatus) + '</span>' +
        '</div>' +
        '<div style="font-size:10px;color:#888;margin-top:2px">' +
          'from <span style="color:#5b4cdb">' + esc(fromName) + '</span>' +
          ' → for <span style="color:#06b6d4">' + esc(forName) + '</span>' +
          (p.fromRole ? ' (' + esc(p.fromRole) + ')' : '') +
        '</div>' +
      '</div>';
    }
    html += '</div>';
    body.innerHTML = html;
  } catch(e) {
    body.innerHTML = '<div style="color:#dc2626;padding:8px">✗ ' + esc(e.message) + '</div>';
  }
}

// Authorize transfer
// Fetch EA's TAP policies (originator perspective)
async function fetchEATapPolicies() {
  if (!selectedTxId) return;
  var s = await loadSettings();
  var body = document.getElementById('ea-tap-body');
  body.innerHTML = '<div style="color:#888;padding:8px">Fetching TAP policies...</div>';

  try {
    var res = await fetch('/api/notabene/transfer/tap-policies?clientId=' + encodeURIComponent(s.eaApikey) +
      '&clientSecret=' + encodeURIComponent(s.eaApisecret) +
      '&did=' + encodeURIComponent(s.eaDid) + '&txId=' + encodeURIComponent(selectedTxId));
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var policies = data.policies || [];
    if (CASE === 'case2') policies = policies.filter(function(p) { return (p['@type'] || p.type) !== 'REQUIRE_RELATIONSHIP_CONFIRMATION'; });
    if (policies.length === 0) {
      body.innerHTML = '<div class="hint">No TAP policies for this transfer.</div>';
      return;
    }

    var html = '<div style="display:flex;flex-direction:column;gap:6px">';
    for (var i = 0; i < policies.length; i++) {
      var p = policies[i];
      var pType = (p['@type'] || '—').replace('REQUIRE_', '').replace(/_/g, ' ');
      var pStatus = p.status || '—';
      var statusColor = pStatus === 'COMPLETED' ? '#059669' : (pStatus === 'PENDING' ? '#d97706' : '#888');
      var fromName = String(p.from || '—').split(':').slice(-2)[0];
      var forName = String(p.for || '—').split(':').slice(-2)[0];

      html += '<div style="padding:8px 10px;background:#f8f9fa;border-radius:5px;border:1px solid #e8e8e8">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<span style="font-size:11px;font-weight:600;color:#1a1a1a">' + esc(pType) + '</span>' +
          '<span style="font-size:10px;font-weight:600;color:' + statusColor + '">' + esc(pStatus) + '</span>' +
        '</div>' +
        '<div style="font-size:10px;color:#888;margin-top:2px">' +
          'from <span style="color:#5b4cdb">' + esc(fromName) + '</span>' +
          ' → for <span style="color:#06b6d4">' + esc(forName) + '</span>' +
          (p.fromRole ? ' (' + esc(p.fromRole) + ')' : '') +
        '</div>' +
      '</div>';
    }
    html += '</div>';
    body.innerHTML = html;
  } catch(e) {
    body.innerHTML = '<div style="color:#dc2626;padding:8px">✗ ' + esc(e.message) + '</div>';
  }
}

// Fetch outgoing transfers for Entity A
async function fetchOutgoingTransfers() {
  var s = await loadSettings();
  var listEl = document.getElementById('ea-outgoing-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="placeholder" style="padding:20px"><p>Loading...</p></div>';

  try {
    var res = await fetch('/api/notabene/transfers?clientId=' + encodeURIComponent(s.eaApikey) +
      '&clientSecret=' + encodeURIComponent(s.eaApisecret) +
      '&did=' + encodeURIComponent(s.eaDid));
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var transfers = data.data || [];
    var outgoing = transfers.filter(function(t) { return t.direction === 'OUTGOING'; });

    if (outgoing.length === 0) {
      listEl.innerHTML = '<div class="placeholder" style="padding:20px"><p>No outgoing transfers found</p></div>';
      return;
    }

    var html = '';
    outgoing.forEach(function(tx) {
      var status = tx.status || 'UNKNOWN';
      var statusColor = status === 'PENDING' ? '#f59e0b' : status === 'AUTHORIZED' ? '#10b981' : '#6b7280';
      html += '<div style="padding:12px;border-bottom:1px solid #f0f0f0;cursor:pointer" onclick="selectOutgoingTransfer(\'' + tx['@id'] + '\')">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<div>' +
            '<div style="font-size:12px;font-weight:600">' + esc(tx.ref || 'No ref') + '</div>' +
            '<div style="font-size:10px;color:#666;margin-top:2px">' + esc(tx.amount || '0') + ' ' + esc(tx.asset || '') + '</div>' +
          '</div>' +
          '<div style="text-align:right">' +
            '<div style="font-size:10px;color:' + statusColor + ';font-weight:600">' + esc(status) + '</div>' +
            '<div style="font-size:9px;color:#999;margin-top:2px">' + esc(new Date(tx.createdAt).toLocaleString()) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    });
    listEl.innerHTML = html;
  } catch(e) {
    listEl.innerHTML = '<div style="color:#dc2626;padding:12px">✗ ' + esc(e.message) + '</div>';
  }
}

// Select outgoing transfer for compliance decision
async function selectOutgoingTransfer(txId) {
  selectedTxId = txId;
  
  // Unlock Step 4b: TAP Policies
  var tapSection = document.getElementById('ea-tap-section');
  var tapTitle = document.getElementById('ea-tap-title');
  if (tapSection) tapSection.style.display = 'block';
  if (tapTitle) {
    tapTitle.style.opacity = '1';
    tapTitle.innerHTML = 'Step 4b · Authorization Requirements (TAP)';
  }

  // Unlock Step 5: Compliance Decision
  var reviewSection = document.getElementById('ea-review-section');
  var reviewTitle = document.getElementById('ea-review-title');
  if (reviewSection) reviewSection.style.display = 'block';
  if (reviewTitle) {
    reviewTitle.style.opacity = '1';
    reviewTitle.innerHTML = 'Step 5 · Compliance Decision';
  }
  
  var body = document.getElementById('ea-review-body');
  body.innerHTML = '<div style="color:#888;padding:8px">Loading transfer details...</div>';

  // Auto-fetch EA's TAP policies
  fetchEATapPolicies();

  var s = await loadSettings();
  try {
    var res = await fetch('/api/notabene/transfer?clientId=' + encodeURIComponent(s.eaApikey) +
      '&clientSecret=' + encodeURIComponent(s.eaApisecret) +
      '&did=' + encodeURIComponent(s.eaDid) + '&txId=' + encodeURIComponent(txId) +
      '&decrypt=true&sanitize=false');
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var tx = data.transfer || data;
    var status = tx.status || 'UNKNOWN';
    var internalAuth = tx.internalAuthorization || 'PENDING';

    var html = '<div class="cred-row"><span class="k">Transfer ID</span><span class="v mono">' + esc(tx['@id']) + '</span></div>' +
      '<div class="cred-row"><span class="k">Reference</span><span class="v mono">' + esc(tx.ref || '—') + '</span></div>' +
      '<div class="cred-row"><span class="k">Amount</span><span class="v">' + esc(tx.amount || '0') + ' ' + esc(tx.asset || '') + '</span></div>' +
      '<div class="cred-row"><span class="k">Status</span><span class="v">' + esc(status) + '</span></div>' +
      '<div class="cred-row"><span class="k">Internal Auth</span><span class="v">' + esc(internalAuth) + '</span></div>';

    if (tx.originator && tx.originator.originatorPerson) {
      var pii = extractPII(tx.originator.originatorPerson, 'originator');
      html += '<div style="margin-top:12px;font-size:10px;font-weight:600;color:#5b4cdb">ORIGINATOR</div>' +
        '<div class="cred-row"><span class="k">Name</span><span class="v">' + esc(pii.name) + '</span></div>' +
        '<div class="cred-row"><span class="k">Account</span><span class="v mono" style="font-size:10px">' + esc(pii.account) + '</span></div>' +
        '<div class="cred-row"><span class="k">DOB</span><span class="v">' + esc(pii.dob) + '</span></div>';
    }

    if (tx.beneficiary && tx.beneficiary.beneficiaryPerson) {
      var pii = extractPII(tx.beneficiary.beneficiaryPerson, 'beneficiary');
      html += '<div style="margin-top:12px;font-size:10px;font-weight:600;color:#06b6d4">BENEFICIARY</div>' +
        '<div class="cred-row"><span class="k">Name</span><span class="v">' + esc(pii.name) + '</span></div>' +
        '<div class="cred-row"><span class="k">Account</span><span class="v mono" style="font-size:10px">' + esc(pii.account) + '</span></div>' +
        '<div class="cred-row"><span class="k">DOB</span><span class="v">' + esc(pii.dob) + '</span></div>';
    }

    body.innerHTML = html;

    // Show/hide action bar based on status
    var actionsEl = document.getElementById('ea-action-bar');
    if (internalAuth === 'AUTHORIZED') {
      actionsEl.innerHTML = '<div style="background:#d1fae5;color:#065f46;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:600">✓ Already authorized</div>';
    } else {
      actionsEl.innerHTML = '<button class="btn btn-success" onclick="authorizeOutgoingTransfer()">✓ Authorize</button>' +
        '<button class="btn btn-danger" onclick="rejectOutgoingTransfer()">✗ Reject</button>';
    }
  } catch(e) {
    body.innerHTML = '<div style="color:#dc2626;padding:8px">✗ ' + esc(e.message) + '</div>';
  }
}

// Authorize outgoing transfer from Entity A
async function authorizeOutgoingTransfer() {
  var s = await loadSettings();
  if (!selectedTxId) return;
  var actionsEl = document.getElementById('ea-action-bar');
  actionsEl.innerHTML = '<div style="color:#888;font-size:11px">Authorizing...</div>';

  try {
    var res = await fetch('/api/notabene/transfer/authorize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: s.eaApikey, clientSecret: s.eaApisecret, did: s.eaDid, txId: selectedTxId })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    actionsEl.innerHTML = '<div style="background:#d1fae5;color:#065f46;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:600">✓ Authorized — ready for on-chain transfer</div>';
    
    // Unlock Step 6: On-Chain Transfer
    document.getElementById('ea-onchain-section').style.display = 'block';
    var onchainTitle = document.getElementById('ea-onchain-title');
    if (onchainTitle) { onchainTitle.style.opacity = '1'; onchainTitle.innerHTML = onchainTitle.innerHTML.replace(/ <span.*<\/span>/, ''); }
    
    // Refresh the transfer detail
    selectOutgoingTransfer(selectedTxId);
  } catch(e) {
    actionsEl.innerHTML = '<button class="btn btn-success" onclick="authorizeOutgoingTransfer()">✓ Authorize</button>' +
      '<button class="btn btn-danger" onclick="rejectOutgoingTransfer()">✗ Reject</button>' +
      '<div style="color:#dc2626;font-size:11px;margin-top:8px">✗ ' + esc(e.message) + '</div>';
  }
}

// Show rejection reason picker (inline panel replacing action bar)
// onComplete(reason, comment) is called when user confirms
function showRejectPanel(actionBarId, onComplete) {
  var el = document.getElementById(actionBarId);
  if (!el) return;
  var options = [
    ['COUNTERPARTY_RISK', 'Counterparty Risk'],
    ['COUNTERPARTY_DUE_DILIGENCE', 'Counterparty Due Diligence'],
    ['SANCTION_SCREENING', 'Sanction Screening'],
    ['BLOCKCHAIN_RISK_SCORE', 'Blockchain Risk Score'],
    ['SUSPICIOUS_TRANSACTION', 'Suspicious Transaction'],
    ['COMPLIANCE_POLICIES', 'Compliance Policies'],
    ['BENEFICIARY_NOT_FOUND', 'Beneficiary Not Found'],
    ['BENEFICIARY_REJECT_INCOMING', 'Beneficiary Reject Incoming'],
    ['ORIGINATOR_REJECT_OUTGOING', 'Originator Reject Outgoing'],
    ['OTHER', 'Other']
  ];
  var opts = options.map(function(o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('');
  var idPrefix = actionBarId;
  el.innerHTML =
    '<div style="width:100%">' +
      '<select id="' + idPrefix + '-reason" style="width:100%;font-size:12px;margin-bottom:6px" onchange="' +
        'var c=document.getElementById(\'' + idPrefix + '-comment-wrap\'); ' +
        'c.style.display=(this.value===\'OTHER\')?\'block\':\'none\'; ' +
        'if(this.value===\'OTHER\'){document.getElementById(\'' + idPrefix + '-comment\').focus();}">' + opts + '</select>' +
      '<div id="' + idPrefix + '-comment-wrap" style="display:none;margin-bottom:6px">' +
        '<input type="text" id="' + idPrefix + '-comment" placeholder="Comment (required for Other)" style="width:100%;font-size:12px;padding:4px 6px;border:1px solid #d0d0d0;border-radius:4px">' +
      '</div>' +
      '<div style="display:flex;gap:6px">' +
        '<button class="btn btn-danger btn-sm" onclick="' +
          'var s=document.getElementById(\'' + idPrefix + '-reason\'); ' +
          'var c=document.getElementById(\'' + idPrefix + '-comment\'); ' +
          'if(s.value===\'OTHER\'&&!c.value.trim()){c.focus();c.style.borderColor=\'#dc2626\';return;} ' +
          'window.__rejectConfirm(\'' + idPrefix + '\', s.value, s.options[s.selectedIndex].text, c.value.trim())">✗ Confirm Reject</button>' +
        '<button class="btn btn-outline btn-sm" onclick="window.__rejectCancel(\'' + idPrefix + '\')">Cancel</button>' +
      '</div>' +
    '</div>';
  window.__rejectConfirm = function(id, reason, label, comment) { onComplete(reason, label, comment); };
  window.__rejectCancel = function(id) { document.getElementById(id).style.display = 'flex'; };
}

// Reject outgoing transfer from Entity A
async function rejectOutgoingTransfer() {
  var s = await loadSettings();
  if (!selectedTxId) return;
  showRejectPanel('ea-action-bar', async function(reason, label, comment) {
    var actionsEl = document.getElementById('ea-action-bar');
    actionsEl.innerHTML = '<div style="color:#888;font-size:11px">Rejecting...</div>';
    try {
      var res = await fetch('/api/notabene/transfer/reject', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: s.eaApikey, clientSecret: s.eaApisecret, did: s.eaDid, txId: selectedTxId, reason: reason, comment: comment })
      });
      var data = await res.json();
      if (data.error) throw new Error(data.error);
      actionsEl.innerHTML = '<div style="background:#fee2e2;color:#991b1b;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:600">✗ Rejected — ' + esc(label) + (comment ? ' (' + esc(comment) + ')' : '') + '</div>';
    } catch(e) {
      actionsEl.innerHTML = '<button class="btn btn-success" onclick="authorizeOutgoingTransfer()">✓ Authorize</button>' +
        '<button class="btn btn-danger" onclick="rejectOutgoingTransfer()">✗ Reject</button>' +
        '<div style="color:#dc2626;font-size:11px;margin-top:8px">✗ ' + esc(e.message) + '</div>';
    }
  });
}

// Complete beneficiary name matching check
async function completeNameMatch() {
  var s = await loadSettings();
  if (!selectedTxId) return;
  var btn = document.getElementById('eb-name-match-btn');
  var body = document.getElementById('eb-name-match-body');
  btn.disabled = true;
  btn.textContent = 'Confirming...';

  try {
    var res = await fetch('/api/notabene/transfer/checks/beneficiary-name-matching', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: s.ebApikey, clientSecret: s.ebApisecret, did: s.ebDid, txId: selectedTxId })
    });
    var data = await res.json();

    // "not found" means name matching policy is OFF in EB dashboard.
    // Authorization must then be done explicitly via the Authorize button.
    var isNotEnforced = data.error && data.error.indexOf('not found') >= 0;
    if (data.error && !isNotEnforced) throw new Error(data.error);

    btn.style.display = 'none';

    if (isNotEnforced) {
      // Name matching policy is OFF — explicit Authorize is required
      body.innerHTML = '<div style="background:#f0fdf4;color:#065f46;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:600">○ Name matching not required — use Authorize below to approve this transfer</div>';
    } else {
      // Name matching policy is ON — completing it auto-authorizes the transfer
      // Re-fetch transfer to confirm, then update the action bar
      await selectIncomingTransfer(selectedTxId);
      var actionBar = document.getElementById('eb-action-bar');
      if (actionBar) actionBar.style.display = 'none';
      document.getElementById('eb-review-body').insertAdjacentHTML('afterbegin',
        '<div style="background:#d1fae5;color:#065f46;padding:6px 10px;border-radius:4px;margin-bottom:8px;font-size:12px;font-weight:600">✓ Beneficiary name matched — transfer authorized</div>');
      body.innerHTML = '<div style="background:#d1fae5;color:#065f46;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:600">✓ Beneficiary name matched — transfer authorized</div>';
    }
  } catch(e) {
    btn.disabled = false;
    btn.textContent = '✓ Confirm Match';
    body.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
  }
}

// Authorize transfer from Entity B (beneficiary VASP)
async function authorizeTransfer() {
  var s = await loadSettings();
  if (!selectedTxId) return;
  var actionBar = document.getElementById('eb-action-bar');
  actionBar.style.display = 'none';

  try {
    var res = await fetch('/api/notabene/transfer/authorize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: s.ebApikey, clientSecret: s.ebApisecret, did: s.ebDid, txId: selectedTxId })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    // Refresh the transfer detail first, THEN show the success banner
    await selectIncomingTransfer(selectedTxId);
    document.getElementById('eb-review-body').insertAdjacentHTML('afterbegin',
      '<div style="background:#d1fae5;color:#065f46;padding:6px 10px;border-radius:4px;margin-bottom:8px;font-size:12px;font-weight:600">✓ Authorized — Entity A can now broadcast on-chain transfer</div>');
  } catch(e) {
    actionBar.style.display = 'flex';
    alert('Authorize failed: ' + e.message);
  }
}

// Reject transfer
async function rejectTransfer() {
  var s = await loadSettings();
  if (!selectedTxId) return;
  showRejectPanel('eb-action-bar', async function(reason, label, comment) {
    try {
      var res = await fetch('/api/notabene/transfer/reject', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: s.ebApikey, clientSecret: s.ebApisecret, did: s.ebDid, txId: selectedTxId, reason: reason, comment: comment })
      });
      var data = await res.json();
      if (data.error) throw new Error(data.error);
      document.getElementById('eb-action-bar').style.display = 'none';
      document.getElementById('eb-review-body').insertAdjacentHTML('afterbegin',
        '<div style="background:#fee2e2;color:#991b1b;padding:6px 10px;border-radius:4px;margin-bottom:8px;font-size:12px;font-weight:600">✗ Rejected — ' + esc(label) + (comment ? ' (' + esc(comment) + ')' : '') + '</div>');

      // Case 2: Unlock Step 5b — Create Counter-Transfer
      if (CASE === 'case2') {
        var counterSection = document.getElementById('eb-counter-section');
        var counterTitle = document.getElementById('eb-counter-title');
        if (counterSection) {
          counterSection.style.display = 'block';
          counterTitle.style.opacity = '1';
          counterTitle.innerHTML = 'Step 5b · Create Counter-Transfer (RFI)';
        }
      }
      // Case 3: counter-transfer unlocked via flagTransfer() after settlement, not here
    } catch(e) {
      alert('Reject failed: ' + e.message);
    }
  });
}

// ═══ Case 2: Rule Discovery via Rejection ═══

// EB creates a counter-transfer (RFI) with its own REQUIRE_PRESENTATION policy
var counterTransferTxId = null;


var onchainTxHash = null;

// Step 6: Broadcast on-chain USDT-TEST transfer
async function broadcastOnchainTransfer() {
  var s = await loadSettings();
  var btn = document.getElementById('ea-onchain-btn');
  var result = document.getElementById('ea-onchain-result');
  
  // Fetch custody wallets
  var wallets = {};
  try {
    var res = await fetch('/api/wallet/persisted');
    wallets = await res.json();
  } catch(e) {}
  
  var eaWallet = wallets.ea || {};
  var ebWallet = wallets.eb || {};
  
  if (!eaWallet.privateKey) {
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ Entity A private key not found. Generate wallet in Settings first.</div>';
    return;
  }
  
  if (!ebWallet.address) {
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ Entity B wallet address not found. Generate wallet in Settings first.</div>';
    return;
  }
  
  // Get amount from the selected transfer
  var amount = '3500'; // Default
  if (selectedTxData && selectedTxData.amount) {
    amount = selectedTxData.amount;
  }
  
  btn.disabled = true;
  btn.textContent = 'Broadcasting...';
  result.style.display = 'block';
  result.innerHTML = '<div style="color:#888;font-size:11px">Signing and broadcasting transaction...</div>';
  
  try {
    var res = await fetch('/api/wallet/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        privateKey: eaWallet.privateKey,
        to: ebWallet.address,
        amount: amount,
        contract: '0xA2c7341dAdB120aa638795Dc73f7c74Ebd35D868' // USDT-TEST
      })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    
    onchainTxHash = data.txHash;
    
    result.innerHTML =
      '<div style="background:#d1fae5;color:#047857;padding:10px;border-radius:6px;font-size:12px">' +
        '<div style="font-weight:600;margin-bottom:4px">✓ Transaction Broadcast</div>' +
        '<div class="mono" style="font-size:10px;word-break:break-all">Tx Hash: ' + esc(data.txHash) + '</div>' +
        '<div style="margin-top:4px">From: ' + esc(data.from) + '</div>' +
        '<div>To: ' + esc(data.to) + '</div>' +
        '<div>Amount: ' + esc(data.amount) + ' ' + esc(data.symbol) + '</div>' +
        '<div style="margin-top:6px"><a href="' + esc(data.explorerUrl) + '" target="_blank" style="color:#2563eb;font-size:10px">↗ View on Etherscan</a></div>' +
      '</div>';
    
    btn.textContent = '✓ Broadcast';
    btn.className = 'btn btn-success';
    
    // Unlock Step 7: Settle on Notabene
    document.getElementById('ea-settle-section').style.display = 'block';
    var settleTitle = document.getElementById('ea-settle-title');
    if (settleTitle) { settleTitle.style.opacity = '1'; settleTitle.innerHTML = settleTitle.innerHTML.replace(/ <span.*<\/span>/, ''); }
    
    // Unlock Entity B Step 6: Match On-Chain Deposit
    document.getElementById('eb-match-section').style.display = 'block';
    var matchTitle = document.getElementById('eb-match-title');
    if (matchTitle) { matchTitle.style.opacity = '1'; matchTitle.innerHTML = matchTitle.innerHTML.replace(/ <span.*<\/span>/, ''); }
    // Pre-fill the tx hash input
    var txHashInput = document.getElementById('eb-match-txhash');
    if (txHashInput) txHashInput.value = onchainTxHash;
    
  } catch(e) {
    btn.disabled = false;
    btn.textContent = '⚡ Broadcast Transfer';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
  }
}

// Step 7: Settle transfer on Notabene using on-chain tx hash
async function settleTransfer() {
  var s = await loadSettings();
  if (!selectedTxId) return;
  var btn = document.getElementById('ea-settle-btn');
  var result = document.getElementById('ea-settle-result');
  
  if (!onchainTxHash) {
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ No on-chain transaction hash found. Broadcast transfer first.</div>';
    return;
  }
  
  btn.disabled = true; btn.textContent = 'Settling...';

  try {
    var res = await fetch('/api/notabene/transfer/settle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: s.eaApikey, clientSecret: s.eaApisecret, did: s.eaDid, txId: selectedTxId, settlementId: onchainTxHash })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    result.style.display = 'block';
    result.innerHTML =
      '<div style="background:#d1fae5;color:#047857;padding:10px;border-radius:6px;font-size:12px">' +
        '<div style="font-weight:600;margin-bottom:4px">✓ Transfer Settled on Notabene</div>' +
        '<div class="mono" style="font-size:10px;word-break:break-all">Settlement ID: ' + esc(onchainTxHash) + '</div>' +
      '</div>';
    btn.textContent = '✓ Settled'; btn.className = 'btn btn-success';

    // Case 4: Unlock EA Step 8 (Revert) after settle
    if (CASE === 'case4') {
      var revertSection = document.getElementById('ea-revert-section');
      var revertTitle = document.getElementById('ea-revert-title');
      if (revertSection) revertSection.style.display = 'block';
      if (revertTitle) { revertTitle.style.opacity = '1'; revertTitle.innerHTML = revertTitle.innerHTML.replace(/ <span.*<\/span>/, ''); }
    }

    // Refresh transfer detail
    selectIncomingTransfer(selectedTxId);
  } catch(e) {
    btn.disabled = false; btn.textContent = 'Settle Transfer';
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626">✗ ' + esc(e.message) + '</div>';
  }
}

// Step 8 (Entity B Step 6): Match on-chain deposit to travel rule message using txMatch
async function matchOnchainDeposit() {
  var s = await loadSettings();
  var btn = document.getElementById('eb-match-btn');
  var result = document.getElementById('eb-match-result');
  var txHashInput = document.getElementById('eb-match-txhash');
  var txHash = txHashInput.value.trim() || onchainTxHash;
  
  if (!txHash) {
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ No tx hash provided. Enter the on-chain tx hash or wait for Entity A to broadcast.</div>';
    return;
  }
  
  // Fetch custody wallets for settlement address
  var wallets = {};
  try {
    var res = await fetch('/api/wallet/persisted');
    wallets = await res.json();
  } catch(e) {}
  
  var ebWallet = wallets.eb || {};
  var settlementAddress = ebWallet.address;
  
  if (!settlementAddress) {
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ Entity B wallet address not found. Generate wallet in Settings first.</div>';
    return;
  }
  
  btn.disabled = true; btn.textContent = 'Matching...';

  try {
    var params = new URLSearchParams({
      clientId: s.ebApikey,
      clientSecret: s.ebApisecret,
      did: s.ebDid,
      settlement_id: txHash,
      settlement_address: 'eip155:11155111:' + settlementAddress.toLowerCase(),
      asset: 'USDT-TEST'
    });
    
    var res = await fetch('/api/notabene/transfer/match?' + params.toString());
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var transfers = data.data || data.transfers || data || [];
    if (!Array.isArray(transfers)) transfers = transfers ? [transfers] : [];
    var matchCount = transfers.length;
    
    result.style.display = 'block';
    if (matchCount > 0) {
      var matchedTx = transfers[0];
      var matchedHtml = transfers.map(function(tx, i) {
        return '<div style="' + (i > 0 ? 'border-top:1px solid #a7f3d0;margin-top:8px;padding-top:8px;' : '') + '">' +
          '<div class="mono" style="font-size:10px;word-break:break-all">Transfer ID: ' + esc(tx.id || tx.txId || 'N/A') + '</div>' +
          '<div style="margin-top:4px">Status: <strong>' + esc(tx.status || 'N/A') + '</strong></div>' +
          '<div>Direction: ' + esc(tx.direction || 'N/A') + '</div>' +
          '<div>Amount: ' + esc(tx.amount || 'N/A') + ' ' + esc(tx.notabeneAsset || '') + '</div>' +
          '<div>Travel Rule: ' + (tx.isTravelRule ? '✓ Yes' : '✗ No') + '</div>' +
          '<div class="mono" style="font-size:10px;word-break:break-all;margin-top:2px">Settlement ID: ' + esc(tx.settlementId || 'N/A') + '</div>' +
        '</div>';
      }).join('');
      result.innerHTML =
        '<div style="background:#d1fae5;color:#047857;padding:10px;border-radius:6px;font-size:12px">' +
          '<div style="font-weight:600;margin-bottom:6px">✓ Match Found — ' + matchCount + ' transfer(s)</div>' +
          matchedHtml +
          '<div style="margin-top:8px;font-size:11px;border-top:1px solid #a7f3d0;padding-top:8px">Based on this travel rule message, you can now decide whether to release the funds to the customer or withhold for further checks.</div>' +
        '</div>';
      btn.textContent = '✓ Matched'; btn.className = 'btn btn-success';

      // Case 3: Unlock flag button after successful match
      if (CASE === 'case3') {
        var flagSection = document.getElementById('eb-flag-section');
        if (flagSection) flagSection.style.display = 'block';
      }

      // Case 4: Show refund section after match (stays locked until EB refreshes and sees REVERT-REQUESTED)
      if (CASE === 'case4') {
        var refundSection = document.getElementById('eb-refund-section');
        if (refundSection) refundSection.style.display = 'block';
      }
    } else {
      result.innerHTML =
        '<div style="background:#fef3c7;color:#92400e;padding:10px;border-radius:6px;font-size:12px">' +
          '<div style="font-weight:600;margin-bottom:4px">⚠ No Match Found</div>' +
          '<div style="font-size:11px">No travel rule message matches this on-chain deposit. This could be a deposit from an unhosted wallet or a VASP not sending travel rule data.</div>' +
        '</div>';
      btn.disabled = false; btn.textContent = 'Match Deposit';
    }
  } catch(e) {
    btn.disabled = false; btn.textContent = 'Match Deposit';
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
  }
}

// ─── Init transfer form ───
autoFillTransferForm();
