require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const app = express();

// Database path
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'api_keys.db');
console.log('📁 Database path:', DB_PATH);

const db = new sqlite3.Database(DB_PATH);

// ========== INIT DATABASE WITH ADMIN USER ==========
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT
  )`);

  // API keys table
  db.run(`CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE,
    name TEXT,
    owner_username TEXT,
    owner_channel TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    hits INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    unlimited_hits BOOLEAN DEFAULT 0,
    allowed_apis TEXT
  )`);

  // Analytics table
  db.run(`CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key TEXT,
    endpoint TEXT,
    request_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    response_time INTEGER,
    status_code INTEGER,
    ip_address TEXT
  )`);

  // Available APIs table
  db.run(`CREATE TABLE IF NOT EXISTS available_apis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    display_name TEXT,
    endpoint TEXT,
    required_params TEXT,
    example_params TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT 1
  )`);

  // ========== CREATE ADMIN USER (IMPORTANT!) ==========
  const hashedPassword = bcrypt.hashSync('aura@1234', 10);
  db.run(`INSERT OR REPLACE INTO users (id, username, password, role) VALUES (1, 'superadmin', ?, 'admin')`, [hashedPassword], (err) => {
    if (err) console.error('Admin create error:', err);
    else console.log('✅ Admin user: superadmin / aura@1234');
  });

  // Insert APIs
  db.get(`SELECT COUNT(*) as count FROM available_apis`, [], (err, row) => {
    if (row && row.count === 0) {
      const apis = [
        ['telegram', '📞 Telegram Number', '/api/telegram', 'key,type,term', '{"type":"tg","term":"8489944328"}'],
        ['family', '👨‍👩‍👧‍👦 Family Tree', '/api/family', 'key,term', '{"term":"979607168114"}'],
        ['num_india', '🇮🇳 Indian Number', '/api/num-india', 'key,num', '{"num":"9876543210"}'],
        ['num_pak', '🇵🇰 Pakistani Number', '/api/num-pak', 'key,number', '{"number":"03001234567"}'],
        ['name_details', '👤 Name Details', '/api/name-details', 'key,name', '{"name":"abhiraaj"}'],
        ['bank_info', '🏦 Bank IFSC', '/api/bank', 'key,ifsc', '{"ifsc":"SBIN0001234"}'],
        ['pan_info', '📄 PAN Card', '/api/pan', 'key,pan', '{"pan":"AXDPR2606K"}'],
        ['vehicle_info', '🚗 Vehicle', '/api/vehicle', 'key,vehicle', '{"vehicle":"HR26DA1337"}'],
        ['rc_info', '📋 RC Details', '/api/rc', 'key,owner', '{"owner":"HR26EV0001"}'],
        ['ip_info', '🌐 IP Info', '/api/ip', 'key,ip', '{"ip":"8.8.8.8"}'],
        ['pincode_info', '📍 Pincode', '/api/pincode', 'key,pin', '{"pin":"110001"}'],
        ['git_info', '🐙 GitHub', '/api/git', 'key,username', '{"username":"octocat"}'],
        ['bgmi_info', '🎮 BGMI', '/api/bgmi', 'key,uid', '{"uid":"5121439477"}'],
        ['ff_info', '🔫 FreeFire', '/api/ff', 'key,uid', '{"uid":"123456789"}'],
        ['aadhar_info', '🆔 Aadhar', '/api/aadhar', 'key,num', '{"num":"393933081942"}'],
        ['ai_image', '🎨 AI Image', '/api/ai-image', 'key,prompt', '{"prompt":"cyberpunk cat"}'],
        ['insta_info', '📸 Instagram', '/api/insta', 'key,username', '{"username":"ankit.vaid"}']
      ];
      
      apis.forEach(api => {
        db.run(`INSERT INTO available_apis (name, display_name, endpoint, required_params, example_params) VALUES (?, ?, ?, ?, ?)`, api);
      });
      console.log('✅ APIs inserted');
    }
  });
});

console.log('✅ Database initialized');

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

// Session
app.use(session({
  secret: 'osint_secret_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// ========== ROUTES ==========
app.get('/', (req, res) => {
  res.render('index', { user: req.session.user });
});

app.get('/endpoints', (req, res) => {
  db.all('SELECT * FROM available_apis WHERE is_active = 1', [], (err, apis) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }
    res.render('endpoints', { apis: apis || [], baseUrl: req.protocol + '://' + req.get('host') });
  });
});

app.get('/docs', (req, res) => {
  db.all('SELECT * FROM available_apis WHERE is_active = 1', [], (err, apis) => {
    res.render('docs', { apis: apis || [], baseUrl: req.protocol + '://' + req.get('host') });
  });
});

app.get('/login', (req, res) => {
  res.render('login', { error: req.query.error });
});

// LOGIN ROUTE - FIXED
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  console.log('Login attempt:', username);
  
  if (!username || !password) {
    return res.redirect('/login?error=missing');
  }
  
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) {
      console.error('DB error:', err);
      return res.status(500).send('Database error');
    }
    
    if (!user) {
      console.log('User not found:', username);
      return res.redirect('/login?error=invalid');
    }
    
    try {
      const match = await bcrypt.compare(password, user.password);
      console.log('Password match:', match);
      
      if (match) {
        req.session.user = { id: user.id, username: user.username, role: user.role };
        req.session.save(() => {
          console.log('Login successful:', username);
          res.redirect('/admin/dashboard');
        });
      } else {
        console.log('Wrong password for:', username);
        res.redirect('/login?error=invalid');
      }
    } catch (bcryptError) {
      console.error('Bcrypt error:', bcryptError);
      res.status(500).send('Login error');
    }
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ADMIN DASHBOARD
app.get('/admin/dashboard', requireAuth, (req, res) => {
  db.all('SELECT * FROM api_keys ORDER BY created_at DESC', [], (err, keys) => {
    db.get('SELECT SUM(hits) as total FROM api_keys', [], (err, hits) => {
      db.get('SELECT COUNT(*) as active FROM api_keys WHERE status="active"', [], (err, active) => {
        res.render('dashboard', { 
          keys: keys || [], 
          totalHits: hits?.total || 0,
          active: active?.active || 0,
          user: req.session.user
        });
      });
    });
  });
});

// Generate API Key
app.post('/admin/generate-key', requireAuth, (req, res) => {
  const { name, owner_username, owner_channel, expiry, unlimited } = req.body;
  const apiKey = 'OSINT_' + Math.random().toString(36).substring(2, 18).toUpperCase();
  let expires_at = null;
  
  if (expiry === '7d') expires_at = new Date(Date.now() + 7*24*60*60*1000);
  else if (expiry === '15d') expires_at = new Date(Date.now() + 15*24*60*60*1000);
  else if (expiry === '1m') expires_at = new Date(Date.now() + 30*24*60*60*1000);
  else if (expiry === '1y') expires_at = new Date(Date.now() + 365*24*60*60*1000);
  
  db.run(`INSERT INTO api_keys (key, name, owner_username, owner_channel, expires_at, unlimited_hits, status)
          VALUES (?, ?, ?, ?, ?, ?, 'active')`, 
          [apiKey, name, owner_username || '@BMW_AURA4', owner_channel || 'https://t.me/OSINTERA_1', expires_at, unlimited === 'true' ? 1 : 0]);
  res.redirect('/admin/dashboard');
});

// Delete API Key
app.post('/admin/delete-key', requireAuth, (req, res) => {
  db.run('DELETE FROM api_keys WHERE id = ?', [req.body.id]);
  res.redirect('/admin/dashboard');
});

// API Proxy
const apiProxyMap = {
  'telegram': (p) => `https://api.subhxcosmo.in/api?key=${p.key}&type=${p.type}&term=${p.term}`,
  'family': (p) => `https://ayaanmods.site/family.php?key=${p.key}&term=${p.term}`,
  'num-india': (p) => `https://ft-osint-api.onrender.com/api/number?key=${p.key}&num=${p.num}`,
  'num-pak': (p) => `https://ft-osint-api.onrender.com/api/pk?key=${p.key}&number=${p.number}`,
  'name-details': (p) => `https://ft-osint-api.onrender.com/api/name?key=${p.key}&name=${p.name}`,
  'bank': (p) => `https://ft-osint-api.onrender.com/api/ifsc?key=${p.key}&ifsc=${p.ifsc}`,
  'pan': (p) => `https://ft-osint-api.onrender.com/api/pan?key=${p.key}&pan=${p.pan}`,
  'vehicle': (p) => `https://ft-osint-api.onrender.com/api/vehicle?key=${p.key}&vehicle=${p.vehicle}`,
  'rc': (p) => `https://ft-osint-api.onrender.com/api/rc?key=${p.key}&owner=${p.owner}`,
  'ip': (p) => `https://ft-osint-api.onrender.com/api/ip?key=${p.key}&ip=${p.ip}`,
  'pincode': (p) => `https://ft-osint-api.onrender.com/api/pincode?key=${p.key}&pin=${p.pin}`,
  'git': (p) => `https://ft-osint-api.onrender.com/api/git?key=${p.key}&username=${p.username}`,
  'bgmi': (p) => `https://ft-osint-api.onrender.com/api/bgmi?key=${p.key}&uid=${p.uid}`,
  'ff': (p) => `https://ft-osint-api.onrender.com/api/ff?key=${p.key}&uid=${p.uid}`,
  'aadhar': (p) => `https://ft-osint-api.onrender.com/api/aadhar?key=${p.key}&num=${p.num}`,
  'ai-image': (p) => `https://ayaanmods.site/aiimage.php?key=${p.key}&prompt=${p.prompt}`,
  'insta': (p) => `https://ft-osint-api.onrender.com/api/insta?key=${p.key}&username=${p.username}`
};

app.all('/api/:endpoint', async (req, res) => {
  const userKey = req.query.key || req.body.key;
  const endpoint = req.params.endpoint;
  
  if (!userKey) {
    return res.json({ error: 'API key required', contact: '@BMW_AURA4' });
  }
  
  db.get('SELECT * FROM api_keys WHERE key = ? AND status = "active"', [userKey], async (err, keyData) => {
    if (err || !keyData) {
      return res.json({ error: 'Invalid API key', contact: '@BMW_AURA4' });
    }
    
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return res.json({ error: 'API key expired', contact: '@BMW_AURA4' });
    }
    
    if (!keyData.unlimited_hits) {
      db.run('UPDATE api_keys SET hits = hits + 1 WHERE id = ?', [keyData.id]);
    }
    
    const proxyFn = apiProxyMap[endpoint];
    if (!proxyFn) {
      return res.json({ error: 'Unknown endpoint' });
    }
    
    try {
      const response = await axios.get(proxyFn({ ...req.query, ...req.body, key: userKey }), { timeout: 30000 });
      let result = response.data;
      if (typeof result === 'object') {
        result.owner = keyData.owner_username || '@BMW_AURA4 / @BMW_AURA1';
        result.channel = keyData.owner_channel || 'https://t.me/OSINTERA_1';
      }
      res.json(result);
    } catch (error) {
      res.json({ error: 'API request failed', details: error.message, contact: '@BMW_AURA4' });
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Server running on port ${PORT}`);
  console.log(`🔐 Login: superadmin / aura@1234`);
  console.log(`📁 DB Path: ${DB_PATH}`);
});
