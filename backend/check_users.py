import sqlite3

conn = sqlite3.connect('revnexa.db')
cursor = conn.execute('SELECT id, username, email, role, is_active FROM users')
print('Users in database:')
for row in cursor:
    print(row)
conn.close()
