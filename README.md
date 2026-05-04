# School Backend API

Backend API for the School Management Portal project. It provides basic REST endpoints for students, staff, grades, and API health checks.

## Live Deployment Target

This backend is designed to deploy on Render, Railway, or any Node.js hosting platform.

## Tech Stack

- Node.js
- Express.js
- CORS
- Helmet
- Morgan
- Dotenv

## API Endpoints

### Health

```http
GET /api/health
```

Returns backend service status.

### Students

```http
GET /api/students
POST /api/students
```

Example POST body:

```json
{
  "name": "Ada Okafor",
  "email": "ada.okafor@example.com",
  "className": "SS1 Science",
  "gender": "Female",
  "parentName": "Mrs. Okafor",
  "term": "First Term",
  "subjects": ["Mathematics", "English", "Biology"]
}
```

### Staff

```http
GET /api/staff
POST /api/staff
```

Example POST body:

```json
{
  "name": "Mr. Chinedu Eze",
  "email": "chinedu.eze@example.com",
  "role": "Form Teacher",
  "classHandled": "SS1 Science",
  "gender": "Male",
  "subjects": ["Physics", "Mathematics"]
}
```

### Grades

```http
GET /api/grades
POST /api/grades
```

Example POST body:

```json
{
  "studentId": 1,
  "subject": "Mathematics",
  "score": 86,
  "term": "First Term"
}
```

## Local Setup

Clone the repository:

```bash
git clone https://github.com/Abobbynwa/school-backend.git
cd school-backend
```

Install dependencies:

```bash
npm install
```

Create an environment file:

```bash
cp .env.example .env
```

Run the API:

```bash
npm run dev
```

Start production server:

```bash
npm start
```

## Render Deployment Settings

Use these settings on Render:

```txt
Runtime: Node
Build Command: npm install
Start Command: npm start
```

Environment variables:

```env
CLIENT_URL=https://your-frontend-url.vercel.app
```

Render provides `PORT` automatically, so you do not need to manually set it unless required.

## Important Note

This first deployable version uses in-memory sample data. That means data resets when the server restarts. The next production upgrade should connect PostgreSQL or Supabase for persistent storage.

## Author

**Agaba Valentine**  
Full Stack Developer | Cybersecurity Enthusiast

- GitHub: https://github.com/Abobbynwa
- Portfolio: https://charming-pothos-c47293.netlify.app/
- LinkedIn: https://www.linkedin.com/in/valentine-agaba-526821229
