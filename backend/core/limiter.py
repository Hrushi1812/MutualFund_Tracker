from slowapi import Limiter
from slowapi.util import get_remote_address

# Shared rate limiter. Lives in its own module so both app.py and route
# modules can import it without circular imports.
# Render/most PaaS sit behind a reverse proxy; get_remote_address reads the
# direct peer, so uvicorn must be started with --proxy-headers (or slowapi
# swapped to a forwarded-for key func) for per-client limits in production.
limiter = Limiter(key_func=get_remote_address)
