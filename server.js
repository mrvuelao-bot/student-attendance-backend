require('dotenv').config(); // ຕ້ອງຢູ່ເທິງສຸດ
const express = require('express');
const mysql = require('mysql2'); // ໃຊ້ mysql2 ເພື່ອຮອງຮັບ MySQL 8+
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ຕັ້ງຄ່າການເຊື່ອມຕໍ່ Database
const databaseUrl = process.env.DATABASE_URL || process.env.DB_URL;
let dbHost = process.env.DB_HOST;
let dbPort = process.env.DB_PORT || 21137;
let dbName = process.env.DB_NAME;
let dbUser = process.env.DB_USER;
let dbPass = process.env.DB_PASS;
let dbSslMode = process.env.DB_SSL_MODE || 'DISABLED';

if (databaseUrl) {
    try {
        const parsed = new URL(databaseUrl);
        dbHost = parsed.hostname || dbHost;
        dbPort = parsed.port || dbPort;
        dbUser = parsed.username || dbUser;
        dbPass = parsed.password || dbPass;
        dbName = parsed.pathname?.slice(1) || dbName;
        const sslParam = parsed.searchParams.get('ssl-mode');
        if (sslParam) dbSslMode = sslParam.toUpperCase();
    } catch (error) {
        console.error('❌ Invalid DATABASE_URL:', error.message);
    }
}

console.log('⛓️ DB config:', {
    host: dbHost,
    port: dbPort,
    database: dbName,
    user: dbUser,
    sslMode: dbSslMode,
    urlUsed: Boolean(databaseUrl)
});

const dbOptions = {
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPass,
    database: dbName,
    connectTimeout: 30000 // ເພີ່ມເວລາລໍຖ້າ 30 ວິນາທີ
};

if (dbSslMode.toUpperCase() === 'REQUIRED') {
    dbOptions.ssl = { rejectUnauthorized: false };
}

const db = mysql.createConnection(dbOptions);

// ເປີດການເຊື່ອມຕໍ່
db.connect((err) => {
    if (err) {
        console.error("❌ DB Connection Error:", err.message);
        return;
    }
    console.log("✅ Connected to MySQL Cloud (Aiven) Successfully!");
    
    // ສ້າງຕາຕະລາງ
    const createUsersTable = `CREATE TABLE IF NOT EXISTS users (email VARCHAR(255) PRIMARY KEY, password VARCHAR(255) NOT NULL, fullname VARCHAR(255) NOT NULL, student_id VARCHAR(50) NOT NULL);`;
    const createAttendanceTable = `CREATE TABLE IF NOT EXISTS attendance (id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(255), checkin_date DATE, checkin_time TIME, FOREIGN KEY (email) REFERENCES users(email));`;

    db.query(createUsersTable, (err) => { if (err) console.error("Error creating users table:", err); });
    db.query(createAttendanceTable, (err) => { if (err) console.error("Error creating attendance table:", err); });
});

// API Routes
app.post('/api/auth', (req, res) => {
    const { email, password, fullname, student_id } = req.body;
    db.query("SELECT * FROM users WHERE email = ?", [email], (err, result) => {
        if (err) return res.status(500).json({ message: "DB Error" });
        if (result.length > 0) {
            res.json({ message: "ເຂົ້າລະບົບສຳເລັດ", user: result[0] });
        } else {
            db.query("INSERT INTO users (email, password, fullname, student_id) VALUES (?,?,?,?)", [email, password, fullname, student_id], (err) => {
                if (err) return res.status(500).json({ message: "ລົງທະບຽນບໍ່ສຳເລັດ" });
                res.status(201).json({ message: "ລົງທະບຽນສຳເລັດ" });
            });
        }
    });
});

app.get('/api/attendance-list', (req, res) => {
    const sql = `SELECT u.student_id, u.fullname, u.email, a.checkin_time, a.checkin_date FROM users u LEFT JOIN attendance a ON u.email = a.email AND a.checkin_date = CURDATE() ORDER BY u.student_id ASC`;
    db.query(sql, (err, result) => {
        if (err) return res.status(500).json({ message: "Error fetching list" });
        res.json(result);
    });
});

app.get('/api/attendance-summary', (req, res) => {
    const summarySql = `SELECT
        COUNT(u.email) AS total,
        SUM(CASE WHEN a.email IS NOT NULL THEN 1 ELSE 0 END) AS present
        FROM users u
        LEFT JOIN attendance a ON u.email = a.email AND a.checkin_date = CURDATE()`;
    db.query(summarySql, (err, result) => {
        if (err) return res.status(500).json({ message: "Error fetching summary" });
        const row = result[0] || { total: 0, present: 0 };
        res.json({
            total: row.total,
            present: row.present || 0,
            absent: row.total - (row.present || 0)
        });
    });
});

app.post('/api/checkin', (req, res) => {
    const { email } = req.body;
    db.query("SELECT * FROM attendance WHERE email = ? AND checkin_date = CURDATE()", [email], (err, result) => {
        if (err) return res.status(500).json({ message: "DB Error" });
        if (result.length > 0) return res.status(400).json({ message: "ເຈົ້າໄດ້ Check-in ໄປແລ້ວມື້ນີ້" });

        db.query("INSERT INTO attendance (email, checkin_date, checkin_time) VALUES (?, CURDATE(), CURTIME())", [email], (err) => {
            if (err) return res.status(500).json({ message: "Check-in ບໍ່ສຳເລັດ" });
            res.json({ message: "Check-in ສຳເລັດແລ້ວ!" });
        });
    });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));