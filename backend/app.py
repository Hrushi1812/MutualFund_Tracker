from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from routes import auth, holdings, portfolio, fyers, schemes
from db import client
from core.logging import setup_logging, get_logger
from core.config import settings

# 1. Setup Logging
setup_logging()
logger = get_logger("app")

app = FastAPI(title="Mutual Fund NAV Estimator API")

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

# Routes
app.include_router(auth.router)
app.include_router(holdings.router)
app.include_router(portfolio.router)
app.include_router(fyers.router)
app.include_router(schemes.router)

@app.get("/")
def home():
    return {"message": "NAV Estimator API is running 🚀 (Refactored)"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)