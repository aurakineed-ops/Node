const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const db = new sqlite3.Database(path.join(__dirname, 'api_keys.db'));

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

  // Insert admin
  const hashedPassword = bcrypt.hashSync('aura@1234', 10);
  db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`, 
    ['superadmin', hashedPassword, 'admin']);

  // Insert all APIs with display names
  const apis = [
    ['telegram', '📞 Telegram Number Lookup', '/api/telegram', 'key,type,term', '{"type":"tg","term":"8489944328"}', 'Get Telegram account details from phone number'],
    ['family', '👨‍👩‍👧‍👦 Family Tree', '/api/family', 'key,term', '{"term":"979607168114"}', 'Family relationship lookup'],
    ['num_india', '🇮🇳 Indian Number Info', '/api/num-india', 'key,num', '{"num":"9876543210"}', 'Indian mobile number details'],
    ['num_pak', '🇵🇰 Pakistani Number', '/api/num-pak', 'key,number', '{"number":"03001234567"}', 'Pakistani mobile number info'],
    ['name_details', '👤 Name to Details', '/api/name-details', 'key,name', '{"name":"abhiraaj"}', 'Get information from name'],
    ['bank_info', '🏦 Bank IFSC Info', '/api/bank', 'key,ifsc', '{"ifsc":"SBIN0001234"}', 'Bank branch details from IFSC code'],
    ['pan_info', '📄 PAN Card Info', '/api/pan', 'key,pan', '{"pan":"AXDPR2606K"}', 'PAN card details verification'],
    ['vehicle_info', '🚗 Vehicle Info', '/api/vehicle', 'key,vehicle', '{"vehicle":"HR26DA1337"}', 'Vehicle registration details'],
    ['rc_info', '📋 RC Details', '/api/rc', 'key,owner', '{"owner":"HR26EV0001"}', 'Registration certificate info'],
    ['ip_info', '🌐 IP Geolocation', '/api/ip', 'key,ip', '{"ip":"8.8.8.8"}', 'IP address location and ISP details'],
    ['pincode_info', '📍 Pincode Info', '/api/pincode', 'key,pin', '{"pin":"110001"}', 'Area details from pincode'],
    ['git_info', '🐙 GitHub User', '/api/git', 'key,username', '{"username":"octocat"}', 'GitHub profile information'],
    ['bgmi_info', '🎮 BGMI Player', '/api/bgmi', 'key,uid', '{"uid":"5121439477"}', 'Battlegrounds Mobile India player stats'],
    ['ff_info', '🔫 FreeFire ID', '/api/ff', 'key,uid', '{"uid":"123456789"}', 'FreeFire player details'],
    ['aadhar_info', '🆔 Aadhar Info', '/api/aadhar', 'key,num', '{"num":"393933081942"}', 'Aadhar card verification'],
    ['ai_image', '🎨 AI Image Gen', '/api/ai-image', 'key,prompt', '{"prompt":"cyberpunk cat"}', 'Generate images using AI'],
    ['insta_info', '📸 Instagram Info', '/api/insta', 'key,username', '{"username":"ankit.vaid"}', 'Instagram profile details']
  ];
  
  apis.forEach(api => {
    db.run(`INSERT OR IGNORE INTO available_apis (name, display_name, endpoint, required_params, example_params, description) VALUES (?, ?, ?, ?, ?, ?)`, api);
  });
});

module.exports = db;