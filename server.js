'sahil''('dotenv').config();
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
    subhxco:'RACKSUN',
    ftosint:'sahil',
    ayaanmods: 'annonymousai',
    truecallerLeak: 'RATELIMITE-BEIBBkim7bjTAkJIZTIUGPR4FkfNAYoj',
    mistral: 'FVKec5Xqa2ORzSoBrqi21nRbIM6rFk2q',
    rogers: 'Rogers2'
};

// ========== DATABASE SETUP ==========
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'api_keys.db');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
    // Users table (updated for head admin)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
        allowed_apis TEXT DEFAULT '[]',
        is_custom BOOLEAN DEFAULT 0
    )`);

    // Analytics table (enhanced for call tracking)
    db.run(`CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key TEXT,
        endpoint TEXT,
        request_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        response_time INTEGER,
        status_code INTEGER,
        ip_address TEXT,
        response_data TEXT,
        date DATE DEFAULT CURRENT_DATE
    )`);

    // Daily calls tracking
    db.run(`CREATE TABLE IF NOT EXISTS daily_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key TEXT,
        date DATE,
        calls INTEGER DEFAULT 0,
        UNIQUE(api_key, date)
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

    // Create HEAD ADMIN (hidden, only accessible via direct DB or special login)
    const headAdminPassword = bcrypt.hashSync('sahil', 10);
    db.run(`INSERT OR REPLACE INTO users (id, username, password, role, created_by) 
            VALUES (1, 'main', ?, 'head_admin', 'system')`, [headAdminPassword]);

    // Create default super admin
    const superAdminPassword = bcrypt.hashSync('aura@1234', 10);
    db.run(`INSERT OR IGNORE INTO users (id, username, password, role, created_by) 
            VALUES (2, 'superadmin', ?, 'admin', 'main')`, [superAdminPassword]);

    // Insert all working APIs
    db.get(`SELECT COUNT(*) as count FROM available_apis`, [], (err, row) => {
        if (row && row.count === 0) {
            const apis = [
                ['telegram', '📞 Telegram Number Lookup', '/api/telegram', 'id', '{"id":"8489944328"}', 'Get Telegram account details'],
                ['email_info', '📧 Email to Info', '/api/email', 'email', '{"email":"test@gmail.com"}', 'Email information'],
                ['family', '👨‍👩‍👧‍👦 Family Tree', '/api/family', 'term', '{"term":"979607168114"}', 'Family relationship lookup'],
                ['num_india', '🇮🇳 Indian Number Info', '/api/num-india', 'num', '{"num":"9876543210"}', 'Indian mobile number details'],
                ['num_pak', '🇵🇰 Pakistani Number', '/api/num-pak', 'number', '{"number":"03001234567"}', 'Pakistani mobile number'],
                ['name_details', '👤 Name to Details', '/api/name-details', 'name', '{"name":"abhiraaj"}', 'Name information'],
                ['bank_info', '🏦 Bank IFSC Info', '/api/bank', 'ifsc', '{"ifsc":"SBIN0001234"}', 'Bank branch details'],
                ['pan_info', '📄 PAN Card Info', '/api/pan', 'pan', '{"pan":"AXDPR2606K"}', 'PAN card details'],
                ['vehicle_info', '🚗 Vehicle Info', '/api/vehicle', 'vehicle', '{"vehicle":"HR26DA1337"}', 'Vehicle registration'],
                ['rc_info', '📋 RC Details', '/api/rc', 'owner', '{"owner":"HR26EV0001"}', 'Registration certificate'],
                ['ip_info', '🌐 IP Geolocation', '/api/ip', 'ip', '{"ip":"8.8.8.8"}', 'IP address location'],
                ['pincode_info', '📍 Pincode Info', '/api/pincode', 'pin', '{"pin":"110001"}', 'Area details'],
                ['git_info', '🐙 GitHub User', '/api/git', 'username', '{"username":"octocat"}', 'GitHub profile'],
                ['bgmi_info', '🎮 BGMI Player', '/api/bgmi', 'uid', '{"uid":"5121439477"}', 'BGMI player stats'],
                ['ff_info', '🔫 FreeFire ID', '/api/ff', 'uid', '{"uid":"123456789"}', 'FreeFire player'],
                ['aadhar_info', '🆔 Aadhar Info', '/api/aadhar', 'num', '{"num":"393933081942"}', 'Aadhar verification'],
                ['ai_image', '🎨 AI Image Gen', '/api/ai-image', 'prompt', '{"prompt":"cyberpunk cat"}', 'Generate AI images'],
                ['insta_info', '📸 Instagram Info', '/api/insta', 'username', '{"username":"ankit.vaid"}', 'Instagram profile'],
                ['num_fullinfo', '🔍 Number to Full Info', '/api/num-fullinfo', 'number', '{"number":"918887882236"}', 'Complete phone info'],
                ['mistral', '🤖 Mistral AI Chat', '/api/mistral', 'message', '{"message":"What is AI?"}', 'Chat with Mistral AI'],
                ['num_newinfo', '📱 Number to New Info', '/api/num-newinfo', 'id', '{"id":"8489944328"}', 'Telegram based number info'],
                ['veh_to_num', '🚗 Vehicle to Number', '/api/veh-to-num', 'term', '{"term":"UP50P5434"}', 'Vehicle to mobile number']
            ];
            
            apis.forEach(api => {
                db.run(`INSERT INTO available_apis (name, display_name, endpoint, required_params, example_params, description) VALUES (?, ?, ?, ?, ?, ?)`, api);
            });
            console.log('✅ 22 APIs inserted');
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
    handler: (req, res) => res.json({ error: 'Rate limit exceeded', contact: '@BMW_AURA5' })
});

// Auth middleware
function requireAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

// Head Admin only middleware
function requireHeadAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'head_admin') {
        return res.status(403).json({ error: 'Access denied. Head admin only.' });
    }
    next();
}

// ========== API PROXY MAP ==========
const apiProxyMap = {
    'telegram': (p) => `https://cyber-osint-tg-num.vercel.app/api/tginfo?key=${MASTER_KEYS.rogers}&id=${p.id || p.term || p.number}`,
    'email_info': (p) => `https://leak-api-xtradeep.ramaxinfo.workers.dev/?email=${p.email}`,
    'family': (p) => `https://ayaanmods.site/family.php?key=${MASTER_KEYS.subhxco}&term=${p.term}`,
    'num-india': (p) => `https://ft-osint-api.duckdns.org/api/number?key=${MASTER_KEYS.ftosint}&num=${p.num}`,
    'num-pak': (p) => `https://ft-osint-api.duckdns.org/api/pk?key=${MASTER_KEYS.ftosint}&number=${p.number}`,
    'name-details': (p) => `https://ft-osint-api.duckdns.org/api/name?key=${MASTER_KEYS.ftosint}&name=${p.name}`,
    'bank': (p) => `https://ft-osint-api.duckdns.org/api/ifsc?key=${MASTER_KEYS.ftosint}&ifsc=${p.ifsc}`,
    'pan': (p) => `https://ft-osint-api.duckdns.org/api/pan?key=${MASTER_KEYS.ftosint}&pan=${p.pan}`,
    'vehicle': (p) => `https://ft-osint-api.duckdns.org/api/vehicle?key=${MASTER_KEYS.ftosint}&vehicle=${p.vehicle}`,
    'rc': (p) => `https://ft-osint-api.duckdns.org/api/rc?key=${MASTER_KEYS.ftosint}&owner=${p.owner}`,
    'ip': (p) => `https://ft-osint-api.duckdns.org/api/ip?key=${MASTER_KEYS.ftosint}&ip=${p.ip}`,
    'pincode': (p) => `https://ft-osint-api.duckdns.org/api/pincode?key=${MASTER_KEYS.ftosint}&pin=${p.pin}`,
    'git': (p) => `https://ft-osint-api.duckdns.org/api/git?key=${MASTER_KEYS.ftosint}&username=${p.username}`,
    'bgmi': (p) => `https://ft-osint-api.duckdns.org/api/bgmi?key=${MASTER_KEYS.ftosint}&uid=${p.uid}`,
    'ff': (p) => `https://ft-osint-api.duckdns.org/api/ff?key=${MASTER_KEYS.ftosint}&uid=${p.uid}`,
    'aadhar': (p) => `https://ft-osint-api.duckdns.org/api/aadhar?key=${MASTER_KEYS.ftosint}&num=${p.num}`,
    'ai-image': (p) => `https://ayaanmods.site/aiimage.php?key=${MASTER_KEYS.ayaanmods}&prompt=${p.prompt}`,
    'insta': (p) => `https://ft-osint-api.duckdns.org/api/insta?key=${MASTER_KEYS.ftosint}&username=${p.username}`,
    'num-fullinfo': (p) => `https://say-wallahai-bro-say-wallahi.onrender.com/raavan/v34/query=${p.number}/key=${MASTER_KEYS.truecallerLeak}`,
    'mistral': (p) => `mistral-direct`,
    'num-newinfo': (p) => `https://cyber-osint-tg-num.vercel.app/api/tginfo?key=${MASTER_KEYS.rogers}&id=${p.id || p.number || p.term}`,
    'veh-to-num': (p) => `https://surya-veh-num-xmrewqs.ramaxinfo.workers.dev/?term=${p.term || p.vehicle || p.num}`
};

// ========== HELPER: Clean response data ==========
function cleanResponseData(data, endpoint, keyData) {
    if (!data || typeof data !== 'object') return data;
    
    let cleaned = JSON.parse(JSON.stringify(data));
    
    const removeFields = ['Developer', 'DM TO BUY ACCESS', 'owner', 'xtradeep', 'Kon_Hu_Mai'];
    
    function cleanObject(obj) {
        if (!obj || typeof obj !== 'object') return;
        
        for (let key in obj) {
            if (removeFields.includes(key)) {
                delete obj[key];
                continue;
            }
            
            if (typeof obj[key] === 'string' && obj[key].includes('@') && !obj[key].includes('BMW_AURA5')) {
                delete obj[key];
                continue;
            }
            
            if (typeof obj[key] === 'object') {
                cleanObject(obj[key]);
            }
        }
    }
    
    cleanObject(cleaned);
    
    cleaned.owner = '@BMW_AURA5';
    cleaned.channel = 'https://t.me/OSINTERA_1';
    cleaned.api_endpoint = endpoint;
    
    return cleaned;
}

// ========== PUBLIC ROUTES ==========
app.get('/', (req, res) => {
    db.all('SELECT COUNT(*) as total_apis FROM available_apis', [], (err, apisCount) => {
        db.get('SELECT COUNT(*) as total_keys FROM api_keys', [], (err, keysCount) => {
            db.get('SELECT SUM(hits) as total_hits FROM api_keys', [], (err, hitsTotal) => {
                res.render('index', { 
                    user: req.session.user,
                    totalApis: apisCount?.[0]?.total_apis || 0,
                    totalKeys: keysCount?.total_keys || 0,
                    totalHits: hitsTotal?.total_hits || 0
                });
            });
        });
    });
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

// TEST API endpoint
app.post('/api/test', async (req, res) => {
    const { endpoint, params } = req.body;
    const proxyFn = apiProxyMap[endpoint];
    
    if (!proxyFn) {
        return res.json({ error: 'Unknown endpoint', success: false });
    }
    
    try {
        const targetUrl = proxyFn({ ...params, key: MASTER_KEYS.ftosint });
        const startTime = Date.now();
        const response = await axios.get(targetUrl, { timeout: 15000 });
        const responseTime = Date.now() - startTime;
        
        const cleanedData = cleanResponseData(response.data, endpoint, null);
        
        res.json({
            success: true,
            response_time_ms: responseTime,
            status_code: response.status,
            data: cleanedData,
            endpoint: endpoint
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message,
            status_code: error.response?.status || 500,
            endpoint: endpoint
        });
    }
});

app.get('/docs', (req, res) => {
    db.all('SELECT * FROM available_apis WHERE is_active = 1', [], (err, apis) => {
        res.render('docs', { apis: apis || [], baseUrl: req.protocol + '://' + req.get('host') });
    });
});

app.get('/login', (req, res) => {
    res.render('login', { error: req.query.error });
});

// ========== LOGIN ROUTE (Supports Head Admin) ==========
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
                
                // Redirect based on role
                if (user.role === 'head_admin') {
                    res.redirect('/head-admin/dashboard');
                } else {
                    res.redirect('/admin/dashboard');
                }
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

// ========== HEAD ADMIN ROUTES (Hidden & Secure) ==========
app.get('/head-admin/dashboard', requireHeadAdmin, (req, res) => {
    // Get all admins
    db.all('SELECT id, username, role, created_by, created_at FROM users WHERE role != "head_admin" ORDER BY created_at DESC', [], (err, admins) => {
        // Get all API keys with call statistics
        db.all(`SELECT 
                    k.*,
                    COALESCE((SELECT SUM(calls) FROM daily_calls WHERE api_key = k.key AND date = date('now')), 0) as today_calls,
                    COALESCE((SELECT SUM(calls) FROM daily_calls WHERE api_key = k.key AND date = date('now', '-1 day')), 0) as yesterday_calls,
                    COALESCE((SELECT SUM(calls) FROM daily_calls WHERE api_key = k.key AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now')), 0) as monthly_calls
                FROM api_keys k
                ORDER BY k.hits DESC`, [], (err, keys) => {
            
            // Get call statistics
            db.get(`SELECT COALESCE(SUM(calls), 0) as total_calls_today FROM daily_calls WHERE date = date('now')`, [], (err, todayStats) => {
                db.get(`SELECT COALESCE(SUM(calls), 0) as total_calls_month FROM daily_calls WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now')`, [], (err, monthStats) => {
                    db.get(`SELECT SUM(hits) as total_hits FROM api_keys`, [], (err, totalHits) => {
                        
                        res.render('head_admin_dashboard', {
                            user: req.session.user,
                            admins: admins || [],
                            keys: keys || [],
                            todayStats: todayStats || { total_calls_today: 0 },
                            monthStats: monthStats || { total_calls_month: 0 },
                            totalHits: totalHits?.total_hits || 0
                        });
                    });
                });
            });
        });
    });
});

// Head Admin: Create new admin
app.post('/head-admin/create-admin', requireHeadAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    // Check if user exists
    db.get('SELECT id FROM users WHERE username = ?', [username], async (err, existing) => {
        if (existing) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (username, password, role, created_by) VALUES (?, ?, ?, ?)`,
            [username, hashedPassword, role || 'admin', req.session.user.username],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.json({ success: true, message: `Admin ${username} created successfully` });
            });
    });
});

// Head Admin: Remove admin
app.post('/head-admin/remove-admin', requireHeadAdmin, (req, res) => {
    const { admin_id } = req.body;
    
    // Don't allow removing head admin or self
    db.get('SELECT role, username FROM users WHERE id = ?', [admin_id], (err, user) => {
        if (user && user.role === 'head_admin') {
            return res.status(403).json({ error: 'Cannot remove head admin' });
        }
        
        db.run('DELETE FROM users WHERE id = ?', [admin_id], function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, message: `Admin removed successfully` });
        });
    });
});

// Head Admin: Get API call statistics
app.get('/head-admin/api-stats', requireHeadAdmin, (req, res) => {
    const { key, date_range } = req.query;
    
    let query = `
        SELECT 
            api_key,
            date,
            calls,
            (SELECT SUM(hits) FROM api_keys WHERE key = d.api_key) as total_hits
        FROM daily_calls d
        WHERE 1=1
    `;
    let params = [];
    
    if (key) {
        query += ` AND api_key = ?`;
        params.push(key);
    }
    
    if (date_range === 'today') {
        query += ` AND date = date('now')`;
    } else if (date_range === 'week') {
        query += ` AND date >= date('now', '-7 days')`;
    } else if (date_range === 'month') {
        query += ` AND date >= date('now', '-30 days')`;
    }
    
    query += ` ORDER BY date DESC`;
    
    db.all(query, params, (err, stats) => {
        if (err) {
            return res.json({ error: err.message });
        }
        res.json({ success: true, stats: stats });
    });
});

// ========== ADMIN ROUTES ==========
app.get('/admin/dashboard', requireAuth, (req, res) => {
    // Regular admin can't access if they're not admin
    if (req.session.user.role === 'head_admin') {
        return res.redirect('/head-admin/dashboard');
    }
    
    db.all('SELECT * FROM api_keys ORDER BY created_at DESC', [], (err, keys) => {
        db.get('SELECT SUM(hits) as total FROM api_keys', [], (err, hits) => {
            db.get('SELECT COUNT(*) as active FROM api_keys WHERE status="active"', [], (err, active) => {
                db.all(`SELECT endpoint, COUNT(*) as count FROM analytics GROUP BY endpoint ORDER BY count DESC LIMIT 10`, [], (err, popular) => {
                    db.all(`SELECT api_key, COUNT(*) as calls FROM analytics GROUP BY api_key ORDER BY calls DESC LIMIT 5`, [], (err, topUsers) => {
                        db.all('SELECT * FROM available_apis WHERE is_active = 1', [], (err, apis) => {
                            // Get today's calls for each key
                            db.all(`SELECT api_key, SUM(calls) as today_calls FROM daily_calls WHERE date = date('now') GROUP BY api_key`, [], (err, todayCalls) => {
                                const callMap = {};
                                if (todayCalls) {
                                    todayCalls.forEach(c => callMap[c.api_key] = c.today_calls);
                                }
                                
                                res.render('dashboard', { 
                                    keys: keys || [], 
                                    totalHits: hits?.total || 0,
                                    active: active?.active || 0,
                                    popular: popular || [],
                                    topUsers: topUsers || [],
                                    apis: apis || [],
                                    user: req.session.user,
                                    todayCalls: callMap
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// ========== GENERATE API KEY WITH CUSTOM KEY SUPPORT ==========
app.post('/admin/generate-key', requireAuth, (req, res) => {
    const { name, owner_username, owner_channel, expiry, unlimited, allowed_apis, custom_key, enable_custom } = req.body;
    
    let apiKey;
    let isCustom = false;
    
    // Check if custom key is enabled and provided
    if (enable_custom === 'true' && custom_key && custom_key.trim() !== '') {
        apiKey = custom_key.trim();
        isCustom = true;
        
        // Validate custom key
        if (apiKey.includes(' ')) {
            return res.status(400).send('Custom key cannot contain spaces');
        }
        if (apiKey.length < 5) {
            return res.status(400).send('Custom key must be at least 5 characters long');
        }
        
        // Check if custom key already exists
        db.get('SELECT key FROM api_keys WHERE key = ?', [apiKey], (err, existing) => {
            if (existing) {
                return res.status(400).send('This API key already exists! Please choose a different one.');
            }
            createKey();
        });
    } else {
        // Generate random key
        apiKey = 'OSINT_' + Math.random().toString(36).substring(2, 18).toUpperCase();
        isCustom = false;
        createKey();
    }
    
    function createKey() {
        let expires_at = null;
        const now = new Date();
        
        if (expiry === '7d') {
            expires_at = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
        } else if (expiry === '15d') {
            expires_at = new Date(now.getTime() + (15 * 24 * 60 * 60 * 1000));
        } else if (expiry === '1m') {
            expires_at = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
        } else if (expiry === '1y') {
            expires_at = new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000));
        }
        
        let allowedApisJson = '["all"]';
        if (allowed_apis && allowed_apis !== 'all') {
            if (Array.isArray(allowed_apis)) {
                allowedApisJson = JSON.stringify(allowed_apis);
            } else if (typeof allowed_apis === 'string') {
                allowedApisJson = JSON.stringify([allowed_apis]);
            }
        } else if (allowed_apis === 'all') {
            allowedApisJson = '["all"]';
        }
        
        db.run(`INSERT INTO api_keys (key, name, owner_username, owner_channel, expires_at, unlimited_hits, allowed_apis, status, is_custom)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`, 
                [apiKey, name, owner_username || '@BMW_AURA5', owner_channel || 'https://t.me/OSINTERA_1', expires_at, unlimited === 'true' ? 1 : 0, allowedApisJson, isCustom ? 1 : 0], 
                function(err) {
                    if (err) {
                        console.error('Error creating key:', err);
                        return res.status(500).send('Error creating key: ' + err.message);
                    }
                    console.log('✅ Key created:', apiKey, '| Custom:', isCustom, '| Expires:', expires_at);
                    res.redirect('/admin/dashboard');
                });
    }
});

// API to check if a custom key is available (for AJAX)
app.post('/admin/check-key-availability', requireAuth, (req, res) => {
    const { custom_key } = req.body;
    
    if (!custom_key || custom_key.trim() === '') {
        return res.json({ available: false, message: 'Key cannot be empty' });
    }
    
    if (custom_key.includes(' ')) {
        return res.json({ available: false, message: 'Key cannot contain spaces' });
    }
    
    if (custom_key.length < 5) {
        return res.json({ available: false, message: 'Key must be at least 5 characters' });
    }
    
    db.get('SELECT key FROM api_keys WHERE key = ?', [custom_key.trim()], (err, existing) => {
        if (existing) {
            res.json({ available: false, message: '❌ Key already exists! Choose another.' });
        } else {
            res.json({ available: true, message: '✅ Key is available!' });
        }
    });
});

app.post('/admin/delete-key', requireAuth, (req, res) => {
    db.run('DELETE FROM api_keys WHERE id = ?', [req.body.id], () => {
        res.redirect('/admin/dashboard');
    });
});

app.post('/admin/toggle-status', requireAuth, (req, res) => {
    const { id, status } = req.body;
    const newStatus = status === 'active' ? 'disabled' : 'active';
    db.run('UPDATE api_keys SET status = ? WHERE id = ?', [newStatus, id], () => {
        res.redirect('/admin/dashboard');
    });
});

// ========== MISTRAL AI HANDLER ==========
async function handleMistralAI(message, model = 'mistral-medium-latest') {
    try {
        const response = await axios.post('https://api.mistral.ai/v1/chat/completions', {
            model: model,
            messages: [{ role: "user", content: message }]
        }, {
            headers: {
                'Authorization': `Bearer ${MASTER_KEYS.mistral}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        
        return {
            success: true,
            response: response.data.choices[0].message.content,
            model: model,
            usage: response.data.usage
        };
    } catch (error) {
        console.error('Mistral API Error:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.error?.message || error.message
        };
    }
}

// ========== API PROXY HANDLER (WITH CALL TRACKING) ==========
app.all('/api/:endpoint', limiter, async (req, res) => {
    const userKey = req.query.key || req.body.key;
    const endpoint = req.params.endpoint;
    const clientIp = req.ip || req.connection.remoteAddress;
    const today = new Date().toISOString().split('T')[0];
    
    if (!userKey) {
        return res.json({ error: 'API key required', contact: '@BMW_AURA5', channel: 'https://t.me/OSINTERA_1' });
    }
    
    db.get('SELECT * FROM api_keys WHERE key = ? AND status = "active"', [userKey], async (err, keyData) => {
        if (err || !keyData) {
            return res.json({ error: 'Invalid or inactive API key', contact: '@BMW_AURA5' });
        }
        
        // Expiry check
        if (keyData.expires_at) {
            const expiryDate = new Date(keyData.expires_at);
            const currentDate = new Date();
            
            if (expiryDate.getTime() < currentDate.getTime()) {
                db.run('UPDATE api_keys SET status = "expired" WHERE id = ?', [keyData.id]);
                return res.json({ 
                    error: `API key expired on ${expiryDate.toLocaleDateString()}`, 
                    contact: '@BMW_AURA5' 
                });
            }
        }
        
        let allowedApis = [];
        try {
            allowedApis = JSON.parse(keyData.allowed_apis || '[]');
        } catch(e) {
            allowedApis = [];
        }
        
        if (!allowedApis.includes('all') && allowedApis.length > 0 && !allowedApis.includes(endpoint)) {
            return res.json({ 
                error: `This API endpoint (${endpoint}) is not allowed for your key`,
                allowed_apis: allowedApis,
                contact: '@BMW_AURA5'
            });
        }
        
        // Update hit count
        if (!keyData.unlimited_hits) {
            db.run('UPDATE api_keys SET hits = hits + 1 WHERE id = ?', [keyData.id]);
        }
        
        // Track daily calls
        db.run(`INSERT INTO daily_calls (api_key, date, calls) 
                VALUES (?, ?, 1) 
                ON CONFLICT(api_key, date) DO UPDATE SET calls = calls + 1`,
                [userKey, today]);
        
        // Special handler for Mistral AI
        if (endpoint === 'mistral') {
            const message = req.query.message || req.body.message;
            const model = req.query.model || req.body.model || 'mistral-medium-latest';
            
            if (!message) {
                return res.json({ 
                    error: 'Message parameter required',
                    usage: '/api/mistral?key=YOUR_KEY&message=Your question here',
                    example: '/api/mistral?key=OSINT_XXXX&message=What is artificial intelligence?'
                });
            }
            
            const startTime = Date.now();
            const result = await handleMistralAI(message, model);
            const responseTime = Date.now() - startTime;
            
            db.run(`INSERT INTO analytics (api_key, endpoint, response_time, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?, ?)`,
                [userKey, endpoint, responseTime, result.success ? 200 : 500, clientIp, today]);
            
            if (result.success) {
                res.json({
                    success: true,
                    response: result.response,
                    model: result.model,
                    response_time_ms: responseTime,
                    owner: '@BMW_AURA5',
                    channel: 'https://t.me/OSINTERA_1',
                    usage: result.usage
                });
            } else {
                res.json({
                    success: false,
                    error: result.error,
                    contact: '@BMW_AURA5'
                });
            }
            return;
        }
        
        // Handle other APIs
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
            
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                [userKey, endpoint, response.status, clientIp, today]);
            
            // Clean the response data
            let cleanedResult = cleanResponseData(response.data, endpoint, keyData);
            
            // Override with standardized owner info
            cleanedResult.owner = '@BMW_AURA5';
            cleanedResult.channel = 'https://t.me/OSINTERA_1';
            cleanedResult.api_endpoint = endpoint;
            
            res.json(cleanedResult);
            
        } catch (error) {
            console.error('❌ API Error:', error.message);
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                [userKey, endpoint, error.response?.status || 500, clientIp, today]);
            
            res.json({ 
                error: 'API request failed', 
                details: error.message,
                status: error.response?.status,
                contact: '@BMW_AURA5',
                channel: 'https://t.me/OSINTERA_1'
            });
        }
    });
});

// ========== CRON JOBS ==========
// Daily expiry check at midnight
cron.schedule('0 0 * * *', () => {
    console.log('🔄 Running daily expiry check...');
    db.run(`UPDATE api_keys SET status = 'expired' 
            WHERE expires_at IS NOT NULL 
            AND datetime(expires_at) < datetime('now') 
            AND status = 'active'`, 
            function(err) {
                if (err) {
                    console.error('Expiry check error:', err);
                } else {
                    console.log(`✅ Expiry check complete: ${this.changes} keys marked as expired`);
                }
            });
});

// API health check every 30 minutes
cron.schedule('*/30 * * * *', async () => {
    console.log('📊 Checking API health...');
    for (const [name, fn] of Object.entries(apiProxyMap)) {
        if (name === 'mistral') continue;
        try {
            const start = Date.now();
            await axios.get(fn({ term: 'UP50P5434', id: '8489944328' }), { timeout: 5000 });
            const ms = Date.now() - start;
            db.run('INSERT OR REPLACE INTO api_status (endpoint_name, is_up, last_checked, response_ms) VALUES (?, 1, datetime("now"), ?)', [name, ms]);
        } catch(e) {
            db.run('INSERT OR REPLACE INTO api_status (endpoint_name, is_up, last_checked, response_ms) VALUES (?, 0, datetime("now"), 0)', [name]);
        }
    }
});

// ========== DEBUG ROUTE (Optional) ==========
app.get('/admin/debug-key/:key', requireAuth, (req, res) => {
    const key = req.params.key;
    db.get('SELECT key, expires_at, status, created_at, hits, is_custom FROM api_keys WHERE key = ?', [key], (err, keyData) => {
        if (err || !keyData) {
            return res.json({ error: 'Key not found' });
        }
        
        const now = new Date();
        const expiry = keyData.expires_at ? new Date(keyData.expires_at) : null;
        const isExpired = expiry ? expiry.getTime() < now.getTime() : false;
        const daysRemaining = expiry ? Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 'unlimited';
        
        res.json({
            key: keyData.key,
            created_at: keyData.created_at,
            expires_at: keyData.expires_at,
            status: keyData.status,
            hits: keyData.hits,
            is_custom: keyData.is_custom === 1,
            current_time: now.toISOString(),
            is_expired: isExpired,
            days_remaining: daysRemaining,
            is_valid: !isExpired && keyData.status === 'active'
        });
    });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('\n🚀 ========== OSINT API HUB ==========');
    console.log('🔥 Server running on http://localhost:' + PORT);
    console.log('👑 HEAD ADMIN LOGIN: main / sahil');
    console.log('🔐 Admin Login: superadmin / aura@1234');
    console.log('✨ NEW: Custom API Keys - Create any key name you want!');
    console.log('📊 Call tracking enabled - View daily/monthly stats');
    console.log('📁 Database: ' + DB_PATH);
    console.log('=====================================\n');
});

module.exports = app;
