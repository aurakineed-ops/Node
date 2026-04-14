require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const cron = require('node-cron');
const db = require('./database');
const app = express();

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(cors());
app.use(session({ secret: 'osint_hub_secret_2024', resave: false, saveUninitialized: true }));

// Rate limiting per key
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.query.key || req.body.key || req.ip,
  handler: (req, res) => res.json({ error: 'Rate limit exceeded. Try after 1 minute', contact: '@BMW_AURA4' })
});

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// ========== PUBLIC ROUTES ==========
app.get('/', (req, res) => {
  res.render('index', { user: req.session.user });
});

app.get('/endpoints', async (req, res) => {
  db.all('SELECT * FROM available_apis WHERE is_active = 1', [], (err, apis) => {
    db.all('SELECT endpoint_name, is_up FROM api_status', [], (err, status) => {
      const statusMap = {};
      status.forEach(s => statusMap[s.endpoint_name] = s.is_up);
      res.render('endpoints', { 
        apis: apis, 
        baseUrl: req.protocol + '://' + req.get('host'),
        statusMap: statusMap
      });
    });
  });
});

app.get('/docs', async (req, res) => {
  db.all('SELECT * FROM available_apis WHERE is_active = 1', [], (err, apis) => {
    res.render('docs', { apis: apis, baseUrl: req.protocol + '://' + req.get('host') });
  });
});

// ========== AUTH ROUTES ==========
app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (user && await bcrypt.compare(password, user.password)) {
      req.session.user = user;
      res.redirect('/admin/dashboard');
    } else res.redirect('/login?error=1');
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ========== ADMIN ROUTES ==========
app.get('/admin/dashboard', requireAuth, async (req, res) => {
  db.all('SELECT * FROM api_keys ORDER BY created_at DESC', [], (err, keys) => {
    db.get('SELECT COUNT(*) as total FROM analytics', [], (err, total) => {
      db.get('SELECT COUNT(*) as active_keys FROM api_keys WHERE status="active"', [], (err, active) => {
        db.get('SELECT SUM(hits) as total_hits FROM api_keys', [], (err, hits) => {
          db.all(`SELECT endpoint, COUNT(*) as count FROM analytics GROUP BY endpoint ORDER BY count DESC LIMIT 10`, [], (err, popular) => {
            db.all(`SELECT api_key, COUNT(*) as calls FROM analytics GROUP BY api_key ORDER BY calls DESC LIMIT 5`, [], (err, topUsers) => {
              res.render('dashboard', { 
                keys, 
                total: total?.total || 0, 
                active: active?.active_keys || 0,
                totalHits: hits?.total_hits || 0,
                popular: popular || [],
                topUsers: topUsers || []
              });
            });
          });
        });
      });
    });
  });
});

app.post('/admin/generate-key', requireAuth, async (req, res) => {
  const { name, owner_username, owner_channel, expiry, unlimited, allowed_apis } = req.body;
  const apiKey = 'OSINT_' + Math.random().toString(36).substring(2, 18).toUpperCase();
  let expires_at = null;
  
  if (expiry === '7d') expires_at = new Date(Date.now() + 7*24*60*60*1000);
  else if (expiry === '15d') expires_at = new Date(Date.now() + 15*24*60*60*1000);
  else if (expiry === '1m') expires_at = new Date(Date.now() + 30*24*60*60*1000);
  else if (expiry === '1y') expires_at = new Date(Date.now() + 365*24*60*60*1000);
  
  const allowed = allowed_apis === 'all' ? JSON.stringify(['all']) : JSON.stringify(allowed_apis || []);
  
  db.run(`INSERT INTO api_keys (key, name, owner_username, owner_channel, expires_at, unlimited_hits, allowed_apis, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`, 
          [apiKey, name, owner_username || '@BMW_AURA4', owner_channel || 'https://t.me/OSINTERA_1', expires_at, unlimited === 'true' ? 1 : 0, allowed]);
  res.redirect('/admin/dashboard');
});

app.post('/admin/delete-key', requireAuth, (req, res) => {
  db.run('DELETE FROM api_keys WHERE id = ?', [req.body.id]);
  res.redirect('/admin/dashboard');
});

app.post('/admin/toggle-status', requireAuth, (req, res) => {
  const { id, status } = req.body;
  db.run('UPDATE api_keys SET status = ? WHERE id = ?', [status === 'active' ? 'disabled' : 'active', id]);
  res.redirect('/admin/dashboard');
});

// ========== API PROXY ENDPOINTS ==========
const apiProxyMap = {
  'telegram': (params) => `https://api.subhxcosmo.in/api?key=${params.key}&type=${params.type}&term=${params.term}`,
  'family': (params) => `https://ayaanmods.site/family.php?key=${params.key}&term=${params.term}`,
  'num-india': (params) => `https://ft-osint-api.onrender.com/api/number?key=${params.key}&num=${params.num}`,
  'num-pak': (params) => `https://ft-osint-api.onrender.com/api/pk?key=${params.key}&number=${params.number}`,
  'name-details': (params) => `https://ft-osint-api.onrender.com/api/name?key=${params.key}&name=${params.name}`,
  'bank': (params) => `https://ft-osint-api.onrender.com/api/ifsc?key=${params.key}&ifsc=${params.ifsc}`,
  'pan': (params) => `https://ft-osint-api.onrender.com/api/pan?key=${params.key}&pan=${params.pan}`,
  'vehicle': (params) => `https://ft-osint-api.onrender.com/api/vehicle?key=${params.key}&vehicle=${params.vehicle}`,
  'rc': (params) => `https://ft-osint-api.onrender.com/api/rc?key=${params.key}&owner=${params.owner}`,
  'ip': (params) => `https://ft-osint-api.onrender.com/api/ip?key=${params.key}&ip=${params.ip}`,
  'pincode': (params) => `https://ft-osint-api.onrender.com/api/pincode?key=${params.key}&pin=${params.pin}`,
  'git': (params) => `https://ft-osint-api.onrender.com/api/git?key=${params.key}&username=${params.username}`,
  'bgmi': (params) => `https://ft-osint-api.onrender.com/api/bgmi?key=${params.key}&uid=${params.uid}`,
  'ff': (params) => `https://ft-osint-api.onrender.com/api/ff?key=${params.key}&uid=${params.uid}`,
  'aadhar': (params) => `https://ft-osint-api.onrender.com/api/aadhar?key=${params.key}&num=${params.num}`,
  'ai-image': (params) => `https://ayaanmods.site/aiimage.php?key=${params.key}&prompt=${params.prompt}`,
  'insta': (params) => `https://ft-osint-api.onrender.com/api/insta?key=${params.key}&username=${params.username}`
};

app.all('/api/:endpoint', limiter, async (req, res) => {
  const userKey = req.query.key || req.body.key;
  const endpoint = req.params.endpoint;
  const clientIp = req.ip || req.connection.remoteAddress;
  
  if (!userKey) {
    return res.json({ error: 'API key required', contact: '@BMW_AURA4 or @BMW_AURA1', channel: 'https://t.me/OSINTERA_1' });
  }
  
  db.get('SELECT * FROM api_keys WHERE key = ?', [userKey], async (err, keyData) => {
    if (!keyData) {
      return res.json({ error: 'Invalid API key', contact: '@BMW_AURA4 or @BMW_AURA1' });
    }
    
    if (keyData.status !== 'active') {
      return res.json({ error: 'API key is disabled', contact: '@BMW_AURA4' });
    }
    
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return res.json({ error: 'API key expired on ' + new Date(keyData.expires_at).toLocaleDateString(), contact: '@BMW_AURA4 or @BMW_AURA1' });
    }
    
    const allowed = JSON.parse(keyData.allowed_apis || '[]');
    if (!allowed.includes('all') && allowed.length > 0 && !allowed.includes(endpoint)) {
      return res.json({ error: 'This API endpoint is not allowed for your key', allowed_apis: allowed });
    }
    
    if (!keyData.unlimited_hits) {
      db.run('UPDATE api_keys SET hits = hits + 1 WHERE id = ?', [keyData.id]);
    }
    
    const proxyFn = apiProxyMap[endpoint];
    if (!proxyFn) {
      return res.json({ error: 'Unknown endpoint', available_endpoints: Object.keys(apiProxyMap) });
    }
    
    try {
      const start = Date.now();
      const targetUrl = proxyFn({ ...req.query, ...req.body, key: userKey });
      const response = await axios.get(targetUrl, { timeout: 30000 });
      const responseTime = Date.now() - start;
      
      db.run(`INSERT INTO analytics (api_key, endpoint, response_time, status_code, ip_address) VALUES (?, ?, ?, ?, ?)`,
        [userKey, endpoint, responseTime, response.status, clientIp]);
      
      let result = response.data;
      if (typeof result === 'object') {
        result.owner = keyData.owner_username || '@BMW_AURA4 / @BMW_AURA1';
        result.channel = keyData.owner_channel || 'https://t.me/OSINTERA_1';
        result.api_key_used = userKey;
        if (!keyData.unlimited_hits) {
          db.get('SELECT hits FROM api_keys WHERE key = ?', [userKey], (err, newHits) => {
            result.remaining_hits = keyData.expires_at ? 'Unlimited' : 'N/A';
          });
        }
      }
      
      res.json(result);
    } catch (error) {
      db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address) VALUES (?, ?, ?, ?)`,
        [userKey, endpoint, 500, clientIp]);
      res.json({ 
        error: 'API request failed', 
        details: error.message,
        contact: '@BMW_AURA4 or @BMW_AURA1',
        channel: 'https://t.me/OSINTERA_1'
      });
    }
  });
});

// ========== CRON JOBS ==========
cron.schedule('0 0 * * *', () => {
  console.log('🔄 Running daily expiry check...');
  db.run('UPDATE api_keys SET status = "expired" WHERE expires_at < datetime("now") AND status = "active"');
});

cron.schedule('*/30 * * * *', async () => {
  console.log('📊 Checking API health...');
  for (const [name, fn] of Object.entries(apiProxyMap)) {
    try {
      const start = Date.now();
      await axios.get(fn({ key: 'health_check', type: 'tg', term: 'test' }), { timeout: 5000 });
      const ms = Date.now() - start;
      db.run('INSERT OR REPLACE INTO api_status (endpoint_name, is_up, last_checked, response_ms) VALUES (?, 1, datetime("now"), ?)', [name, ms]);
    } catch(e) {
      db.run('INSERT OR REPLACE INTO api_status (endpoint_name, is_up, last_checked, response_ms) VALUES (?, 0, datetime("now"), 0)', [name]);
    }
  }
});

app.listen(3000, () => console.log('🔥 API Hub running on http://localhost:3000'));