import logging
import os
import uvicorn

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from asyncpg import create_pool
from dotenv import load_dotenv

from app.models import (
    RegistrationIn, RegistrationOut,
    ContactIn,      ContactOut,
    NewsIn,         NewsOut
)

# ─── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─── Load Config ───────────────────────────────────────────────────────────────
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    logger.critical("DATABASE_URL not set in .env")
    raise RuntimeError("DATABASE_URL not set in .env")

# ─── App Setup ─────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Acme Academy API",
    description="Backend for school site",
    version="1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Database Pool ────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    logger.info("Connecting to database...")
    app.state.db_pool = await create_pool(DATABASE_URL, min_size=1, max_size=10)
    logger.info("Database pool created.")

@app.on_event("shutdown")
async def shutdown():
    logger.info("Closing database pool...")
    await app.state.db_pool.close()
    logger.info("Database pool closed.")

# ─── Registration Endpoint ─────────────────────────────────────────────────────
@app.post("/api/register", response_model=RegistrationOut)
async def register(reg: RegistrationIn):
    sql = """
        INSERT INTO registrations
          (full_name, student_class, dob, gender, parent_name, parent_email, parent_phone)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id;
    """
    async with app.state.db_pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                sql,
                reg.full_name,
                reg.student_class,
                reg.dob,
                reg.gender,
                reg.parent_name,
                reg.parent_email,
                reg.parent_phone,
            )
        except Exception:
            logger.error("DB insertion error (registrations)", exc_info=True)
            raise HTTPException(status_code=500, detail="Registration failed")
    return RegistrationOut(id=row["id"], message="Registration received!")

# ─── Contact Endpoint ──────────────────────────────────────────────────────────
@app.post("/api/contact", response_model=ContactOut)
async def submit_contact(msg: ContactIn):
    sql = """
        INSERT INTO contact_messages
          (name, email, message)
        VALUES ($1,$2,$3)
        RETURNING id;
    """
    async with app.state.db_pool.acquire() as conn:
        try:
            row = await conn.fetchrow(sql, msg.name, msg.email, msg.message)
        except Exception:
            logger.error("DB insertion error (contact_messages)", exc_info=True)
            raise HTTPException(status_code=500, detail="Message submission failed")
    return ContactOut(id=row["id"], message="Message received!")

# ─── News Endpoints ────────────────────────────────────────────────────────────
@app.post("/api/news", response_model=NewsOut)
async def create_news(item: NewsIn):
    sql = """
        INSERT INTO news (title, content, image_url)
        VALUES ($1,$2,$3)
        RETURNING id, title, content, image_url, created_at;
    """
    async with app.state.db_pool.acquire() as conn:
        try:
            row = await conn.fetchrow(sql, item.title, item.content, item.image_url)
        except Exception:
            logger.error("DB insertion error (news)", exc_info=True)
            raise HTTPException(status_code=500, detail="Could not create news item")
    return NewsOut(**row)

@app.get("/api/news", response_model=list[NewsOut])
async def list_news():
    sql = """
        SELECT id, title, content, image_url, created_at
        FROM news
        ORDER BY created_at DESC;
    """
    async with app.state.db_pool.acquire() as conn:
        rows = await conn.fetch(sql)
    return [NewsOut(**r) for r in rows]

# ─── Run ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
