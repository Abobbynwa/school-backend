from pydantic import BaseModel, EmailStr, Field
from datetime import date, datetime

class RegistrationIn(BaseModel):
    full_name: str = Field(..., example="Jane Doe")
    student_class: str = Field(..., example="SS 2")
    dob: date = Field(..., example="2008-05-12")
    gender: str = Field(..., example="Female")
    parent_name: str = Field(..., example="John Doe")
    parent_email: EmailStr = Field(..., example="parent@example.com")
    parent_phone: str | None = Field(None, example="+15551234567")

class RegistrationOut(BaseModel):
    id: int
    message: str

class ContactIn(BaseModel):
    name: str = Field(..., example="Jane Doe")
    email: EmailStr = Field(..., example="jane@example.com")
    message: str = Field(..., example="I’d like to know more about your programs.")

class ContactOut(BaseModel):
    id: int
    message: str

class NewsIn(BaseModel):
    title: str = Field(..., example="Spring Concert Highlights")
    content: str = Field(..., example="Our students dazzled the audience with...")
    image_url: str | None = Field(None, example="https://cdn.example.com/img/concert.jpg")

class NewsOut(BaseModel):
    id: int
    title: str
    content: str
    image_url: str | None
    created_at: datetime
