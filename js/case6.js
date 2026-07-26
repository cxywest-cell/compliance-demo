// ─── Case 6: Unregistered Address — Manual Relationship Confirmation ───

// Extract the settlement address from a transfer object
function getSettlementAddress(tx) {
  if (!tx || !tx.agents) return null;
  for (var i = 0; i < tx.agents.length; i++) {
    var a = tx.agents[i];
    if (a.role === 'SettlementAddress' && a.agent && a.agent['@id']) {
      return a.agent['@id'];
    }
  }
  return null;
}

// Confirm address ownership via PATCH /entity/:did/relationship
async function confirmRelationship() {
  var s = await loadSettings();
  var btn = document.getElementById('eb-confirm-btn');
  var result = document.getElementById('eb-confirm-result');

  if (!s.ebApikey || !s.ebApisecret) {
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ Missing Entity B credentials. Configure in Settings.</div>';
    return;
  }

  // Get the unregistered address from the selected transfer
  var addrEl = document.getElementById('eb-confirm-address');
  var rawAddress = addrEl ? addrEl.textContent.trim() : '';
  if (!rawAddress || rawAddress === '—') {
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ No address to confirm. Select a transfer first.</div>';
    return;
  }

  // Convert to did:pkh format if needed
  var fromAddress = rawAddress.startsWith('did:pkh:') ? rawAddress : 'did:pkh:eip155:11155111:' + rawAddress;

  btn.disabled = true;
  btn.textContent = 'Confirming...';
  result.style.display = 'block';
  result.innerHTML = '<div style="color:#888;font-size:11px">Confirming relationship for ' + esc(rawAddress.substring(0, 20)) + '...</div>';

  try {
    var res = await fetch('/api/notabene/relationship/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: s.ebApikey,
        clientSecret: s.ebApisecret,
        entityDid: s.ebDid,
        fromAddress: fromAddress
      })
    });
    var data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || ('HTTP ' + res.status));

    btn.textContent = '✓ Confirmed';
    btn.classList.remove('btn-success');
    btn.classList.add('btn-outline');
    result.innerHTML = '<div style="color:#059669;font-size:11px;font-weight:600">✓ Relationship confirmed successfully.</div>' +
      '<details style="margin-top:6px"><summary style="cursor:pointer;font-size:10px;color:#5b4cdb">Response</summary>' +
      '<pre class="mono" style="font-size:9px;max-height:200px;overflow:auto;background:#f8f9fa;padding:8px;border-radius:4px;margin-top:4px">' +
      esc(JSON.stringify(data, null, 2)) + '</pre></details>';

    // Show done section
    document.getElementById('eb-done-title').style.display = 'block';
    document.getElementById('eb-done-section').style.display = 'block';

    // Re-fetch transfer details + TAP policies to show updated status (PENDING → COMPLETED)
    setTimeout(function() {
      fetchTransferDetails();
      fetchTapPolicies();
    }, 1500);
    setTimeout(function() { fetchTapPolicies(); }, 3000);
  } catch(e) {
    btn.disabled = false;
    btn.textContent = '✓ Confirm Address';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
  }
}
