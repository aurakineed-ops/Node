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
    subhxco:'RACKSUN',
    ftosint: 'sahil',
    ayaanmods: 'annonymousai',
    truecallerLeak: 'RATELIMITE-BEIBBkim7bjTAkJIZTIUGPR4FkfNAYoj',
    mistral: 'FVKec5Xqa2ORzSoBrqi21nRbIM6rFk2q',
    rogers: 'Rogers2'  // Added for new APIs
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
        allowed_apis TEXT DEFAULT '[]'
    )`);

    // Analytics table
    db.run(`CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key TEXT,
        endpoint TEXT,
        request_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        response_time INTEGER,
        status_code INTEGER,
        ip_address TEXT,
        response_data TEXT
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

    // Create admin user
    const hashedPassword = bcrypt.hashSync('aura@1234', 10);
    db.run(`INSERT OR REPLACE INTO users (id, username, password, role) VALUES (1, 'superadmin', ?, 'admin')`, [hashedPassword]);

    // Insert all working APIs (including the two new ones)
    db.get(`SELECT COUNT(*) as count FROM available_apis`, [], (err, row) => {
        if (row && row.count === 0) {
            const apis = [
                ['telegram', '📞 Telegram Number Lookup', '/api/telegram', 'id', '{"id":"8489944328"}', 'Get Telegram account details from ID/Number'],
                ['email_info', '📧 Email to Info', '/api/email', 'email', '{"email":"test@gmail.com"}', 'Get information from email address (leak data)'],
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
                ['num_fullinfo', '🔍 Number to Full Info', '/api/num-fullinfo', 'number', '{"number":"918887882236"}', 'Complete phone number info'],
                ['mistral', '🤖 Mistral AI Chat', '/api/mistral', 'message', '{"message":"What is AI?"}', 'Chat with Mistral AI (medium-latest model)'],
                ['num_newinfo', '📱 Number to New Info', '/api/num-newinfo', 'id', '{"id":"8489944328"}', 'Get detailed info from phone number (Telegram based)'],
                ['veh_to_num', '🚗 Vehicle to Number', '/api/veh-to-num', 'term', '{"term":"UP50P5434"}', 'Get vehicle owner details and mobile number from registration']
            ];
            
            apis.forEach(api => {
                db.run(`INSERT INTO available_apis (name, display_name, endpoint, required_params, example_params, description) VALUES (?, ?, ?, ?, ?, ?)`, api);
            });
            console.log('✅ 22 APIs inserted (including 2 new ones)');
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

// ========== API PROXY MAP (UPDATED WITH NEW APIS) ==========
const apiProxyMap = {
    'telegram': (p) => `https://cyber-osint-tg-num.vercel.app/api/tginfo?key=${MASTER_KEYS.rogers}&id=${p.id || p.term || p.number}`,
    'email_info': (p) => `https://leak-api-xtradeep.ramaxinfo.workers.dev/?email=${p.email}`,
    'family': (p) => `https://ayaanmods.site/family.php?key=${MASTER_KEYS.subhxco}&term=${p.term}`,
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
    'num-fullinfo': (p) => `https://say-wallahai-bro-say-wallahi.onrender.com/raavan/v34/query=${p.number}/key=${MASTER_KEYS.truecallerLeak}`,
    'mistral': (p) => `mistral-direct`,
    // NEW APIs
    'num-newinfo': (p) => `https://cyber-osint-tg-num.vercel.app/api/tginfo?key=${MASTER_KEYS.rogers}&id=${p.id || p.number || p.term}`,
    'veh-to-num': (p) => `https://surya-veh-num-xmrewqs.ramaxinfo.workers.dev/?term=${p.term || p.vehicle || p.num}`
};

// ========== HELPER: Clean response data (remove original owner info) ==========
function cleanResponseData(data, endpoint, keyData) {
    // If no data or not an object, return as is
    if (!data || typeof data !== 'object') return data;
    
    // Deep clone to avoid modifying original
    let cleaned = JSON.parse(JSON.stringify(data));
    
    // Remove any fields that contain original developer/owner info
    const removeFields = ['Developer', 'DM TO BUY ACCESS', 'owner', 'xtradeep', 'Kon_Hu_Mai'];
    
    function cleanObject(obj) {
        if (!obj || typeof obj !== 'object') return;
        
        for (let key in obj) {
            // Remove specific fields
            if (removeFields.includes(key)) {
                delete obj[key];
                continue;
            }
            
            // Remove any field with @username pattern (except @BMW_AURA5)
            if (typeof obj[key] === 'string' && obj[key].includes('@') && !obj[key].includes('BMW_AURA5')) {
                delete obj[key];
                continue;
            }
            
            // Recursively clean nested objects
            if (typeof obj[key] === 'object') {
                cleanObject(obj[key]);
            }
        }
    }
    
    cleanObject(cleaned);
    
    // Add standardized owner info
    cleaned.owner = '⚠️ Fixed by @BMW_AURA5 ⚠️';
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
        
        // Clean the response data
        const cleanedData = cleanResponseData(response.data, endpoint, null);
        
        res.json({
            success: true,
            response_time_ms: responseTime,
            status_code: response.status,
            data: cleanedData,
            endpoint: endpoint,
            url: targetUrl.substring(0, 150) + '...'
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
                        db.all('SELECT * FROM available_apis WHERE is_active = 1', [], (err, apis) => {
                            res.render('dashboard', { 
                                keys: keys || [], 
                                totalHits: hits?.total || 0,
                                active: active?.active || 0,
                                popular: popular || [],
                                topUsers: topUsers || [],
                                apis: apis || [],
                                user: req.session.user
                            });
                        });
                    });
                });
            });
        });
    });
});

// Generate API Key with correct expiry
app.post('/admin/generate-key', requireAuth, (req, res) => {
    const { name, owner_username, owner_channel, expiry, unlimited, allowed_apis } = req.body;
    const apiKey = 'OSINT_' + Math.random().toString(36).substring(2, 18).toUpperCase();
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
    
    db.run(`INSERT INTO api_keys (key, name, owner_username, owner_channel, expires_at, unlimited_hits, allowed_apis, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`, 
            [apiKey, name, owner_username || '@BMW_AURA5', owner_channel || 'https://t.me/OSINTERA_1', expires_at, unlimited === 'true' ? 1 : 0, allowedApisJson], 
            function(err) {
                if (err) {
                    console.error('Error creating key:', err);
                    return res.status(500).send('Error creating key');
                }
                console.log('✅ Key created:', apiKey, 'Expires:', expires_at);
                res.redirect('/admin/dashboard');
            });
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

// ========== MISTRAL AI HANDLER ==========
async function handleMistralAI(message, model = 'mistral-medium-latest') {
    try {
        const response = await axios.post('https://api.mistral.ai/v1/chat/completions', {
            model: model,
            messages: [
                {
                    role: "user",
                    content: message
                }
            ]
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
            error: error.response?.data?.error?.message || error.message,
            details: error.response?.data
        };
    }
}

// ========== API PROXY HANDLER (UPDATED WITH CLEANING) ==========
app.all('/api/:endpoint', limiter, async (req, res) => {
    const userKey = req.query.key || req.body.key;
    const endpoint = req.params.endpoint;
    const clientIp = req.ip || req.connection.remoteAddress;
    
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
        
        if (!keyData.unlimited_hits) {
            db.run('UPDATE api_keys SET hits = hits + 1 WHERE id = ?', [keyData.id]);
        }
        
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
            
            db.run(`INSERT INTO analytics (api_key, endpoint, response_time, status_code, ip_address) VALUES (?, ?, ?, ?, ?)`,
                [userKey, endpoint, responseTime, result.success ? 200 : 500, clientIp]);
            
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
                    details: result.details,
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
            
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address) VALUES (?, ?, ?, ?)`,
                [userKey, endpoint, response.status, clientIp]);
            
            // CLEAN THE RESPONSE DATA - Remove original owner info, add standardized one
            let cleanedResult = cleanResponseData(response.data, endpoint, keyData);
            
            // Override with standardized owner info
            cleanedResult.owner = '@BMW_AURA5';
            cleanedResult.channel = 'https://t.me/OSINTERA_1';
            cleanedResult.api_endpoint = endpoint;
            
            res.json(cleanedResult);
            
        } catch (error) {
            console.error('❌ API Error:', error.message);
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address) VALUES (?, ?, ?, ?)`,
                [userKey, endpoint, error.response?.status || 500, clientIp]);
            
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
            const testParam = name === 'veh-to-num' ? 'UP50P5434' : (name === 'num-newinfo' ? '8489944328' : 'test');
            await axios.get(fn({ term: testParam, id: testParam, number: testParam }), { timeout: 5000 });
            const ms = Date.now() - start;
            db.run('INSERT OR REPLACE INTO api_status (endpoint_name, is_up, last_checked, response_ms) VALUES (?, 1, datetime("now"), ?)', [name, ms]);
        } catch(e) {
            db.run('INSERT OR REPLACE INTO api_status (endpoint_name, is_up, last_checked, response_ms) VALUES (?, 0, datetime("now"), 0)', [name]);
        }
    }
});

// ========== DEBUG ROUTE ==========
app.get('/admin/debug-key/:key', requireAuth, (req, res) => {
    const key = req.params.key;
    db.get('SELECT key, expires_at, status, created_at, hits FROM api_keys WHERE key = ?', [key], (err, keyData) => {
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
    console.log('🔐 Admin Login: superadmin / aura@1234');
    console.log('📁 Database: ' + DB_PATH);
    console.log('📡 Endpoints: http://localhost:' + PORT + '/endpoints');
    console.log('🧪 Test API: POST /api/test');
    console.log('🤖 Mistral AI: /api/mistral?key=KEY&message=Hello');
    console.log('📱 New API 1: /api/num-newinfo?key=KEY&id=NUMBER');
    console.log('🚗 New API 2: /api/veh-to-num?key=KEY&term=VEHICLE_NO');
    console.log('🔍 Debug Key: /admin/debug-key/YOUR_KEY');
    console.log('=====================================\n');
});

module.exports = app;
