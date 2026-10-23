"""Initialize the first admin user for Revnexa."""
from __future__ import annotations

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.services.user_service import initialize_admin_user


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Initialize the first admin user for Revnexa')
    parser.add_argument('--username', required=True, help='Admin username')
    parser.add_argument('--email', required=True, help='Admin email')
    parser.add_argument('--password', required=True, help='Admin password (min 8 characters)')
    
    args = parser.parse_args()
    
    username = args.username
    email = args.email
    password = args.password
    
    if not username or not email or not password:
        print("Error: All fields are required")
        sys.exit(1)
    
    if len(password) < 8:
        print("Error: Password must be at least 8 characters")
        sys.exit(1)
    
    try:
        user = initialize_admin_user(username, email, password)
        print(f"\n✓ Admin user created successfully!")
        print(f"  Username: {user['username']}")
        print(f"  Email: {user['email']}")
        print(f"  Role: {user['role']}")
        print(f"\nYou can now log in at http://localhost:5174/login")
    except ValueError as e:
        print(f"\n✗ Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
