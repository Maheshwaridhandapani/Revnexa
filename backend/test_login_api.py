import urllib.request
import json

# Test the login API endpoint
url = "http://localhost:8000/api/auth/login"
data = {
    "username": "admin",
    "password": "admin123456"
}

print("Testing login API endpoint...")
print(f"URL: {url}")
print(f"Data: {data}")

try:
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    
    with urllib.request.urlopen(req) as response:
        status_code = response.status
        response_text = response.read().decode('utf-8')
        print(f"\nStatus Code: {status_code}")
        print(f"Response: {response_text}")
        
        if status_code == 200:
            print("✓ Login API successful")
        else:
            print("✗ Login API failed")
except Exception as e:
    print(f"✗ Error: {e}")
