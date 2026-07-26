// ═══ Case 4: Revert — Cancel & Refund ═══
// EA: Create (full PII) → Authorize → Broadcast → Settle → REVERT
// EB: Review → Authorize → Match → Send Refund On-Chain → Settle Revert

var refundTxHash = null;

// ─── EA Step 8: Revert Transfer ───
async function revertTransfer() {
  var s = await loadSettings();
  if (!selectedTxId) {
    alert('No transfer selected. Go to Entity A → Step 4 and select a transfer first.');
    return;
  }

  var btn = document.getElementById('ea-revert-btn');
  var result = document.getElementById('ea-revert-result');
  var reasonEl = document.getElementById('ea-revert-reason');
  var reason = reasonEl ? reasonEl.value.trim() : '';
  if (!reason) { alert('Please enter a revert reason.'); reasonEl.focus(); return; }

  // Fetch EA wallet for return address (CAIP-10 format)
  var wallets = {};
  try {
    var res = await fetch('/api/wallet/persisted');
    wallets = await res.json();
  } catch(e) {}

  var eaWallet = wallets.ea ? wallets.ea.address : '';
  if (!eaWallet) {
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ Entity A wallet not found. Generate wallet in Settings first.</div>';
    return;
  }

  var settlementAddress = 'eip155:11155111:' + eaWallet;

  btn.disabled = true; btn.textContent = 'Reverting...';

  try {
    var res = await fetch('/api/notabene/transfer/revert', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: s.eaApikey, clientSecret: s.eaApisecret,
        did: s.eaDid, txId: selectedTxId,
        reason: reason, settlementAddress: settlementAddress
      })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    result.style.display = 'block';
    result.innerHTML =
      '<div style="background:#fef3c7;color:#92400e;padding:10px;border-radius:6px;font-size:12px">' +
        '<div style="font-weight:600;margin-bottom:4px">↩ Revert Requested</div>' +
        '<div style="font-size:11px">Status: <strong>REVERT-REQUESTED</strong></div>' +
        '<div style="font-size:11px;margin-top:4px">Entity B has been notified. They need to send the refund on-chain and settle the revert.</div>' +
        '<div class="mono" style="font-size:10px;margin-top:4px;color:#888">Return address: ' + esc(settlementAddress) + '</div>' +
      '</div>';
    btn.textContent = '✓ Revert Requested'; btn.className = 'btn btn-outline';

    // Unlock EA revert address display
    var addrEl = document.getElementById('ea-revert-address');
    if (addrEl) addrEl.textContent = settlementAddress;
  } catch(e) {
    btn.disabled = false; btn.textContent = '↩ Revert Transfer';
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
  }
}

// ─── Auto-fill revert address display on load ───
async function fillRevertAddressDisplay() {
  try {
    var res = await fetch('/api/wallet/persisted');
    var wallets = await res.json();
    var eaWallet = wallets.ea ? wallets.ea.address : '';
    var addrEl = document.getElementById('ea-revert-address');
    if (addrEl && eaWallet) addrEl.textContent = 'eip155:11155111:' + eaWallet;

    var ebWallet = wallets.eb ? wallets.eb.address : '';
    var destEl = document.getElementById('eb-refund-dest');
    if (destEl && eaWallet) destEl.textContent = eaWallet;
  } catch(e) {}
}

// ─── EB Step 7: Send Refund On-Chain ───
async function sendRefundOnchain() {
  var s = await loadSettings();
  var btn = document.getElementById('eb-refund-btn');
  var result = document.getElementById('eb-refund-result');
  var amountEl = document.getElementById('eb-refund-amount');
  var amount = amountEl ? amountEl.value : '3500';

  btn.disabled = true; btn.textContent = 'Sending...';

  try {
    // Fetch wallets for private key and destination
    var res = await fetch('/api/wallet/persisted');
    var wallets = await res.json();
    var ebWallet = wallets.eb || {};
    var eaWallet = wallets.ea ? wallets.ea.address : '';

    if (!ebWallet.privateKey) throw new Error('Entity B wallet private key not found. Import wallet in Settings.');
    if (!eaWallet) throw new Error('Entity A wallet address not found.');

    var res2 = await fetch('/api/wallet/transfer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        privateKey: ebWallet.privateKey,
        to: eaWallet,
        amount: amount
      })
    });
    var data = await res2.json();
    if (data.error) throw new Error(data.error);

    refundTxHash = data.txHash;

    result.style.display = 'block';
    result.innerHTML =
      '<div style="background:#d1fae5;color:#047857;padding:10px;border-radius:6px;font-size:12px">' +
        '<div style="font-weight:600;margin-bottom:4px">✓ Refund Sent On-Chain</div>' +
        '<div>Amount: <strong>' + esc(amount) + ' USDT-TEST</strong></div>' +
        '<div>From: <span class="mono" style="font-size:10px">' + esc(data.from) + '</span></div>' +
        '<div>To: <span class="mono" style="font-size:10px">' + esc(data.to) + '</span></div>' +
        '<div class="mono" style="font-size:10px;word-break:break-all;margin-top:4px">Tx Hash: ' + esc(data.txHash) + '</div>' +
        '<a href="' + esc(data.explorerUrl) + '" target="_blank" style="font-size:11px;color:#5b4cdb">View on Etherscan ↗</a>' +
      '</div>';
    btn.textContent = '✓ Refund Sent'; btn.className = 'btn btn-success';

    // Unlock Step 8: Settle Revert
    document.getElementById('eb-settle-revert-section').style.display = 'block';
    var title = document.getElementById('eb-settle-revert-title');
    if (title) { title.style.opacity = '1'; title.innerHTML = title.innerHTML.replace(/ <span.*<\/span>/, ''); }
  } catch(e) {
    btn.disabled = false; btn.textContent = '⚡ Send Refund';
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
  }
}

// ─── EB Step 8: Settle Revert ───
async function settleRevertTransfer() {
  var s = await loadSettings();
  if (!selectedTxId) {
    alert('No transfer selected. Go to Entity B → Step 2 and select the incoming transfer first.');
    return;
  }

  var btn = document.getElementById('eb-settle-revert-btn');
  var result = document.getElementById('eb-settle-revert-result');

  if (!refundTxHash) {
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ No refund tx hash found. Send refund first (Step 7).</div>';
    return;
  }

  btn.disabled = true; btn.textContent = 'Settling...';

  try {
    var res = await fetch('/api/notabene/transfer/settle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: s.ebApikey, clientSecret: s.ebApisecret,
        did: s.ebDid, txId: selectedTxId,
        settlementId: refundTxHash
      })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    result.style.display = 'block';
    result.innerHTML =
      '<div style="background:#d1fae5;color:#047857;padding:10px;border-radius:6px;font-size:12px">' +
        '<div style="font-weight:600;margin-bottom:4px">✓ Revert Settled</div>' +
        '<div style="font-size:11px">Status: <strong>REVERTED</strong></div>' +
        '<div style="font-size:11px;margin-top:4px">The transfer has been fully reverted. Funds returned to Entity A.</div>' +
        '<div class="mono" style="font-size:10px;word-break:break-all;margin-top:4px">Refund Tx: ' + esc(refundTxHash) + '</div>' +
      '</div>';
    btn.textContent = '✓ Settled'; btn.className = 'btn btn-success';
  } catch(e) {
    btn.disabled = false; btn.textContent = '✓ Settle Revert';
    result.style.display = 'block';
    result.innerHTML = '<div style="color:#dc2626;font-size:11px">✗ ' + esc(e.message) + '</div>';
  }
}

// Initialize on load
fillRevertAddressDisplay();
