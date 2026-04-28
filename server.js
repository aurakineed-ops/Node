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
const fs = require('fs');
const app = express();

// ========== MASTER API KEYS (Removed Rogers) ==========
const MASTER_KEYS = {
    subhxco: 'RACKSUN',
    ftosint: 'sahil-newww',
    ayaanmods: 'annonymousai',
    truecallerLeak: 'RATELIMITE-BEIBBkim7bjTAkJIZTIUGPR4FkfNAYoj',
    mistral: 'FVKec5Xqa2ORzSoBrqi21nRbIM6rFk2q'
    // rogers: REMOVED
};

// ========== EXTRACTED KEYS FROM TELEGRAM BOT ==========
const EXTRACTED_KEYS = {
    tech_api: 'TVB_FULL_79D3030E',
    family_api_key: '19marr'
};

// ========== TECH API BASE ==========
const TECH_API_BASE = 'https://techvishalboss.com/api/v1/lookup.php';

// ========== NEW API ENDPOINTS ==========
const NEW_APIS = {
    telegram_lookup: 'https://bronx-tg-ultra.vercel.app/tg',
    vehicle_to_number: 'https://vvvin-ng.vercel.app/lookup'
};

// ========== DATABASE SETUP ==========
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const DB_PATH = path.join(dataDir, 'api_keys.db');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE,
        name TEXT,
        app_name TEXT,
        owner_username TEXT,
        owner_channel TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        hits INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        unlimited_hits BOOLEAN DEFAULT 0,
        allowed_apis TEXT DEFAULT '["all"]',
        is_custom BOOLEAN DEFAULT 0,
        rate_limit_enabled BOOLEAN DEFAULT 1,
        rate_limit_per_day INTEGER DEFAULT 100,
        rate_limit_per_hour INTEGER DEFAULT 20,
        rate_limit_per_minute INTEGER DEFAULT 5,
        max_total_hits INTEGER DEFAULT 0,
        ip_whitelist TEXT DEFAULT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS rate_limit_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key TEXT,
        date TEXT,
        hour INTEGER,
        minute INTEGER,
        requests INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key TEXT,
        endpoint TEXT,
        status_code INTEGER,
        ip_address TEXT,
        date DATE DEFAULT CURRENT_DATE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS daily_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key TEXT,
        date DATE,
        calls INTEGER DEFAULT 0,
        UNIQUE(api_key, date)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS api_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint_name TEXT,
        is_up BOOLEAN DEFAULT 1,
        last_checked DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS available_apis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        display_name TEXT,
        endpoint TEXT,
        required_params TEXT,
        example_params TEXT,
        description TEXT,
        level TEXT DEFAULT '1',
        is_active BOOLEAN DEFAULT 1
    )`);

    // Create HEAD ADMIN
    db.get(`SELECT * FROM users WHERE username = 'main'`, [], (err, row) => {
        if (!row) {
            const headAdminPassword = bcrypt.hashSync('sahil', 10);
            db.run(`INSERT INTO users (username, password, role, created_by) VALUES (?, ?, ?, ?)`, 
                ['main', headAdminPassword, 'head_admin', 'system']);
            console.log('✅ Head Admin created: main / sahil');
        }
    });

    // Create NORMAL ADMIN
    db.get(`SELECT * FROM users WHERE username = 'admin'`, [], (err, row) => {
        if (!row) {
            const adminPassword = bcrypt.hashSync('aura@1234', 10);
            db.run(`INSERT INTO users (username, password, role, created_by) VALUES (?, ?, ?, ?)`, 
                ['admin', adminPassword, 'admin', 'main']);
            console.log('✅ Normal Admin created: admin / aura@1234');
        }
    });

    // Insert ALL APIs
    db.get(`SELECT COUNT(*) as count FROM available_apis`, [], (err, row) => {
        if (row && row.count === 0) {
            const apis = [
                // ========== LEVEL 1: APIs ==========
                ['telegram', '📞 Telegram Number Lookup', '/api/telegram', 'id', '{"id":"7530266953"}', 'Get Telegram account details and linked number', '1'],
                ['veh_to_num', '🚗 Vehicle to Mobile Number', '/api/veh-to-num', 'term', '{"term":"UP50P5434"}', 'Get mobile number from vehicle registration', '1'],
                ['email_info', '📧 Email to Info', '/api/email', 'email', '{"email":"test@gmail.com"}', 'Email information', '1'],
                ['family', '👨‍👩‍👧‍👦 Family Tree', '/api/family', 'term', '{"term":"979607168114"}', 'Family relationship lookup', '1'],
                ['num_india', '🇮🇳 Indian Number Info', '/api/num-india', 'num', '{"num":"9876543210"}', 'Indian mobile number details', '1'],
                ['num_pak', '🇵🇰 Pakistani Number', '/api/num-pak', 'number', '{"number":"03001234567"}', 'Pakistani mobile number', '1'],
                ['name_details', '👤 Name to Details', '/api/name-details', 'name', '{"name":"abhiraaj"}', 'Name information', '1'],
                ['bank_info', '🏦 Bank IFSC Info', '/api/bank', 'ifsc', '{"ifsc":"SBIN0001234"}', 'Bank branch details', '1'],
                ['pan_info', '📄 PAN Card Info', '/api/pan', 'pan', '{"pan":"AXDPR2606K"}', 'PAN card details', '1'],
                ['vehicle_info', '🚗 Vehicle Info', '/api/vehicle', 'vehicle', '{"vehicle":"HR26DA1337"}', 'Vehicle registration', '1'],
                ['rc_info', '📋 RC Details', '/api/rc', 'owner', '{"owner":"HR26EV0001"}', 'Registration certificate', '1'],
                ['ip_info', '🌐 IP Geolocation', '/api/ip', 'ip', '{"ip":"8.8.8.8"}', 'IP address location', '1'],
                ['pincode_info', '📍 Pincode Info', '/api/pincode', 'pin', '{"pin":"110001"}', 'Area details', '1'],
                ['git_info', '🐙 GitHub User', '/api/git', 'username', '{"username":"octocat"}', 'GitHub profile', '1'],
                ['bgmi_info', '🎮 BGMI Player', '/api/bgmi', 'uid', '{"uid":"5121439477"}', 'BGMI player stats', '1'],
                ['ff_info', '🔫 FreeFire ID', '/api/ff', 'uid', '{"uid":"123456789"}', 'FreeFire player', '1'],
                ['aadhar_info', '🆔 Aadhar Info', '/api/aadhar', 'num', '{"num":"393933081942"}', 'Aadhar verification', '1'],
                ['ai_image', '🎨 AI Image Gen', '/api/ai-image', 'prompt', '{"prompt":"cyberpunk cat"}', 'Generate AI images', '1'],
                ['insta_info', '📸 Instagram Info', '/api/insta', 'username', '{"username":"ankit.vaid"}', 'Instagram profile', '1'],
                ['num_fullinfo', '🔍 Number to Full Info', '/api/num-fullinfo', 'number', '{"number":"918887882236"}', 'Complete phone info', '1'],
                ['mistral', '🤖 Mistral AI Chat', '/api/mistral', 'message', '{"message":"What is AI?"}', 'Chat with Mistral AI', '1'],
                ['num_newinfo', '📱 Number to New Info', '/api/num-newinfo', 'id', '{"id":"8489944328"}', 'Number information lookup', '1'],
                
                // ========== LEVEL 2: Tech API ==========
                ['aadhaar_to_pan', '🆚 Aadhaar to PAN', '/api/aadhaar-to-pan', 'aadhar', '{"aadhar":"393933081942"}', 'Get PAN from Aadhaar', '2'],
                ['pan_info_new', '🆚 PAN Detailed Info', '/api/pan-info-new', 'pan', '{"pan":"AXDPR2606K"}', 'Detailed PAN information', '2'],
                ['vehicle_address', '🚗 Vehicle to Address', '/api/vehicle-address', 'rc', '{"rc":"HR26DA1337"}', 'Get address from vehicle', '2'],
                ['pan_to_gst', '📄 PAN to GST', '/api/pan-to-gst', 'pan', '{"pan":"AXDPR2606K"}', 'Get GST from PAN', '2'],
                ['vehicle_owner_number', '🚗 Vehicle Owner Mobile', '/api/vehicle-owner-number', 'rc', '{"rc":"HR26DA1337"}', 'Get owner mobile from vehicle', '2'],
                ['tg_to_number', '🧠 Telegram ID to Mobile', '/api/tg-to-number', 'telegram', '{"telegram":"8489944328"}', 'Get mobile from Telegram ID', '2'],
                ['number_lookup_tech', '🔍 Advanced Number Lookup', '/api/number-lookup-tech', 'number', '{"number":"9876543210"}', 'Advanced phone intelligence', '2'],
                ['aadhaar_to_number', '🆚 Aadhaar to Mobile', '/api/aadhaar-to-number', 'number', '{"number":"393933081942"}', 'Get mobile from Aadhaar', '2'],
                
                // ========== LEVEL 3: Family API ==========
                ['aadhaar_family', '👨‍👩‍👧‍👦 Aadhaar Family', '/api/aadhaar-family', 'term', '{"term":"393933081942"}', 'Complete family details', '3'],
                
                // ========== LEVEL 4: Website Scraper ==========
                ['website_scraper', '🌐 Website Scraper', '/api/website-scraper', 'url', '{"url":"https://example.com"}', 'Extract data from websites', '4']
            ];
            
            apis.forEach(api => {
                db.run(`INSERT INTO available_apis (name, display_name, endpoint, required_params, example_params, description, level) VALUES (?, ?, ?, ?, ?, ?, ?)`, api);
            });
            console.log('✅ 30+ APIs inserted (Level 1-4)');
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

app.use(session({
    secret: 'osint_secret_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req) => req.query.key || req.ip,
    handler: (req, res) => res.json({ error: 'Rate limit exceeded', contact: '@BMW_AURA5' })
});

function requireAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

function requireHeadAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'head_admin') {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
}

function checkIpWhitelist(ipWhitelist, clientIp) {
    if (!ipWhitelist) return true;
    try {
        const allowedIps = JSON.parse(ipWhitelist);
        if (!allowedIps || allowedIps.length === 0) return true;
        return allowedIps.includes(clientIp);
    } catch(e) {
        return true;
    }
}

async function checkRateLimit(apiKey, keyData) {
    if (keyData.max_total_hits > 0 && keyData.hits >= keyData.max_total_hits) {
        db.run('UPDATE api_keys SET status = "expired" WHERE id = ?', [keyData.id]);
        return { allowed: false, reason: `Total hits limit reached: ${keyData.max_total_hits}` };
    }
    
    if (keyData.unlimited_hits === 1) {
        return { allowed: true, unlimited: true };
    }
    
    if (keyData.rate_limit_enabled !== 1) {
        return { allowed: true };
    }
    
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    if (keyData.rate_limit_per_minute > 0) {
        const minuteCount = await getCount(apiKey, today, currentHour, currentMinute);
        if (minuteCount >= keyData.rate_limit_per_minute) {
            return { allowed: false, reason: `Per minute limit: ${keyData.rate_limit_per_minute}` };
        }
    }
    
    if (keyData.rate_limit_per_hour > 0) {
        const hourCount = await getCount(apiKey, today, currentHour, null);
        if (hourCount >= keyData.rate_limit_per_hour) {
            return { allowed: false, reason: `Per hour limit: ${keyData.rate_limit_per_hour}` };
        }
    }
    
    if (keyData.rate_limit_per_day > 0) {
        const dayCount = await getCount(apiKey, today, null, null);
        if (dayCount >= keyData.rate_limit_per_day) {
            return { allowed: false, reason: `Per day limit: ${keyData.rate_limit_per_day}` };
        }
    }
    
    await incrementCount(apiKey, today, null, null);
    await incrementCount(apiKey, today, currentHour, null);
    await incrementCount(apiKey, today, currentHour, currentMinute);
    
    return { allowed: true };
}

function getCount(apiKey, date, hour, minute) {
    return new Promise((resolve) => {
        let query = `SELECT SUM(requests) as total FROM rate_limit_tracking WHERE api_key = ? AND date = ?`;
        let params = [apiKey, date];
        
        if (hour !== null) {
            query += ` AND hour = ?`;
            params.push(hour);
        }
        if (minute !== null) {
            query += ` AND minute = ?`;
            params.push(minute);
        }
        
        db.get(query, params, (err, row) => {
            resolve(row ? (row.total || 0) : 0);
        });
    });
}

function incrementCount(apiKey, date, hour, minute) {
    return new Promise((resolve) => {
        const query = `INSERT INTO rate_limit_tracking (api_key, date, hour, minute, requests)
                       VALUES (?, ?, ?, ?, 1)`;
        const params = [apiKey, date, hour !== null ? hour : 0, minute !== null ? minute : 0];
        db.run(query, params, () => resolve());
    });
}

// ========== API PROXY MAP (UPDATED - No Rogers, New APIs Added) ==========
const apiProxyMap = {
    // ========== NEW APIS (Replaced) ==========
    'telegram': (p) => `https://bronx-tg-ultra.vercel.app/tg?num=${p.id || p.term || p.number}`,
    'veh_to_num': (p) => `https://vvvin-ng.vercel.app/lookup?rc=${p.term || p.vehicle || p.num}`,
    
    // ========== LEVEL 1: Existing APIs ==========
    'email_info': (p) => `https://leak-api-xtradeep.ramaxinfo.workers.dev/?email=${p.email}`,
    'family': (p) => `https://ayaanmods.site/family.php?key=${MASTER_KEYS.subhxco}&term=${p.term}`,
    'num_india': (p) => `https://ft-osint-api.duckdns.org/api/number?key=${MASTER_KEYS.ftosint}&num=${p.num}`,
    'num_pak': (p) => `https://ft-osint-api.duckdns.org/api/pk?key=${MASTER_KEYS.ftosint}&number=${p.number}`,
    'name_details': (p) => `https://ft-osint-api.duckdns.org/api/name?key=${MASTER_KEYS.ftosint}&name=${p.name}`,
    'bank_info': (p) => `https://ft-osint-api.duckdns.org/api/ifsc?key=${MASTER_KEYS.ftosint}&ifsc=${p.ifsc}`,
    'pan_info': (p) => `https://ft-osint-api.duckdns.org/api/pan?key=${MASTER_KEYS.ftosint}&pan=${p.pan}`,
    'vehicle_info': (p) => `https://ft-osint-api.duckdns.org/api/vehicle?key=${MASTER_KEYS.ftosint}&vehicle=${p.vehicle}`,
    'rc_info': (p) => `https://ft-osint-api.duckdns.org/api/rc?key=${MASTER_KEYS.ftosint}&owner=${p.owner}`,
    'ip_info': (p) => `https://ft-osint-api.duckdns.org/api/ip?key=${MASTER_KEYS.ftosint}&ip=${p.ip}`,
    'pincode_info': (p) => `https://ft-osint-api.duckdns.org/api/pincode?key=${MASTER_KEYS.ftosint}&pin=${p.pin}`,
    'git_info': (p) => `https://ft-osint-api.duckdns.org/api/git?key=${MASTER_KEYS.ftosint}&username=${p.username}`,
    'bgmi_info': (p) => `https://ft-osint-api.duckdns.org/api/bgmi?key=${MASTER_KEYS.ftosint}&uid=${p.uid}`,
    'ff_info': (p) => `https://ft-osint-api.duckdns.org/api/ff?key=${MASTER_KEYS.ftosint}&uid=${p.uid}`,
    'aadhar_info': (p) => `https://ft-osint-api.duckdns.org/api/aadhar?key=${MASTER_KEYS.ftosint}&num=${p.num}`,
    'ai_image': (p) => `https://ayaanmods.site/aiimage.php?key=${MASTER_KEYS.ayaanmods}&prompt=${p.prompt}`,
    'insta_info': (p) => `https://ft-osint-api.duckdns.org/api/insta?key=${MASTER_KEYS.ftosint}&username=${p.username}`,
    'num_fullinfo': (p) => `https://say-wallahai-bro-say-wallahi.onrender.com/raavan/v34/query=${p.number}/key=${MASTER_KEYS.truecallerLeak}`,
    'mistral': `mistral-direct`,
    'num_newinfo': (p) => `https://bronx-tg-ultra.vercel.app/tg?num=${p.id || p.number || p.term}`,
    
    // ========== LEVEL 2: Tech APIs ==========
    'aadhaar-to-pan': (p) => `${TECH_API_BASE}?key=${EXTRACTED_KEYS.tech_api}&service=aadhar_to_pan&aadhar=${p.aadhar}`,
    'pan-info-new': (p) => `${TECH_API_BASE}?key=${EXTRACTED_KEYS.tech_api}&service=pan&pan=${p.pan}`,
    'vehicle-address': (p) => `${TECH_API_BASE}?key=${EXTRACTED_KEYS.tech_api}&service=vehicle&rc=${p.rc}`,
    'pan-to-gst': (p) => `${TECH_API_BASE}?key=${EXTRACTED_KEYS.tech_api}&service=pan_to_gst&pan=${p.pan}`,
    'vehicle-owner-number': (p) => `${TECH_API_BASE}?key=${EXTRACTED_KEYS.tech_api}&service=vehicle_owner_number&rc=${p.rc}`,
    'tg-to-number': (p) => `${TECH_API_BASE}?key=${EXTRACTED_KEYS.tech_api}&service=tg_to_number&telegram=${p.telegram}`,
    'number-lookup-tech': (p) => `${TECH_API_BASE}?key=${EXTRACTED_KEYS.tech_api}&service=number&number=${p.number}`,
    'aadhaar-to-number': (p) => `${TECH_API_BASE}?key=${EXTRACTED_KEYS.tech_api}&service=aadhar_to_number&number=${p.number}`,
    
    // ========== LEVEL 3: Family API ==========
    'aadhaar-family': (p) => `https://familyyyy-info.vercel.app/key-api?key=${EXTRACTED_KEYS.family_api_key}&term=${p.term}`,
    
    // ========== LEVEL 4: Website Scraper ==========
    'website-scraper': (p) => {
        let url = p.url;
        if (!url.startsWith('http')) url = 'https://' + url;
        return `https://rohit-website-scrapper-api.vercel.app/zip?url=${encodeURIComponent(url)}`;
    }
};

// ========== RESPONSE CLEANER - ONLY @BMW_AURA5 and @OSINT_ERA1 ==========
function cleanResponseData(data, endpoint = null) {
    if (!data || typeof data !== 'object') return data;
    
    let cleaned = JSON.parse(JSON.stringify(data));
    
    const removeFields = [
        'Developer', 'DM TO BUY ACCESS', 'owner', 'xtradeep', 'Kon_Hu_Mai', 'channel', 
        'telegram', 'contact', 'instagram', 'twitter', 'fb', 'facebook', 'website', 
        'github', 'created_by', 'owner_username', 'owner_channel', 'credit', 'Credits', 
        'Credit', 'Source', 'source', 'provider', 'Provider', 'api_source', 'API_Source',
        'bot_token', 'admin_id', 'admin_password', 'tech_api', 'family_api_key',
        'credit', 'developer', 'method', 'query_time_ms', 'resolved_id'
    ];
    
    function cleanObject(obj) {
        if (!obj || typeof obj !== 'object') return;
        for (let key in obj) {
            if (removeFields.includes(key.toLowerCase()) || removeFields.includes(key)) {
                delete obj[key];
            } 
            else if (typeof obj[key] === 'string') {
                if (obj[key].includes('@') && !obj[key].includes('BMW_AURA5') && !obj[key].includes('OSINT_ERA1')) {
                    delete obj[key];
                }
            }
            else if (typeof obj[key] === 'object') {
                cleanObject(obj[key]);
            }
        }
    }
    
    cleanObject(cleaned);
    
    // ONLY ADD THESE TWO - NO OTHER CREDITS
    cleaned.owner = '@BMW_AURA5';
    cleaned.channel = '@OSINT_ERA1';
    
    return cleaned;
}

// ========== PUBLIC ROUTES ==========
app.get('/', (req, res) => {
    db.get('SELECT COUNT(*) as total_apis FROM available_apis', [], (err, apisCount) => {
        db.get('SELECT COUNT(*) as total_keys FROM api_keys', [], (err, keysCount) => {
            db.get('SELECT SUM(hits) as total_hits FROM api_keys', [], (err, hitsTotal) => {
                res.render('index', { 
                    user: req.session.user || null,
                    totalApis: (apisCount && apisCount.total_apis) || 0,
                    totalKeys: (keysCount && keysCount.total_keys) || 0,
                    totalHits: (hitsTotal && hitsTotal.total_hits) || 0
                });
            });
        });
    });
});

app.get('/endpoints', (req, res) => {
    db.all('SELECT * FROM available_apis WHERE is_active = 1 ORDER BY level, name', [], (err, apis) => {
        const statusMap = {};
        (apis || []).forEach(api => {
            statusMap[api.name] = true;
        });
        
        res.render('endpoints', { 
            apis: apis || [], 
            baseUrl: req.protocol + '://' + req.get('host'),
            statusMap: statusMap
        });
    });
});

app.get('/docs', (req, res) => {
    db.all('SELECT * FROM available_apis WHERE is_active = 1 ORDER BY level, name', [], (err, apis) => {
        const statusMap = {};
        (apis || []).forEach(api => {
            statusMap[api.name] = true;
        });
        
        res.render('docs', { 
            apis: apis || [], 
            baseUrl: req.protocol + '://' + req.get('host'),
            statusMap: statusMap
        });
    });
});

app.get('/login', (req, res) => {
    res.render('login', { error: req.query.error || null });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.redirect('/login?error=missing');
    
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) return res.redirect('/login?error=invalid');
        try {
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                req.session.user = { id: user.id, username: user.username, role: user.role };
                if (user.role === 'head_admin') return res.redirect('/head-admin/dashboard');
                else return res.redirect('/admin/dashboard');
            } else {
                return res.redirect('/login?error=invalid');
            }
        } catch (bcryptError) {
            return res.redirect('/login?error=server_error');
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// ========== HEAD ADMIN DASHBOARD ==========
app.get('/head-admin/dashboard', requireHeadAdmin, (req, res) => {
    db.all('SELECT id, username, role, created_by, created_at FROM users WHERE role != "head_admin"', [], (err, admins) => {
        db.all('SELECT * FROM api_keys ORDER BY created_at DESC', [], (err, keys) => {
            db.get('SELECT SUM(hits) as total_hits FROM api_keys', [], (err, totalHits) => {
                res.render('head_admin_dashboard', { 
                    user: req.session.user, 
                    admins: admins || [], 
                    keys: keys || [], 
                    totalHits: (totalHits && totalHits.total_hits) || 0 
                });
            });
        });
    });
});

app.post('/head-admin/create-admin', requireHeadAdmin, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ error: 'Username and password required' });
    
    db.get('SELECT id FROM users WHERE username = ?', [username], async (err, existing) => {
        if (existing) return res.json({ error: 'Username already exists' });
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (username, password, role, created_by) VALUES (?, ?, ?, ?)`, 
            [username, hashedPassword, 'admin', req.session.user.username], function(err) {
            if (err) return res.json({ error: err.message });
            res.json({ success: true });
        });
    });
});

app.post('/head-admin/remove-admin', requireHeadAdmin, (req, res) => {
    db.run('DELETE FROM users WHERE id = ? AND role = "admin"', [req.body.admin_id], function(err) {
        res.json({ success: !err });
    });
});

// ========== ADMIN DASHBOARD ==========
app.get('/admin/dashboard', requireAuth, (req, res) => {
    if (req.session.user.role === 'head_admin') return res.redirect('/head-admin/dashboard');
    if (req.session.user.role !== 'admin') return res.status(403).send('Access denied');
    
    db.all('SELECT * FROM api_keys ORDER BY created_at DESC', [], (err, keys) => {
        db.get('SELECT SUM(hits) as total FROM api_keys', [], (err, hits) => {
            db.get('SELECT COUNT(*) as active FROM api_keys WHERE status="active"', [], (err, active) => {
                db.all('SELECT * FROM available_apis WHERE is_active = 1 ORDER BY level, name', [], (err, apis) => {
                    res.render('dashboard', { 
                        keys: keys || [], 
                        totalHits: (hits && hits.total) || 0,
                        active: (active && active.active) || 0,
                        apis: apis || [],
                        user: req.session.user,
                        baseUrl: req.protocol + '://' + req.get('host')
                    });
                });
            });
        });
    });
});

// ========== GENERATE API KEY ==========
app.post('/admin/generate-key', requireAuth, (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).send('Access denied');
    }
    
    const { name, app_name, expiry, limit_type, max_total_hits, daily_limit, allowed_apis, custom_key, ip_whitelist } = req.body;
    
    function createKey(apiKey, isCustom) {
        let expires_at = null;
        const now = new Date();
        
        if (expiry === '7d') expires_at = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
        else if (expiry === '15d') expires_at = new Date(now.getTime() + (15 * 24 * 60 * 60 * 1000));
        else if (expiry === '1m') expires_at = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
        else if (expiry === '1y') expires_at = new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000));
        
        let allowedApisJson = '["all"]';
        
        if (allowed_apis) {
            if (Array.isArray(allowed_apis)) {
                if (allowed_apis.includes('all') || allowed_apis.length === 0) {
                    allowedApisJson = '["all"]';
                } else {
                    allowedApisJson = JSON.stringify(allowed_apis);
                }
            } else if (typeof allowed_apis === 'string') {
                if (allowed_apis === 'all' || allowed_apis === 'on') {
                    allowedApisJson = '["all"]';
                } else {
                    allowedApisJson = JSON.stringify([allowed_apis]);
                }
            }
        }
        
        const isUnlimited = limit_type === 'unlimited';
        const totalHitsLimit = (!isUnlimited && max_total_hits) ? parseInt(max_total_hits) : 0;
        const dailyLimitValue = daily_limit ? parseInt(daily_limit) : 0;
        const rateLimitEnabled = isUnlimited ? 0 : 1;
        const rateLimitPerDay = dailyLimitValue > 0 ? dailyLimitValue : (isUnlimited ? 0 : 100);
        
        const finalOwner = '@BMW_AURA5';
        const finalChannel = '@OSINT_ERA1';
        
        let ipWhitelistJson = null;
        if (ip_whitelist && ip_whitelist.trim()) {
            const ips = ip_whitelist.split(',').map(ip => ip.trim());
            ipWhitelistJson = JSON.stringify(ips);
        }
        
        db.run(`INSERT INTO api_keys (
            key, name, app_name, owner_username, owner_channel, expires_at, 
            unlimited_hits, allowed_apis, status, is_custom,
            rate_limit_enabled, rate_limit_per_day, rate_limit_per_hour, rate_limit_per_minute,
            max_total_hits, ip_whitelist
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`, 
            [apiKey, name || app_name, app_name || name, finalOwner, finalChannel, expires_at, 
             isUnlimited ? 1 : 0, allowedApisJson, isCustom ? 1 : 0,
             rateLimitEnabled, rateLimitPerDay, 20, 5,
             totalHitsLimit, ipWhitelistJson], 
            function(err) {
                if (err) {
                    console.error('Error creating key:', err);
                    return res.status(500).send('Error: ' + err.message);
                }
                res.redirect('/admin/dashboard');
            });
    }
    
    if (custom_key && custom_key.trim() !== '') {
        let apiKey = custom_key.trim().toUpperCase();
        if (apiKey.includes(' ')) return res.status(400).send('Invalid custom key: No spaces allowed');
        if (apiKey.length < 3) return res.status(400).send('Custom key must be at least 3 characters');
        db.get('SELECT key FROM api_keys WHERE key = ?', [apiKey], (err, existing) => {
            if (existing) return res.status(400).send('Key already exists');
            createKey(apiKey, true);
        });
    } else {
        let apiKey = 'OSINT_' + Math.random().toString(36).substring(2, 18).toUpperCase();
        createKey(apiKey, false);
    }
});

app.post('/admin/delete-key', requireAuth, (req, res) => {
    if (req.session.user.role !== 'admin') return res.status(403).send('Access denied');
    db.run('DELETE FROM api_keys WHERE id = ?', [req.body.id]);
    res.redirect('/admin/dashboard');
});

app.post('/admin/toggle-status', requireAuth, (req, res) => {
    if (req.session.user.role !== 'admin') return res.status(403).send('Access denied');
    const { id, status } = req.body;
    db.run('UPDATE api_keys SET status = ? WHERE id = ?', [status === 'active' ? 'disabled' : 'active', id]);
    res.redirect('/admin/dashboard');
});

async function handleMistralAI(message) {
    try {
        const response = await axios.post('https://api.mistral.ai/v1/chat/completions', {
            model: 'mistral-medium-latest',
            messages: [{ role: "user", content: message }]
        }, {
            headers: { 'Authorization': `Bearer ${MASTER_KEYS.mistral}`, 'Content-Type': 'application/json' },
            timeout: 30000
        });
        return { success: true, response: response.data.choices[0].message.content };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ========== MAIN API HANDLER ==========
app.all('/api/:endpoint', globalLimiter, async (req, res) => {
    const userKey = req.query.key || req.body.key;
    let endpoint = req.params.endpoint;
    const today = new Date().toISOString().split('T')[0];
    const clientIp = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
    
    if (!userKey) {
        return res.json({ error: 'API key required', contact: '@BMW_AURA5' });
    }
    
    const normalizedEndpoint = endpoint.replace(/-/g, '_');
    
    db.get('SELECT * FROM api_keys WHERE key = ? AND status = "active"', [userKey], async (err, keyData) => {
        if (err || !keyData) {
            return res.json({ error: 'Invalid API key', contact: '@BMW_AURA5' });
        }
        
        if (!checkIpWhitelist(keyData.ip_whitelist, clientIp)) {
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`, [userKey, endpoint, 403, clientIp, today]);
            return res.json({ error: 'IP not whitelisted', contact: '@BMW_AURA5' });
        }
        
        if (keyData.max_total_hits > 0 && keyData.hits >= keyData.max_total_hits) {
            db.run('UPDATE api_keys SET status = "expired" WHERE id = ?', [keyData.id]);
            return res.json({ error: 'Key expired (total hits limit reached)', contact: '@BMW_AURA5' });
        }
        
        const rateCheck = await checkRateLimit(userKey, keyData);
        if (!rateCheck.allowed) {
            return res.json({ error: rateCheck.reason, contact: '@BMW_AURA5' });
        }
        
        if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
            db.run('UPDATE api_keys SET status = "expired" WHERE id = ?', [keyData.id]);
            return res.json({ error: 'Key expired', contact: '@BMW_AURA5' });
        }
        
        let allowedApis = [];
        try { 
            allowedApis = JSON.parse(keyData.allowed_apis || '["all"]'); 
        } catch(e) { 
            allowedApis = ['all']; 
        }
        
        const isAllowed = allowedApis.includes('all') || 
                          allowedApis.includes(endpoint) || 
                          allowedApis.includes(normalizedEndpoint);
        
        if (!isAllowed) {
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`, [userKey, endpoint, 403, clientIp, today]);
            return res.json({ 
                error: 'Endpoint not allowed for this key', 
                allowed_apis: allowedApis,
                your_endpoint: endpoint,
                contact: '@BMW_AURA5' 
            });
        }
        
        db.run('UPDATE api_keys SET hits = hits + 1 WHERE id = ?', [keyData.id]);
        db.run(`INSERT INTO daily_calls (api_key, date, calls) VALUES (?, ?, 1) ON CONFLICT(api_key, date) DO UPDATE SET calls = calls + 1`, [userKey, today]);
        
        if (endpoint === 'mistral') {
            const message = req.query.message || req.body.message;
            if (!message) return res.json({ error: 'Message required' });
            const result = await handleMistralAI(message);
            const cleanedResult = cleanResponseData(result);
            return res.json(cleanedResult);
        }
        
        let proxyFn = apiProxyMap[endpoint] || apiProxyMap[normalizedEndpoint];
        
        if (!proxyFn) {
            return res.json({ error: 'Unknown endpoint', contact: '@BMW_AURA5' });
        }
        
        try {
            const targetUrl = proxyFn({ ...req.query, ...req.body });
            const response = await axios.get(targetUrl, { timeout: 30000 });
            let cleanedData = cleanResponseData(response.data);
            cleanedData.unlimited = keyData.unlimited_hits === 1;
            cleanedData.remaining_hits = keyData.max_total_hits > 0 ? keyData.max_total_hits - (keyData.hits + 1) : null;
            
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`, [userKey, endpoint, response.status, clientIp, today]);
            res.json(cleanedData);
        } catch (error) {
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`, [userKey, endpoint, 500, clientIp, today]);
            res.json({ error: 'API request failed', details: error.message, contact: '@BMW_AURA5' });
        }
    });
});

app.get('/api-info', (req, res) => {
    db.all('SELECT name, display_name, endpoint, required_params, example_params, description, level FROM available_apis WHERE is_active = 1 ORDER BY level', [], (err, apis) => {
        res.json({
            owner: '@BMW_AURA5',
            channel: '@OSINT_ERA1',
            total_apis: (apis || []).length,
            levels: {
                level1: (apis || []).filter(a => a.level === '1').length,
                level2: (apis || []).filter(a => a.level === '2').length,
                level3: (apis || []).filter(a => a.level === '3').length,
                level4: (apis || []).filter(a => a.level === '4').length
            },
            apis: apis || []
        });
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), owner: '@BMW_AURA5', channel: '@OSINT_ERA1' });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

cron.schedule('0 0 * * *', () => {
    console.log('🔄 Daily reset running...');
    db.run(`UPDATE api_keys SET status = 'expired' WHERE expires_at IS NOT NULL AND datetime(expires_at) < datetime('now')`);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateStr = sevenDaysAgo.toISOString().split('T')[0];
    db.run(`DELETE FROM rate_limit_tracking WHERE date < ?`, [dateStr]);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('\n🚀 OSINT API HUB RUNNING');
    console.log(`📍 http://localhost:${PORT}`);
    console.log('=====================================');
    console.log('👑 HEAD ADMIN: main / sahil');
    console.log('🔐 NORMAL ADMIN: admin / aura@1234');
    console.log('=====================================');
    console.log('✅ NEW APIs Added:');
    console.log('   - Telegram Lookup: https://bronx-tg-ultra.vercel.app/tg');
    console.log('   - Vehicle to Number: https://vvvin-ng.vercel.app/lookup');
    console.log('✅ Rogers API REMOVED');
    console.log('✅ ONLY @BMW_AURA5 and @OSINT_ERA1 showing');
    console.log('=====================================\n');
});

module.exports = app;
