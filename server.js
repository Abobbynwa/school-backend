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

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const query = async (text, params = []) => pool.query(text, params);

app.use(helmet());
app.use(cors({ origin: CLIENT_URL === "*" ? true : CLIENT_URL, credentials: true }));
app.use(express.json({ limit: "10mb" }));
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
      admission_number TEXT UNIQUE,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      class_name TEXT NOT NULL,
      gender TEXT DEFAULT 'Not specified',
      age INTEGER,
      genotype TEXT DEFAULT 'Not specified',
      parent_name TEXT DEFAULT 'Not specified',
      parent_phone TEXT DEFAULT 'Not specified',
      parent_email TEXT,
      emergency_contact TEXT,
      home_address TEXT DEFAULT 'Not specified',
      term TEXT DEFAULT 'Not specified',
      subjects TEXT[] DEFAULT '{}',
      passport_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE students ADD COLUMN IF NOT EXISTS admission_number TEXT UNIQUE;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS age INTEGER;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS genotype TEXT DEFAULT 'Not specified';
    ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_phone TEXT DEFAULT 'Not specified';
    ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_email TEXT;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS home_address TEXT DEFAULT 'Not specified';
    ALTER TABLE students ADD COLUMN IF NOT EXISTS passport_url TEXT;

    CREATE TABLE IF NOT EXISTS staff (
      id BIGSERIAL PRIMARY KEY,
      staff_id TEXT UNIQUE,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      class_handled TEXT DEFAULT 'Not assigned',
      gender TEXT DEFAULT 'Not specified',
      phone TEXT,
      department TEXT,
      qualification TEXT,
      home_address TEXT,
      subjects TEXT[] DEFAULT '{}',
      photo_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE staff ADD COLUMN IF NOT EXISTS staff_id TEXT UNIQUE;
    ALTER TABLE staff ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE staff ADD COLUMN IF NOT EXISTS department TEXT;
    ALTER TABLE staff ADD COLUMN IF NOT EXISTS qualification TEXT;
    ALTER TABLE staff ADD COLUMN IF NOT EXISTS home_address TEXT;
    ALTER TABLE staff ADD COLUMN IF NOT EXISTS photo_url TEXT;

    CREATE TABLE IF NOT EXISTS grades (
      id BIGSERIAL PRIMARY KEY,
      student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      score NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
      grade TEXT NOT NULL,
      term TEXT DEFAULT 'Not specified',
      report_card_url TEXT,
      uploaded_by TEXT DEFAULT 'Admin',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE grades ADD COLUMN IF NOT EXISTS report_card_url TEXT;
    ALTER TABLE grades ADD COLUMN IF NOT EXISTS uploaded_by TEXT DEFAULT 'Admin';

    CREATE TABLE IF NOT EXISTS fee_items (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      class_name TEXT NOT NULL,
      term TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
      session TEXT DEFAULT '2025/2026',
      due_date DATE,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE fee_items ADD COLUMN IF NOT EXISTS due_date DATE;
    ALTER TABLE fee_items ADD COLUMN IF NOT EXISTS note TEXT;

    CREATE TABLE IF NOT EXISTS fee_payments (
      id BIGSERIAL PRIMARY KEY,
      student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
      fee_item_id BIGINT REFERENCES fee_items(id) ON DELETE SET NULL,
      amount_paid NUMERIC(12,2) NOT NULL CHECK (amount_paid >= 0),
      payment_method TEXT DEFAULT 'Cash',
      reference TEXT,
      receipt_url TEXT,
      payment_date DATE DEFAULT CURRENT_DATE,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS receipt_url TEXT;

    CREATE TABLE IF NOT EXISTS admissions (
      id BIGSERIAL PRIMARY KEY,
      student_name TEXT NOT NULL,
      class_applying TEXT NOT NULL,
      gender TEXT DEFAULT 'Not specified',
      age INTEGER,
      genotype TEXT DEFAULT 'Not specified',
      previous_school TEXT,
      parent_name TEXT NOT NULL,
      parent_phone TEXT NOT NULL,
      parent_email TEXT,
      home_address TEXT,
      passport_url TEXT,
      note TEXT,
      status TEXT DEFAULT 'Pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      class_name TEXT NOT NULL,
      subject TEXT NOT NULL,
      instructions TEXT NOT NULL,
      due_date DATE,
      attachment_url TEXT,
      created_by TEXT NOT NULL,
      created_by_email TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
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

const parseSubjects = (subjects) =>
  Array.isArray(subjects)
    ? subjects
    : String(subjects || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

const calculateGrade = (score) =>
  Number(score) >= 70
    ? "A"
    : Number(score) >= 60
    ? "B"
    : Number(score) >= 50
    ? "C"
    : Number(score) >= 45
    ? "D"
    : Number(score) >= 40
    ? "E"
    : "F";

const signToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token required.",
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const result = await query(
      "SELECT id, name, email, role, created_at FROM users WHERE id = $1",
      [decoded.id]
    );

    if (!result.rowCount) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists.",
      });
    }

    req.user = result.rows[0];
    next();
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};

const requireAdmin = (req, res, next) =>
  req.user?.role === "admin"
    ? next()
    : res.status(403).json({
        success: false,
        message: "Admin access required.",
      });

const requireStaffOrAdmin = (req, res, next) =>
  ["admin", "staff"].includes(req.user?.role)
    ? next()
    : res.status(403).json({
        success: false,
        message: "Staff or admin access required.",
      });

const getStaffProfileByEmail = async (email) => {
  const staff = await query("SELECT * FROM staff WHERE email=$1", [email.toLowerCase()]);
  return staff.rows[0] || null;
};

app.get("/", (req, res) =>
  res.json({
    message: "School Management Portal API is running",
    status: "success",
  })
);

app.get("/api/health", async (req, res) => {
  try {
    await query("SELECT 1");
    res.status(200).json({
      status: "healthy",
      service: "school-backend-api",
      database: "connected",
      auth: "enabled",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(200).json({
      status: "degraded",
      database: "disconnected",
      message: error.message,
    });
  }
});

app.get("/api/db-health", async (req, res) => {
  try {
    await query("SELECT 1");
    res.json({
      success: true,
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      database: "disconnected",
      message: error.message,
    });
  }
});

app.post("/api/auth/register-admin", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters.",
      });
    }

    const count = await query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'");

    if (count.rows[0].count > 0) {
      return res.status(403).json({
        success: false,
        message: "Admin account already exists. Use login instead.",
      });
    }

    const hash = await bcrypt.hash(password, 12);

    const result = await query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin') RETURNING id, name, email, role, created_at",
      [name, email.toLowerCase(), hash]
    );

    const user = result.rows[0];

    res.status(201).json({
      success: true,
      message: "Admin registered successfully.",
      token: signToken(user),
      user,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Email already exists.",
      });
    }

    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const result = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);

    if (!result.rowCount) {
      return res.status(401).json({
        success: false,
        message: "Invalid login details.",
      });
    }

    const record = result.rows[0];
    const valid = await bcrypt.compare(password, record.password_hash);

    if (!valid) {
      return res.status(401).json({
        success: false,
        message: "Invalid login details.",
      });
    }

    const user = {
      id: record.id,
      name: record.name,
      email: record.email,
      role: record.role,
      created_at: record.created_at,
    };

    res.json({
      success: true,
      message: "Login successful.",
      token: signToken(user),
      user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/auth/me", requireAuth, (req, res) =>
  res.json({
    success: true,
    user: req.user,
  })
);

app.get("/api/summary", async (req, res) => {
  try {
    const tables = [
      "students",
      "staff",
      "grades",
      "announcements",
      "messages",
      "notifications",
      "fee_items",
      "fee_payments",
      "admissions",
      "assignments",
    ];

    const counts = await Promise.all(
      tables.map((t) => query(`SELECT COUNT(*)::int AS count FROM ${t}`))
    );

    res.json({
      success: true,
      data: Object.fromEntries(tables.map((t, i) => [t, counts[i].rows[0].count])),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/students", async (req, res) => {
  try {
    const r = await query("SELECT * FROM students ORDER BY class_name ASC, name ASC");
    res.json({ success: true, count: r.rowCount, data: r.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/students", requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      admissionNumber,
      name,
      email,
      className,
      gender,
      age,
      genotype,
      parentName,
      parentPhone,
      parentEmail,
      emergencyContact,
      homeAddress,
      term,
      subjects,
      passportUrl,
    } = req.body;

    if (!name || !email || !className) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and className are required.",
      });
    }

    const r = await query(
      `INSERT INTO students (
        admission_number,
        name,
        email,
        class_name,
        gender,
        age,
        genotype,
        parent_name,
        parent_phone,
        parent_email,
        emergency_contact,
        home_address,
        term,
        subjects,
        passport_url
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *`,
      [
        admissionNumber || null,
        name,
        email.toLowerCase(),
        className,
        gender || "Not specified",
        age ? Number(age) : null,
        genotype || "Not specified",
        parentName || "Not specified",
        parentPhone || "Not specified",
        parentEmail || null,
        emergencyContact || null,
        homeAddress || "Not specified",
        term || "Not specified",
        parseSubjects(subjects),
        passportUrl || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Student created successfully.",
      data: r.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Student email or admission number already exists.",
      });
    }

    res.status(500).json({ success: false, message: error.message });
  }
});

app.put("/api/students/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      admissionNumber,
      name,
      email,
      className,
      gender,
      age,
      genotype,
      parentName,
      parentPhone,
      parentEmail,
      emergencyContact,
      homeAddress,
      term,
      subjects,
      passportUrl,
    } = req.body;

    const r = await query(
      `UPDATE students SET
        admission_number=COALESCE($1, admission_number),
        name=COALESCE($2, name),
        email=COALESCE($3, email),
        class_name=COALESCE($4, class_name),
        gender=COALESCE($5, gender),
        age=COALESCE($6, age),
        genotype=COALESCE($7, genotype),
        parent_name=COALESCE($8, parent_name),
        parent_phone=COALESCE($9, parent_phone),
        parent_email=COALESCE($10, parent_email),
        emergency_contact=COALESCE($11, emergency_contact),
        home_address=COALESCE($12, home_address),
        term=COALESCE($13, term),
        subjects=COALESCE($14, subjects),
        passport_url=COALESCE($15, passport_url),
        updated_at=NOW()
      WHERE id=$16
      RETURNING *`,
      [
        admissionNumber || null,
        name || null,
        email ? email.toLowerCase() : null,
        className || null,
        gender || null,
        age ? Number(age) : null,
        genotype || null,
        parentName || null,
        parentPhone || null,
        parentEmail || null,
        emergencyContact || null,
        homeAddress || null,
        term || null,
        subjects ? parseSubjects(subjects) : null,
        passportUrl || null,
        req.params.id,
      ]
    );

    if (!r.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Student not found.",
      });
    }

    res.json({
      success: true,
      message: "Student updated successfully.",
      data: r.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete("/api/students/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await query("DELETE FROM students WHERE id=$1 RETURNING *", [req.params.id]);

    if (!r.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Student not found.",
      });
    }

    res.json({
      success: true,
      message: "Student deleted successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/staff", async (req, res) => {
  try {
    const r = await query("SELECT * FROM staff ORDER BY class_handled ASC, name ASC");
    res.json({ success: true, count: r.rowCount, data: r.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/staff", requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      staffId,
      name,
      email,
      password,
      role,
      classHandled,
      gender,
      phone,
      department,
      qualification,
      homeAddress,
      subjects,
      photoUrl,
    } = req.body;

    if (!name || !email || !role || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password, and role are required.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Staff password must be at least 8 characters.",
      });
    }

    const hash = await bcrypt.hash(password, 12);

    await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1,$2,$3,'staff')
       ON CONFLICT (email)
       DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        role = 'staff',
        updated_at = NOW()`,
      [name, email.toLowerCase(), hash]
    );

    const r = await query(
      `INSERT INTO staff (
        staff_id,
        name,
        email,
        role,
        class_handled,
        gender,
        phone,
        department,
        qualification,
        home_address,
        subjects,
        photo_url
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (email)
      DO UPDATE SET
        staff_id = EXCLUDED.staff_id,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        class_handled = EXCLUDED.class_handled,
        gender = EXCLUDED.gender,
        phone = EXCLUDED.phone,
        department = EXCLUDED.department,
        qualification = EXCLUDED.qualification,
        home_address = EXCLUDED.home_address,
        subjects = EXCLUDED.subjects,
        photo_url = EXCLUDED.photo_url,
        updated_at = NOW()
      RETURNING *`,
      [
        staffId || null,
        name,
        email.toLowerCase(),
        role,
        classHandled || "Not assigned",
        gender || "Not specified",
        phone || null,
        department || null,
        qualification || null,
        homeAddress || null,
        parseSubjects(subjects),
        photoUrl || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Staff member and login created successfully.",
      data: r.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Staff email or staff ID already exists.",
      });
    }

    res.status(500).json({ success: false, message: error.message });
  }
});

app.put("/api/staff/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      staffId,
      name,
      email,
      role,
      classHandled,
      gender,
      phone,
      department,
      qualification,
      homeAddress,
      subjects,
      photoUrl,
      password,
    } = req.body;

    const old = await query("SELECT * FROM staff WHERE id=$1", [req.params.id]);

    if (!old.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Staff not found.",
      });
    }

    const r = await query(
      `UPDATE staff SET
        staff_id=COALESCE($1, staff_id),
        name=COALESCE($2, name),
        email=COALESCE($3, email),
        role=COALESCE($4, role),
        class_handled=COALESCE($5, class_handled),
        gender=COALESCE($6, gender),
        phone=COALESCE($7, phone),
        department=COALESCE($8, department),
        qualification=COALESCE($9, qualification),
        home_address=COALESCE($10, home_address),
        subjects=COALESCE($11, subjects),
        photo_url=COALESCE($12, photo_url),
        updated_at=NOW()
      WHERE id=$13
      RETURNING *`,
      [
        staffId || null,
        name || null,
        email ? email.toLowerCase() : null,
        role || null,
        classHandled || null,
        gender || null,
        phone || null,
        department || null,
        qualification || null,
        homeAddress || null,
        subjects ? parseSubjects(subjects) : null,
        photoUrl || null,
        req.params.id,
      ]
    );

    if (password && password.length >= 8) {
      const hash = await bcrypt.hash(password, 12);
      await query(
        `UPDATE users
         SET name=$1, email=$2, password_hash=$3, role='staff', updated_at=NOW()
         WHERE email=$4`,
        [r.rows[0].name, r.rows[0].email, hash, old.rows[0].email]
      );
    } else {
      await query(
        `UPDATE users
         SET name=$1, email=$2, role='staff', updated_at=NOW()
         WHERE email=$3`,
        [r.rows[0].name, r.rows[0].email, old.rows[0].email]
      );
    }

    res.json({
      success: true,
      message: "Staff updated successfully.",
      data: r.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete("/api/staff/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await query("DELETE FROM staff WHERE id=$1 RETURNING *", [req.params.id]);

    if (!r.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Staff not found.",
      });
    }

    await query("DELETE FROM users WHERE email=$1 AND role='staff'", [r.rows[0].email]);

    res.json({
      success: true,
      message: "Staff and login deleted successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/staff/profile", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "staff") {
      return res.status(403).json({
        success: false,
        message: "Staff access required.",
      });
    }

    const profile = await getStaffProfileByEmail(req.user.email);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Staff profile not found.",
      });
    }

    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/staff/my-students", requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    if (req.user.role === "admin") {
      const r = await query("SELECT * FROM students ORDER BY class_name, name");
      return res.json({
        success: true,
        count: r.rowCount,
        data: r.rows,
      });
    }

    const profile = await getStaffProfileByEmail(req.user.email);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Staff profile not found.",
      });
    }

    const r = await query("SELECT * FROM students WHERE class_name=$1 ORDER BY name", [
      profile.class_handled,
    ]);

    res.json({
      success: true,
      count: r.rowCount,
      staff: profile,
      data: r.rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/admissions", requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await query("SELECT * FROM admissions ORDER BY created_at DESC");

    res.json({
      success: true,
      count: r.rowCount,
      data: r.rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/admissions", async (req, res) => {
  try {
    const {
      studentName,
      classApplying,
      gender,
      age,
      genotype,
      previousSchool,
      parentName,
      parentPhone,
      parentEmail,
      homeAddress,
      passportUrl,
      note,
    } = req.body;

    if (!studentName || !classApplying || !parentName || !parentPhone) {
      return res.status(400).json({
        success: false,
        message: "Student name, class applying, parent name, and parent phone are required.",
      });
    }

    const r = await query(
      `INSERT INTO admissions (
        student_name,
        class_applying,
        gender,
        age,
        genotype,
        previous_school,
        parent_name,
        parent_phone,
        parent_email,
        home_address,
        passport_url,
        note
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        studentName,
        classApplying,
        gender || "Not specified",
        age ? Number(age) : null,
        genotype || "Not specified",
        previousSchool || null,
        parentName,
        parentPhone,
        parentEmail || null,
        homeAddress || null,
        passportUrl || null,
        note || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Admission application submitted successfully.",
      data: r.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.patch("/api/admissions/:id/status", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;

    const r = await query(
      `UPDATE admissions
       SET status=$1, updated_at=NOW()
       WHERE id=$2
       RETURNING *`,
      [status || "Pending", req.params.id]
    );

    if (!r.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Admission application not found.",
      });
    }

    res.json({
      success: true,
      message: "Admission status updated successfully.",
      data: r.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/admissions/:id/convert", requireAuth, requireAdmin, async (req, res) => {
  try {
    const admission = await query("SELECT * FROM admissions WHERE id=$1", [req.params.id]);

    if (!admission.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Admission application not found.",
      });
    }

    const item = admission.rows[0];

    const email = item.parent_email || `student${item.id}@schoolportal.local`;

    const r = await query(
      `INSERT INTO students (
        name,
        email,
        class_name,
        gender,
        age,
        genotype,
        parent_name,
        parent_phone,
        parent_email,
        home_address,
        passport_url,
        term,
        subjects
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *`,
      [
        item.student_name,
        email.toLowerCase(),
        item.class_applying,
        item.gender || "Not specified",
        item.age,
        item.genotype || "Not specified",
        item.parent_name,
        item.parent_phone,
        item.parent_email,
        item.home_address,
        item.passport_url,
        "First Term",
        [],
      ]
    );

    await query(
      `UPDATE admissions
       SET status='Accepted', updated_at=NOW()
       WHERE id=$1`,
      [item.id]
    );

    res.status(201).json({
      success: true,
      message: "Applicant converted to student successfully.",
      data: r.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/grades", async (req, res) => {
  try {
    const r = await query(
      "SELECT grades.*, students.name AS student_name FROM grades LEFT JOIN students ON students.id = grades.student_id ORDER BY grades.created_at DESC"
    );

    res.json({
      success: true,
      count: r.rowCount,
      data: r.rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/grades", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { studentId, subject, score, term, reportCardUrl } = req.body;

    if (!studentId || !subject || score === undefined) {
      return res.status(400).json({
        success: false,
        message: "studentId, subject, and score are required.",
      });
    }

    const numeric = Number(score);
    const grade = calculateGrade(numeric);

    const r = await query(
      `INSERT INTO grades (
        student_id,
        subject,
        score,
        grade,
        term,
        report_card_url,
        uploaded_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *`,
      [
        Number(studentId),
        subject,
        numeric,
        grade,
        term || "Not specified",
        reportCardUrl || null,
        req.user.name,
      ]
    );

    await query(
      "INSERT INTO notifications (type, recipient, subject, message, status) VALUES ($1,$2,$3,$4,$5)",
      [
        "email",
        "parent@example.com",
        `New ${subject} grade uploaded`,
        `A score of ${numeric} has been uploaded for student #${studentId}.`,
        "queued",
      ]
    );

    res.status(201).json({
      success: true,
      message: "Grade uploaded successfully.",
      data: r.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/staff/grades", requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const { studentId, subject, score, term, reportCardUrl } = req.body;

    if (!studentId || !subject || score === undefined) {
      return res.status(400).json({
        success: false,
        message: "studentId, subject, and score are required.",
      });
    }

    const student = await query("SELECT * FROM students WHERE id=$1", [studentId]);

    if (!student.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Student not found.",
      });
    }

    if (req.user.role === "staff") {
      const profile = await getStaffProfileByEmail(req.user.email);

      if (!profile) {
        return res.status(404).json({
          success: false,
          message: "Staff profile not found.",
        });
      }

      if (profile.class_handled !== student.rows[0].class_name) {
        return res.status(403).json({
          success: false,
          message: "You can only upload results for your assigned class.",
        });
      }
    }

    const numeric = Number(score);
    const grade = calculateGrade(numeric);

    const r = await query(
      `INSERT INTO grades (
        student_id,
        subject,
        score,
        grade,
        term,
        report_card_url,
        uploaded_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *`,
      [
        Number(studentId),
        subject,
        numeric,
        grade,
        term || student.rows[0].term || "Not specified",
        reportCardUrl || null,
        req.user.name,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Result uploaded successfully.",
      data: r.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put("/api/grades/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { subject, score, term, reportCardUrl } = req.body;
    const numeric = score !== undefined ? Number(score) : null;
    const grade = numeric !== null ? calculateGrade(numeric) : null;

    const r = await query(
      `UPDATE grades SET
        subject=COALESCE($1,subject),
        score=COALESCE($2,score),
        grade=COALESCE($3,grade),
        term=COALESCE($4,term),
        report_card_url=COALESCE($5,report_card_url),
        updated_at=NOW()
      WHERE id=$6
      RETURNING *`,
      [subject || null, numeric, grade, term || null, reportCardUrl || null, req.params.id]
    );

    if (!r.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Grade not found.",
      });
    }

    res.json({
      success: true,
      message: "Grade updated successfully.",
      data: r.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete("/api/grades/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await query("DELETE FROM grades WHERE id=$1 RETURNING *", [req.params.id]);

    if (!r.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Grade not found.",
      });
    }

    res.json({
      success: true,
      message: "Grade deleted successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/results", async (req, res) => {
  try {
    const r = await query(`
      SELECT
        students.id AS student_id,
        students.name,
        students.class_name,
        students.term,
        COUNT(grades.id)::int AS subjects_count,
        COALESCE(AVG(grades.score),0)::numeric(5,2) AS average_score
      FROM students
      LEFT JOIN grades ON grades.student_id = students.id
      GROUP BY students.id
      ORDER BY students.class_name ASC, students.name ASC
    `);

    res.json({
      success: true,
      count: r.rowCount,
      data: r.rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/results/:studentId", async (req, res) => {
  try {
    const s = await query("SELECT * FROM students WHERE id=$1", [req.params.studentId]);

    if (!s.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Student not found.",
      });
    }

    const g = await query("SELECT * FROM grades WHERE student_id=$1 ORDER BY subject ASC", [
      req.params.studentId,
    ]);

    const total = g.rows.reduce((sum, item) => sum + Number(item.score), 0);
    const average = g.rowCount ? Number((total / g.rowCount).toFixed(2)) : 0;

    res.json({
      success: true,
      data: {
        student: s.rows[0],
        grades: g.rows,
        total,
        average,
        subjects_count: g.rowCount,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/fees", async (req, res) => {
  try {
    const r = await query("SELECT * FROM fee_items ORDER BY created_at DESC");
    res.json({ success: true, count: r.rowCount, data: r.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/fees", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, className, term, amount, session, dueDate, note } = req.body;

    if (!title || !className || !term || amount === undefined) {
      return res.status(400).json({
        success: false,
        message: "Title, class, term, and amount are required.",
      });
    }

    const r = await query(
      `INSERT INTO fee_items (
        title,
        class_name,
        term,
        amount,
        session,
        due_date,
        note
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *`,
      [
        title,
        className,
        term,
        Number(amount),
        session || "2025/2026",
        dueDate || null,
        note || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: "School fee created successfully.",
      data: r.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put("/api/fees/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, className, term, amount, session, dueDate, note } = req.body;

    const r = await query(
      `UPDATE fee_items SET
        title=COALESCE($1,title),
        class_name=COALESCE($2,class_name),
        term=COALESCE($3,term),
        amount=COALESCE($4,amount),
        session=COALESCE($5,session),
        due_date=COALESCE($6,due_date),
        note=COALESCE($7,note),
        updated_at=NOW()
      WHERE id=$8
      RETURNING *`,
      [
        title || null,
        className || null,
        term || null,
        amount ? Number(amount) : null,
        session || null,
        dueDate || null,
        note || null,
        req.params.id,
      ]
    );

    if (!r.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Fee not found.",
      });
    }

    res.json({
      success: true,
      message: "Fee updated successfully.",
      data: r.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete("/api/fees/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await query("DELETE FROM fee_items WHERE id=$1 RETURNING *", [req.params.id]);

    if (!r.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Fee not found.",
      });
    }

    res.json({
      success: true,
      message: "Fee deleted successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/payments", async (req, res) => {
  try {
    const r = await query(`
      SELECT
        fee_payments.*,
        students.name AS student_name,
        students.class_name,
        fee_items.title AS fee_title,
        fee_items.amount AS fee_amount
      FROM fee_payments
      LEFT JOIN students ON students.id=fee_payments.student_id
      LEFT JOIN fee_items ON fee_items.id=fee_payments.fee_item_id
      ORDER BY fee_payments.created_at DESC
    `);

    res.json({
      success: true,
      count: r.rowCount,
      data: r.rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/payments", requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      studentId,
      feeItemId,
      amountPaid,
      paymentMethod,
      reference,
      receiptUrl,
      note,
    } = req.body;

    if (!studentId || !feeItemId || amountPaid === undefined) {
      return res.status(400).json({
        success: false,
        message: "Student, fee item, and amount paid are required.",
      });
    }

    const r = await query(
      `INSERT INTO fee_payments (
        student_id,
        fee_item_id,
        amount_paid,
        payment_method,
        reference,
        receipt_url,
        note
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *`,
      [
        Number(studentId),
        Number(feeItemId),
        Number(amountPaid),
        paymentMethod || "Cash",
        reference || null,
        receiptUrl || null,
        note || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Payment recorded successfully.",
      data: r.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete("/api/payments/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await query("DELETE FROM fee_payments WHERE id=$1 RETURNING *", [req.params.id]);

    if (!r.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Payment not found.",
      });
    }

    res.json({
      success: true,
      message: "Payment deleted successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/fee-balances", async (req, res) => {
  try {
    const r = await query(`
      SELECT
        students.id AS student_id,
        students.name AS student_name,
        students.class_name,
        fee_items.id AS fee_item_id,
        fee_items.title,
        fee_items.term,
        fee_items.amount AS expected_amount,
        COALESCE(SUM(fee_payments.amount_paid),0) AS paid_amount,
        (fee_items.amount - COALESCE(SUM(fee_payments.amount_paid),0)) AS balance
      FROM students
      JOIN fee_items ON fee_items.class_name = students.class_name
      LEFT JOIN fee_payments
        ON fee_payments.student_id = students.id
        AND fee_payments.fee_item_id = fee_items.id
      GROUP BY students.id, fee_items.id
      ORDER BY students.name ASC
    `);

    res.json({
      success: true,
      count: r.rowCount,
      data: r.rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/assignments", requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    if (req.user.role === "staff") {
      const profile = await getStaffProfileByEmail(req.user.email);

      if (!profile) {
        return res.status(404).json({
          success: false,
          message: "Staff profile not found.",
        });
      }

      const r = await query(
        "SELECT * FROM assignments WHERE class_name=$1 ORDER BY created_at DESC",
        [profile.class_handled]
      );

      return res.json({
        success: true,
        count: r.rowCount,
        data: r.rows,
      });
    }

    const r = await query("SELECT * FROM assignments ORDER BY created_at DESC");

    res.json({
      success: true,
      count: r.rowCount,
      data: r.rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/assignments", requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const { title, subject, instructions, dueDate, attachmentUrl, className } = req.body;

    if (!title || !subject || !instructions) {
      return res.status(400).json({
        success: false,
        message: "Title, subject, and instructions are required.",
      });
    }

    let finalClassName = className;

    if (req.user.role === "staff") {
      const profile = await getStaffProfileByEmail(req.user.email);

      if (!profile) {
        return res.status(404).json({
          success: false,
          message: "Staff profile not found.",
        });
      }

      finalClassName = profile.class_handled;
    }

    if (!finalClassName) {
      return res.status(400).json({
        success: false,
        message: "Class name is required.",
      });
    }

    const r = await query(
      `INSERT INTO assignments (
        title,
        class_name,
        subject,
        instructions,
        due_date,
        attachment_url,
        created_by,
        created_by_email
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *`,
      [
        title,
        finalClassName,
        subject,
        instructions,
        dueDate || null,
        attachmentUrl || null,
        req.user.name,
        req.user.email,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Assignment created successfully.",
      data: r.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/announcements", async (req, res) => {
  try {
    const r = await query("SELECT * FROM announcements ORDER BY created_at DESC");
    res.json({ success: true, count: r.rowCount, data: r.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/announcements", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, message, audience } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: "Title and message are required.",
      });
    }

    const r = await query(
      "INSERT INTO announcements (title,message,audience) VALUES ($1,$2,$3) RETURNING *",
      [title, message, audience || "All"]
    );

    res.status(201).json({
      success: true,
      message: "Announcement published successfully.",
      data: r.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/messages", async (req, res) => {
  try {
    const r = await query("SELECT * FROM messages ORDER BY created_at DESC");
    res.json({ success: true, count: r.rowCount, data: r.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/messages", requireAuth, async (req, res) => {
  try {
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({
        success: false,
        message: "To and message are required.",
      });
    }

    const r = await query(
      "INSERT INTO messages (sender,recipient,message) VALUES ($1,$2,$3) RETURNING *",
      [req.user.name, to, message]
    );

    res.status(201).json({
      success: true,
      message: "Message sent successfully.",
      data: r.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/notifications", requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await query("SELECT * FROM notifications ORDER BY created_at DESC");
    res.json({ success: true, count: r.rowCount, data: r.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/notifications", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { recipient, subject, message } = req.body;

    if (!recipient || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "Recipient, subject, and message are required.",
      });
    }

    const r = await query(
      "INSERT INTO notifications (type, recipient, subject, message, status) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      ["email", recipient, subject, message, "queued"]
    );

    res.status(201).json({
      success: true,
      message: "Email notification queued successfully.",
      data: r.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.use((req, res) =>
  res.status(404).json({
    success: false,
    message: "Route not found.",
  })
);

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
