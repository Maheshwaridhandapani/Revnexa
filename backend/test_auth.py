import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.services.user_service import authenticate_user

# Test authentication
print("Testing authentication...")
result = authenticate_user("admin", "admin123456")
print(f"Result: {result}")

if result:
    print("✓ Authentication successful")
    print(f"User: {result}")
else:
    print("✗ Authentication failed")
