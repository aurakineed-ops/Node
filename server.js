require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();

// ========== MONGO DB CONNECTION ==========
const MONGODB_URI = 'mongodb+srv://aura72665_db_user:j7dz7dJqYLGn40uY@osint.bwbipm8.mongodb.net/?appName=OSINT';
const DB_NAME = 'osint_hub';
let db;
let client;

async function connectDB() {
    try {
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db(DB_NAME);
        console.log('✅ Connected to MongoDB');
        
        // Create collections with indexes
        await db.createCollection('users');
        await db.createCollection('api_keys');
        await db.createCollection('analytics');
        await db.createCollection('api_status');
        await db.createCollection('available_apis');
        
        // Indexes
        await db.collection('api_keys').createIndex({ key: 1 }, { unique: true });
        await db.collection('api_keys').createIndex({ expires_at: 1 });
        await db.collection('users').createIndex({ username: 1 }, { unique: true });
        
        // Create admin user if not exists
        const adminExists = await db.collection('users').findOne({ username: 'superadmin' });
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('aura@1234', 10);
            await db.collection('users').insertOne({
                username: 'superadmin',
                password: hashedPassword,
                role: 'admin',
                created_at: new Date()
            });
            console.log('✅ Admin user created');
        }
        
        // Insert APIs if not exists
        const apiCount = await db.collection('available_apis').countDocuments();
        if (apiCount === 0) {
            const apis = [
                ['telegram', '📞 Telegram Number Lookup', '/api/telegram', 'id', '{"id":"8489944328"}', 'Get Telegram account details'],
                ['email_info', '📧 Email to Info', '/api/email', 'email', '{"email":"test@gmail.com"}', 'Email leak data'],
                ['family', '👨‍👩‍👧‍👦 Family Tree', '/api/family', 'term', '{"term":"979607168114"}', 'Family relationship lookup'],
                ['num_india', '🇮🇳 Indian Number Info', '/api/num-india', 'num', '{"num":"9876543210"}', 'Indian mobile number details'],
                ['num_pak', '🇵🇰 Pakistani Number', '/api/num-pak', 'number', '{"number":"03001234567"}', 'Pakistani mobile number info'],
                ['name_details', '👤 Name to Details', '/api/name-details', 'name', '{"name":"abhiraaj"}', 'Name information'],
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
                ['vehicle_to_num', '🚗 Vehicle to Number', '/api/vehicle-to-num', 'vehicle', '{"vehicle":"UP50P5434"}', 'Get owner number from vehicle']
            ];
            
            for (const api of apis) {
                await db.collection('available_apis').insertOne({
                    name: api[0],
                    display_name: api[1],
                    endpoint: api[2],
                    required_params: api[3],
                    example_params: api[4],
                    description: api[5],
                    is_active: true,
                    created_at: new Date()
                });
            }
            console.log('✅ 20 APIs inserted');
        }
        
    } catch (error) {
        console.error('MongoDB Connection Error:', error);
        process.exit(1);
    }
}

// ========== MASTER API KEYS (All replaced with @BMW_AURA5 branding) ==========
const MASTER_KEYS = {
    subhxco: 'RACKSUN',
    ftosint: 'sahil',
    ayaanmods: 'annonymousai',
    truecallerLeak: 'RATELIMITE-BEIBBkim7bjTAkJIZTIUGPR4FkfNAYoj'
};

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

function requireAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

// ========== API PROXY MAP (Updated with new vehicle-to-number API) ==========
const apiProxyMap = {
    'telegram': (p) => `https://cyber-osint-tg-num.vercel.app/api/tginfo?key=Rogers2&id=${p.id || p.term || p.number}`,
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
    // NEW: Vehicle to Number API
    'vehicle-to-num': (p) => `https://surya-veh-num-xmrewqs.ramaxinfo.workers.dev/?term=${p.vehicle}`
};

// ========== PUBLIC ROUTES ==========
app.get('/', async (req, res) => {
    const totalApis = await db.collection('available_apis').countDocuments();
    const totalKeys = await db.collection('api_keys').countDocuments();
    const hitsResult = await db.collection('api_keys').aggregate([{ $group: { _id: null, total: { $sum: '$hits' } } }]).toArray();
    const totalHits = hitsResult[0]?.total || 0;
    
    res.render('index', { 
        user: req.session.user,
        totalApis: totalApis,
        totalKeys: totalKeys,
        totalHits: totalHits
    });
});

app.get('/endpoints', async (req, res) => {
    const apis = await db.collection('available_apis').find({ is_active: true }).toArray();
    const statusList = await db.collection('api_status').find({}).toArray();
    const statusMap = {};
    statusList.forEach(s => statusMap[s.endpoint_name] = s.is_up);
    
    res.render('endpoints', { 
        apis: apis, 
        baseUrl: req.protocol + '://' + req.get('host'),
        statusMap: statusMap
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
        
        // Strip any external owner names and add @BMW_AURA5
        let cleanData = response.data;
        if (typeof cleanData === 'object') {
            delete cleanData.owner;
            delete cleanData.credit;
            delete cleanData.made_by;
            delete cleanData.developer;
        }
        
        res.json({
            success: true,
            response_time_ms: responseTime,
            status_code: response.status,
            data: cleanData,
            endpoint: endpoint,
            credit: '@BMW_AURA5',
            channel: 'https://t.me/OSINTERA_1'
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message,
            status_code: error.response?.status || 500,
            endpoint: endpoint,
            credit: '@BMW_AURA5'
        });
    }
});

app.get('/docs', async (req, res) => {
    const apis = await db.collection('available_apis').find({ is_active: true }).toArray();
    res.render('docs', { apis: apis, baseUrl: req.protocol + '://' + req.get('host') });
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
    
    const user = await db.collection('users').findOne({ username: username });
    
    if (!user) {
        return res.redirect('/login?error=invalid');
    }
    
    try {
        const match = await bcrypt.compare(password, user.password);
        if (match) {
            req.session.user = { id: user._id.toString(), username: user.username, role: user.role };
            res.redirect('/admin/dashboard');
        } else {
            res.redirect('/login?error=invalid');
        }
    } catch (bcryptError) {
        res.status(500).send('Login error');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// ========== ADMIN ROUTES ==========
app.get('/admin/dashboard', requireAuth, async (req, res) => {
    const keys = await db.collection('api_keys').find({}).sort({ created_at: -1 }).toArray();
    const hitsResult = await db.collection('api_keys').aggregate([{ $group: { _id: null, total: { $sum: '$hits' } } }]).toArray();
    const totalHits = hitsResult[0]?.total || 0;
    const activeKeys = await db.collection('api_keys').countDocuments({ status: 'active' });
    const popular = await db.collection('analytics').aggregate([
        { $group: { _id: '$endpoint', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
    ]).toArray();
    const topUsers = await db.collection('analytics').aggregate([
        { $group: { _id: '$api_key', calls: { $sum: 1 } } },
        { $sort: { calls: -1 } },
        { $limit: 5 }
    ]).toArray();
    const apis = await db.collection('available_apis').find({ is_active: true }).toArray();
    
    res.render('dashboard', { 
        keys: keys, 
        totalHits: totalHits,
        active: activeKeys,
        popular: popular,
        topUsers: topUsers,
        apis: apis,
        user: req.session.user
    });
});

// Generate API Key
app.post('/admin/generate-key', requireAuth, async (req, res) => {
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
    
    let allowedApisJson = ['all'];
    if (allowed_apis && allowed_apis !== 'all') {
        if (Array.isArray(allowed_apis)) {
            allowedApisJson = allowed_apis;
        } else if (typeof allowed_apis === 'string') {
            allowedApisJson = [allowed_apis];
        }
    }
    
    await db.collection('api_keys').insertOne({
        key: apiKey,
        name: name,
        owner_username: owner_username || '@BMW_AURA5',
        owner_channel: owner_channel || 'https://t.me/OSINTERA_1',
        created_at: new Date(),
        expires_at: expires_at,
        hits: 0,
        status: 'active',
        unlimited_hits: unlimited === 'true',
        allowed_apis: allowedApisJson
    });
    
    console.log('✅ Key created:', apiKey, 'Expires:', expires_at);
    res.redirect('/admin/dashboard');
});

app.post('/admin/delete-key', requireAuth, async (req, res) => {
    await db.collection('api_keys').deleteOne({ _id: new ObjectId(req.body.id) });
    res.redirect('/admin/dashboard');
});

app.post('/admin/toggle-status', requireAuth, async (req, res) => {
    const { id, status } = req.body;
    await db.collection('api_keys').updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: status === 'active' ? 'disabled' : 'active' } }
    );
    res.redirect('/admin/dashboard');
});

// ========== API PROXY HANDLER (With @BMW_AURA5 branding) ==========
app.all('/api/:endpoint', limiter, async (req, res) => {
    const userKey = req.query.key || req.body.key;
    const endpoint = req.params.endpoint;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    if (!userKey) {
        return res.json({ error: 'API key required', contact: '@BMW_AURA5', channel: 'https://t.me/OSINTERA_1' });
    }
    
    const keyData = await db.collection('api_keys').findOne({ key: userKey, status: 'active' });
    
    if (!keyData) {
        return res.json({ error: 'Invalid or inactive API key', contact: '@BMW_AURA5' });
    }
    
    // Expiry check
    if (keyData.expires_at) {
        const expiryDate = new Date(keyData.expires_at);
        const currentDate = new Date();
        
        if (expiryDate.getTime() < currentDate.getTime()) {
            await db.collection('api_keys').updateOne(
                { _id: keyData._id },
                { $set: { status: 'expired' } }
            );
            return res.json({ 
                error: `API key expired on ${expiryDate.toLocaleDateString()}`, 
                contact: '@BMW_AURA5' 
            });
        }
    }
    
    // Check allowed APIs
    const allowedApis = keyData.allowed_apis || [];
    if (!allowedApis.includes('all') && allowedApis.length > 0 && !allowedApis.includes(endpoint)) {
        return res.json({ 
            error: `This API endpoint (${endpoint}) is not allowed for your key`,
            allowed_apis: allowedApis,
            contact: '@BMW_AURA5'
        });
    }
    
    // Increment hits
    if (!keyData.unlimited_hits) {
        await db.collection('api_keys').updateOne(
            { _id: keyData._id },
            { $inc: { hits: 1 } }
        );
    }
    
    const proxyFn = apiProxyMap[endpoint];
    if (!proxyFn) {
        return res.json({ error: 'Unknown endpoint', available: Object.keys(apiProxyMap), credit: '@BMW_AURA5' });
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
        
        await db.collection('analytics').insertOne({
            api_key: userKey,
            endpoint: endpoint,
            status_code: response.status,
            ip_address: clientIp,
            request_time: new Date()
        });
        
        // STRIP ALL EXTERNAL NAMES AND ADD @BMW_AURA5 ONLY
        let result = response.data;
        if (typeof result === 'object' && result !== null) {
            // Remove any existing owner/credit fields
            delete result.owner;
            delete result.credit;
            delete result.made_by;
            delete result.developer;
            delete result.created_by;
            delete result.branding;
            delete result.Rogers2id;
            delete result.Rogers;
            
            // Add @BMW_AURA5 branding
            result.credit = '@BMW_AURA5';
            result.channel = 'https://t.me/OSINTERA_1';
        }
        
        res.json(result);
        
    } catch (error) {
        console.error('❌ API Error:', error.message);
        await db.collection('analytics').insertOne({
            api_key: userKey,
            endpoint: endpoint,
            status_code: error.response?.status || 500,
            ip_address: clientIp,
            request_time: new Date()
        });
        
        res.json({ 
            error: 'API request failed', 
            details: error.message,
            status: error.response?.status,
            contact: '@BMW_AURA5',
            channel: 'https://t.me/OSINTERA_1'
        });
    }
});

// ========== CRON JOBS ==========
// Daily expiry check
cron.schedule('0 0 * * *', async () => {
    console.log('🔄 Running daily expiry check...');
    const result = await db.collection('api_keys').updateMany(
        { 
            expires_at: { $lt: new Date() }, 
            status: 'active' 
        },
        { $set: { status: 'expired' } }
    );
    console.log(`✅ Expiry check complete: ${result.modifiedCount} keys marked as expired`);
});

// API health check every 30 minutes
cron.schedule('*/30 * * * *', async () => {
    console.log('📊 Checking API health...');
    for (const [name, fn] of Object.entries(apiProxyMap)) {
        try {
            const start = Date.now();
            await axios.get(fn({ key: 'health_check', type: 'tg', term: 'test' }), { timeout: 5000 });
            const ms = Date.now() - start;
            await db.collection('api_status').updateOne(
                { endpoint_name: name },
                { $set: { is_up: true, last_checked: new Date(), response_ms: ms } },
                { upsert: true }
            );
        } catch(e) {
            await db.collection('api_status').updateOne(
                { endpoint_name: name },
                { $set: { is_up: false, last_checked: new Date(), response_ms: 0 } },
                { upsert: true }
            );
        }
    }
});

// ========== DEBUG ROUTE ==========
app.get('/admin/debug-key/:key', requireAuth, async (req, res) => {
    const key = req.params.key;
    const keyData = await db.collection('api_keys').findOne({ key: key });
    
    if (!keyData) {
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
        is_valid: !isExpired && keyData.status === 'active',
        credit: '@BMW_AURA5'
    });
});

// ========== START SERVER ==========
async function startServer() {
    await connectDB();
    
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log('\n🚀 ========== OSINT API HUB ==========');
        console.log('🔥 Server running on http://localhost:' + PORT);
        console.log('🔐 Admin Login: superadmin / aura@1234');
        console.log('📁 Database: MongoDB (OSINT Hub)');
        console.log('📡 Endpoints: http://localhost:' + PORT + '/endpoints');
        console.log('🧪 Test API: POST /api/test');
        console.log('🆕 New API: /api/vehicle-to-num');
        console.log('🏷️  All responses branded with @BMW_AURA5');
        console.log('=====================================\n');
    });
}

startServer();

module.exports = app;
