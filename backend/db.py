import os
import certifi
from pymongo import MongoClient
from pymongo.errors import InvalidURI, ConfigurationError
from dotenv import load_dotenv
from core.config import settings

load_dotenv()

try:
    # Only use TLS CA bundle for Atlas (mongodb+srv://) or explicit TLS connections
    uri = settings.MONGO_URI
    connect_kwargs = {}
    if uri.startswith("mongodb+srv://") or "tls=true" in uri or "ssl=true" in uri:
        connect_kwargs["tlsCAFile"] = certifi.where()
    client = MongoClient(uri, **connect_kwargs)
    # The ismaster command is cheap and does not require auth.
    client.admin.command('ismaster')
    print("✅ Connected to MongoDB successfully!")
except (InvalidURI, ConfigurationError) as e:
    print(f"\n❌ MongoDB Connection Error: {e}")
    print("👉 HINT: If you have special characters (like '@', ':', '%') in your password, you MUST 'URL Escape' them.")
    print("   Example: '@' becomes '%40', '+' becomes '%2B'.\n")
    raise e

db = client[settings.MONGO_DB]
holdings_collection = db["holdings"]
users_collection = db["users"]


def ensure_indexes():
    """Create required indexes. Idempotent; called once at app startup."""
    users_collection.create_index("username", unique=True)
    users_collection.create_index("email", unique=True)
    holdings_collection.create_index("user_id")
