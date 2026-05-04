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

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required. Add it to your Render environment variables.");
  process.exit(1);
}

if (!JWT_SECRET) {
  console.error("JWT_SECRET is required. Add it to your Render environment variables.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

app.use(helmet());
app.use(
  cors({
    origin: CLIENT_URL === "*" ? true : CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan("dev"));

const query = async (text, params = []) => pool.query(text, params);

const calculateGrade = (score) => {
  const numericScore = Number(score);
  if (numericScore >= 70) return "A";
  if (numericScore >= 60) return "B";
  if (numericScore >= 50) return "C";
  if (numericScore >= 45) return "D";
  if (numericScore >= 40) return "E";
  return "F";
};

const parseSubjects = (subjects) => {
  if (Array.isArray(subjects)) return subjects;
  return String(subjects || "")
    .split(",")
    .map((subject) => subject.trim())
    .filter(Boolean);
};

const signToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ success: false, message: "Authentication token required." });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await query("SELECT id, name, email, role, created_at FROM users WHERE id = $1", [decoded.id]);

    if (!result.rowCount) {
      return res.status(401).json({ success: false, message: "User no longer exists." });
    }

    req.user = result.rows[0];
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Invalid or expired token." });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin access required." });
  }
  return next();
};

app.get("/", (req, res) => {
  res.json({
    message: "School Management Portal API is running with PostgreSQL and JWT auth",
    status: "success",
    documentation: "/api/health",
  });
});

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
      service: "school-backend-api",
      database: "disconnected",
      auth: "enabled",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get("/api/db-health", async (req, res) => {
  try {
    await query("SELECT 1");
    res.json({ success: true, database: "connected", timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, database: "disconnected", message: error.message });
  }
});

app.post("/api/auth/register-admin", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Name, email, and password are required." });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });
    }

    const adminCount = await query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'");
    if (adminCount.rows[0].count > 0) {
      return res.status(403).json({ success: false, message: "Admin account already exists. Use login instead." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       RETURNING id, name, email, role, created_at`,
      [name, email.toLowerCase(), passwordHash]
    );

    const user = result.rows[0];
    const token = signToken(user);

    res.status(201).json({ success: true, message: "Admin registered successfully.", token, user });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ success: false, message: "Email already exists." });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    const result = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    if (!result.rowCount) {
      return res.status(401).json({ success: false, message: "Invalid login details." });
    }

    const userRecord = result.rows[0];
    const passwordValid = await bcrypt.compare(password, userRecord.password_hash);

    if (!passwordValid) {
      return res.status(401).json({ success: false, message: "Invalid login details." });
    }

    const user = {
      id: userRecord.id,
      name: userRecord.name,
      email: userRecord.email,
      role: userRecord.role,
      created_at: userRecord.created_at,
    };

    const token = signToken(user);
    res.json({ success: true, message: "Login successful.", token, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

app.get("/api/summary", async (req, res) => {
  try {
    const [students, staff, grades, announcements, messages, notifications] = await Promise.all([
      query("SELECT COUNT(*)::int AS count FROM students"),
      query("SELECT COUNT(*)::int AS count FROM staff"),
      query("SELECT COUNT(*)::int AS count FROM grades"),
      query("SELECT COUNT(*)::int AS count FROM announcements"),
      query("SELECT COUNT(*)::int AS count FROM messages"),
      query("SELECT COUNT(*)::int AS count FROM notifications"),
    ]);

    res.json({
      success: true,
      data: {
        students: students.rows[0].count,
        staff: staff.rows[0].count,
        grades: grades.rows[0].count,
        announcements: announcements.rows[0].count,
        messages: messages.rows[0].count,
        notifications: notifications.rows[0].count,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/students", async (req, res) => {
  try {
    const result = await query("SELECT * FROM students ORDER BY created_at DESC");
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/students", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, email, className, gender, parentName, term, subjects } = req.body;
    if (!name || !email || !className) {
      return res.status(400).json({ success: false, message: "Name, email, and className are required." });
    }

    const result = await query(
      `INSERT INTO students (name, email, class_name, gender, parent_name, term, subjects)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, email.toLowerCase(), className, gender || "Not specified", parentName || "Not specified", term || "Not specified", parseSubjects(subjects)]
    );

    res.status(201).json({ success: true, message: "Student created successfully.", data: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ success: false, message: "Student email already exists." });
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/staff", async (req, res) => {
  try {
    const result = await query("SELECT * FROM staff ORDER BY created_at DESC");
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/staff", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, email, role, classHandled, gender, subjects } = req.body;
    if (!name || !email || !role) {
      return res.status(400).json({ success: false, message: "Name, email, and role are required." });
    }

    const result = await query(
      `INSERT INTO staff (name, email, role, class_handled, gender, subjects)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, email.toLowerCase(), role, classHandled || "Not assigned", gender || "Not specified", parseSubjects(subjects)]
    );

    res.status(201).json({ success: true, message: "Staff member created successfully.", data: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ success: false, message: "Staff email already exists." });
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/grades", async (req, res) => {
  try {
    const result = await query(
      `SELECT grades.*, students.name AS student_name
       FROM grades LEFT JOIN students ON students.id = grades.student_id
       ORDER BY grades.created_at DESC`
    );
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/grades", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { studentId, subject, score, term } = req.body;
    if (!studentId || !subject || score === undefined) {
      return res.status(400).json({ success: false, message: "studentId, subject, and score are required." });
    }

    const numericScore = Number(score);
    const grade = calculateGrade(numericScore);
    const result = await query(
      `INSERT INTO grades (student_id, subject, score, grade, term)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [Number(studentId), subject, numericScore, grade, term || "Not specified"]
    );

    await query(
      `INSERT INTO notifications (type, recipient, subject, message, status)
       VALUES ($1, $2, $3, $4, $5)`,
      ["email", "parent@example.com", `New ${subject} grade uploaded`, `A score of ${numericScore} has been uploaded for student #${studentId}.`, "queued"]
    );

    res.status(201).json({ success: true, message: "Grade uploaded successfully and notification queued.", data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/announcements", async (req, res) => {
  try {
    const result = await query("SELECT * FROM announcements ORDER BY created_at DESC");
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/announcements", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, message, audience } = req.body;
    if (!title || !message) return res.status(400).json({ success: false, message: "Title and message are required." });

    const result = await query(
      `INSERT INTO announcements (title, message, audience) VALUES ($1, $2, $3) RETURNING *`,
      [title, message, audience || "All"]
    );

    res.status(201).json({ success: true, message: "Announcement published successfully.", data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/messages", async (req, res) => {
  try {
    const result = await query("SELECT * FROM messages ORDER BY created_at DESC");
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/messages", requireAuth, async (req, res) => {
  try {
    const { to, message } = req.body;
    if (!to || !message) return res.status(400).json({ success: false, message: "To and message are required." });

    const result = await query(
      `INSERT INTO messages (sender, recipient, message) VALUES ($1, $2, $3) RETURNING *`,
      [req.user.name, to, message]
    );

    res.status(201).json({ success: true, message: "Message sent successfully.", data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/notifications", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await query("SELECT * FROM notifications ORDER BY created_at DESC");
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/notifications", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { recipient, subject, message } = req.body;
    if (!recipient || !subject || !message) {
      return res.status(400).json({ success: false, message: "Recipient, subject, and message are required." });
    }

    const result = await query(
      `INSERT INTO notifications (type, recipient, subject, message, status) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      ["email", recipient, subject, message, "queued"]
    );

    res.status(201).json({ success: true, message: "Email notification queued successfully.", data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found." });
});

app.listen(PORT, () => {
  console.log(`School backend API running on port ${PORT}`);
});
