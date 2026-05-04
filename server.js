import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "*";

app.use(helmet());
app.use(
  cors({
    origin: CLIENT_URL === "*" ? true : CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan("dev"));

let students = [
  {
    id: 1,
    name: "Ada Okafor",
    email: "ada.okafor@example.com",
    className: "SS1 Science",
    gender: "Female",
    parentName: "Mrs. Okafor",
    term: "First Term",
    subjects: ["Mathematics", "English", "Biology", "Chemistry", "Physics"],
  },
  {
    id: 2,
    name: "Musa Ibrahim",
    email: "musa.ibrahim@example.com",
    className: "JSS2",
    gender: "Male",
    parentName: "Mr. Ibrahim",
    term: "First Term",
    subjects: ["Mathematics", "English", "Basic Science", "Social Studies"],
  },
];

let staff = [
  {
    id: 1,
    name: "Mr. Chinedu Eze",
    email: "chinedu.eze@example.com",
    role: "Form Teacher",
    classHandled: "SS1 Science",
    gender: "Male",
    subjects: ["Physics", "Mathematics"],
  },
  {
    id: 2,
    name: "Mrs. Grace Bello",
    email: "grace.bello@example.com",
    role: "Subject Teacher",
    classHandled: "JSS2",
    gender: "Female",
    subjects: ["English", "Literature"],
  },
];

let grades = [
  {
    id: 1,
    studentId: 1,
    subject: "Mathematics",
    score: 86,
    grade: "A",
    term: "First Term",
  },
  {
    id: 2,
    studentId: 2,
    subject: "English",
    score: 74,
    grade: "B",
    term: "First Term",
  },
];

const createId = (items) => {
  if (!items.length) return 1;
  return Math.max(...items.map((item) => item.id)) + 1;
};

app.get("/", (req, res) => {
  res.json({
    message: "School Management Portal API is running",
    status: "success",
    documentation: "/api/health",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "school-backend-api",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/students", (req, res) => {
  res.json({
    success: true,
    count: students.length,
    data: students,
  });
});

app.post("/api/students", (req, res) => {
  const { name, email, className, gender, parentName, term, subjects } = req.body;

  if (!name || !email || !className) {
    return res.status(400).json({
      success: false,
      message: "Name, email, and className are required.",
    });
  }

  const newStudent = {
    id: createId(students),
    name,
    email,
    className,
    gender: gender || "Not specified",
    parentName: parentName || "Not specified",
    term: term || "Not specified",
    subjects: Array.isArray(subjects) ? subjects : [],
  };

  students.push(newStudent);

  return res.status(201).json({
    success: true,
    message: "Student created successfully.",
    data: newStudent,
  });
});

app.get("/api/staff", (req, res) => {
  res.json({
    success: true,
    count: staff.length,
    data: staff,
  });
});

app.post("/api/staff", (req, res) => {
  const { name, email, role, classHandled, gender, subjects } = req.body;

  if (!name || !email || !role) {
    return res.status(400).json({
      success: false,
      message: "Name, email, and role are required.",
    });
  }

  const newStaff = {
    id: createId(staff),
    name,
    email,
    role,
    classHandled: classHandled || "Not assigned",
    gender: gender || "Not specified",
    subjects: Array.isArray(subjects) ? subjects : [],
  };

  staff.push(newStaff);

  return res.status(201).json({
    success: true,
    message: "Staff member created successfully.",
    data: newStaff,
  });
});

app.get("/api/grades", (req, res) => {
  res.json({
    success: true,
    count: grades.length,
    data: grades,
  });
});

app.post("/api/grades", (req, res) => {
  const { studentId, subject, score, term } = req.body;

  if (!studentId || !subject || score === undefined) {
    return res.status(400).json({
      success: false,
      message: "studentId, subject, and score are required.",
    });
  }

  const numericScore = Number(score);
  let grade = "F";

  if (numericScore >= 70) grade = "A";
  else if (numericScore >= 60) grade = "B";
  else if (numericScore >= 50) grade = "C";
  else if (numericScore >= 45) grade = "D";
  else if (numericScore >= 40) grade = "E";

  const newGrade = {
    id: createId(grades),
    studentId: Number(studentId),
    subject,
    score: numericScore,
    grade,
    term: term || "Not specified",
  };

  grades.push(newGrade);

  return res.status(201).json({
    success: true,
    message: "Grade uploaded successfully.",
    data: newGrade,
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found.",
  });
});

app.listen(PORT, () => {
  console.log(`School backend API running on port ${PORT}`);
});
