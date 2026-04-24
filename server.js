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
    rogers: 'Rogers2',
    imei: 'f43f0d0c-27b0-408a-abd0-585fabea6adf',  // IMEI API Key
    impds_key: 'paidchx'  // IMPDS API Key
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
        owner_username TEXT,
        owner_channel TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        hits INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        unlimited_hits BOOLEAN DEFAULT 0,
        allowed_apis TEXT DEFAULT '[]',
        is_custom BOOLEAN DEFAULT 0,
        rate_limit_enabled BOOLEAN DEFAULT 1,
        rate_limit_per_day INTEGER DEFAULT 100,
        rate_limit_per_hour INTEGER DEFAULT 20,
        rate_limit_per_minute INTEGER DEFAULT 5
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

    db.run(`CREATE TABLE IF NOT EXISTS available_apis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        display_name TEXT,
        endpoint TEXT,
        required_params TEXT,
        example_params TEXT,
        description TEXT,
        is_active BOOLEAN DEFAULT 1,
        is_new BOOLEAN DEFAULT 0
    )`);

    // Create head admin
    db.get(`SELECT * FROM users WHERE username = 'main'`, [], (err, row) => {
        if (!row) {
            const headAdminPassword = bcrypt.hashSync('sahil', 10);
            db.run(`INSERT INTO users (username, password, role, created_by) VALUES (?, ?, ?, ?)`, 
                ['main', headAdminPassword, 'head_admin', 'system']);
            console.log('✅ Head admin created');
        }
    });

    // Create super admin
    db.get(`SELECT * FROM users WHERE username = 'superadmin'`, [], (err, row) => {
        if (!row) {
            const superAdminPassword = bcrypt.hashSync('aura@1234', 10);
            db.run(`INSERT INTO users (username, password, role, created_by) VALUES (?, ?, ?, ?)`, 
                ['superadmin', superAdminPassword, 'admin', 'main']);
            console.log('✅ Super admin created');
        }
    });

    // Insert all APIs with NEW APIs highlighted
    db.get(`SELECT COUNT(*) as count FROM available_apis`, [], (err, row) => {
        if (row && row.count === 0) {
            const apis = [
                // ========== EXISTING APIS ==========
                ['telegram', '📞 Telegram Number Lookup', '/api/telegram', 'id', '{"id":"8489944328"}', 'Get Telegram account details', 0],
                ['family', '👨‍👩‍👧‍👦 Family Tree', '/api/family', 'term', '{"term":"979607168114"}', 'Family relationship lookup', 0],
                ['num_india', '🇮🇳 Indian Number Info', '/api/num-india', 'num', '{"num":"9876543210"}', 'Indian mobile number details', 0],
                ['num_pak', '🇵🇰 Pakistani Number', '/api/num-pak', 'number', '{"number":"03001234567"}', 'Pakistani mobile number', 0],
                ['name_details', '👤 Name to Details', '/api/name-details', 'name', '{"name":"abhiraaj"}', 'Name information', 0],
                ['pan_info', '📄 PAN Card Info', '/api/pan', 'pan', '{"pan":"AXDPR2606K"}', 'PAN card details', 0],
                ['vehicle_info', '🚗 Vehicle Info', '/api/vehicle', 'vehicle', '{"vehicle":"HR26DA1337"}', 'Vehicle registration', 0],
                ['ip_info', '🌐 IP Geolocation', '/api/ip', 'ip', '{"ip":"8.8.8.8"}', 'IP address location', 0],
                ['pincode_info', '📍 Pincode Info', '/api/pincode', 'pin', '{"pin":"110001"}', 'Area details', 0],
                ['git_info', '🐙 GitHub User', '/api/git', 'username', '{"username":"octocat"}', 'GitHub profile', 0],
                ['bgmi_info', '🎮 BGMI Player', '/api/bgmi', 'uid', '{"uid":"5121439477"}', 'BGMI player stats', 0],
                ['ff_info', '🔫 FreeFire ID', '/api/ff', 'uid', '{"uid":"123456789"}', 'FreeFire player', 0],
                ['ai_image', '🎨 AI Image Gen', '/api/ai-image', 'prompt', '{"prompt":"cyberpunk cat"}', 'Generate AI images', 0],
                ['insta_info', '📸 Instagram Info', '/api/insta', 'username', '{"username":"ankit.vaid"}', 'Instagram profile', 0],
                ['num_fullinfo', '🔍 Number to Full Info', '/api/num-fullinfo', 'number', '{"number":"918887882236"}', 'Complete phone info', 0],
                ['mistral', '🤖 Mistral AI Chat', '/api/mistral', 'message', '{"message":"What is AI?"}', 'Chat with Mistral AI', 0],
                ['num_newinfo', '📱 Number to New Info', '/api/num-newinfo', 'id', '{"id":"8489944328"}', 'Telegram based number info', 0],
                ['veh_to_num', '🚗 Vehicle to Number', '/api/veh-to-num', 'term', '{"term":"UP50P5434"}', 'Vehicle to mobile number', 0],
                
                // ========== 🆕 4 NEW APIs (HIGHLIGHTED) ==========
                ['ifsc_info', '🏦 IFSC Bank Info', '/api/ifsc', 'ifsc', '{"ifsc":"SBIN0001234"}', 'Get complete bank branch details using IFSC code', 1],
                ['imei_info', '📱 IMEI Device Info', '/api/imei', 'imei', '{"imei":"123456789012345"}', 'Get complete device details from IMEI number', 1],
                ['aadhar_family', '🆔 Aadhar to Family Card', '/api/aadhar-family', 'aadhaar', '{"aadhaar":"123456789012"}', 'Get family ration card details from Aadhaar number', 1],
                ['mail_domain', '📧 Email Domain Intelligence', '/api/mail-domain', 'mail', '{"mail":"user@gmail.com"}', 'Get MX records, WHOIS, SSL, Breach info of email domain', 1]
            ];
            
            apis.forEach(api => {
                db.run(`INSERT INTO available_apis (name, display_name, endpoint, required_params, example_params, description, is_new) VALUES (?, ?, ?, ?, ?, ?, ?)`, api);
            });
            console.log('✅ 22 APIs inserted (4 NEW APIs highlighted: IFSC, IMEI, Aadhar-Family, Mail-Domain)');
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

// ========== RATE LIMIT FUNCTIONS ==========
async function checkRateLimit(apiKey, keyData) {
    if (keyData.unlimited_hits === 1) return { allowed: true, unlimited: true };
    if (keyData.rate_limit_enabled !== 1) return { allowed: true };
    
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
        if (hour !== null) { query += ` AND hour = ?`; params.push(hour); }
        if (minute !== null) { query += ` AND minute = ?`; params.push(minute); }
        db.get(query, params, (err, row) => { resolve(row ? (row.total || 0) : 0); });
    });
}

function incrementCount(apiKey, date, hour, minute) {
    return new Promise((resolve) => {
        const query = `INSERT INTO rate_limit_tracking (api_key, date, hour, minute, requests) VALUES (?, ?, ?, ?, 1)`;
        const params = [apiKey, date, hour !== null ? hour : 0, minute !== null ? minute : 0];
        db.run(query, params, () => resolve());
    });
}

// ========== API PROXY MAP ==========
const apiProxyMap = {
    'telegram': (p) => `https://cyber-osint-tg-num.vercel.app/api/tginfo?key=${MASTER_KEYS.rogers}&id=${p.id || p.term || p.number}`,
    'family': (p) => `https://ayaanmods.site/family.php?key=${MASTER_KEYS.subhxco}&term=${p.term}`,
    'num-india': (p) => `https://ft-osint-api.duckdns.org/api/number?key=${MASTER_KEYS.ftosint}&num=${p.num}`,
    'num-pak': (p) => `https://ft-osint-api.duckdns.org/api/pk?key=${MASTER_KEYS.ftosint}&number=${p.number}`,
    'name-details': (p) => `https://ft-osint-api.duckdns.org/api/name?key=${MASTER_KEYS.ftosint}&name=${p.name}`,
    'pan': (p) => `https://ft-osint-api.duckdns.org/api/pan?key=${MASTER_KEYS.ftosint}&pan=${p.pan}`,
    'vehicle': (p) => `https://ft-osint-api.duckdns.org/api/vehicle?key=${MASTER_KEYS.ftosint}&vehicle=${p.vehicle}`,
    'ip': (p) => `http://ip-api.com/json/${p.ip}`,
    'pincode': (p) => `https://api.postalpincode.in/pincode/${p.pin}`,
    'git': (p) => `https://api.github.com/users/${p.username}`,
    'bgmi': (p) => `https://ft-osint-api.duckdns.org/api/bgmi?key=${MASTER_KEYS.ftosint}&uid=${p.uid}`,
    'ff': (p) => `https://ft-osint-api.duckdns.org/api/ff?key=${MASTER_KEYS.ftosint}&uid=${p.uid}`,
    'ai-image': (p) => `https://ayaanmods.site/aiimage.php?key=${MASTER_KEYS.ayaanmods}&prompt=${p.prompt}`,
    'insta': (p) => `https://ft-osint-api.duckdns.org/api/insta?key=${MASTER_KEYS.ftosint}&username=${p.username}`,
    'num-fullinfo': (p) => `https://say-wallahai-bro-say-wallahi.onrender.com/raavan/v34/query=${p.number}/key=${MASTER_KEYS.truecallerLeak}`,
    'mistral': `mistral-direct`,
    'num-newinfo': (p) => `https://cyber-osint-tg-num.vercel.app/api/tginfo?key=${MASTER_KEYS.rogers}&id=${p.id || p.number || p.term}`,
    'veh-to-num': (p) => `https://surya-veh-num-xmrewqs.ramaxinfo.workers.dev/?term=${p.term || p.vehicle || p.num}`,
    
    // ========== 🆕 NEW APIs ==========
    'ifsc': (p) => `https://ifsc.razorpay.com/${p.ifsc}`,
    'imei': (p) => `https://dash.imei.info/api/check/0/?imei=${p.imei}&API_KEY=${MASTER_KEYS.imei}`,
    'aadhar-family': (p) => p,  // Handled separately
    'mail-domain': (p) => p     // Handled separately
};

// ========== CLEAN RESPONSE ==========
function cleanResponseData(data) {
    if (!data || typeof data !== 'object') return data;
    
    let cleaned = JSON.parse(JSON.stringify(data));
    
    const removeFields = ['Developer', 'DM TO BUY ACCESS', 'owner', 'xtradeep', 'Kon_Hu_Mai', 'channel', 'telegram', 'contact', 'instagram', 'twitter', 'fb', 'facebook', 'website', 'github', 'created_by', 'owner_username', 'owner_channel', 'credit', 'Credits', 'Credit', 'Source', 'source', 'provider', 'Provider'];
    
    function cleanObject(obj) {
        if (!obj || typeof obj !== 'object') return;
        for (let key in obj) {
            if (removeFields.includes(key.toLowerCase()) || removeFields.includes(key)) {
                delete obj[key];
            } else if (typeof obj[key] === 'string') {
                if (obj[key].includes('@') && !obj[key].includes('BMW_AURA5') && !obj[key].includes('OSINT_ERA1')) {
                    delete obj[key];
                }
            } else if (typeof obj[key] === 'object') {
                cleanObject(obj[key]);
            }
        }
    }
    
    cleanObject(cleaned);
    
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
                    totalApis: apisCount?.total_apis || 0,
                    totalKeys: keysCount?.total_keys || 0,
                    totalHits: hitsTotal?.total_hits || 0
                });
            });
        });
    });
});

app.get('/endpoints', (req, res) => {
    db.all('SELECT * FROM available_apis WHERE is_active = 1', [], (err, apis) => {
        const formattedApis = (apis || []).map(api => {
            let params = {};
            try { params = JSON.parse(api.required_params || '{}'); } catch(e) { params = {}; }
            const paramName = Object.keys(params)[0] || 'param';
            
            return {
                ...api,
                param_name: paramName,
                param_example: params[paramName] || 'value',
                full_url: `${api.endpoint}`,
                example_usage: `${api.endpoint}?key=YOUR_API_KEY&${paramName}=${params[paramName] || 'value'}`,
                is_new: api.is_new === 1
            };
        });
        
        const statusMap = {};
        (apis || []).forEach(api => { statusMap[api.name] = true; });
        
        res.render('endpoints', { 
            apis: formattedApis, 
            baseUrl: req.protocol + '://' + req.get('host'), 
            statusMap: statusMap 
        });
    });
});

app.get('/docs', (req, res) => {
    db.all('SELECT * FROM available_apis WHERE is_active = 1', [], (err, apis) => {
        const formattedApis = (apis || []).map(api => {
            let params = {};
            try { params = JSON.parse(api.required_params || '{}'); } catch(e) { params = {}; }
            const paramName = Object.keys(params)[0] || 'param';
            return { 
                ...api, 
                param_name: paramName, 
                param_example: params[paramName] || 'value',
                is_new: api.is_new === 1
            };
        });
        
        const statusMap = {};
        (apis || []).forEach(api => { statusMap[api.name] = true; });
        
        res.render('docs', { 
            apis: formattedApis, 
            baseUrl: req.protocol + '://' + req.get('host'), 
            statusMap: statusMap 
        });
    });
});

app.get('/login', (req, res) => {
    res.render('login', { error: req.query.error || null });
});

// ========== LOGIN ==========
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
                const today = new Date().toISOString().split('T')[0];
                
                db.all('SELECT api_key, SUM(calls) as calls FROM daily_calls WHERE date = ? GROUP BY api_key', [today], (err, todayCallsData) => {
                    const todayCalls = {};
                    if (todayCallsData) {
                        todayCallsData.forEach(item => {
                            todayCalls[item.api_key] = item.calls;
                        });
                    }
                    
                    db.all(`SELECT endpoint, COUNT(*) as count FROM analytics WHERE endpoint IS NOT NULL GROUP BY endpoint ORDER BY count DESC LIMIT 10`, [], (err, popular) => {
                        db.all(`SELECT api_key, SUM(calls) as calls FROM daily_calls GROUP BY api_key ORDER BY calls DESC LIMIT 10`, [], (err, topUsers) => {
                            res.render('head_admin_dashboard', {
                                user: req.session.user,
                                admins: admins || [],
                                keys: keys || [],
                                totalHits: totalHits?.total_hits || 0,
                                popular: popular || [],
                                topUsers: topUsers || [],
                                todayCalls: todayCalls
                            });
                        });
                    });
                });
            });
        });
    });
});

// ========== HEAD ADMIN - CREATE ADMIN ==========
app.post('/head-admin/create-admin', requireHeadAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    
    if (!username || !password) {
        return res.json({ error: 'Username and password required' });
    }
    
    // Check if username already exists
    db.get('SELECT id FROM users WHERE username = ?', [username], async (err, existing) => {
        if (existing) {
            return res.json({ error: 'Username already exists' });
        }
        
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            db.run(`INSERT INTO users (username, password, role, created_by) VALUES (?, ?, ?, ?)`,
                [username, hashedPassword, role || 'admin', req.session.user.username],
                function(err) {
                    if (err) {
                        return res.json({ error: err.message });
                    }
                    res.json({ success: true, message: 'Admin created successfully' });
                });
        } catch (error) {
            res.json({ error: 'Password hashing failed' });
        }
    });
});

// ========== HEAD ADMIN - REMOVE ADMIN ==========
app.post('/head-admin/remove-admin', requireHeadAdmin, (req, res) => {
    const { admin_id } = req.body;
    
    if (!admin_id) {
        return res.json({ error: 'Admin ID required' });
    }
    
    db.run('DELETE FROM users WHERE id = ? AND role != "head_admin"', [admin_id], function(err) {
        if (err) {
            return res.json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.json({ error: 'Admin not found or cannot remove head admin' });
        }
        res.json({ success: true, message: 'Admin removed successfully' });
    });
});

// ========== HEAD ADMIN - UPDATE RATE LIMIT ==========
app.post('/head-admin/update-rate-limit', requireHeadAdmin, (req, res) => {
    const { key_id, unlimited_hits, rate_limit_enabled, rate_limit_per_day, rate_limit_per_hour, rate_limit_per_minute } = req.body;
    
    if (!key_id) {
        return res.json({ error: 'Key ID required' });
    }
    
    const isUnlimited = unlimited_hits === 'true';
    
    db.run(`UPDATE api_keys 
            SET unlimited_hits = ?,
                rate_limit_enabled = ?,
                rate_limit_per_day = ?,
                rate_limit_per_hour = ?,
                rate_limit_per_minute = ?
            WHERE id = ?`,
            [
                isUnlimited ? 1 : 0,
                isUnlimited ? 0 : (rate_limit_enabled === 'true' ? 1 : 0),
                rate_limit_per_day || 100,
                rate_limit_per_hour || 20,
                rate_limit_per_minute || 5,
                key_id
            ],
            function(err) {
                if (err) {
                    return res.json({ error: err.message });
                }
                if (this.changes === 0) {
                    return res.json({ error: 'Key not found' });
                }
                res.json({ success: true, message: 'Rate limit updated successfully' });
            });
});

// ========== HEAD ADMIN - GET ALL KEYS ==========
app.get('/head-admin/keys', requireHeadAdmin, (req, res) => {
    db.all('SELECT * FROM api_keys ORDER BY created_at DESC', [], (err, keys) => {
        if (err) {
            return res.json({ error: err.message });
        }
        res.json({ success: true, keys: keys || [] });
    });
});

// ========== HEAD ADMIN - GET SINGLE KEY ==========
app.get('/head-admin/key/:id', requireHeadAdmin, (req, res) => {
    const { id } = req.params;
    
    db.get('SELECT * FROM api_keys WHERE id = ?', [id], (err, key) => {
        if (err) {
            return res.json({ error: err.message });
        }
        if (!key) {
            return res.json({ error: 'Key not found' });
        }
        res.json({ success: true, key: key });
    });
});

// ========== HEAD ADMIN - DELETE ANY KEY ==========
app.post('/head-admin/delete-key', requireHeadAdmin, (req, res) => {
    const { key_id } = req.body;
    
    if (!key_id) {
        return res.json({ error: 'Key ID required' });
    }
    
    db.run('DELETE FROM api_keys WHERE id = ?', [key_id], function(err) {
        if (err) {
            return res.json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.json({ error: 'Key not found' });
        }
        
        // Also delete related records
        db.run('DELETE FROM daily_calls WHERE api_key = (SELECT key FROM api_keys WHERE id = ?)', [key_id]);
        db.run('DELETE FROM rate_limit_tracking WHERE api_key = (SELECT key FROM api_keys WHERE id = ?)', [key_id]);
        db.run('DELETE FROM analytics WHERE api_key = (SELECT key FROM api_keys WHERE id = ?)', [key_id]);
        
        res.json({ success: true, message: 'Key deleted successfully' });
    });
});

// ========== HEAD ADMIN - TOGGLE KEY STATUS ==========
app.post('/head-admin/toggle-key-status', requireHeadAdmin, (req, res) => {
    const { key_id, status } = req.body;
    
    if (!key_id) {
        return res.json({ error: 'Key ID required' });
    }
    
    const newStatus = status === 'active' ? 'disabled' : 'active';
    
    db.run('UPDATE api_keys SET status = ? WHERE id = ?', [newStatus, key_id], function(err) {
        if (err) {
            return res.json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.json({ error: 'Key not found' });
        }
        res.json({ success: true, message: `Key ${newStatus} successfully` });
    });
});

// ========== HEAD ADMIN - GET ALL ADMINS ==========
app.get('/head-admin/admins', requireHeadAdmin, (req, res) => {
    db.all('SELECT id, username, role, created_by, created_at FROM users WHERE role != "head_admin"', [], (err, admins) => {
        if (err) {
            return res.json({ error: err.message });
        }
        res.json({ success: true, admins: admins || [] });
    });
});

// ========== HEAD ADMIN - GET STATS ==========
app.get('/head-admin/stats', requireHeadAdmin, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastWeekStr = lastWeek.toISOString().split('T')[0];
    
    // Get total stats
    db.get('SELECT COUNT(*) as total_keys, SUM(hits) as total_hits FROM api_keys', [], (err, totalStats) => {
        // Get active keys count
        db.get('SELECT COUNT(*) as active_keys FROM api_keys WHERE status = "active"', [], (err, activeStats) => {
            // Get today's calls
            db.get('SELECT SUM(calls) as today_calls FROM daily_calls WHERE date = ?', [today], (err, todayStats) => {
                // Get last 7 days calls
                db.all('SELECT date, SUM(calls) as calls FROM daily_calls WHERE date >= ? GROUP BY date ORDER BY date', [lastWeekStr], (err, weekStats) => {
                    // Get top 5 APIs
                    db.all(`SELECT endpoint, COUNT(*) as count FROM analytics GROUP BY endpoint ORDER BY count DESC LIMIT 5`, [], (err, topApis) => {
                        res.json({
                            success: true,
                    stats: {
                        total_keys: totalStats?.total_keys || 0,
                        total_hits: totalStats?.total_hits || 0,
                        active_keys: activeStats?.active_keys || 0,
                        today_calls: todayStats?.today_calls || 0
                    },
                    weekly_calls: weekStats || [],
                    top_apis: topApis || []
                        });
                    });
                });
            });
        });
    });
});

// ========== HEAD ADMIN - RESET KEY HITS ==========
app.post('/head-admin/reset-key-hits', requireHeadAdmin, (req, res) => {
    const { key_id } = req.body;
    
    if (!key_id) {
        return res.json({ error: 'Key ID required' });
    }
    
    db.run('UPDATE api_keys SET hits = 0 WHERE id = ?', [key_id], function(err) {
        if (err) {
            return res.json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.json({ error: 'Key not found' });
        }
        res.json({ success: true, message: 'Key hits reset successfully' });
    });
});

// ========== HEAD ADMIN - BULK DELETE EXPIRED KEYS ==========
app.post('/head-admin/delete-expired-keys', requireHeadAdmin, (req, res) => {
    db.run(`DELETE FROM api_keys WHERE expires_at IS NOT NULL AND datetime(expires_at) < datetime('now')`, function(err) {
        if (err) {
            return res.json({ error: err.message });
        }
        res.json({ success: true, message: `${this.changes} expired keys deleted successfully` });
    });
});

// ========== HEAD ADMIN - GET SYSTEM LOGS ==========
app.get('/head-admin/logs', requireHeadAdmin, (req, res) => {
    const { limit = 100, offset = 0 } = req.query;
    
    db.all(`SELECT * FROM analytics ORDER BY date DESC LIMIT ? OFFSET ?`, [parseInt(limit), parseInt(offset)], (err, logs) => {
        if (err) {
            return res.json({ error: err.message });
        }
        db.get('SELECT COUNT(*) as total FROM analytics', [], (err, count) => {
            res.json({
                success: true,
                logs: logs || [],
                total: count?.total || 0,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
        });
    });
});

// ========== HEAD ADMIN - UPDATE API STATUS ==========
app.post('/head-admin/update-api-status', requireHeadAdmin, (req, res) => {
    const { api_name, is_active } = req.body;
    
    if (!api_name) {
        return res.json({ error: 'API name required' });
    }
    
    db.run('UPDATE available_apis SET is_active = ? WHERE name = ?', [is_active === 'true' ? 1 : 0, api_name], function(err) {
        if (err) {
            return res.json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.json({ error: 'API not found' });
        }
        res.json({ success: true, message: `API ${is_active === 'true' ? 'activated' : 'deactivated'} successfully` });
    });
});

// ========== ADMIN DASHBOARD ==========
app.get('/admin/dashboard', requireAuth, (req, res) => {
    if (req.session.user.role === 'head_admin') {
        return res.redirect('/head-admin/dashboard');
    }
    
    db.all('SELECT * FROM api_keys ORDER BY created_at DESC', [], (err, keys) => {
        db.get('SELECT SUM(hits) as total FROM api_keys', [], (err, hits) => {
            db.get('SELECT COUNT(*) as active FROM api_keys WHERE status="active"', [], (err, active) => {
                db.all('SELECT * FROM available_apis WHERE is_active = 1', [], (err, apis) => {
                    const today = new Date().toISOString().split('T')[0];
                    
                    db.all('SELECT api_key, SUM(calls) as calls FROM daily_calls WHERE date = ? GROUP BY api_key', [today], (err, todayCallsData) => {
                        const todayCalls = {};
                        if (todayCallsData) {
                            todayCallsData.forEach(item => {
                                todayCalls[item.api_key] = item.calls;
                            });
                        }
                        
                        db.all(`SELECT endpoint, COUNT(*) as count FROM analytics WHERE endpoint IS NOT NULL GROUP BY endpoint ORDER BY count DESC LIMIT 10`, [], (err, popular) => {
                            db.all(`SELECT api_key, SUM(calls) as calls FROM daily_calls GROUP BY api_key ORDER BY calls DESC LIMIT 10`, [], (err, topUsers) => {
                                const formattedApis = (apis || []).map(api => {
                                    let params = {};
                                    try { params = JSON.parse(api.required_params || '{}'); } catch(e) { params = {}; }
                                    const paramName = Object.keys(params)[0] || 'param';
                                    return { 
                                        ...api, 
                                        param_name: paramName, 
                                        param_example: params[paramName] || 'value',
                                        is_new: api.is_new === 1
                                    };
                                });
                                
                                res.render('dashboard', { 
                                    keys: keys || [], 
                                    totalHits: hits?.total || 0,
                                    active: active?.active || 0,
                                    apis: formattedApis,
                                    popular: popular || [],
                                    topUsers: topUsers || [],
                                    todayCalls: todayCalls,
                                    user: req.session.user,
                                    baseUrl: req.protocol + '://' + req.get('host')
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// ========== ADMIN - GENERATE API KEY ==========
app.post('/admin/generate-key', requireAuth, (req, res) => {
    const { name, expiry, unlimited_hits, allowed_apis, custom_key, enable_custom,
            rate_limit_enabled, rate_limit_per_day, rate_limit_per_hour, rate_limit_per_minute } = req.body;
    
    function createKey(apiKey, isCustom) {
        let expires_at = null;
        const now = new Date();
        
        if (expiry === '7d') expires_at = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
        else if (expiry === '15d') expires_at = new Date(now.getTime() + (15 * 24 * 60 * 60 * 1000));
        else if (expiry === '1m') expires_at = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
        else if (expiry === '1y') expires_at = new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000));
        
        let allowedApisJson = allowed_apis === 'all' ? '["all"]' : JSON.stringify([allowed_apis]);
        const isUnlimited = unlimited_hits === 'true';
        const rateLimitEnabled = isUnlimited ? 0 : (rate_limit_enabled === 'true' ? 1 : 0);
        
        const finalOwner = '@BMW_AURA5';
        const finalChannel = '@OSINT_ERA1';
        
        db.run(`INSERT INTO api_keys (key, name, owner_username, owner_channel, expires_at, unlimited_hits, allowed_apis, status, is_custom,
                rate_limit_enabled, rate_limit_per_day, rate_limit_per_hour, rate_limit_per_minute)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`, 
                [apiKey, name, finalOwner, finalChannel, expires_at, 
                 isUnlimited ? 1 : 0, allowedApisJson, isCustom ? 1 : 0,
                 rateLimitEnabled,
                 isUnlimited ? 0 : (rate_limit_per_day || 100),
                 isUnlimited ? 0 : (rate_limit_per_hour || 20),
                 isUnlimited ? 0 : (rate_limit_per_minute || 5)], 
                function(err) {
                    if (err) {
                        return res.status(500).send('Error: ' + err.message);
                    }
                    res.redirect('/admin/dashboard');
                });
    }
    
    if (enable_custom === 'true' && custom_key && custom_key.trim() !== '') {
        let apiKey = custom_key.trim();
        if (apiKey.includes(' ') || apiKey.length < 5) return res.status(400).send('Invalid custom key');
        db.get('SELECT key FROM api_keys WHERE key = ?', [apiKey], (err, existing) => {
            if (existing) return res.status(400).send('Key already exists');
            createKey(apiKey, true);
        });
    } else {
        let apiKey = 'OSINT_' + Math.random().toString(36).substring(2, 18).toUpperCase();
        createKey(apiKey, false);
    }
});

// ========== ADMIN - DELETE KEY ==========
app.post('/admin/delete-key', requireAuth, (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).send('Key ID required');
    
    db.run('DELETE FROM api_keys WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).send('Error: ' + err.message);
        res.redirect('/admin/dashboard');
    });
});

// ========== ADMIN - TOGGLE KEY STATUS ==========
app.post('/admin/toggle-status', requireAuth, (req, res) => {
    const { id, status } = req.body;
    const newStatus = status === 'active' ? 'disabled' : 'active';
    
    db.run('UPDATE api_keys SET status = ? WHERE id = ?', [newStatus, id], function(err) {
        if (err) return res.status(500).send('Error: ' + err.message);
        res.redirect('/admin/dashboard');
    });
});

// ========== MISTRAL AI HANDLER ==========
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

// ========== EMAIL DOMAIN INFO HANDLER ==========
async function getMailDomainInfo(mail) {
    try {
        const domain = mail.split('@')[1];
        
        let mxRecords = [];
        try {
            const response = await axios.get(`https://dns.google/resolve?name=${domain}&type=MX`);
            if (response.data.Answer) {
                mxRecords = response.data.Answer.map(r => r.data);
            }
        } catch(e) { mxRecords = ['Unable to fetch']; }
        
        let breaches = [];
        try {
            const breachResponse = await axios.get(`https://haveibeenpwned.com/api/v3/breachedaccount/${mail}`);
            if (breachResponse.data) breaches = breachResponse.data.map(b => b.Name);
        } catch(e) { breaches = []; }
        
        return {
            email: mail,
            domain: domain,
            mx_records: mxRecords,
            breaches_found: breaches,
            is_disposable: domain.includes('tempmail') || domain.includes('10minutemail') || domain.includes('yopmail'),
            owner: '@BMW_AURA5',
            channel: '@OSINT_ERA1'
        };
    } catch (error) {
        return { error: error.message };
    }
}

// ========== MAIN API HANDLER ==========
app.all('/api/:endpoint', globalLimiter, async (req, res) => {
    const userKey = req.query.key || req.body.key;
    const endpoint = req.params.endpoint;
    const today = new Date().toISOString().split('T')[0];
    const clientIp = req.ip || req.connection.remoteAddress;
    
    if (!userKey) {
        return res.json({ error: 'API key required', contact: '@BMW_AURA5' });
    }
    
    db.get('SELECT * FROM api_keys WHERE key = ? AND status = "active"', [userKey], async (err, keyData) => {
        if (err || !keyData) {
            return res.json({ error: 'Invalid API key', contact: '@BMW_AURA5' });
        }
        
        const rateCheck = await checkRateLimit(userKey, keyData);
        if (!rateCheck.allowed) {
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                [userKey, endpoint, 429, clientIp, today]);
            return res.json({ error: rateCheck.reason, contact: '@BMW_AURA5' });
        }
        
        if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
            db.run('UPDATE api_keys SET status = "expired" WHERE id = ?', [keyData.id]);
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                [userKey, endpoint, 403, clientIp, today]);
            return res.json({ error: 'Key expired', contact: '@BMW_AURA5' });
        }
        
        let allowedApis = [];
        try { allowedApis = JSON.parse(keyData.allowed_apis || '[]'); } catch(e) { allowedApis = []; }
        if (!allowedApis.includes('all') && allowedApis.length > 0 && !allowedApis.includes(endpoint)) {
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                [userKey, endpoint, 403, clientIp, today]);
            return res.json({ error: 'Endpoint not allowed for this key' });
        }
        
        db.run('UPDATE api_keys SET hits = hits + 1 WHERE id = ?', [keyData.id]);
        db.run(`INSERT INTO daily_calls (api_key, date, calls) VALUES (?, ?, 1) 
                ON CONFLICT(api_key, date) DO UPDATE SET calls = calls + 1`, [userKey, today]);
        
        // ========== MISTRAL AI ==========
        if (endpoint === 'mistral') {
            const message = req.query.message || req.body.message;
            if (!message) {
                db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                    [userKey, endpoint, 400, clientIp, today]);
                return res.json({ error: 'Message required' });
            }
            const result = await handleMistralAI(message);
            const cleanedResult = cleanResponseData(result);
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                [userKey, endpoint, result.success ? 200 : 500, clientIp, today]);
            return res.json(cleanedResult);
        }
        
        // ========== IFSC API ==========
        if (endpoint === 'ifsc') {
            const ifsc = req.query.ifsc || req.body.ifsc;
            if (!ifsc) {
                db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                    [userKey, endpoint, 400, clientIp, today]);
                return res.json({ error: 'IFSC code required' });
            }
            try {
                const response = await axios.get(`https://ifsc.razorpay.com/${ifsc.toUpperCase()}`);
                const cleanedData = cleanResponseData(response.data);
                cleanedData.unlimited = keyData.unlimited_hits === 1;
                db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                    [userKey, endpoint, 200, clientIp, today]);
                return res.json(cleanedData);
            } catch (error) {
                db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                    [userKey, endpoint, 404, clientIp, today]);
                return res.json({ error: 'Invalid IFSC code or not found' });
            }
        }
        
        // ========== IMEI API ==========
        if (endpoint === 'imei') {
            const imei = req.query.imei || req.body.imei;
            if (!imei || imei.length < 14 || imei.length > 16) {
                db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                    [userKey, endpoint, 400, clientIp, today]);
                return res.json({ error: 'Valid IMEI required (14-16 digits)' });
            }
            try {
                const response = await axios.get(`https://dash.imei.info/api/check/0/?imei=${imei}&API_KEY=${MASTER_KEYS.imei}`, {
                    headers: { 'User-Agent': 'okhttp/4.9.2', 'Accept-Encoding': 'gzip' },
                    timeout: 25000
                });
                const cleanedData = cleanResponseData(response.data);
                cleanedData.unlimited = keyData.unlimited_hits === 1;
                db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                    [userKey, endpoint, 200, clientIp, today]);
                return res.json(cleanedData);
            } catch (error) {
                db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                    [userKey, endpoint, 500, clientIp, today]);
                return res.json({ error: 'IMEI lookup failed', details: error.message });
            }
        }
        
        // ========== MAIL DOMAIN API ==========
        if (endpoint === 'mail-domain') {
            const mail = req.query.mail || req.body.mail;
            if (!mail || !mail.includes('@')) {
                db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                    [userKey, endpoint, 400, clientIp, today]);
                return res.json({ error: 'Valid email address required' });
            }
            const result = await getMailDomainInfo(mail);
            const cleanedResult = cleanResponseData(result);
            cleanedResult.unlimited = keyData.unlimited_hits === 1;
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                [userKey, endpoint, 200, clientIp, today]);
            return res.json(cleanedResult);
        }
        
        // ========== PROXY FOR OTHER APIS ==========
        const proxyFn = apiProxyMap[endpoint];
        if (!proxyFn) {
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                [userKey, endpoint, 404, clientIp, today]);
            return res.json({ error: 'Unknown endpoint' });
        }
        
        try {
            let targetUrl;
            if (typeof proxyFn === 'function') {
                targetUrl = proxyFn({ ...req.query, ...req.body });
            } else {
                targetUrl = proxyFn;
            }
            
            if (typeof targetUrl === 'string' && targetUrl.startsWith('http')) {
                const response = await axios.get(targetUrl, { timeout: 30000 });
                let cleanedData = cleanResponseData(response.data);
                cleanedData.unlimited = keyData.unlimited_hits === 1;
                
                db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                    [userKey, endpoint, response.status, clientIp, today]);
                return res.json(cleanedData);
            } else if (typeof targetUrl === 'object') {
                const cleanedData = cleanResponseData(targetUrl);
                return res.json(cleanedData);
            } else {
                return res.json({ error: 'Invalid endpoint configuration' });
            }
        } catch (error) {
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                [userKey, endpoint, 500, clientIp, today]);
            return res.json({ error: 'API request failed', details: error.message, contact: '@BMW_AURA5' });
        }
    });
});

// ========== API INFO ENDPOINT ==========
app.get('/api-info', (req, res) => {
    db.all('SELECT name, display_name, endpoint, required_params, example_params, description, is_new FROM available_apis WHERE is_active = 1', [], (err, apis) => {
        res.json({
            owner: '@BMW_AURA5',
            channel: '@OSINT_ERA1',
            total_apis: (apis || []).length,
            new_apis: (apis || []).filter(api => api.is_new === 1).length,
            apis: apis || []
        });
    });
});

// ========== HEALTH CHECK ==========
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== ERROR HANDLING MIDDLEWARE ==========
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// ========== CRON JOBS ==========
cron.schedule('0 0 * * *', () => {
    console.log('🔄 Daily reset running...');
    db.run(`UPDATE api_keys SET status = 'expired' WHERE expires_at IS NOT NULL AND datetime(expires_at) < datetime('now')`);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateStr = sevenDaysAgo.toISOString().split('T')[0];
    db.run(`DELETE FROM rate_limit_tracking WHERE date < ?`, [dateStr]);
    console.log('✅ Daily cleanup completed');
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('\n🚀 OSINT API HUB RUNNING');
    console.log(`📍 http://localhost:${PORT}`);
    console.log('👑 Head Admin: main / sahil');
    console.log('🔐 Admin: superadmin / aura@1234');
    console.log('\n📡 AVAILABLE API ENDPOINTS:');
    console.log('   GET /api/telegram?id=number');
    console.log('   GET /api/ifsc?ifsc=SBIN0001234');
    console.log('   GET /api/imei?imei=123456789012345');
    console.log('   GET /api/mail-domain?mail=user@gmail.com');
    console.log('   GET /api/ip?ip=8.8.8.8');
    console.log('   GET /api/mistral?message=Hello');
    console.log('   GET /api/num-india?num=9876543210');
    console.log('   GET /api/pan?pan=AXDPR2606K');
    console.log('   GET /api/vehicle?vehicle=HR26DA1337');
    console.log('   GET /api/insta?username=ankit.vaid');
    console.log('\n🆕 4 NEW APIs Added:');
    console.log('   🏦 IFSC Bank Info');
    console.log('   📱 IMEI Device Info');
    console.log('   📧 Email Domain Intelligence');
    console.log('   🆔 Aadhar to Family Card (Coming Soon)');
    console.log('\n✅ ONLY @BMW_AURA5 and @OSINT_ERA1 showing');
    console.log('=====================================\n');
});

module.exports = app;