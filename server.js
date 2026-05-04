import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

dotenv.config();

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "*";
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

if (!DATABASE_URL) process.exit(console.error("DATABASE_URL is required."));
if (!JWT_SECRET) process.exit(console.error("JWT_SECRET is required."));

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const query = async (text, params = []) => pool.query(text, params);

app.use(helmet());
app.use(cors({ origin: CLIENT_URL === "*" ? true : CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(morgan("dev"));

const initializeDatabase = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'student')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS students (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      class_name TEXT NOT NULL,
      gender TEXT DEFAULT 'Not specified',
      age INTEGER,
      genotype TEXT DEFAULT 'Not specified',
      parent_name TEXT DEFAULT 'Not specified',
      parent_phone TEXT DEFAULT 'Not specified',
      home_address TEXT DEFAULT 'Not specified',
      term TEXT DEFAULT 'Not specified',
      subjects TEXT[] DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE students ADD COLUMN IF NOT EXISTS age INTEGER;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS genotype TEXT DEFAULT 'Not specified';
    ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_phone TEXT DEFAULT 'Not specified';
    ALTER TABLE students ADD COLUMN IF NOT EXISTS home_address TEXT DEFAULT 'Not specified';

    CREATE TABLE IF NOT EXISTS staff (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      class_handled TEXT DEFAULT 'Not assigned',
      gender TEXT DEFAULT 'Not specified',
      subjects TEXT[] DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS grades (
      id BIGSERIAL PRIMARY KEY,
      student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      score NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
      grade TEXT NOT NULL,
      term TEXT DEFAULT 'Not specified',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fee_items (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      class_name TEXT NOT NULL,
      term TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
      session TEXT DEFAULT '2025/2026',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fee_payments (
      id BIGSERIAL PRIMARY KEY,
      student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
      fee_item_id BIGINT REFERENCES fee_items(id) ON DELETE SET NULL,
      amount_paid NUMERIC(12,2) NOT NULL CHECK (amount_paid >= 0),
      payment_method TEXT DEFAULT 'Cash',
      reference TEXT,
      payment_date DATE DEFAULT CURRENT_DATE,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      audience TEXT DEFAULT 'All',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      sender TEXT NOT NULL,
      recipient TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      type TEXT DEFAULT 'email',
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'queued',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
};

const parseSubjects = (subjects) => Array.isArray(subjects) ? subjects : String(subjects || "").split(",").map((s) => s.trim()).filter(Boolean);
const calculateGrade = (score) => Number(score) >= 70 ? "A" : Number(score) >= 60 ? "B" : Number(score) >= 50 ? "C" : Number(score) >= 45 ? "D" : Number(score) >= 40 ? "E" : "F";
const signToken = (user) => jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: "7d" });

const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, message: "Authentication token required." });
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await query("SELECT id, name, email, role, created_at FROM users WHERE id = $1", [decoded.id]);
    if (!result.rowCount) return res.status(401).json({ success: false, message: "User no longer exists." });
    req.user = result.rows[0];
    next();
  } catch {
    res.status(401).json({ success: false, message: "Invalid or expired token." });
  }
};
const requireAdmin = (req, res, next) => req.user?.role === "admin" ? next() : res.status(403).json({ success: false, message: "Admin access required." });

app.get("/", (req, res) => res.json({ message: "School Management Portal API is running", status: "success" }));
app.get("/api/health", async (req, res) => {
  try { await query("SELECT 1"); res.status(200).json({ status: "healthy", service: "school-backend-api", database: "connected", auth: "enabled", timestamp: new Date().toISOString() }); }
  catch (error) { res.status(200).json({ status: "degraded", database: "disconnected", message: error.message }); }
});
app.get("/api/db-health", async (req, res) => {
  try { await query("SELECT 1"); res.json({ success: true, database: "connected", timestamp: new Date().toISOString() }); }
  catch (error) { res.status(500).json({ success: false, database: "disconnected", message: error.message }); }
});

app.post("/api/auth/register-admin", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success: false, message: "Name, email, and password are required." });
    if (password.length < 8) return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });
    const count = await query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'");
    if (count.rows[0].count > 0) return res.status(403).json({ success: false, message: "Admin account already exists. Use login instead." });
    const hash = await bcrypt.hash(password, 12);
    const result = await query("INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin') RETURNING id, name, email, role, created_at", [name, email.toLowerCase(), hash]);
    const user = result.rows[0];
    res.status(201).json({ success: true, message: "Admin registered successfully.", token: signToken(user), user });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ success: false, message: "Email already exists." });
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: "Email and password are required." });
    const result = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    if (!result.rowCount) return res.status(401).json({ success: false, message: "Invalid login details." });
    const record = result.rows[0];
    const valid = await bcrypt.compare(password, record.password_hash);
    if (!valid) return res.status(401).json({ success: false, message: "Invalid login details." });
    const user = { id: record.id, name: record.name, email: record.email, role: record.role, created_at: record.created_at };
    res.json({ success: true, message: "Login successful.", token: signToken(user), user });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});
app.get("/api/auth/me", requireAuth, (req, res) => res.json({ success: true, user: req.user }));

app.get("/api/summary", async (req, res) => {
  try {
    const tables = ["students", "staff", "grades", "announcements", "messages", "notifications", "fee_items", "fee_payments"];
    const counts = await Promise.all(tables.map((t) => query(`SELECT COUNT(*)::int AS count FROM ${t}`)));
    res.json({ success: true, data: Object.fromEntries(tables.map((t, i) => [t, counts[i].rows[0].count])) });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get("/api/students", async (req, res) => {
  try { const r = await query("SELECT * FROM students ORDER BY created_at DESC"); res.json({ success: true, count: r.rowCount, data: r.rows }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});
app.post("/api/students", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, email, className, gender, age, genotype, parentName, parentPhone, homeAddress, term, subjects } = req.body;
    if (!name || !email || !className) return res.status(400).json({ success: false, message: "Name, email, and className are required." });
    const r = await query(`INSERT INTO students (name, email, class_name, gender, age, genotype, parent_name, parent_phone, home_address, term, subjects) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [name, email.toLowerCase(), className, gender || "Not specified", age ? Number(age) : null, genotype || "Not specified", parentName || "Not specified", parentPhone || "Not specified", homeAddress || "Not specified", term || "Not specified", parseSubjects(subjects)]);
    res.status(201).json({ success: true, message: "Student created successfully.", data: r.rows[0] });
  } catch (error) { if (error.code === "23505") return res.status(409).json({ success: false, message: "Student email already exists." }); res.status(500).json({ success: false, message: error.message }); }
});

app.get("/api/staff", async (req, res) => {
  try { const r = await query("SELECT * FROM staff ORDER BY created_at DESC"); res.json({ success: true, count: r.rowCount, data: r.rows }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});
app.post("/api/staff", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, email, role, classHandled, gender, subjects } = req.body;
    if (!name || !email || !role) return res.status(400).json({ success: false, message: "Name, email, and role are required." });
    const r = await query("INSERT INTO staff (name, email, role, class_handled, gender, subjects) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", [name, email.toLowerCase(), role, classHandled || "Not assigned", gender || "Not specified", parseSubjects(subjects)]);
    res.status(201).json({ success: true, message: "Staff member created successfully.", data: r.rows[0] });
  } catch (error) { if (error.code === "23505") return res.status(409).json({ success: false, message: "Staff email already exists." }); res.status(500).json({ success: false, message: error.message }); }
});

app.get("/api/grades", async (req, res) => {
  try { const r = await query("SELECT grades.*, students.name AS student_name FROM grades LEFT JOIN students ON students.id = grades.student_id ORDER BY grades.created_at DESC"); res.json({ success: true, count: r.rowCount, data: r.rows }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});
app.post("/api/grades", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { studentId, subject, score, term } = req.body;
    if (!studentId || !subject || score === undefined) return res.status(400).json({ success: false, message: "studentId, subject, and score are required." });
    const numeric = Number(score); const grade = calculateGrade(numeric);
    const r = await query("INSERT INTO grades (student_id, subject, score, grade, term) VALUES ($1,$2,$3,$4,$5) RETURNING *", [Number(studentId), subject, numeric, grade, term || "Not specified"]);
    await query("INSERT INTO notifications (type, recipient, subject, message, status) VALUES ($1,$2,$3,$4,$5)", ["email", "parent@example.com", `New ${subject} grade uploaded`, `A score of ${numeric} has been uploaded for student #${studentId}.`, "queued"]);
    res.status(201).json({ success: true, message: "Grade uploaded successfully.", data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get("/api/results", async (req, res) => {
  try {
    const r = await query(`SELECT students.id AS student_id, students.name, students.class_name, students.term, COUNT(grades.id)::int AS subjects_count, COALESCE(AVG(grades.score),0)::numeric(5,2) AS average_score FROM students LEFT JOIN grades ON grades.student_id = students.id GROUP BY students.id ORDER BY students.created_at DESC`);
    res.json({ success: true, count: r.rowCount, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});
app.get("/api/results/:studentId", async (req, res) => {
  try {
    const s = await query("SELECT * FROM students WHERE id=$1", [req.params.studentId]);
    if (!s.rowCount) return res.status(404).json({ success: false, message: "Student not found." });
    const g = await query("SELECT * FROM grades WHERE student_id=$1 ORDER BY subject ASC", [req.params.studentId]);
    const total = g.rows.reduce((sum, item) => sum + Number(item.score), 0);
    const average = g.rowCount ? Number((total / g.rowCount).toFixed(2)) : 0;
    res.json({ success: true, data: { student: s.rows[0], grades: g.rows, total, average, subjects_count: g.rowCount } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get("/api/fees", async (req, res) => {
  try { const r = await query("SELECT * FROM fee_items ORDER BY created_at DESC"); res.json({ success: true, count: r.rowCount, data: r.rows }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});
app.post("/api/fees", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, className, term, amount, session } = req.body;
    if (!title || !className || !term || amount === undefined) return res.status(400).json({ success: false, message: "Title, class, term, and amount are required." });
    const r = await query("INSERT INTO fee_items (title, class_name, term, amount, session) VALUES ($1,$2,$3,$4,$5) RETURNING *", [title, className, term, Number(amount), session || "2025/2026"]);
    res.status(201).json({ success: true, message: "School fee created successfully.", data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get("/api/payments", async (req, res) => {
  try {
    const r = await query(`SELECT fee_payments.*, students.name AS student_name, students.class_name, fee_items.title AS fee_title, fee_items.amount AS fee_amount FROM fee_payments LEFT JOIN students ON students.id=fee_payments.student_id LEFT JOIN fee_items ON fee_items.id=fee_payments.fee_item_id ORDER BY fee_payments.created_at DESC`);
    res.json({ success: true, count: r.rowCount, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});
app.post("/api/payments", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { studentId, feeItemId, amountPaid, paymentMethod, reference, note } = req.body;
    if (!studentId || !feeItemId || amountPaid === undefined) return res.status(400).json({ success: false, message: "Student, fee item, and amount paid are required." });
    const r = await query("INSERT INTO fee_payments (student_id, fee_item_id, amount_paid, payment_method, reference, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", [Number(studentId), Number(feeItemId), Number(amountPaid), paymentMethod || "Cash", reference || null, note || null]);
    res.status(201).json({ success: true, message: "Payment recorded successfully.", data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});
app.get("/api/fee-balances", async (req, res) => {
  try {
    const r = await query(`SELECT students.id AS student_id, students.name AS student_name, students.class_name, fee_items.id AS fee_item_id, fee_items.title, fee_items.term, fee_items.amount AS expected_amount, COALESCE(SUM(fee_payments.amount_paid),0) AS paid_amount, (fee_items.amount - COALESCE(SUM(fee_payments.amount_paid),0)) AS balance FROM students JOIN fee_items ON fee_items.class_name = students.class_name LEFT JOIN fee_payments ON fee_payments.student_id = students.id AND fee_payments.fee_item_id = fee_items.id GROUP BY students.id, fee_items.id ORDER BY students.name ASC`);
    res.json({ success: true, count: r.rowCount, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get("/api/announcements", async (req, res) => { try { const r = await query("SELECT * FROM announcements ORDER BY created_at DESC"); res.json({ success: true, count: r.rowCount, data: r.rows }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });
app.post("/api/announcements", requireAuth, requireAdmin, async (req, res) => { try { const { title, message, audience } = req.body; if (!title || !message) return res.status(400).json({ success: false, message: "Title and message are required." }); const r = await query("INSERT INTO announcements (title,message,audience) VALUES ($1,$2,$3) RETURNING *", [title, message, audience || "All"]); res.status(201).json({ success: true, message: "Announcement published successfully.", data: r.rows[0] }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });
app.get("/api/messages", async (req, res) => { try { const r = await query("SELECT * FROM messages ORDER BY created_at DESC"); res.json({ success: true, count: r.rowCount, data: r.rows }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });
app.post("/api/messages", requireAuth, async (req, res) => { try { const { to, message } = req.body; if (!to || !message) return res.status(400).json({ success: false, message: "To and message are required." }); const r = await query("INSERT INTO messages (sender,recipient,message) VALUES ($1,$2,$3) RETURNING *", [req.user.name, to, message]); res.status(201).json({ success: true, message: "Message sent successfully.", data: r.rows[0] }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });
app.get("/api/notifications", requireAuth, requireAdmin, async (req, res) => { try { const r = await query("SELECT * FROM notifications ORDER BY created_at DESC"); res.json({ success: true, count: r.rowCount, data: r.rows }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });
app.post("/api/notifications", requireAuth, requireAdmin, async (req, res) => { try { const { recipient, subject, message } = req.body; if (!recipient || !subject || !message) return res.status(400).json({ success: false, message: "Recipient, subject, and message are required." }); const r = await query("INSERT INTO notifications (type, recipient, subject, message, status) VALUES ($1,$2,$3,$4,$5) RETURNING *", ["email", recipient, subject, message, "queued"]); res.status(201).json({ success: true, message: "Email notification queued successfully.", data: r.rows[0] }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });

app.use((req, res) => res.status(404).json({ success: false, message: "Route not found." }));

const startServer = async () => {
  try {
    await initializeDatabase();
    console.log("Database tables are ready.");
    app.listen(PORT, () => console.log(`School backend API running on port ${PORT}`));
  } catch (error) {
    console.error("Database initialization failed:", error.message);
    process.exit(1);
  }
};
startServer();
