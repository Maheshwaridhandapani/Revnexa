import sqlite3

conn = sqlite3.connect('revnexa.db')
cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
print('Tables in database:')
for row in cursor:
    print(row)

print('\nUsers table schema:')
cursor = conn.execute("PRAGMA table_info(users)")
for row in cursor:
    print(row)

print('\nUsers in database:')
cursor = conn.execute('SELECT id, username, email, role, is_active FROM users')
users = cursor.fetchall()
if users:
    for row in users:
        print(row)
else:
    print('No users found')

conn.close()
