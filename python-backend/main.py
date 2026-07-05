from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Logo Showcase AI Backend")

class LogoRequest(BaseModel):
    filename: str
    tags: list[str] = []

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Python Microservice Running"}

@app.post("/analyze-logo")
def analyze_logo(logo: LogoRequest):
    # Mock AI analysis for extracting tags from a logo
    return {
        "filename": logo.filename,
        "suggested_tags": ["minimalist", "monochrome", "modern"],
        "confidence": 0.95
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
