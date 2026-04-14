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

// ========== MASTER API KEYS ==========
const MASTER_KEYS = {
    subhxcosmo: 'ITACHI',           // https://api.subhxcosmo.in
    ftosint: 'sahil',               // https://ft-osint-api.onrender.com (ALL WORKING)
    ayaanmods: 'annonymousai',      // https://ayaanmods.site
    truecallerLeak: 'RVN-0nPplC5gSSaeCE98otdrkwKk39c2WsHa'  // say-wallahai-bro
};

// ========== DATABASE SETUP ==========
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'api_keys.db');
console.log('📁 Database path:', DB_PATH);

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
    db.run(`INSERT OR REPLACE INTO users (id, username, password, role) VALUES (1, 'superadmin', ?, 'admin')`, [hashedPassword], (err) => {
        if (err) console.error('Admin create error:', err);
        else console.log('✅ Admin user: superadmin / aura@1234');
    });

    // Insert all working APIs
    db.get(`SELECT COUNT(*) as count FROM available_apis`, [], (err, row) => {
        if (row && row.count === 0) {
            const apis = [
                // subhxcosmo APIs (ITACHI key)
                ['telegram', '📞 Telegram Number Lookup', '/api/telegram', 'type,term', '{"type":"tg","term":"8489944328"}', 'Get Telegram account details from phone number'],
                ['family', '👨‍👩‍👧‍👦 Family Tree', '/api/family', 'term', '{"term":"979607168114"}', 'Family relationship lookup'],
                
                // ft-osint APIs (sahil key) - ALL WORKING
                ['num_india', '🇮🇳 Indian Number Info', '/api/num-india', 'num', '{"num":"9876543210"}', 'Indian mobile number details'],
                ['num_pak', '🇵🇰 Pakistani Number', '/api/num-pak', 'number', '{"number":"03001234567"}', 'Pakistani mobile number info'],
                ['name_details', '👤 Name to Details', '/api/name-details', 'name', '{"name":"abhiraaj"}', 'Get information from name'],
                ['bank_info', '🏦 Bank IFSC Info', '/api/bank', 'ifsc', '{"ifsc":"SBIN0001234"}', 'Bank branch details from IFSC code'],
                ['pan_info', '📄 PAN Card Info', '/api/pan', 'pan', '{"pan":"AXDPR2606K"}', 'PAN card details verification'],
                ['vehicle_info', '🚗 Vehicle Info', '/api/vehicle', 'vehicle', '{"vehicle":"HR26DA1337"}', 'Vehicle registration details'],
                ['rc_info', '📋 RC Details', '/api/rc', 'owner', '{"owner":"HR26EV0001"}', 'Registration certificate info'],
                ['ip_info', '🌐 IP Geolocation', '/api/ip', 'ip', '{"ip":"8.8.8.8"}', 'IP address location and ISP details'],
                ['pincode_info', '📍 Pincode Info', '/api/pincode', 'pin', '{"pin":"110001"}', 'Area details from pincode'],
                ['git_info', '🐙 GitHub User', '/api/git', 'username', '{"username":"octocat"}', 'GitHub profile information'],
                ['bgmi_info', '🎮 BGMI Player', '/api/bgmi', 'uid', '{"uid":"5121439477"}', 'Battlegrounds Mobile India player stats'],
                ['ff_info', '🔫 FreeFire ID', '/api/ff', 'uid', '{"uid":"123456789"}', 'FreeFire player details'],
                ['aadhar_info', '🆔 Aadhar Info', '/api/aadhar', 'num', '{"num":"393933081942"}', 'Aadhar card verification'],
                ['insta_info', '📸 Instagram Info', '/api/insta', 'username', '{"username":"ankit.vaid"}', 'Instagram profile details'],
                
                // aayaanmods API (annonymousai key)
                ['ai_image', '🎨 AI Image Gen', '/api/ai-image', 'prompt', '{"prompt":"cyberpunk cat"}', 'Generate images using AI'],
                
                // truecaller leak API
                ['num_fullinfo', '🔍 Number to Full Info', '/api/num-fullinfo', 'number', '{"number":"919602033122"}', 'Get complete info from phone number (Truecaller leak)']
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

// ========== API PROXY MAP WITH ALL MASTER KEYS ==========
const apiProxyMap = {
    // subhxcosmo APIs (ITACHI key)
    'telegram': (p) => `https://api.subhxcosmo.in/api?key=${MASTER_KEYS.subhxcosmo}&type=${p.type}&term=${p.term}`,
    'family': (p) => `https://ayaanmods.site/family.php?key=${MASTER_KEYS.subhxcosmo}&term=${p.term}`,
    
    // ft-osint APIs (sahil key) - ALL WORKING
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
    'insta': (p) => `https://ft-osint-api.onrender.com/api/insta?key=${MASTER_KEYS.ftosint}&username=${p.username}`,
    
    // aayaanmods API (annonymousai key)
    'ai-image': (p) => `https://ayaanmods.site/aiimage.php?key=${MASTER_KEYS.ayaanmods}&prompt=${p.prompt}`,
    
    // truecaller leak API
    'num-fullinfo': (p) => `https://say-wallahai-bro-say-wallahi.onrender.com/raavan/v34/query=${p.number}/key=${MASTER_KEYS.truecallerLeak}`
};

// ========== PUBLIC ROUTES ==========
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

// ========== LOGIN ROUTE ==========
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    console.log('🔐 Login attempt:', username);
    
    if (!username || !password) {
        return res.redirect('/login?error=missing');
    }
    
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) {
            console.error('DB error:', err);
            return res.status(500).send('Database error');
        }
        
        if (!user) {
            console.log('❌ User not found:', username);
            return res.redirect('/login?error=invalid');
        }
        
        try {
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                req.session.user = { id: user.id, username: user.username, role: user.role };
                req.session.save(() => {
                    console.log('✅ Login successful:', username);
                    res.redirect('/admin/dashboard');
                });
            } else {
                console.log('❌ Wrong password for:', username);
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

// ========== ADMIN ROUTES ==========
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

// ========== API PROXY HANDLER ==========
app.all('/api/:endpoint', limiter, async (req, res) => {
    const userKey = req.query.key || req.body.key;
    const endpoint = req.params.endpoint;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    // Check if user provided their API key
    if (!userKey) {
        return res.json({ error: 'API key required. Get your key from admin', contact: '@BMW_AURA4', channel: 'https://t.me/OSINTERA_1' });
    }
    
    // Verify user's key from database
    db.get('SELECT * FROM api_keys WHERE key = ? AND status = "active"', [userKey], async (err, keyData) => {
        if (err || !keyData) {
            return res.json({ error: 'Invalid or inactive API key', contact: '@BMW_AURA4' });
        }
        
        // Check expiry
        if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
            return res.json({ error: `API key expired on ${new Date(keyData.expires_at).toLocaleDateString()}`, contact: '@BMW_AURA4' });
        }
        
        // Increment hits (if not unlimited)
        if (!keyData.unlimited_hits) {
            db.run('UPDATE api_keys SET hits = hits + 1 WHERE id = ?', [keyData.id]);
        }
        
        // Get proxy function
        const proxyFn = apiProxyMap[endpoint];
        if (!proxyFn) {
            return res.json({ error: 'Unknown endpoint', available: Object.keys(apiProxyMap) });
        }
        
        try {
            // Build target URL with master keys
            const targetUrl = proxyFn({ ...req.query, ...req.body });
            console.log('🌐 Proxying to:', targetUrl.substring(0, 100));
            
            // Make request with browser headers to avoid 403
            const response = await axios.get(targetUrl, { 
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Referer': 'https://www.google.com/',
                    'Origin': 'https://www.google.com',
                    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'cross-site'
                }
            });
            
            // Log analytics
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address) VALUES (?, ?, ?, ?)`,
                [userKey, endpoint, response.status, clientIp]);
            
            // Add owner info to response
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

// ========== START SERVER ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 ========== OSINT API HUB ==========`);
    console.log(`🔥 Server running on http://localhost:${PORT}`);
    console.log(`🔐 Admin Login: superadmin / aura@1234`);
    console.log(`📁 Database: ${DB_PATH}`);
    console.log(`📡 Endpoints: http://localhost:${PORT}/endpoints`);
    console.log(`🔑 Master Keys Loaded:`);
    console.log(`   - subhxcosmo: ${MASTER_KEYS.subhxcosmo}`);
    console.log(`   - ftosint: ${MASTER_KEYS.ftosint}`);
    console.log(`   - ayaanmods: ${MASTER_KEYS.ayaanmods}`);
    console.log(`   - truecallerLeak: ${MASTER_KEYS.truecallerLeak.substring(0, 15)}...`);
    console.log(`=====================================\n`);
});

module.exports = app;
