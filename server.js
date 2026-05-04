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

// ========== MASTER API KEYS ==========
const MASTER_KEYS = {
    subhxco: 'RACKSUN',
    ftosint: 'sahil-newww',
    ayaanmods: 'annonymousai',
    truecallerLeak: 'RATELIMITE-BEIBBkim7bjTAkJIZTIUGPR4FkfNAYoj',
    mistral: 'FVKec5Xqa2ORzSoBrqi21nRbIM6rFk2q',
    bronx_tg_key: 'BRONXop'
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

    // Insert ALL APIs (UPDATED with Search Anything name)
    db.get(`SELECT COUNT(*) as count FROM available_apis`, [], (err, row) => {
        if (row && row.count === 0) {
            const apis = [
                ['telegram', '📞 Telegram Number Lookup', '/api/telegram', 'id', '{"id":"7530266953"}', 'Get Telegram account details and linked number', '1'],
                ['aadhar_info', '🆔 Aadhar Details', '/api/aadhar', 'num', '{"num":"652507323571"}', 'Aadhar to personal details (Name, Mobile, Address)', '1'],
                ['family', '👨‍👩‍👧‍👦 Family Details', '/api/family', 'term', '{"term":"701984830542"}', 'Family relationship lookup from Aadhaar', '1'],
                ['num_india', '🇮🇳 Indian Number Info', '/api/num-india', 'num', '{"num":"9876543210"}', 'Indian mobile number details', '1'],
                ['num_pak', '🇵🇰 Pakistani Number', '/api/num-pak', 'number', '{"number":"03001234567"}', 'Pakistani mobile number lookup', '1'],
                ['name_details', '👤 Name to Details', '/api/name-details', 'name', '{"name":"abhiraaj"}', 'Name information search', '1'],
                ['bank_info', '🏦 Bank IFSC Info', '/api/bank', 'ifsc', '{"ifsc":"SBIN0001234"}', 'Bank branch details from IFSC', '1'],
                ['pan_info', '📄 PAN Card Info', '/api/pan', 'pan', '{"pan":"AXDPR2606K"}', 'PAN card details validation', '1'],
                ['vehicle_info', '🚗 Vehicle Full Info', '/api/vehicle', 'vehicle', '{"vehicle":"UP50P5434"}', 'Complete vehicle registration details', '1'],
                ['rc_info', '📋 RC Details', '/api/rc', 'owner', '{"owner":"HR26EV0001"}', 'Registration certificate information', '1'],
                ['ip_info', '🌐 IP Geolocation', '/api/ip', 'ip', '{"ip":"8.8.8.8"}', 'IP address location', '1'],
                ['pincode_info', '📍 Pincode Info', '/api/pincode', 'pin', '{"pin":"110001"}', 'Area details from pincode', '1'],
                ['git_info', '🐙 GitHub User', '/api/git', 'username', '{"username":"octocat"}', 'GitHub profile information', '1'],
                ['bgmi_info', '🎮 BGMI Player', '/api/bgmi', 'uid', '{"uid":"5121439477"}', 'BGMI player stats', '1'],
                ['ff_info', '🔫 FreeFire ID', '/api/ff', 'uid', '{"uid":"123456789"}', 'FreeFire player information', '1'],
                ['ai_image', '🎨 AI Image Gen', '/api/ai-image', 'prompt', '{"prompt":"cyberpunk cat"}', 'Generate AI images', '1'],
                ['insta_info', '📸 Instagram Info', '/api/insta', 'username', '{"username":"ankit.vaid"}', 'Instagram profile scraper', '1'],
                ['mistral', '🤖 Mistral AI Chat', '/api/mistral', 'message', '{"message":"What is AI?"}', 'Chat with Mistral AI', '1'],
                ['aadhaar_family', '👨‍👩‍👧‍👦 Aadhaar Family Extended', '/api/aadhaar-family', 'id', '{"id":"701984830542"}', 'Complete family details from Aadhaar', '3'],
                ['website_scraper', '🌐 Website Scraper', '/api/website-scraper', 'url', '{"url":"https://example.com"}', 'Extract data from websites', '4'],
                ['ip_advanced', '🌍 IP Advanced', '/api/ip-advanced', 'ip', '{"ip":"8.8.8.8"}', 'Advanced IP geolocation with ISP data', '1'],
                ['pincode_advanced', '📍 Pincode Advanced', '/api/pincode-advanced', 'pin', '{"pin":"110001"}', 'Complete post office details from pincode', '1'],
                ['country_info', '🏳️ Country Info', '/api/country-info', 'country', '{"country":"india"}', 'Full country information, flag, currency, language', '1'],
                ['search', '🔍 Search Anything', '/api/search', 'q', '{"q":"era"}', 'Search anything anonymously (DuckDuckGo)', '1'],
                ['ai_image_pro', '🎨 AI Image Pro (StarNest)', '/api/ai-image-pro', 'prompt', '{"prompt":"beautiful sunset"}', 'Advanced AI image generation', '2']
            ];
            
            apis.forEach(api => {
                db.run(`INSERT INTO available_apis (name, display_name, endpoint, required_params, example_params, description, level) VALUES (?, ?, ?, ?, ?, ?, ?)`, api);
            });
            console.log('✅ APIs inserted (Search Anything name added)');
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
    handler: (req, res) => res.json({ error: 'Rate limit exceeded', contact: '@bmw_aura5' })
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

// ========== API PROXY MAP (UPDATED) ==========
const apiProxyMap = {
    'telegram': (p) => `http://Api.subhxcosmo.in/api?key=RACK2&type=tg&term=${p.id || p.term || p.number}`,
    'aadhar_info': (p) => `https://ayush-multi-api.vercel.app/api/adhar?term=${p.num || p.id}`,
    'family': (p) => `https://aadhar-2-ration.noobgamingv40.workers.dev/api/aadhaar?id=${p.term || p.id}`,
    'num_india': (p) => `https://ft-osint-api.duckdns.org/api/number?key=${MASTER_KEYS.ftosint}&num=${p.num}`,
    'num_pak': (p) => `https://ft-osint-api.duckdns.org/api/pk?key=${MASTER_KEYS.ftosint}&number=${p.number}`,
    'name_details': (p) => `https://ft-osint-api.duckdns.org/api/name?key=${MASTER_KEYS.ftosint}&name=${p.name}`,
    'bank_info': (p) => `https://ft-osint-api.duckdns.org/api/ifsc?key=${MASTER_KEYS.ftosint}&ifsc=${p.ifsc}`,
    'pan_info': (p) => `https://ft-osint-api.duckdns.org/api/pan?key=${MASTER_KEYS.ftosint}&pan=${p.pan}`,
    'vehicle_info': (p) => `https://vvvin-ng.vercel.app/lookup?rc=${p.vehicle || p.rc || p.term}`,
    'rc_info': (p) => `https://ft-osint-api.duckdns.org/api/rc?key=${MASTER_KEYS.ftosint}&owner=${p.owner}`,
    'ip_info': (p) => `https://ft-osint-api.duckdns.org/api/ip?key=${MASTER_KEYS.ftosint}&ip=${p.ip}`,
    'pincode_info': (p) => `https://ft-osint-api.duckdns.org/api/pincode?key=${MASTER_KEYS.ftosint}&pin=${p.pin}`,
    'git_info': (p) => `https://ft-osint-api.duckdns.org/api/git?key=${MASTER_KEYS.ftosint}&username=${p.username}`,
    'bgmi_info': (p) => `https://ft-osint-api.duckdns.org/api/bgmi?key=${MASTER_KEYS.ftosint}&uid=${p.uid}`,
    'ff_info': (p) => `https://ft-osint-api.duckdns.org/api/ff?key=${MASTER_KEYS.ftosint}&uid=${p.uid}`,
    'ai_image': (p) => `https://ayaanmods.site/aiimage.php?key=${MASTER_KEYS.ayaanmods}&prompt=${p.prompt}`,
    'insta_info': (p) => `https://ft-osint-api.duckdns.org/api/insta?key=${MASTER_KEYS.ftosint}&username=${p.username}`,
    'mistral': `mistral-direct`,
    'aadhaar_family': (p) => `https://aadhar-2-ration.noobgamingv40.workers.dev/api/aadhaar?id=${p.id || p.term}`,
    'website_scraper': (p) => {
        let url = p.url;
        if (!url.startsWith('http')) url = 'https://' + url;
        return `https://rohit-website-scrapper-api.vercel.app/zip?url=${encodeURIComponent(url)}`;
    },
    'ip_advanced': (p) => `https://ipinfo.io/${p.ip || p.query}/json`,
    'pincode_advanced': (p) => `https://api.postalpincode.in/pincode/${p.pin || p.pincode}`,
    'country_info': (p) => `https://restcountries.com/v3.1/name/${p.country || p.name}`,
    'search': (p) => `https://api.duckduckgo.com/?q=${encodeURIComponent(p.q || p.query)}&format=json&no_html=1&skip_disambig=1`,
    'ai_image_pro': async (p) => {
        // StarNest AI - POST request with headers
        const response = await axios.post('https://api-aichat.starnestsolution.com/generate', 
            { prompt: p.prompt, debug: false },
            {
                headers: {
                    'KID': '36ccfe00-78fc-4cab-9c5b-5460b0c78513',
                    'DEVICE-ID': '7d601cf424a93c3c',
                    'PACKAGE-ID': 'starnest.aichat.aichatbot.assistant',
                    'VALIDITY': '90',
                    'Content-Type': 'application/json'
                },
                timeout: 60000
            }
        );
        return response.data;
    }
};

// ========== FIXED RESPONSE CLEANER (YOUR CREDIT ONLY) ==========
function cleanResponseData(data, endpoint = null) {
    if (!data || typeof data !== 'object') {
        return data || {};
    }
    
    try {
        let cleaned = JSON.parse(JSON.stringify(data));
        
        const removeFields = [
            'Developer', 'DM TO BUY ACCESS', 'owner', 'xtradeep', 'Kon_Hu_Mai', 'channel', 
            'telegram', 'contact', 'instagram', 'twitter', 'fb', 'facebook', 'website', 
            'github', 'created_by', 'owner_username', 'owner_channel', 'credit', 'Credits', 
            'Credit', 'Source', 'source', 'provider', 'Provider', 'api_source', 'API_Source',
            'bot_token', 'admin_id', 'admin_password', 'tech_api', 'family_api_key',
            'credit', 'developer', 'method', 'query_time_ms', 'resolved_id', 'noobgamingv40',
            'bronx_tg_key', 'BRONXop', 'RACK2', 'RACKSUN', 'email_info', 'vehicle_owner_number',
            'techvishalboss', 'TVB_FULL', 'lookup.php', 'status', 'message', 'error',
            'by', '@ftgamer2', '@InvalidAyush', 'RATELIMITE-BEIBBkim7bjTAkJIZTIUGPR4FkfNAYoj'
        ];
        
        function cleanObject(obj) {
            if (!obj || typeof obj !== 'object') return;
            
            for (let key in obj) {
                if (obj.hasOwnProperty(key)) {
                    if (removeFields.includes(key) || removeFields.includes(key.toLowerCase())) {
                        delete obj[key];
                    } 
                    else if (typeof obj[key] === 'string') {
                        if (obj[key] && obj[key].includes('@') && !obj[key].includes('bmw_aura5') && !obj[key].includes('OSINTNXERA')) {
                            delete obj[key];
                        }
                        if (obj[key].includes('techvishalboss') || obj[key].includes('TVB_FULL') || obj[key].includes('InvalidAyush')) {
                            delete obj[key];
                        }
                    }
                    else if (typeof obj[key] === 'object') {
                        cleanObject(obj[key]);
                        if (obj[key] && Object.keys(obj[key]).length === 0) {
                            delete obj[key];
                        }
                    }
                }
            }
        }
        
        cleanObject(cleaned);
        cleaned.owner = '@bmw_aura5';
        cleaned.channel = 'https://t.me/OSINTNXERA';
        return cleaned;
        
    } catch (error) {
        console.error('Clean error:', error);
        return {
            owner: '@bmw_aura5',
            channel: 'https://t.me/OSINTNXERA',
            data: data
        };
    }
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
        res.render('endpoints', { 
            apis: apis || [], 
            baseUrl: req.protocol + '://' + req.get('host'),
            statusMap: {}
        });
    });
});

app.get('/docs', (req, res) => {
    db.all('SELECT * FROM available_apis WHERE is_active = 1 ORDER BY level, name', [], (err, apis) => {
        res.render('docs', { 
            apis: apis || [], 
            baseUrl: req.protocol + '://' + req.get('host'),
            statusMap: {}
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

// ========== GENERATE API KEY (FIXED SELECT ALL) ==========
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
            } 
            else if (typeof allowed_apis === 'string') {
                if (allowed_apis === 'all' || allowed_apis === 'on') {
                    allowedApisJson = '["all"]';
                } else {
                    allowedApisJson = JSON.stringify([allowed_apis]);
                }
            }
        } else {
            allowedApisJson = '["all"]';
        }
        
        const isUnlimited = limit_type === 'unlimited';
        const totalHitsLimit = (!isUnlimited && max_total_hits) ? parseInt(max_total_hits) : 0;
        const dailyLimitValue = daily_limit ? parseInt(daily_limit) : 0;
        const rateLimitEnabled = isUnlimited ? 0 : 1;
        const rateLimitPerDay = dailyLimitValue > 0 ? dailyLimitValue : (isUnlimited ? 0 : 100);
        
        const finalOwner = '@bmw_aura5';
        const finalChannel = 'https://t.me/OSINTNXERA';
        
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

// ========== MAIN API HANDLER (FIXED SELECT ALL) ==========
app.all('/api/:endpoint', globalLimiter, async (req, res) => {
    const userKey = req.query.key || req.body.key;
    let endpoint = req.params.endpoint;
    const today = new Date().toISOString().split('T')[0];
    const clientIp = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
    
    if (!userKey) {
        return res.json({ error: 'API key required', contact: '@bmw_aura5' });
    }
    
    const normalizedEndpoint = endpoint.replace(/-/g, '_');
    
    db.get('SELECT * FROM api_keys WHERE key = ? AND status = "active"', [userKey], async (err, keyData) => {
        if (err || !keyData) {
            return res.json({ error: 'Invalid API key', contact: '@bmw_aura5' });
        }
        
        if (!checkIpWhitelist(keyData.ip_whitelist, clientIp)) {
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`, [userKey, endpoint, 403, clientIp, today]);
            return res.json({ error: 'IP not whitelisted', contact: '@bmw_aura5' });
        }
        
        if (keyData.max_total_hits > 0 && keyData.hits >= keyData.max_total_hits) {
            db.run('UPDATE api_keys SET status = "expired" WHERE id = ?', [keyData.id]);
            return res.json({ error: 'Key expired (total hits limit reached)', contact: '@bmw_aura5' });
        }
        
        const rateCheck = await checkRateLimit(userKey, keyData);
        if (!rateCheck.allowed) {
            return res.json({ error: rateCheck.reason, contact: '@bmw_aura5' });
        }
        
        if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
            db.run('UPDATE api_keys SET status = "expired" WHERE id = ?', [keyData.id]);
            return res.json({ error: 'Key expired', contact: '@bmw_aura5' });
        }
        
        let allowedApis = [];
        try { 
            allowedApis = JSON.parse(keyData.allowed_apis || '["all"]'); 
        } catch(e) { 
            allowedApis = ['all']; 
        }
        
        // FIX: Flexible endpoint matching
        const isAllowed = allowedApis.includes('all') || 
                          allowedApis.includes(endpoint) || 
                          allowedApis.includes(normalizedEndpoint) ||
                          allowedApis.includes(endpoint + '_info') ||
                          allowedApis.includes(endpoint.replace(/_info$/, ''));
        
        if (!isAllowed) {
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`, [userKey, endpoint, 403, clientIp, today]);
            return res.json({ 
                error: 'Endpoint not allowed for this key', 
                allowed_apis: allowedApis,
                your_endpoint: endpoint,
                contact: '@bmw_aura5' 
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
            return res.json({ error: 'Unknown endpoint', contact: '@bmw_aura5' });
        }
        
        try {
            let responseData;
            if (endpoint === 'ai_image_pro') {
                // Special handling for POST request
                responseData = await proxyFn({ ...req.query, ...req.body });
            } else {
                const targetUrl = proxyFn({ ...req.query, ...req.body });
                const response = await axios.get(targetUrl, { timeout: 30000 });
                responseData = response.data;
            }
            
            let cleanedData = cleanResponseData(responseData);
            cleanedData.unlimited = keyData.unlimited_hits === 1;
            cleanedData.remaining_hits = keyData.max_total_hits > 0 ? keyData.max_total_hits - (keyData.hits + 1) : null;
            
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`, [userKey, endpoint, 200, clientIp, today]);
            res.json(cleanedData);
        } catch (error) {
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`, [userKey, endpoint, 500, clientIp, today]);
            res.json({ error: 'API request failed', details: error.message, contact: '@bmw_aura5' });
        }
    });
});

app.get('/api-info', (req, res) => {
    db.all('SELECT name, display_name, endpoint, required_params, example_params, description, level FROM available_apis WHERE is_active = 1 ORDER BY level', [], (err, apis) => {
        res.json({
            owner: '@bmw_aura5',
            channel: 'https://t.me/OSINTNXERA',
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
    res.json({ status: 'ok', timestamp: new Date().toISOString(), owner: '@bmw_aura5', channel: 'https://t.me/OSINTNXERA' });
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
    console.log('✅ Select All bug FIXED (ip vs ip_info)');
    console.log('✅ Search Anything (DuckDuckGo) added');
    console.log('✅ StarNest AI Image Pro added');
    console.log('✅ Credit: @bmw_aura5');
    console.log('=====================================\n');
});

module.exports = app;
