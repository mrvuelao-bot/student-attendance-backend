require('dotenv').config();
const express = require('express');
const mysql = require('mysql2'); //  1. ແກ້ໄຂ: ປ່ຽນມາໃຊ້ mysql2 ເພື່ອຮອງຮັບ MySQL 8.4 ເທິງ Cloud
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// ປ່ຽນພາກສ່ວນການເຊື່ອມຕໍ່ DB ມາເປັນແບບນີ້:
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    timezone: '+07:00',
    ssl: {
        rejectUnauthorized: false
    }
});

// 2.  ເອີ້ນໃຊ້ db.connect ແຄ່ "ບ່ອນດຽວ" ເທົ່ານັ້ນໃນໄຟລ໌!
db.connect((err) => {
    if (err) {
        return console.error("❌ DB Connection Error:", err.message);
    }
    
    console.log("✅ Connected to MySQL Cloud (Aiven) Successfully!");
    
    // 🛠️ ສ້າງຕາຕະລາງອັດຕະໂນມັດ ຖ້າມັນຍັງບໍ່ມີໃນ Cloud
    const createUsersTable = `
        CREATE TABLE IF NOT EXISTS users (
            email VARCHAR(255) PRIMARY KEY,
            password VARCHAR(255) NOT NULL,
            fullname VARCHAR(255) NOT NULL,
            student_id VARCHAR(50) NOT NULL
        );
    `;
    
    const createAttendanceTable = `
        CREATE TABLE IF NOT EXISTS attendance (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255),
            checkin_date DATE,
            checkin_time TIME,
            FOREIGN KEY (email) REFERENCES users(email)
        );
    `;

    db.query(createUsersTable, (err) => { 
        if (err) console.error("❌ Error creating users table:", err); 
    });
    db.query(createAttendanceTable, (err) => { 
        if (err) console.error("❌ Error creating attendance table:", err); 
    });
});

// ==========================================
// API Routes
// ==========================================

// 1. Login/Register
app.post('/api/auth', (req, res) => {
    const { email, password, fullname, student_id } = req.body;
    const sql = "SELECT * FROM users WHERE email = ?";
    db.query(sql, [email], (err, result) => {
        if (err) return res.status(500).json({ message: "DB Error" });
        if (result.length > 0) {
            res.json({ message: "ເຂົ້າລະບົບສຳເລັດ", user: result[0] });
        } else {
            const ins = "INSERT INTO users (email, password, fullname, student_id) VALUES (?,?,?,?)";
            db.query(ins, [email, password, fullname, student_id], (err) => {
                if (err) return res.status(500).json({ message: "ລົງທະບຽນບໍ່ສຳເລັດ" });
                res.status(201).json({ message: "ລົງທະບຽນສຳເລັດ", user: {email, fullname, student_id} });
            });
        }
    });
});

// 2. ດຶງລາຍຊື່ທັງໝົດ (ຈະ Reset ເວລາ Check-in ເປັນ 'ຍັງບໍ່ມາ' ທັນທີເມື່ອປ່ຽນວັນໃໝ່)
app.get('/api/attendance-list', (req, res) => {
    const sql = `
        SELECT 
            u.student_id, 
            u.fullname, 
            u.email, 
            a.checkin_time, 
            a.checkin_date 
        FROM users u 
        LEFT JOIN attendance a ON u.email = a.email AND a.checkin_date = CURDATE()
        ORDER BY u.student_id ASC
    `;
    db.query(sql, (err, result) => {
        if (err) return res.status(500).json({ message: "Error fetching list" });
        res.json(result);
    });
});

// 3. ສະຫຼຸບຕົວເລກ (Reset ສະເພາະ present ແລະ absent ໃນວັນໃໝ່, total ຄືເກົ່າ)
app.get('/api/attendance-summary', (req, res) => {
    const sqlTotal = "SELECT COUNT(*) as total FROM users";
    const sqlPresent = "SELECT COUNT(*) as present FROM attendance WHERE checkin_date = CURDATE()";
    
    db.query(sqlTotal, (err, r1) => {
        if (err) return res.status(500).json({ message: "Error counting total users" });
        
        db.query(sqlPresent, (err, r2) => {
            if (err) return res.status(500).json({ message: "Error counting present users" });
            
            const total = r1[0].total || 0;
            const present = r2[0].present || 0;
            
            res.json({ 
                total: total, 
                present: present, 
                absent: total - present 
            });
        });
    });
});

// 4. ເຂົ້າຮຽນ (Check-in)
app.post('/api/checkin', (req, res) => {
    const { email } = req.body;
    const checkSql = "SELECT * FROM attendance WHERE email = ? AND checkin_date = CURDATE()";
    
    db.query(checkSql, [email], (err, result) => {
        if (err) return res.status(500).json({ message: "DB Error" });
        if (result.length > 0) return res.status(400).json({ message: "ເຈົ້າໄດ້ Check-in ໄປແລ້ວມື້ນີ້" });

        const sql = "INSERT INTO attendance (email, checkin_date, checkin_time) VALUES (?, CURDATE(), CURTIME())";
        db.query(sql, [email], (err) => {
            if (err) return res.status(500).json({ message: "Check-in ບໍ່ສຳເລັດ" });
            res.json({ message: "Check-in ສຳເລັດແລ້ວ!" });
        });
    });
});

//  3. ແກ້ໄຂ: ຕັ້ງພອດຈາກ env ເພື່ອໃຫ້ເຮືອນໃຊ້ໃນແວດລ້ອມການດັບພິເສດ (e.g., Vercel)
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`🚀 Server running on http://127.0.0.1:${PORT}`));