require('dotenv').config({ path: './.env' }); 

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

console.log("ກຳລັງເຊື່ອມຕໍ່ດ້ວຍ URI:", process.env.MONGO_URI ? "ພົບແລ້ວ!" : "ບໍ່ພົບ! ກະລຸນາກວດສອບໄຟລ໌ .env");

const app = express();
app.use(cors());
app.use(express.json());

// ເຊື່ອມຕໍ່ MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ ເຊື່ອມຕໍ່ MongoDB ສຳເລັດ!"))
  .catch(err => console.error("❌ ເຊື່ອມຕໍ່ບໍ່ໄດ້:", err));

// ສ້າງ Model
const User = mongoose.model('User', new mongoose.Schema({
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    fullname: String,
    student_id: String
}));

const Attendance = mongoose.model('Attendance', new mongoose.Schema({
    email: String,
    checkin_date: { type: String, default: () => new Date().toISOString().split('T')[0] },
    checkin_time: { type: String, default: () => new Date().toLocaleTimeString('en-GB') }
}));

// API Routes
app.post('/api/auth', async (req, res) => {
    const { email, password, fullname, student_id } = req.body;
    try {
        let user = await User.findOne({ email });
        if (user) {
            res.json({ message: "ເຂົ້າລະບົບສຳເລັດ", user });
        } else {
            user = await User.create({ email, password, fullname, student_id });
            res.status(201).json({ message: "ລົງທະບຽນສຳເລັດ", user });
        }
    } catch (err) { 
        res.status(500).json({ message: err.message }); 
    }
});

app.get('/api/attendance-summary', async (req, res) => {
    try {
        const users = await User.find();
        const today = new Date().toISOString().split('T')[0];
        const attendance = await Attendance.find({ checkin_date: today });
        res.json({ total: users.length, present: attendance.length, absent: users.length - attendance.length });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/attendance-list', async (req, res) => {
    try {
        const users = await User.find();
        const today = new Date().toISOString().split('T')[0];
        const attendance = await Attendance.find({ checkin_date: today });
        const result = users.map(u => {
            const att = attendance.find(a => a.email === u.email);
            return { ...u.toObject(), checkin_time: att ? att.checkin_time : null };
        });
        res.json(result);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/checkin', async (req, res) => {
    const { email } = req.body;
    const today = new Date().toISOString().split('T')[0];
    try {
        const existing = await Attendance.findOne({ email, checkin_date: today });
        if (existing) return res.status(400).json({ message: "ເຈົ້າໄດ້ Check-in ໄປແລ້ວມື້ນີ້" });
        await Attendance.create({ email });
        res.json({ message: "Check-in ສຳເລັດແລ້ວ!" });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));