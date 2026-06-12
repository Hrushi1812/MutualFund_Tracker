from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from routes import auth, holdings, portfolio, fyers, schemes
from db import client, ensure_indexes
from core.limiter import limiter
from core.logging import setup_logging, get_logger
from core.config import settings

# 1. Setup Logging
setup_logging()
logger = get_logger("app")

app = FastAPI(title="Mutual Fund NAV Estimator API")

# Rate limiting (slowapi)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# 2. Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled Exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error. Please check logs for details."},
    )

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup
@app.on_event("startup")
def startup_db_client():
    try:
        client.admin.command('ismaster')
        logger.info("Connected to MongoDB successfully!")
    except Exception as e:
        logger.critical(f"MongoDB Startup Error: {e}")
    try:
        ensure_indexes()
        logger.info("MongoDB indexes ensured.")
    except Exception as e:
        # Unique index creation fails if duplicate users already exist;
        # keep serving but log loudly so it gets fixed.
        logger.critical(f"MongoDB index creation failed: {e}")

# Routes
app.include_router(auth.router)
app.include_router(holdings.router)
app.include_router(portfolio.router)
app.include_router(fyers.router)
app.include_router(schemes.router)

@app.get("/")
def home():
    return {"message": "NAV Estimator API is running 🚀 (Refactored)"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)