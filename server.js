import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "*";
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required. Add it to your Render environment variables.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
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

const query = async (text, params = []) => {
  const result = await pool.query(text, params);
  return result;
};

app.get("/", (req, res) => {
  res.json({
    message: "School Management Portal API is running with PostgreSQL",
    status: "success",
    documentation: "/api/health",
  });
});

app.get("/api/health", async (req, res) => {
  try {
    await query("SELECT 1");
    res.json({
      status: "healthy",
      service: "school-backend-api",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      service: "school-backend-api",
      database: "disconnected",
      message: error.message,
    });
  }
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

app.post("/api/students", async (req, res) => {
  try {
    const { name, email, className, gender, parentName, term, subjects } = req.body;

    if (!name || !email || !className) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and className are required.",
      });
    }

    const result = await query(
      `INSERT INTO students (name, email, class_name, gender, parent_name, term, subjects)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        name,
        email,
        className,
        gender || "Not specified",
        parentName || "Not specified",
        term || "Not specified",
        parseSubjects(subjects),
      ]
    );

    res.status(201).json({
      success: true,
      message: "Student created successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/students/:id", async (req, res) => {
  try {
    const studentResult = await query("SELECT * FROM students WHERE id = $1", [req.params.id]);

    if (!studentResult.rowCount) {
      return res.status(404).json({ success: false, message: "Student not found." });
    }

    const gradesResult = await query("SELECT * FROM grades WHERE student_id = $1 ORDER BY created_at DESC", [
      req.params.id,
    ]);

    res.json({
      success: true,
      data: {
        ...studentResult.rows[0],
        grades: gradesResult.rows,
      },
    });
  } catch (error) {
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

app.post("/api/staff", async (req, res) => {
  try {
    const { name, email, role, classHandled, gender, subjects } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and role are required.",
      });
    }

    const result = await query(
      `INSERT INTO staff (name, email, role, class_handled, gender, subjects)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        name,
        email,
        role,
        classHandled || "Not assigned",
        gender || "Not specified",
        parseSubjects(subjects),
      ]
    );

    res.status(201).json({
      success: true,
      message: "Staff member created successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/grades", async (req, res) => {
  try {
    const result = await query(
      `SELECT grades.*, students.name AS student_name
       FROM grades
       LEFT JOIN students ON students.id = grades.student_id
       ORDER BY grades.created_at DESC`
    );
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/grades", async (req, res) => {
  try {
    const { studentId, subject, score, term } = req.body;

    if (!studentId || !subject || score === undefined) {
      return res.status(400).json({
        success: false,
        message: "studentId, subject, and score are required.",
      });
    }

    const numericScore = Number(score);
    const grade = calculateGrade(numericScore);

    const result = await query(
      `INSERT INTO grades (student_id, subject, score, grade, term)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [Number(studentId), subject, numericScore, grade, term || "Not specified"]
    );

    await query(
      `INSERT INTO notifications (type, recipient, subject, message, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        "email",
        "parent@example.com",
        `New ${subject} grade uploaded`,
        `A score of ${numericScore} has been uploaded for student #${studentId}.`,
        "queued",
      ]
    );

    res.status(201).json({
      success: true,
      message: "Grade uploaded successfully and notification queued.",
      data: result.rows[0],
    });
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

app.post("/api/announcements", async (req, res) => {
  try {
    const { title, message, audience } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: "Title and message are required.",
      });
    }

    const result = await query(
      `INSERT INTO announcements (title, message, audience)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [title, message, audience || "All"]
    );

    res.status(201).json({
      success: true,
      message: "Announcement published successfully.",
      data: result.rows[0],
    });
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

app.post("/api/messages", async (req, res) => {
  try {
    const { from, to, message } = req.body;

    if (!from || !to || !message) {
      return res.status(400).json({
        success: false,
        message: "From, to, and message are required.",
      });
    }

    const result = await query(
      `INSERT INTO messages (sender, recipient, message)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [from, to, message]
    );

    res.status(201).json({
      success: true,
      message: "Message sent successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/notifications", async (req, res) => {
  try {
    const result = await query("SELECT * FROM notifications ORDER BY created_at DESC");
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/notifications", async (req, res) => {
  try {
    const { recipient, subject, message } = req.body;

    if (!recipient || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "Recipient, subject, and message are required.",
      });
    }

    const result = await query(
      `INSERT INTO notifications (type, recipient, subject, message, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      ["email", recipient, subject, message, "queued"]
    );

    res.status(201).json({
      success: true,
      message: "Email notification queued successfully.",
      data: result.rows[0],
    });
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
