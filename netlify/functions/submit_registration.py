import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor

def handler(event, context):
    # Only accept POST
    if event.get("httpMethod") != "POST":
        return {"statusCode": 405, "body": "Method Not Allowed"}

    try:
        payload = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return {"statusCode": 400, "body": "Invalid JSON"}

    # Extract & validate
    full_name    = payload.get("fullName")
    student_cls  = payload.get("studentClass")
    dob          = payload.get("dob")
    gender       = payload.get("gender")
    parent_name  = payload.get("parentName")
    parent_email = payload.get("parentEmail")
    parent_phone = payload.get("parentPhone")

    if not all([full_name, student_cls, dob, gender, parent_name, parent_email]):
        return {"statusCode": 400, "body": "Missing fields"}

    # Connect to Neon
    db_url = os.getenv("NEON_DATABASE_URL")
    conn = psycopg2.connect(db_url, sslmode="require")
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        cur.execute("""
            INSERT INTO registrations
              (full_name, class, dob, gender, parent_name, parent_email, parent_phone)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            RETURNING id, created_at;
        """, (full_name, student_cls, dob, gender, parent_name, parent_email, parent_phone))
        new_row = cur.fetchone()
        conn.commit()
    except Exception as e:
        conn.rollback()
        print("DB ERROR:", e)
        return {"statusCode": 500, "body": "Database error"}
    finally:
        cur.close()
        conn.close()

    # Return success
    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Registered successfully",
            "id": new_row["id"],
            "timestamp": new_row["created_at"]
        })
    }
