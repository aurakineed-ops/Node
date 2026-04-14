require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const app = express();

// ========== MASTER API KEYS ==========
const MASTER_KEYS = {
    subhxcosmo: 'ITACHI',
    ftosint: 'sahil',
    ayaanmods: 'annonymousai',
    truecallerLeak: 'RVN-0nPplC5gSSaeCE98otdrkwKk39c2WsHa'
};

// ========== DATABASE SETUP ==========
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'api_keys.db');
const db = new sqlite3.Database(DB_PATH);

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

    // Create admin user (superadmin / aura@1234)
    const hashedPassword = bcrypt.hashSync('aura@1234', 10);
    db.run(`INSERT OR REPLACE INTO users (id, username, password, role) VALUES (1, 'superadmin', ?, 'admin')`, [hashedPassword]);

    // Insert all working APIs
    db.get(`SELECT COUNT(*) as count FROM available_apis`, [], (err, row) => {
        if (row && row.count === 0) {
            const apis = [
                ['telegram', '📞 Telegram Number Lookup', '/api/telegram', 'type,term', '{"type":"tg","term":"8489944328"}', 'Get Telegram account details'],
                ['family', '👨‍👩‍👧‍👦 Family Tree', '/api/family', 'term', '{"term":"979607168114"}', 'Family relationship lookup'],
                ['num_india', '🇮🇳 Indian Number Info', '/api/num-india', 'num', '{"num":"9876543210"}', 'Indian mobile number details'],
                ['num_pak', '🇵🇰 Pakistani Number', '/api/num-pak', 'number', '{"number":"03001234567"}', 'Pakistani mobile number info'],
                ['name_details', '👤 Name to Details', '/api/name-details', 'name', '{"name":"abhiraaj"}', 'Get information from name'],
                ['bank_info', '🏦 Bank IFSC Info', '/api/bank', 'ifsc', '{"ifsc":"SBIN0001234"}', 'Bank branch details'],
                ['pan_info', '📄 PAN Card Info', '/api/pan', 'pan', '{"pan":"AXDPR2606K"}', 'PAN card details'],
                ['vehicle_info', '🚗 Vehicle Info', '/api/vehicle', 'vehicle', '{"vehicle":"HR26DA1337"}', 'Vehicle registration details'],
                ['rc_info', '📋 RC Details', '/api/rc', 'owner', '{"owner":"HR26EV0001"}', 'Registration certificate info'],
                ['ip_info', '🌐 IP Geolocation', '/api/ip', 'ip', '{"ip":"8.8.8.8"}', 'IP address location'],
                ['pincode_info', '📍 Pincode Info', '/api/pincode', 'pin', '{"pin":"110001"}', 'Area details from pincode'],
                ['git_info', '🐙 GitHub User', '/api/git', 'username', '{"username":"octocat"}', 'GitHub profile'],
                ['bgmi_info', '🎮 BGMI Player', '/api/bgmi', 'uid', '{"uid":"5121439477"}', 'BGMI player stats'],
                ['ff_info', '🔫 FreeFire ID', '/api/ff', 'uid', '{"uid":"123456789"}', 'FreeFire player details'],
                ['aadhar_info', '🆔 Aadhar Info', '/api/aadhar', 'num', '{"num":"393933081942"}', 'Aadhar card verification'],
                ['ai_image', '🎨 AI Image Gen', '/api/ai-image', 'prompt', '{"prompt":"cyberpunk cat"}', 'Generate AI images'],
                ['insta_info', '📸 Instagram Info', '/api/insta', 'username', '{"username":"ankit.vaid"}', 'Instagram profile details'],
                ['num_fullinfo', '🔍 Number to Full Info', '/api/num-fullinfo', 'number', '{"number":"919602033122"}', 'Complete phone number info']
            ];
            
            apis.forEach(api => {
                db.run(`INSERT INTO available_apis (name, display_name, endpoint, required_params, example_params, description) VALUES (?, ?, ?, ?, ?, ?)`, api);
            });
            console.log('✅ 18 Working APIs inserted');
        }
    });
});

// ========== MIDDLEWARE ==========
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(cors());

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'osint_secret_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req) => req.query.key || req.ip,
    handler: (req, res) => res.json({ error: 'Rate limit exceeded', contact: '@BMW_AURA4' })
});

// Auth middleware
function requireAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

// ========== API PROXY MAP ==========
const apiProxyMap = {
    'telegram': (p) => `https://api.subhxcosmo.in/api?key=${MASTER_KEYS.subhxcosmo}&type=${p.type}&term=${p.term}`,
    'family': (p) => `https://ayaanmods.site/family.php?key=${MASTER_KEYS.subhxcosmo}&term=${p.term}`,
    'num-india': (p) => `https://ft-osint-api.onrender.com/api/number?key=${MASTER_KEYS.ftosint}&num=${p.num}`,
    'num-pak': (p) => `https://ft-osint-api.onrender.com/api/pk?key=${MASTER_KEYS.ftosint}&number=${p.number}`,
    'name-details': (p) => `https://ft-osint-api.onrender.com/api/name?key=${MASTER_KEYS.ftosint}&name=${p.name}`,
    'bank': (p) => `https://ft-osint-api.onrender.com/api/ifsc?key=${MASTER_KEYS.ftosint}&ifsc=${p.ifsc}`,
    'pan': (p) => `https://ft-osint-api.onrender.com/api/pan?key=${MASTER_KEYS.ftosint}&pan=${p.pan}`,
    'vehicle': (p) => `https://ft-osint-api.onrender.com/api/vehicle?key=${MASTER_KEYS.ftosint}&vehicle=${p.vehicle}`,
    'rc': (p) => `https://ft-osint-api.onrender.com/api/rc?key=${MASTER_KEYS.ftosint}&owner=${p.owner}`,
    'ip': (p) => `https://ft-osint-api.onrender.com/api/ip?key=${MASTER_KEYS.ftosint}&ip=${p.ip}`,
    'pincode': (p) => `https://ft-osint-api.onrender.com/api/pincode?key=${MASTER_KEYS.ftosint}&pin=${p.pin}`,
    'git': (p) => `https://ft-osint-api.onrender.com/api/git?key=${MASTER_KEYS.ftosint}&username=${p.username}`,
    'bgmi': (p) => `https://ft-osint-api.onrender.com/api/bgmi?key=${MASTER_KEYS.ftosint}&uid=${p.uid}`,
    'ff': (p) => `https://ft-osint-api.onrender.com/api/ff?key=${MASTER_KEYS.ftosint}&uid=${p.uid}`,
    'aadhar': (p) => `https://ft-osint-api.onrender.com/api/aadhar?key=${MASTER_KEYS.ftosint}&num=${p.num}`,
    'ai-image': (p) => `https://ayaanmods.site/aiimage.php?key=${MASTER_KEYS.ayaanmods}&prompt=${p.prompt}`,
    'insta': (p) => `https://ft-osint-api.onrender.com/api/insta?key=${MASTER_KEYS.ftosint}&username=${p.username}`,
    'num-fullinfo': (p) => `https://say-wallahai-bro-say-wallahi.onrender.com/raavan/v34/query=${p.number}/key=${MASTER_KEYS.truecallerLeak}`
};

// ========== PUBLIC ROUTES ==========
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user });
});

app.get('/endpoints', (req, res) => {
    db.all('SELECT * FROM available_apis WHERE is_active = 1', [], (err, apis) => {
        db.all('SELECT endpoint_name, is_up FROM api_status', [], (err, status) => {
            const statusMap = {};
            if (status) {
                status.forEach(s => statusMap[s.endpoint_name] = s.is_up);
            }
            res.render('endpoints', { 
                apis: apis || [], 
                baseUrl: req.protocol + '://' + req.get('host'),
                statusMap: statusMap
            });
        });
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

// ========== LOGIN ROUTE ==========
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
app.get('/admin/dashboard', requireAuth, (req, res) => {
    db.all('SELECT * FROM api_keys ORDER BY created_at DESC', [], (err, keys) => {
        db.get('SELECT SUM(hits) as total FROM api_keys', [], (err, hits) => {
            db.get('SELECT COUNT(*) as active FROM api_keys WHERE status="active"', [], (err, active) => {
                db.all(`SELECT endpoint, COUNT(*) as count FROM analytics GROUP BY endpoint ORDER BY count DESC LIMIT 10`, [], (err, popular) => {
                    db.all(`SELECT api_key, COUNT(*) as calls FROM analytics GROUP BY api_key ORDER BY calls DESC LIMIT 5`, [], (err, topUsers) => {
                        res.render('dashboard', { 
                            keys: keys || [], 
                            totalHits: hits?.total || 0,
                            active: active?.active || 0,
                            popular: popular || [],
                            topUsers: topUsers || [],
                            user: req.session.user
                        });
                    });
                });
            });
        });
    });
});

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

app.post('/admin/delete-key', requireAuth, (req, res) => {
    db.run('DELETE FROM api_keys WHERE id = ?', [req.body.id]);
    res.redirect('/admin/dashboard');
});

app.post('/admin/toggle-status', requireAuth, (req, res) => {
    const { id, status } = req.body;
    db.run('UPDATE api_keys SET status = ? WHERE id = ?', [status === 'active' ? 'disabled' : 'active', id]);
    res.redirect('/admin/dashboard');
});

// ========== API PROXY HANDLER ==========
app.all('/api/:endpoint', limiter, async (req, res) => {
    const userKey = req.query.key || req.body.key;
    const endpoint = req.params.endpoint;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    if (!userKey) {
        return res.json({ error: 'API key required', contact: '@BMW_AURA4', channel: 'https://t.me/OSINTERA_1' });
    }
    
    db.get('SELECT * FROM api_keys WHERE key = ? AND status = "active"', [userKey], async (err, keyData) => {
        if (err || !keyData) {
            return res.json({ error: 'Invalid or inactive API key', contact: '@BMW_AURA4' });
        }
        
        if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
            return res.json({ error: `API key expired on ${new Date(keyData.expires_at).toLocaleDateString()}`, contact: '@BMW_AURA4' });
        }
        
        if (!keyData.unlimited_hits) {
            db.run('UPDATE api_keys SET hits = hits + 1 WHERE id = ?', [keyData.id]);
        }
        
        const proxyFn = apiProxyMap[endpoint];
        if (!proxyFn) {
            return res.json({ error: 'Unknown endpoint', available: Object.keys(apiProxyMap) });
        }
        
        try {
            const targetUrl = proxyFn({ ...req.query, ...req.body });
            console.log('🌐 Proxying to:', targetUrl.substring(0, 100));
            
            const response = await axios.get(targetUrl, { 
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Referer': 'https://www.google.com/',
                    'Origin': 'https://www.google.com'
                }
            });
            
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address) VALUES (?, ?, ?, ?)`,
                [userKey, endpoint, response.status, clientIp]);
            
            let result = response.data;
            if (typeof result === 'object') {
                result.owner = keyData.owner_username || '@BMW_AURA4 / @BMW_AURA1';
                result.channel = keyData.owner_channel || 'https://t.me/OSINTERA_1';
                result.api_key_used = userKey;
            }
            res.json(result);
            
        } catch (error) {
            console.error('❌ API Error:', error.message);
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address) VALUES (?, ?, ?, ?)`,
                [userKey, endpoint, error.response?.status || 500, clientIp]);
            
            res.json({ 
                error: 'API request failed', 
                details: error.message,
                status: error.response?.status,
                contact: '@BMW_AURA4',
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

// ========== START SERVER ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 ========== OSINT API HUB ==========`);
    console.log(`🔥 Server running on http://localhost:${PORT}`);
    console.log(`🔐 Admin Login: superadmin / aura@1234`);
    console.log(`📁 Database: ${DB_PATH}`);
    console.log(`📡 Endpoints: http://localhost:${PORT}/endpoints`);
    console.log(`=====================================\n`);
});

module.exports = app;
