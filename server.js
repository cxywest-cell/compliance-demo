/**
 * Sumsub Two-Window Demo Server (Node.js + Express)
 * - Generates Access Tokens for user.html
 * - Manages applicant status for operator.html
 * - Proxies Sumsub API calls (Approve, Reject, Force Green/Red)
 */
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { ethers } = require('ethers');

// Don't crash on socket errors from Sumsub API
process.on('unhandledRejection', (err) => {
  console.error('[Unhandled]', err.message);
});
process.on('uncaughtException', (err) => {
  console.error('[Uncaught]', err.message);
});
const https = require('https');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const FormData = require('form-data');

const upload = multer({ storage: multer.memoryStorage() });

// Load .env
const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const app = express();

// Raw body parser for webhook HMAC verification (MUST be before express.json)
app.use('/sumsub/webhook', express.raw({ type: 'application/json' }));
app.use('/notabene/webhook', express.raw({ type: '*/*' }));

app.use(express.json());
app.use(express.static(__dirname)); // Serve static files (HTML, CSS, JS)

const SUMSUB_API_SECRET = process.env.SUMSUB_API_SECRET;
const SUMSUB_WEBSDK_SECRET = process.env.SUMSUB_WEBSDK_SECRET;
const SUMSUB_APP_TOKEN = process.env.SUMSUB_APP_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'SukZpD1QZhvzyo5cAcWiROJJant';
const NOTABENE_WEBHOOK_SECRET = process.env.NOTABENE_WEBHOOK_SECRET || 'whsec_bZTI8qRmPZMrwASEuAUTJDBnSJD8aPMM';
const BASE_URL = 'api.sumsub.com';
const LEVEL_NAME = 'kyb-test-daniel-0626';

// --- HMAC Signature ---
function signRequest(method, path, body) {
  const ts = Math.floor(Date.now() / 1000);
  const bodyStr = body ? JSON.stringify(body) : '';
  const stringToSign = `${ts}${method}${path}${bodyStr}`;
  const signature = crypto.createHmac('sha256', SUMSUB_API_SECRET).update(stringToSign).digest('hex');
  return { ts, sig: signature };
}

// --- Persistent tracking (file-backed) ---
const TRACKING_FILE = path.resolve(__dirname, '.applicants.json');
let knownApplicants = new Map(); // externalUserId -> last seen info

// Load from disk on startup
function loadApplicants() {
  try {
    if (fs.existsSync(TRACKING_FILE)) {
      const data = JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8'));
      Object.entries(data).forEach(([extId, info]) => knownApplicants.set(extId, info));
      console.log(`[Tracking] Loaded ${knownApplicants.size} applicants from disk`);
    }
  } catch (e) {
    console.error('[Tracking] Failed to load:', e.message);
  }
}

function saveApplicants() {
  try {
    const data = Object.fromEntries(knownApplicants);
    fs.writeFileSync(TRACKING_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[Tracking] Failed to save:', e.message);
  }
}

function trackApplicant(extId, info) {
  knownApplicants.set(extId, { ...info, _lastSeen: Date.now() });
  saveApplicants();
}

loadApplicants();

// --- Compliance Applicants (persistent, created on startup) ---
const COMPLIANCE_FILE = path.resolve(__dirname, '.compliance-applicants.json');
const LEVEL_MAP = {
  company: 'kyb-test-daniel-0626',
  individual: 'kyc-test-daniel-260618',
};

const COMPLIANCE_CASES = [
  // Person tests
  { id: 'p1', tab: 'person', name: 'Joelamltest Red', dob: '1999-01-24', expectedHit: 'Yes', exactMatch: 'Yes', hitType: 'Any' },
  { id: 'p2', tab: 'person', name: 'Joelamltest Red', dob: '', expectedHit: 'Yes', exactMatch: 'Yes', hitType: 'Any' },
  { id: 'p3', tab: 'person', name: 'Joelamltest Yellow', dob: '', expectedHit: 'Yes', exactMatch: 'No', hitType: 'Any' },
  { id: 'p4', tab: 'person', name: 'Joelamltest Testpep', dob: '', expectedHit: 'Yes', exactMatch: 'Yes', hitType: 'PEP' },
  { id: 'p5', tab: 'person', name: 'Joelamltest Testsanc', dob: '', expectedHit: 'Yes', exactMatch: 'Yes', hitType: 'Sanctions' },
  { id: 'p6', tab: 'person', name: 'John Doe Testperson', dob: '', expectedHit: 'No', exactMatch: 'No', hitType: '-' },
  // Company tests
  { id: 'c1', tab: 'company', name: 'Lorem Mocksanc LLC', dob: '', expectedHit: 'Yes', exactMatch: 'No', hitType: 'Sanctions' },
  { id: 'c2', tab: 'company', name: 'Lorem Mockrime LLC', dob: '', expectedHit: 'Yes', exactMatch: 'No', hitType: 'Crime' },
  { id: 'c3', tab: 'company', name: 'Lorem Mockmedi LLC', dob: '', expectedHit: 'Yes', exactMatch: 'No', hitType: 'Adverse media' },
  { id: 'c4', tab: 'company', name: 'Lorem Ipsum Corp', dob: '', expectedHit: 'No', exactMatch: 'No', hitType: '-' },
];

function randomExtUserId() {
  return 'cu-' + require('crypto').randomBytes(8).toString('hex');
}

let complianceApplicants = []; // { id, tab, name, extUserId, applicantId, reviewStatus, ... }

async function seedComplianceApplicants() {
  // Load existing
  try {
    if (fs.existsSync(COMPLIANCE_FILE)) {
      const data = JSON.parse(fs.readFileSync(COMPLIANCE_FILE, 'utf8'));
      if (data.applicants && data.applicants.length > 0) {
        complianceApplicants = data.applicants;
        console.log(`[Compliance] Loaded ${complianceApplicants.length} applicants from disk`);
      }
    }
  } catch (e) {
    console.error('[Compliance] Failed to load:', e.message);
  }

  if (complianceApplicants.length > 0) {
    console.log('[Compliance] Already seeded');
    return;
  }

  // Assign random extUserIds but DON'T create via API
  // Applicants are created by Sumsub when user completes WebSDK
  console.log('[Compliance] Assigning extUserIds (no API creation)...');
  for (const tc of COMPLIANCE_CASES) {
    complianceApplicants.push({
      id: tc.id,
      tab: tc.tab,
      name: tc.name,
      extUserId: randomExtUserId(),
      applicantId: null,
      reviewStatus: 'not-created',
      expectedHit: tc.expectedHit,
      exactMatch: tc.exactMatch,
      hitType: tc.hitType,
      dob: tc.dob,
      level: tc.tab === 'company' ? LEVEL_MAP.company : LEVEL_MAP.individual,
      amlResult: null
    });
  }

  saveComplianceApplicants();
  console.log(`[Compliance] Prepared ${complianceApplicants.length}/10 applicants (awaiting WebSDK)`);
}

function saveComplianceApplicants() {
  try {
    fs.writeFileSync(COMPLIANCE_FILE, JSON.stringify({ applicants: complianceApplicants }, null, 2));
  } catch (e) {
    console.error('[Compliance] Failed to save:', e.message);
  }
}

async function refreshComplianceStatuses() {
  for (const a of complianceApplicants) {
    if (a.reviewStatus === 'not-created' && !a.applicantId) continue;
    try {
      const infoPath = `/resources/applicants/-;externalUserId=${encodeURIComponent(a.extUserId)}/one`;
      const info = await sumsubApi('GET', infoPath);
      if (info && info.id && !info.code) {
        const review = info.review || {};
        a.applicantId = info.id;
        a.reviewStatus = review.reviewResult?.reviewAnswer || review.reviewStatus || info.reviewStatus || 'init';
      }
    } catch (e) {
      console.error(`[Compliance] Failed to refresh ${a.extUserId}:`, e.message);
    }
  }
  saveComplianceApplicants();
}

async function resetAllCompliance() {
  console.log('[Compliance] Resetting all applicants (new extUserIds)...');
  for (const a of complianceApplicants) {
    a.extUserId = randomExtUserId();
    a.applicantId = null;
    a.reviewStatus = 'not-created';
    a.amlResult = null;
  }
  saveComplianceApplicants();
  console.log('[Compliance] All applicants reset to not-created');
}

// Seed on startup (non-blocking, happens in background)
seedComplianceApplicants();

// --- API Proxy ---
function sumsubApi(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const { ts, sig } = signRequest(method, apiPath, body);
    console.log(`[API] ${method} ${apiPath}`);
    if (body) console.log(`[API BODY] ${JSON.stringify(body)}`);
    const options = {
      hostname: BASE_URL,
      port: 443,
      path: apiPath,
      method: method,
      headers: {
        'X-App-Token': SUMSUB_APP_TOKEN,
        'X-App-Access-Ts': String(ts),
        'X-App-Access-Sig': sig,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data, status: res.statusCode });
        }
      });
    });

    req.on('error', (e) => reject(e));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// --- Routes ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'kyb-test.html')));
app.get('/user', (req, res) => res.sendFile(path.join(__dirname, 'user.html')));
app.get('/operator', (req, res) => res.sendFile(path.join(__dirname, 'operator.html')));
app.get('/kyb-test', (req, res) => res.sendFile(path.join(__dirname, 'kyb-test.html')));

app.post('/api/token', async (req, res) => {
  const { externalUserId } = req.query;
  const apiPath = `/resources/accessTokens?userId=${externalUserId}&levelName=${LEVEL_NAME}&ttlInSecs=600`;
  console.log('Token Request:', apiPath);
  const result = await sumsubApi('POST', apiPath);
  console.log('Token Response:', JSON.stringify(result));
  
  // Pre-register this applicant in tracking so the operator panel knows about it
  if (!knownApplicants.has(externalUserId)) {
    trackApplicant(externalUserId, {
      externalUserId,
      reviewStatus: 'PENDING',
      levelName: LEVEL_NAME,
      type: 'unknown',
      _internalId: null,
      _lastSeen: Date.now(),
      _pending: true // flag: will be resolved on next status check
    });
    console.log(`[Tracking] Pre-registered ${externalUserId}`);
  }
  
  res.json(result);
});

// Helper: resolve externalUserId to internal applicantId
async function resolveApplicantId(externalUserId) {
  // First check cache
  if (knownApplicants.has(externalUserId)) {
    return knownApplicants.get(externalUserId)._internalId;
  }
  // Query Sumsub
  const infoPath = `/resources/applicants/-;externalUserId=${externalUserId}/one`;
  const infoResult = await sumsubApi('GET', infoPath);
  if (infoResult && infoResult.id) {
    trackApplicant(externalUserId, { ...infoResult, _internalId: infoResult.id });
    return infoResult.id;
  }
  return null;
}

app.get('/api/status/:id', async (req, res) => {
  const extId = req.params.id;
  
  // Use the correct Sumsub endpoint for externalUserId lookup
  const infoPath = `/resources/applicants/-;externalUserId=${extId}/one`;
  const infoResult = await sumsubApi('GET', infoPath);
  
  if (infoResult && !infoResult.code) {
    const applicantId = infoResult.id;
    
    // Flatten the nested review status for easier frontend consumption
    const review = infoResult.review || {};
    let reviewStatus = review.reviewResult?.reviewAnswer || review.reviewStatus;
    if (!reviewStatus && infoResult.review?.reviewStatus === 'init') reviewStatus = 'PENDING';
    if (!reviewStatus && infoResult.review?.reviewStatus === 'awaitingUser') reviewStatus = 'PENDING';
    infoResult.reviewStatus = reviewStatus || 'UNKNOWN';
    infoResult.reviewResult = review.reviewResult || {};
    
    // Extract KYB-specific data for the operator panel
    const companyInfo = infoResult.fixedInfo?.companyInfo || {};
    infoResult._kyb = {
      companyName: companyInfo.companyName || null,
      registrationNumber: companyInfo.registrationNumber || null,
      country: companyInfo.country || null,
      email: companyInfo.email || null,
      ownershipStructureDepth: companyInfo.ownershipStructureDepth || null,
      beneficiaries: (companyInfo.beneficiaries || []).map(b => ({
        id: b.id,
        applicantId: b.applicantId,
        shareSize: b.shareSize,
        types: b.types,
        submitted: b.submitted,
        firstName: b.beneficiaryInfo?.firstName || null,
        lastName: b.beneficiaryInfo?.lastName || null,
        email: b.beneficiaryInfo?.email || null,
        phone: b.beneficiaryInfo?.phone || null
      }))
    };
    
    // Cache the internal ID for future use (approve/decline/simulate)
    trackApplicant(extId, { ...infoResult, _internalId: applicantId });
    res.json(infoResult);
  } else if (knownApplicants.has(extId)) {
    // Return cached info if we've seen this applicant before
    res.json({ ...knownApplicants.get(extId), _cached: true });
  } else {
    res.json({ reviewStatus: 'NOT_FOUND', message: 'No applicant found', error: infoResult });
  }
});

app.post('/api/decide/:id', async (req, res) => {
  const { action } = req.query;
  const extId = req.params.id;
  
  // Resolve externalUserId to internal applicantId
  const applicantId = await resolveApplicantId(extId);
  if (!applicantId) {
    return res.json({ error: 'Applicant not found', externalUserId: extId });
  }
  
  console.log(`[DECIDE] ${action.toUpperCase()} for ${extId} -> ${applicantId}`);
  
  if (action === 'approve') {
    const result = await sumsubApi('POST', `/resources/applicants/${applicantId}/-/approve`, {});
    if (knownApplicants.has(extId)) trackApplicant(extId, { ...knownApplicants.get(extId), reviewStatus: 'GREEN' });
    res.json(result);
  } else if (action === 'decline') {
    const body = {
      note: 'Manual rejection by operator',
      reasons: {
        other: ['other']
      }
    };
    const result = await sumsubApi('POST', `/resources/applicants/${applicantId}/-/reject`, body);
    console.log(`[REJECT] result: ${JSON.stringify(result)}`);
    if (knownApplicants.has(extId)) trackApplicant(extId, { ...knownApplicants.get(extId), reviewStatus: 'RED' });
    res.json(result);
  }
});

app.post('/api/simulate/:id', async (req, res) => {
  const { result } = req.query;
  const extId = req.params.id;
  
  // Resolve externalUserId to internal applicantId
  const applicantId = await resolveApplicantId(extId);
  if (!applicantId) {
    return res.json({ error: 'Applicant not found', externalUserId: extId });
  }
  
  const path = `/resources/applicants/${applicantId}/status/testCompleted`;
  const body = { reviewAnswer: result.toUpperCase() };
  const apiResult = await sumsubApi('POST', path, body);
  
  // Update tracked status
  if (knownApplicants.has(extId)) {
    trackApplicant(extId, { ...knownApplicants.get(extId), reviewStatus: result.toUpperCase() });
  }
  res.json(apiResult);
});

// --- UBO / Beneficiary KYC Tracking ---
// Fetch individual UBO applicant status by internal applicantId
app.get('/api/ubo/:applicantId/status', async (req, res) => {
  const applicantId = req.params.applicantId;
  const infoPath = `/resources/applicants/${applicantId}/one`;
  const infoResult = await sumsubApi('GET', infoPath);
  
  if (infoResult && !infoResult.code) {
    const review = infoResult.review || {};
    let reviewStatus = review.reviewResult?.reviewAnswer || review.reviewStatus;
    if (!reviewStatus && infoResult.review?.reviewStatus === 'init') reviewStatus = 'PENDING';
    infoResult.reviewStatus = reviewStatus || 'UNKNOWN';
    infoResult.reviewResult = review.reviewResult || {};
    res.json(infoResult);
  } else {
    res.json({ reviewStatus: 'NOT_FOUND', message: 'UBO applicant not found', error: infoResult });
  }
});

// Approve/Reject a UBO by internal applicantId
app.post('/api/ubo/:applicantId/decide', async (req, res) => {
  const { action } = req.query;
  const applicantId = req.params.applicantId;
  
  console.log(`[UBO DECIDE] ${action.toUpperCase()} for applicantId ${applicantId}`);
  
  if (action === 'approve') {
    const result = await sumsubApi('POST', `/resources/applicants/${applicantId}/-/approve`, {});
    res.json(result);
  } else if (action === 'decline') {
    const body = {
      note: 'Manual UBO rejection by operator',
      reasons: { other: ['other'] }
    };
    const result = await sumsubApi('POST', `/resources/applicants/${applicantId}/-/reject`, body);
    res.json(result);
  }
});

// Force Green/Red on a UBO (sandbox)
app.post('/api/ubo/:applicantId/simulate', async (req, res) => {
  const { result } = req.query;
  const applicantId = req.params.applicantId;
  
  const path = `/resources/applicants/${applicantId}/status/testCompleted`;
  const body = { reviewAnswer: result.toUpperCase() };
  const apiResult = await sumsubApi('POST', path, body);
  res.json(apiResult);
});

app.get('/api/recent', async (req, res) => {
  // Return known applicants, refreshing status from Sumsub for each
  const entries = Array.from(knownApplicants.entries());
  if (entries.length === 0) {
    return res.json([]);
  }

  const results = await Promise.all(
    entries.map(async ([extId, cached]) => {
      try {
        const infoPath = `/resources/applicants/-;externalUserId=${extId}/one`;
        const fresh = await sumsubApi('GET', infoPath);
        if (fresh && fresh.id) {
          const review = fresh.review || {};
          let reviewStatus = review.reviewResult?.reviewAnswer || review.reviewStatus;
          if (!reviewStatus && fresh.review?.reviewStatus === 'init') reviewStatus = 'PENDING';
          if (!reviewStatus && fresh.review?.reviewStatus === 'awaitingUser') reviewStatus = 'PENDING';
          if (!reviewStatus) reviewStatus = 'UNKNOWN';
          trackApplicant(extId, { ...fresh, _internalId: fresh.id });
          return {
            externalUserId: extId,
            reviewStatus,
            levelName: fresh.review?.levelName || 'N/A',
            type: fresh.type || 'unknown',
            _internalId: fresh.id,
            _lastSeen: Date.now()
          };
        }
      } catch (e) {
        console.error(`[Recent] Failed to refresh ${extId}:`, e.message);
      }
      // Fall back to cached
      return {
        externalUserId: extId,
        reviewStatus: cached.reviewStatus || 'UNKNOWN',
        levelName: cached.levelName || 'N/A',
        type: cached.type || 'unknown',
        _internalId: cached._internalId,
        _lastSeen: cached._lastSeen
      };
    })
  );

  // Sort by lastSeen descending
  results.sort((a, b) => (b._lastSeen || 0) - (a._lastSeen || 0));
  res.json(results);
});

// --- Compliance Dashboard Route ---
app.get('/compliance', (req, res) => res.sendFile(path.join(__dirname, 'compliance-dashboard.html')));

// ========== COMPLIANCE API ENDPOINTS ==========

// Get all stored compliance applicants with their current statuses
app.get('/api/compliance/list', async (req, res) => {
  // Return cached data immediately, refresh in background
  res.json({ applicants: complianceApplicants });
  refreshComplianceStatuses();
});

// Reset all: reset each in Sumsub, clear local data, recreate fresh
app.post('/api/compliance/reset', async (req, res) => {
  res.json({ ok: true, message: 'Reset in progress' });
  resetAllCompliance();
});

// Generate external WebSDK link for a compliance applicant
app.post('/api/compliance/token', async (req, res) => {
  const { extUserId } = req.body;
  const a = complianceApplicants.find(a => a.extUserId === extUserId);
  if (!a) return res.json({ code: 404, description: 'Applicant not found' });

  const level = a.level;
  const apiPath = `/resources/sdkIntegrations/levels/-/websdkLink?lang=en&source=api`;
  const body = {
    levelName: level,
    userId: extUserId,
    ttlInSecs: 1800,
    applicantIdentifiers: {
      email: 'daniel@cregis.io',
      phone: '+4915112345678'
    }
  };
  const result = await sumsubApi('POST', apiPath, body);

  if (result.url) {
    console.log(`[Compliance] External link generated for ${a.name}: ${result.url}`);
  } else {
    console.error(`[Compliance] Link generation failed:`, JSON.stringify(result));
  }
  res.json(result);
});

// Update a single applicant's AML result in local store
app.post('/api/compliance/update-aml', async (req, res) => {
  const { extUserId, amlResult } = req.body;
  const a = complianceApplicants.find(a => a.extUserId === extUserId);
  if (a) {
    a.amlResult = amlResult;
    saveComplianceApplicants();
    res.json({ ok: true });
  } else {
    res.json({ code: 404, description: 'Applicant not found in store' });
  }
});

// Create applicant (person or company) - creates in Sumsub + stores
app.post('/api/applicants/create', async (req, res) => {
  const { externalUserId, levelName, type, firstName, lastName, dateOfBirth, companyName, country, regNo } = req.body;
  
  // Level must be in query string, not body
  const apiPath = `/resources/applicants?levelName=${encodeURIComponent(levelName || 'default')}`;
  
  const body = { externalUserId, type: type || 'individual' };
  
  if (type === 'company') {
    body.fixedInfo = {
      companyInfo: {}
    };
    if (companyName) body.fixedInfo.companyInfo.companyName = companyName;
    if (country) body.fixedInfo.companyInfo.country = country;
    if (regNo) body.fixedInfo.companyInfo.registrationNumber = regNo;
  } else {
    body.fixedInfo = {};
    if (firstName) body.fixedInfo.firstName = firstName;
    if (lastName) body.fixedInfo.lastName = lastName;
    if (dateOfBirth) body.fixedInfo.dateOfBirth = dateOfBirth;
  }
  
  console.log(`[COMPLIANCE CREATE] type=${type} levelName=${levelName} extId=${externalUserId}`);
  console.log(`[COMPLIANCE CREATE BODY]`, JSON.stringify(body));
  const result = await sumsubApi('POST', apiPath, body);
  console.log(`[COMPLIANCE CREATE RESULT]`, JSON.stringify(result).substring(0, 500));
  res.json(result);
});

// Request applicant check (POST /resources/applicants/{applicantId}/status/pending)
app.post('/api/request-check/:applicantId', async (req, res) => {
  const { applicantId } = req.params;
  console.log(`[REQUEST CHECK] ${applicantId}`);
  const path = `/resources/applicants/${applicantId}/status/pending?reason=demo`;
  const result = await sumsubApi('POST', path, null);
  console.log(`[REQUEST CHECK RESULT]`, JSON.stringify(result).substring(0, 500));
  res.json(result);
});

// AML Rescreening (POST /resources/applicants/{id}/recheck/aml)
// Only works for approved applicants with completed verification steps
app.post('/api/aml/rescreen/:applicantId', async (req, res) => {
  const applicantId = req.params.applicantId;
  console.log(`[AML RESCREEN] ${applicantId}`);
  const result = await sumsubApi('POST', `/resources/applicants/${applicantId}/recheck/aml`, {});
  console.log(`[AML RESCREEN RESULT]`, JSON.stringify(result));
  res.json(result);
});

// Get AML Case Data (GET /resources/api/applicants/{id}/amlCase)
app.get('/api/aml/result/:applicantId', async (req, res) => {
  const applicantId = req.params.applicantId;
  console.log(`[AML RESULT] ${applicantId}`);
  const result = await sumsubApi('GET', `/resources/api/applicants/${applicantId}/amlCase`);
  console.log(`[AML RESULT RESPONSE]`, JSON.stringify(result).substring(0, 500));
  res.json(result);
});

// Get Applicant Data (GET /resources/applicants/{id}/one)
app.get('/api/applicant/data/:applicantId', async (req, res) => {
  const applicantId = req.params.applicantId;
  console.log(`[GET DATA] ${applicantId}`);
  const result = await sumsubApi('GET', `/resources/applicants/${applicantId}/one`);
  console.log(`[GET DATA RESPONSE]`, JSON.stringify(result).substring(0, 500));
  res.json(result);
});

// Reset applicant to init (POST /resources/applicants/{id}/reset)
app.post('/api/applicant/reset/:applicantId', async (req, res) => {
  const applicantId = req.params.applicantId;
  console.log(`[RESET] ${applicantId}`);
  const result = await sumsubApi('POST', `/resources/applicants/${applicantId}/reset`, {});
  console.log(`[RESET RESULT]`, JSON.stringify(result));
  res.json(result);
});

// ─── Notabene Travel Rule API ───

const NOTABENE_AUTH_URL = 'https://auth.notabene.id/oauth/token';
const NOTABENE_API_BASE = 'https://api.eu1.notabene.id';

// Token cache (24h validity, refresh at 23h)
let notabeneTokenCache = {}; // keyed by clientId

async function getNotabeneToken(clientId, clientSecret) {
  // Check cache
  if (notabeneTokenCache[clientId]) {
    const cached = notabeneTokenCache[clientId];
    if (Date.now() < cached.expiresAt) {
      return cached.token;
    }
  }

  console.log(`[NOTABENE AUTH] Getting token for ${clientId}`);
  const resp = await fetch(NOTABENE_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      audience: NOTABENE_API_BASE
    })
  });
  const data = await resp.json();
  if (!data.access_token) {
    throw new Error('Notabene auth failed: ' + JSON.stringify(data));
  }
  notabeneTokenCache[clientId] = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 3600) * 1000
  };
  return data.access_token;
}

async function notabeneApi(method, path, token, body) {
  const url = NOTABENE_API_BASE + path;
  console.log(`[NOTABENE] ${method} ${path}`);
  const opts = {
    method,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    }
  };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  const resp = await fetch(url, opts);
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch(e) { data = text; }
  console.log(`[NOTABENE RESULT] ${resp.status}`);
  return data;
}

// Get auth token
app.post('/api/notabene/token', async (req, res) => {
  const { clientId, clientSecret } = req.body;
  try {
    const token = await getNotabeneToken(clientId, clientSecret);
    res.json({ token });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// List network entities
app.get('/api/notabene/network', async (req, res) => {
  const { clientId, clientSecret, listing } = req.query;
  try {
    const token = await getNotabeneToken(clientId, clientSecret);
    const path = '/network' + (listing ? '?listing=' + listing : '');
    const data = await notabeneApi('GET', path, token);
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Get entity info
app.get('/api/notabene/entity', async (req, res) => {
  const { clientId, clientSecret, did } = req.query;
  try {
    const token = await getNotabeneToken(clientId, clientSecret);
    const data = await notabeneApi('GET', '/entity/' + did, token);
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Create transfer
app.post('/api/notabene/transfer', async (req, res) => {
  const { clientId, clientSecret, entityDid, transferBody } = req.body;
  try {
    const token = await getNotabeneToken(clientId, clientSecret);
    const path = '/entity/' + entityDid + '/tx';
    const data = await notabeneApi('POST', path, token, transferBody);
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// List transfers for entity
app.get('/api/notabene/transfers', async (req, res) => {
  const { clientId, clientSecret, did } = req.query;
  try {
    const token = await getNotabeneToken(clientId, clientSecret);
    const data = await notabeneApi('GET', '/entity/' + did + '/tx', token);
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Get specific transfer
app.get('/api/notabene/transfer', async (req, res) => {
  const { clientId, clientSecret, did, txId } = req.query;
  try {
    const token = await getNotabeneToken(clientId, clientSecret);
    const data = await notabeneApi('GET', '/entity/' + did + '/tx/' + txId, token);
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Authorize transfer
app.post('/api/notabene/transfer/authorize', async (req, res) => {
  const { clientId, clientSecret, did, txId } = req.body;
  try {
    const token = await getNotabeneToken(clientId, clientSecret);
    const data = await notabeneApi('POST', '/entity/' + did + '/tx/' + txId + '/authorize', token, {});
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Reject transfer
app.post('/api/notabene/transfer/reject', async (req, res) => {
  const { clientId, clientSecret, did, txId, reason, comment } = req.body;
  try {
    const token = await getNotabeneToken(clientId, clientSecret);
    const data = await notabeneApi('POST', '/entity/' + did + '/tx/' + txId + '/reject', token, { reason: reason || 'OTHER', comment: comment || '' });
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Settle transfer
app.post('/api/notabene/transfer/settle', async (req, res) => {
  const { clientId, clientSecret, did, txId, settlementId } = req.body;
  try {
    const token = await getNotabeneToken(clientId, clientSecret);
    const data = await notabeneApi('POST', '/entity/' + did + '/tx/' + txId + '/settle', token, { settlementId });
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Cloudflare Tunnel Management ───
let tunnelProcess = null;
let tunnelUrl = null;
let tunnelResolve = null; // Promise resolver for waiting on URL

// Kill any existing tunnel and clean up all listeners
function killTunnel() {
  return new Promise((resolve) => {
    // Kill our own spawned tunnel
    if (tunnelProcess && !tunnelProcess.killed) {
      tunnelProcess.removeAllListeners();
      tunnelProcess.kill('SIGKILL');
    }
    // Kill ALL other cloudflared processes pointing to localhost:8000
    const { execSync } = require('child_process');
    try {
      execSync('pkill -f "cloudflared.*localhost:8000" 2>/dev/null', { stdio: 'ignore' });
    } catch(e) { /* ignore errors (no matching process, etc.) */ }
    tunnelProcess = null;
    tunnelUrl = null;
    tunnelResolve = null;
    resolve();
  });
}

// Spawn cloudflared and wait for the URL
function startTunnel(res) {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const proc = spawn('cloudflared', [
      'tunnel', '--url', 'http://localhost:8000',
      '--protocol', 'http2', '--edge-ip-version', '4', '--no-autoupdate'
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    tunnelProcess = proc;

    let output = '';
    let responded = false;
    const respond = (data) => {
      if (responded) return;
      responded = true;
      resolve(data);
    };

    const timeout = setTimeout(() => {
      if (!responded) {
        proc.kill('SIGKILL');
        respond({ error: 'Tunnel failed to start within 45 seconds' });
      }
    }, 45000);

    const handler = (data) => {
      output += data.toString();
      // Wait until the URL is found AND the tunnel is registered
      const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      const registeredMatch = output.match(/Registered tunnel connection/);
      if (urlMatch && registeredMatch && !tunnelUrl) {
        tunnelUrl = urlMatch[0];
        clearTimeout(timeout);
        console.log(`[Tunnel] ${tunnelUrl} — registered and ready`);
        respond({ url: tunnelUrl, status: 'started' });
      }
    };

    proc.stdout.on('data', handler);
    proc.stderr.on('data', handler);

    proc.on('error', (err) => {
      clearTimeout(timeout);
      respond({ error: 'cloudflared not found: ' + err.message });
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (!responded) respond({ error: 'cloudflared exited with code ' + code });
      if (tunnelProcess === proc) {
        tunnelProcess = null;
        tunnelUrl = null;
      }
    });
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', tunnel: tunnelUrl, time: Date.now() });
});

app.post('/api/tunnel/start', async (req, res) => {
  console.log('[Tunnel API] Start request from', req.ip);
  if (tunnelProcess && !tunnelProcess.killed) {
    return res.json({ url: tunnelUrl, status: 'already_running' });
  }
  const result = await startTunnel(res);
  res.json(result);
});

app.get('/api/tunnel/status', (req, res) => {
  res.json({ url: tunnelUrl, running: tunnelProcess && !tunnelProcess.killed });
});

app.post('/api/tunnel/refresh', async (req, res) => {
  console.log('[Tunnel API] Refresh request from', req.ip);
  await killTunnel();
  const result = await startTunnel(res);
  res.json(result);
});

app.post('/api/tunnel/test', (req, res) => {
  if (!tunnelUrl) {
    return res.json({ success: false, error: 'No tunnel running' });
  }
  // Test localhost directly (external DNS may not resolve in WSL)
  const http = require('http');
  const startTime = Date.now();
  http.get('http://localhost:8000/settings', { timeout: 5000 }, (redirectRes) => {
    const statusCode = redirectRes.statusCode;
    const ok = statusCode === 200 || statusCode === 302;
    res.json({
      success: ok,
      url: tunnelUrl,
      statusCode: String(statusCode),
      latency: Date.now() - startTime
    });
  }).on('error', (err) => {
    res.json({
      success: false,
      error: err.message,
      url: tunnelUrl
    });
  });
});

app.post('/api/tunnel/stop', (req, res) => {
  if (tunnelProcess && !tunnelProcess.killed) {
    tunnelProcess.kill();
    tunnelProcess = null;
  }
  tunnelUrl = null;
  res.json({ status: 'stopped' });
});

// ─── Onboarding Pages ───
app.get('/onboarding', (req, res) => res.sendFile(__dirname + '/onboarding.html'));
app.get('/settings', (req, res) => res.sendFile(__dirname + '/settings.html'));
app.get('/monitoring', (req, res) => res.sendFile(__dirname + '/monitoring.html'));
app.get('/screening', (req, res) => res.sendFile(__dirname + '/screening.html'));
app.get('/transfer', (req, res) => res.sendFile(__dirname + '/transfer-flow.html'));
// .html aliases for sidebar navigation
app.get('/onboarding.html', (req, res) => res.redirect('/onboarding'));
app.get('/settings.html', (req, res) => res.redirect('/settings'));
app.get('/monitoring.html', (req, res) => res.redirect('/monitoring'));
app.get('/screening.html', (req, res) => res.redirect('/screening'));
app.get('/transfer-flow.html', (req, res) => res.redirect('/transfer'));

// Generate WebSDK link with redirect URL
app.post('/api/websdk-link', async (req, res) => {
  const { levelName, externalUserId, email } = req.body;

  // Use server's known tunnel URL (not frontend's location.origin)
  const baseUrl = (tunnelUrl || 'http://localhost:8000').replace(/\/+$/, '');

  // Pass signKey so Sumsub signs the redirect JWT — our server verifies it on callback
  const linkPath = '/resources/sdkIntegrations/levels/-/websdkLink';
  const linkBody = {
    levelName: levelName,
    userId: externalUserId,
    ttlInSecs: 3600,
    applicantIdentifiers: { email: email },
    redirect: {
      successUrl: baseUrl + '/callback?externalUserId=' + externalUserId + '&action=success',
      rejectUrl: baseUrl + '/callback?externalUserId=' + externalUserId + '&action=reject',
      signKey: SUMSUB_WEBSDK_SECRET
    }
  };

  console.log(`[WebSDK Link] successUrl: ${linkBody.redirect.successUrl}`);
  console.log(`[WebSDK Link] rejectUrl: ${linkBody.redirect.rejectUrl}`);

  const linkResult = await sumsubApi('POST', linkPath, linkBody);

  if (linkResult.error) {
    return res.status(500).json({ error: 'Failed to generate WebSDK link', detail: linkResult.error });
  }

  console.log(`[WebSDK Link] Generated link for ${externalUserId}`);
  res.json({ url: linkResult.url, externalUserId: externalUserId });
});

// Run AML check for applicant (POST /resources/applicants/{applicantId}/recheck/aml)
app.post('/api/run-aml-check', async (req, res) => {
  const { applicantId } = req.body;
  const amlPath = '/resources/applicants/' + applicantId + '/recheck/aml';
  const result = await sumsubApi('POST', amlPath);
  if (result.error) {
    return res.status(500).json({ error: 'Failed to run AML check', detail: result.error });
  }
  res.json({ ok: result.ok || 1 });
});

// Get AML case data (GET /resources/api/applicants/{applicantId}/amlCase)
app.get('/api/aml-case-data/:applicantId', async (req, res) => {
  const { applicantId } = req.params;
  const amlPath = '/resources/api/applicants/' + applicantId + '/amlCase';
  const result = await sumsubApi('GET', amlPath);
  if (result.error) {
    return res.status(500).json({ error: 'Failed to get AML case data', detail: result.error });
  }
  res.json(result);
});

// Check applicant existence by externalUserId (GET /resources/applicants/-/byExternalUserId/{externalUserId})
app.post('/api/check-applicant-existence', async (req, res) => {
  const { externalUserId } = req.body;

  const checkPath = '/resources/applicants/-/byExternalUserId/' + externalUserId;
  const result = await sumsubApi('GET', checkPath);

  if (result.error) {
    return res.status(500).json({ error: 'Failed to check applicant existence', detail: result.error });
  }

  res.json({
    exists: result.exists || false,
    applicant: result.applicant || null
  });
});

// Check applicant status by externalUserId
app.post('/api/applicant-status', async (req, res) => {
  const { externalUserId } = req.body;

  const statusPath = '/resources/applicants/-;externalUserId=' + externalUserId + '/one';
  const statusResult = await sumsubApi('GET', statusPath);

  if (statusResult.error) {
    return res.status(500).json({ error: 'Failed to check applicant status', detail: statusResult.error });
  }

  console.log(`[Applicant Status] Checked ${externalUserId}`);
  res.json(statusResult);
});

// Approve or reject applicant by externalUserId
app.post('/api/decision', async (req, res) => {
  const { externalUserId, action } = req.body;

  // First get the applicant to find the internal ID
  const lookupPath = '/resources/applicants/-;externalUserId=' + externalUserId + '/one';
  const lookup = await sumsubApi('GET', lookupPath);

  if (lookup.error || !lookup.id) {
    return res.status(404).json({ ok: false, error: 'Applicant not found', detail: lookup.error });
  }

  const applicantId = lookup.id;
  let result;

  if (action === 'APPROVE') {
    result = await sumsubApi('POST', `/resources/applicants/${applicantId}/-/approve`, {});
  } else {
    const body = { manualReviewTag: { rejectReason: 'Manual rejection by operator' } };
    result = await sumsubApi('POST', `/resources/applicants/${applicantId}/-/reject`, body);
  }

  if (result.error) {
    return res.status(500).json({ ok: false, error: result.error });
  }

  console.log(`[Decision] ${action} ${externalUserId} (${applicantId})`);
  res.json({ ok: true, applicantId, action });
});

// Callback page for post-verification redirect
app.get('/callback', (req, res) => {
  // Verify JWT and embed result into page for developer reference
  const rawJwt = req.query.jwt || '';
  let jwtResult = { verified: false, header: null, payload: null, error: 'No JWT provided' };

  if (rawJwt) {
    const parts = rawJwt.split('.');
    const signingInput = parts.slice(0, 2).join('.');
    const actualSig = parts[2] || '';

    // Compute expected signature using HS256 + our secret
    const expectedSig = crypto
      .createHmac('sha256', SUMSUB_WEBSDK_SECRET)
      .update(signingInput)
      .digest('base64url');

    try {
      const decoded = jwt.verify(rawJwt, SUMSUB_WEBSDK_SECRET, { algorithms: ['HS256'] });
      jwtResult = {
        verified: true,
        header: jwt.decode(rawJwt, { complete: true }).header,
        payload: decoded,
        signingInput: signingInput,
        expectedSig: expectedSig,
        actualSig: actualSig,
        sigMatch: expectedSig === actualSig,
        error: null
      };
      console.log('[Callback JWT] Verified OK:', JSON.stringify(decoded));
    } catch (e) {
      jwtResult = { verified: false, header: null, payload: null, error: e.message };
      if (parts.length === 3) {
        jwtResult.header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
        jwtResult.payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        jwtResult.signingInput = signingInput;
        jwtResult.expectedSig = expectedSig;
        jwtResult.actualSig = actualSig;
        jwtResult.sigMatch = false;
      }
      console.log('[Callback JWT] Verification failed:', e.message);
    }
  }

  const jwtDataScript = '<script>window.__JWT_VERIFY__ = ' + JSON.stringify(jwtResult).replace(/</g, '\\u003c') + ';</script>';

  // Read callback.html and inject the JWT data before </head>
  const htmlPath = path.join(__dirname, 'callback.html');
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const injected = html.replace('</head>', jwtDataScript + '</head>');
  res.send(injected);
});

// ─── Sumsub Webhook Receiver ───
// Receives applicant status change events from Sumsub
const WEBHOOK_LOG_PATH = path.join(__dirname, '.webhooks.json');

function logWebhook(entry) {
  try {
    let log = [];
    if (fs.existsSync(WEBHOOK_LOG_PATH)) {
      log = JSON.parse(fs.readFileSync(WEBHOOK_LOG_PATH, 'utf8'));
    }
    log.push(entry);
    if (log.length > 100) log = log.slice(-100);
    fs.writeFileSync(WEBHOOK_LOG_PATH, JSON.stringify(log, null, 2));
  } catch(e) {
    console.error('[Webhook] Failed to save log:', e.message);
  }
}

app.post('/sumsub/webhook', (req, res) => {
  const rawBody = req.body;
  const signature = req.headers['x-payload-hmac-sha256'];
  
  // Verify HMAC signature
  const computedHmac = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  const valid = signature === computedHmac;
  
  let payload;
  try {
    payload = JSON.parse(rawBody.toString());
  } catch(e) {
    console.error('[Webhook] Invalid JSON:', e.message);
    return res.status(400).send('Invalid JSON');
  }
  
  const timestamp = new Date().toISOString();
  const entry = { type: 'sumsub', timestamp, verified: valid, signature, signatureMatch: computedHmac, ...payload };
  
  const status = valid ? 'VERIFIED' : 'UNVERIFIED';
  console.log(`[Webhook] ${status} | ${timestamp} — type: ${payload.type || 'unknown'}, applicantId: ${payload.applicantId || '—'}, extUserId: ${payload.externalUserId || '—'}`);
  
  if (!valid) {
    console.log(`[Webhook] Expected: ${computedHmac}`);
    console.log(`[Webhook] Received: ${signature}`);
  }
  
  logWebhook(entry);
  res.status(200).send('OK');
});

app.get('/sumsub/webhook', (req, res) => {
  // Sumsub validates webhooks with GET first
  res.status(200).send('OK');
});

// ─── Notabene webhook receiver ───
// Logs incoming Notabene Travel Rule webhook events to the shared webhook log.
// Payload structure is TBD — Notabene docs need to be consulted.
// For now we capture everything: headers + body.
// Raw body parser is registered at the top of the file, before express.json().
app.post('/notabene/webhook', (req, res) => {
  const rawBody = req.body && req.body.length ? req.body.toString('utf8') : '';
  let parsedBody;
  try { parsedBody = JSON.parse(rawBody); } catch(e) { parsedBody = rawBody; }

  // Attempt signature verification — Notabene's exact scheme is TBD.
  // Check common header names; verify if any matches HMAC-SHA256(rawBody, secret).
  const candidateHeaders = [
    'x-notabene-signature',
    'x-signature',
    'x-hub-signature',
    'x-payload-hmac-sha256',
    'notabene-signature',
    'signature'
  ];
  let sigHeader = null;
  let sigValue = null;
  for (const h of candidateHeaders) {
    if (req.headers[h]) {
      sigHeader = h;
      sigValue = req.headers[h];
      break;
    }
  }
  const computedHmac = crypto.createHmac('sha256', NOTABENE_WEBHOOK_SECRET).update(rawBody).digest('hex');
  // Some schemes prefix with "sha256="
  const computedHmacPrefixed = 'sha256=' + computedHmac;
  let verified = false;
  if (sigValue) {
    const sv = sigValue.replace(/^sha256=/, '');
    verified = (sv === computedHmac || sv === computedHmacPrefixed || sigValue === computedHmac);
  }

  const entry = {
    type: 'notabene',
    timestamp: new Date().toISOString(),
    verified: verified,
    signatureHeader: sigHeader,
    signature: sigValue,
    signatureMatch: sigValue ? computedHmac : null,
    allHeaders: req.headers,
    body: parsedBody,
    rawBody: rawBody.substring(0, 5000)
  };
  logWebhook(entry);
  const status = verified ? 'VERIFIED' : (sigValue ? 'UNVERIFIED' : 'NO_SIGNATURE');
  console.log(`[Notabene Webhook] ${status} | ${entry.timestamp} — sigHeader: ${sigHeader || 'none'}, msgType: ${typeof parsedBody === 'object' ? (parsedBody.message || parsedBody.eventType || 'unknown') : 'raw'}`);
  res.status(200).send('OK');
});

app.get('/notabene/webhook', (req, res) => {
  res.status(200).send('OK');
});

// API endpoint for webhook console polling
app.get('/api/webhooks', (req, res) => {
  try {
    if (fs.existsSync(WEBHOOK_LOG_PATH)) {
      const log = JSON.parse(fs.readFileSync(WEBHOOK_LOG_PATH, 'utf8'));
      res.json(log);
    } else {
      res.json([]);
    }
  } catch(e) {
    res.json([]);
  }
});

// Request applicant check — triggers Sumsub to process the applicant
// POST /resources/applicants/{applicantId}/status/pending
app.post('/api/applicant-check', async (req, res) => {
  const { applicantId } = req.body;
  if (!applicantId) {
    return res.status(400).json({ error: 'applicantId required' });
  }

  const path = '/resources/applicants/' + applicantId + '/status/pending';
  const result = await sumsubApi('POST', path, {});

  if (result.error) {
    return res.status(500).json({ error: 'Applicant check failed', detail: result.error });
  }

  console.log(`[Applicant Check] applicantId=${applicantId}`);
  res.json(result);
});

// Upload verification document to Sumsub
// POST /resources/applicants/{applicantId}/info/idDoc
// Multipart form: info (JSON metadata) + content (file)
app.post('/api/upload-doc', upload.single('content'), async (req, res) => {
  const { applicantId } = req.body;
  const infoJson = req.body.info;

  if (!applicantId || !infoJson || !req.file) {
    return res.status(400).json({ error: 'applicantId, info (JSON), and content (file) required' });
  }

  let info;
  try {
    info = JSON.parse(infoJson);
  } catch (e) {
    return res.status(400).json({ error: 'info must be valid JSON' });
  }

  const apiPath = '/resources/applicants/' + applicantId + '/info/idDoc';
  const { ts, sig } = signRequest('POST', apiPath, null); // No body for multipart signing

  const form = new FormData();
  form.append('info', JSON.stringify(info));
  form.append('content', req.file.buffer, {
    filename: req.file.originalname,
    contentType: req.file.mimetype
  });

  console.log(`[Doc Upload] applicantId=${applicantId} idDocType=${info.idDocType} country=${info.country} file=${req.file.originalname}`);

  const url = 'https://' + BASE_URL + apiPath;
  form.getLength((err, length) => {
    if (err) return res.status(500).json({ error: 'Form length error: ' + err.message });

    const options = {
      hostname: BASE_URL,
      port: 443,
      path: apiPath,
      method: 'POST',
      headers: {
        ...form.getHeaders(),
        'X-App-Token': SUMSUB_APP_TOKEN,
        'X-App-Access-Ts': String(ts),
        'X-App-Access-Sig': sig,
        'X-Return-Doc-Warnings': 'true'
      }
    };

    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (response.statusCode >= 400) {
            return res.status(response.statusCode).json(parsed);
          }
          res.json(parsed);
        } catch (e) {
          res.json({ raw: data, status: response.statusCode });
        }
      });
    });

    request.on('error', (e) => {
      console.error('[Doc Upload] Request error:', e.message);
      res.status(500).json({ error: e.message });
    });

    form.pipe(request);
  });
});

// Request action check — triggers Sumsub to process an applicant action
// POST /resources/applicantActions/{actionId}/review/status/pending
app.post('/api/action-check', async (req, res) => {
  const { actionId } = req.body;
  if (!actionId) {
    return res.status(400).json({ error: 'actionId required' });
  }

  const path = '/resources/applicantActions/' + actionId + '/review/status/pending';
  const result = await sumsubApi('POST', path, {});

  if (result.error) {
    return res.status(500).json({ error: 'Action check failed', detail: result.error });
  }

  console.log(`[Action Check] actionId=${actionId}, reviewStatus=${result.review?.reviewStatus}`);
  res.json(result);
});

// Clear webhook log
app.post('/api/webhooks/clear', (req, res) => {
  fs.writeFileSync(WEBHOOK_LOG_PATH, '[]');
  res.json({ ok: true });
});

// ─── Wallet Management (Sepolia / ERC-20) ───

const SEPOLIA_RPC = process.env.SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';
const KLCC_CONTRACT = '0x0136dE66891c0fb433C157A50f8CC796b0Fd0c66';
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)'
];

// Generate a fresh Ethereum wallet
app.post('/api/wallet/generate', (req, res) => {
  try {
    const wallet = ethers.Wallet.createRandom();
    res.json({
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic.phrase
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Import a wallet from private key (returns address)
app.post('/api/wallet/import', (req, res) => {
  const { privateKey } = req.body;
  if (!privateKey) return res.status(400).json({ error: 'privateKey required' });
  try {
    const wallet = new ethers.Wallet(privateKey);
    res.json({ address: wallet.address });
  } catch(e) {
    res.status(400).json({ error: 'Invalid private key' });
  }
});

// Get balances (ETH + KLCC token) for an address
app.get('/api/wallet/balance', async (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: 'address required' });
  try {
    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
    const ethBalance = await provider.getBalance(address);
    const contract = new ethers.Contract(KLCC_CONTRACT, ERC20_ABI, provider);
    let tokenInfo = {};
    let tokenBalance = 0n;
    try {
      const [name, symbol, decimals, bal] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals(),
        contract.balanceOf(address)
      ]);
      tokenInfo = { name, symbol, decimals: Number(decimals) };
      tokenBalance = bal;
    } catch(e) {
      // Token contract call failed — still return ETH balance
    }
    res.json({
      address,
      ethBalance: ethers.formatEther(ethBalance),
      tokenBalance: tokenInfo.decimals
        ? ethers.formatUnits(tokenBalance, tokenInfo.decimals)
        : ethers.formatEther(tokenBalance),
      token: tokenInfo
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Verify asset contract info (name, symbol, decimals)
app.get('/api/wallet/asset-info', async (req, res) => {
  const { contract: contractAddr } = req.query;
  const addr = contractAddr || KLCC_CONTRACT;
  try {
    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
    const contract = new ethers.Contract(addr, ERC20_ABI, provider);
    const [name, symbol, decimals] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals()
    ]);
    res.json({ contract: addr, name, symbol, decimals: Number(decimals) });
  } catch(e) {
    res.status(500).json({ error: e.message, contract: addr });
  }
});

app.listen(8000, '0.0.0.0', () => {
  console.log('Server running on http://0.0.0.0:8000');
  console.log('  Dashboard:  http://localhost:8000/');
  console.log('  KYB Test:   http://localhost:8000/kyb-test');
  console.log('  Compliance: http://localhost:8000/compliance');
});