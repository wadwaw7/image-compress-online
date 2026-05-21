import logging
import time
import sys
from pathlib import Path

from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from .core.config import get_settings
from .database import Base, engine, get_db
from .api.v1 import auth as auth_router
from .api.v1 import admin as admin_router
from .api.v1 import images as images_router
from .api.v1 import records as records_router
from .utils.db_migrate import ensure_login_limit_columns, ensure_compress_task_unique_index, ensure_users_unique_indexes, ensure_media_type_column
from .utils.bootstrap_admin import ensure_default_admin

# Structured logging: console + file
LOG_DIR = Path(__file__).resolve().parents[2] / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_DIR / "app.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)

settings = get_settings()
app = FastAPI(title="Image Compressor API", version="1.0.0")


@app.middleware("http")
async def request_log_middleware(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = (time.time() - start) * 1000
    logger.info(
        "%s %s → %s (%.1fms)",
        request.method,
        request.url.path,
        response.status_code,
        duration,
    )
    return response


@app.middleware("http")
async def cache_control_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    elif request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "font-src 'self'; "
        "connect-src 'self'; "
        "frame-ancestors 'self'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    response.headers["Content-Security-Policy"] = csp
    response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
    return response

# CORS：从配置读取允许的域名（逗号分隔）
cors_origins_raw = settings.CORS_ORIGINS if settings.CORS_ORIGINS != "*" else ""
cors_origins = [o.strip() for o in cors_origins_raw.split(",") if o.strip()] if cors_origins_raw else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Content-Disposition"],
    max_age=600,
    allow_credentials=False,
)

# Create DB tables on startup (for SQLite fallback / quick start)
@app.on_event("startup")
def on_startup():
    try:
        Base.metadata.create_all(bind=engine)
    except Exception:
        logger.critical("Database initialization failed", exc_info=True)
        raise

    try:
        ensure_login_limit_columns(engine)
        ensure_compress_task_unique_index(engine)
        ensure_users_unique_indexes(engine)
        ensure_media_type_column(engine)
        ensure_default_admin(engine)
    except Exception:
        logger.warning("Migration/bootstrap check failed", exc_info=True)

    # Reset stale tasks (status=0 → status=2) from interrupted runs
    try:
        from .models.record import CompressTask
        from sqlalchemy import update
        with engine.begin() as conn:
            result = conn.execute(
                update(CompressTask)
                .where(CompressTask.status == 0)
                .values(status=2, error_message="Server restarted, task lost")
            )
            if result.rowcount:
                logger.info("Reset %d stale compress tasks (status 0→2)", result.rowcount)
    except Exception:
        logger.warning("Failed to reset stale tasks", exc_info=True)

# No-op: queue_keeper not implemented; batch_compress is synchronous
@app.on_event("shutdown")
def on_shutdown():
    pass


# API routers
app.include_router(auth_router.router, prefix="/api/v1")
app.include_router(admin_router.router, prefix="/api/v1")
app.include_router(images_router.router, prefix="/api/v1")
app.include_router(records_router.router, prefix="/api/v1")


# Static frontend — look for "public" first (GitHub repo structure), then "frontend" (legacy)
_frontend_candidates = [
    Path(__file__).resolve().parents[2] / "public",
    Path(__file__).resolve().parents[2] / "frontend",
]
FRONTEND_DIR = next((d for d in _frontend_candidates if d.exists()), _frontend_candidates[0])

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return JSONResponse(status_code=503, content={"status": "error", "database": str(e)})


@app.get("/")
def root_index():
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return JSONResponse({"message": "Image Compressor API running. Frontend not found."})


# Dev convenience: serve frontend static files at root so absolute paths like /app.js work
from fastapi.responses import Response
import mimetypes

@app.get("/{filename:path}")
async def serve_frontend_static(filename: str):
    """Serve static frontend files at root path for development (no nginx needed)."""
    file_path = FRONTEND_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        # Let 404 handling work normally for API routes
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    media_type, _ = mimetypes.guess_type(str(file_path))
    content = file_path.read_bytes()
    return Response(content=content, media_type=media_type or "application/octet-stream")
