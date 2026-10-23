import urllib.request
import json

# Test the dashboard API endpoint with authentication
url = "http://localhost:8000/api/auth/login"
data = {
    "username": "admin",
    "password": "admin123456"
}

print("Testing login...")
req = urllib.request.Request(
    url,
    data=json.dumps(data).encode('utf-8'),
    headers={'Content-Type': 'application/json'},
    method='POST'
)

with urllib.request.urlopen(req) as response:
    login_data = json.loads(response.read().decode('utf-8'))
    token = login_data['access_token']
    print(f"✓ Login successful, token: {token[:50]}...")

print("\nTesting dashboard endpoint...")
dashboard_url = "http://localhost:8000/api/dashboard"
req = urllib.request.Request(
    dashboard_url,
    headers={'Authorization': f'Bearer {token}'},
    method='GET'
)

try:
    with urllib.request.urlopen(req) as response:
        status = response.status
        dashboard_data = json.loads(response.read().decode('utf-8'))
        print(f"✓ Dashboard status: {status}")
        print(f"✓ Dashboard keys: {list(dashboard_data.keys())}")
except Exception as e:
    print(f"✗ Dashboard error: {e}")
