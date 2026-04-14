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

// ========== DATABASE PATH FROM ENVIRONMENT VARIABLE ==========
// Render pe DB_PATH set kar: /var/data/api_keys.db (agar disk hai)
// Ya ./api_keys.db (agar disk nahi hai)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'api_keys.db');
console.log('📁 Database path:', DB_PATH);

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log('✅ SQLite database connected:', DB_PATH);
    initDatabase();
  }
});

// ========== REMAINING CODE SAME AS BEFORE ==========
// ... (baaki ka code waisa hi rahega)

function initDatabase() {
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

    // API status tracking
    db.run(`CREATE TABLE IF NOT EXISTS api_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint_name TEXT,
      is_up BOOLEAN DEFAULT 1,
      last_checked DATETIME DEFAULT CURRENT_TIMESTAMP,
      response_ms INTEGER
    )`);

    // Available APIs
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

    // Insert default admin
    const hashedPassword = bcrypt.hashSync('aura@1234', 10);
    db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`, 
      ['superadmin', hashedPassword, 'admin']);

    // Insert APIs (same as before)
    const apis = [
      ['telegram', '📞 Telegram Number Lookup', '/api/telegram', 'key,type,term', '{"type":"tg","term":"8489944328"}', 'Get Telegram account details'],
      ['family', '👨‍👩‍👧‍👦 Family Tree', '/api/family', 'key,term', '{"term":"979607168114"}', 'Family relationship lookup'],
      ['num_india', '🇮🇳 Indian Number Info', '/api/num-india', 'key,num', '{"num":"9876543210"}', 'Indian mobile number details'],
      ['num_pak', '🇵🇰 Pakistani Number', '/api/num-pak', 'key,number', '{"number":"03001234567"}', 'Pakistani mobile number info'],
      ['name_details', '👤 Name to Details', '/api/name-details', 'key,name', '{"name":"abhiraaj"}', 'Get information from name'],
      ['bank_info', '🏦 Bank IFSC Info', '/api/bank', 'key,ifsc', '{"ifsc":"SBIN0001234"}', 'Bank branch details'],
      ['pan_info', '📄 PAN Card Info', '/api/pan', 'key,pan', '{"pan":"AXDPR2606K"}', 'PAN card details'],
      ['vehicle_info', '🚗 Vehicle Info', '/api/vehicle', 'key,vehicle', '{"vehicle":"HR26DA1337"}', 'Vehicle registration details'],
      ['rc_info', '📋 RC Details', '/api/rc', 'key,owner', '{"owner":"HR26EV0001"}', 'Registration certificate info'],
      ['ip_info', '🌐 IP Geolocation', '/api/ip', 'key,ip', '{"ip":"8.8.8.8"}', 'IP address location'],
      ['pincode_info', '📍 Pincode Info', '/api/pincode', 'key,pin', '{"pin":"110001"}', 'Area details from pincode'],
      ['git_info', '🐙 GitHub User', '/api/git', 'key,username', '{"username":"octocat"}', 'GitHub profile'],
      ['bgmi_info', '🎮 BGMI Player', '/api/bgmi', 'key,uid', '{"uid":"5121439477"}', 'BGMI player stats'],
      ['ff_info', '🔫 FreeFire ID', '/api/ff', 'key,uid', '{"uid":"123456789"}', 'FreeFire player details'],
      ['aadhar_info', '🆔 Aadhar Info', '/api/aadhar', 'key,num', '{"num":"393933081942"}', 'Aadhar verification'],
      ['ai_image', '🎨 AI Image Gen', '/api/ai-image', 'key,prompt', '{"prompt":"cyberpunk cat"}', 'Generate images'],
      ['insta_info', '📸 Instagram Info', '/api/insta', 'key,username', '{"username":"ankit.vaid"}', 'Instagram profile']
    ];
    
    apis.forEach(api => {
      db.run(`INSERT OR IGNORE INTO available_apis (name, display_name, endpoint, required_params, example_params, description) VALUES (?, ?, ?, ?, ?, ?)`, api);
    });
    
    console.log('✅ Database initialized with all tables');
  });
}

// ========== MIDDLEWARE ==========
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(cors());
app.set('trust proxy', 1);

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'osint_hub_secret_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.query.key || req.body.key || req.ip,
  handler: (req, res) => res.json({ error: 'Rate limit exceeded', contact: '@BMW_AURA4' })
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
    res.render('endpoints', { apis: apis || [], baseUrl: req.protocol + '://' + req.get('host') });
  });
});

app.get('/docs', async (req, res) => {
  db.all('SELECT * FROM available_apis WHERE is_active = 1', [], (err, apis) => {
    res.render('docs', { apis: apis || [], baseUrl: req.protocol + '://' + req.get('host') });
  });
});

// ========== AUTH ROUTES ==========
app.get('/login', (req, res) => {
  res.render('login', { error: req.query.error });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.redirect('/login?error=missing');
  }
  
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err || !user) {
      return res.redirect('/login?error=invalid');
    }
    
    try {
      const match = await bcrypt.compare(password, user.password);
      if (match) {
        req.session.user = { id: user.id, username: user.username, role: user.role };
        res.redirect('/admin/dashboard');
      } else {
        res.redirect('/login?error=invalid');
      }
    } catch (bcryptError) {
      res.status(500).send('Login error');
    }
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ========== ADMIN ROUTES ==========
app.get('/admin/dashboard', requireAuth, async (req, res) => {
  db.all('SELECT * FROM api_keys ORDER BY created_at DESC', [], (err, keys) => {
    db.get('SELECT SUM(hits) as total_hits FROM api_keys', [], (err, hits) => {
      db.get('SELECT COUNT(*) as active_keys FROM api_keys WHERE status="active"', [], (err, active) => {
        res.render('dashboard', { 
          keys: keys || [], 
          totalHits: hits?.total_hits || 0,
          active: active?.active_keys || 0,
          user: req.session.user
        });
      });
    });
  });
});

app.post('/admin/generate-key', requireAuth, async (req, res) => {
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

app.post('/admin/delete-key', requireAuth, (req, res) => {
  db.run('DELETE FROM api_keys WHERE id = ?', [req.body.id]);
  res.redirect('/admin/dashboard');
});

// ========== API PROXY ==========
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

// ========== START SERVER ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 API Hub running on http://localhost:${PORT}`);
  console.log(`📁 Database: ${DB_PATH}`);
  console.log(`🔐 Admin: superadmin / aura@1234`);
});
