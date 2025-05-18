import time
import requests
import sqlite3
from flask import Flask, request, jsonify

PLATFORM_ACCOUNT = 'yourplatformaccount'  # CHANGE THIS to your platform's Hive account
SYMBOL = 'PEK'
HIVE_ENGINE_HISTORY_API = 'https://api.hive-engine.com/rpc/history'

app = Flask(__name__)
DB_PATH = 'poker_balances.db'

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS balances (
        user TEXT PRIMARY KEY,
        balance REAL DEFAULT 0
    )''')
    conn.commit()
    conn.close()

def update_balance(user, amount):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('INSERT OR IGNORE INTO balances (user, balance) VALUES (?, 0)', (user,))
    c.execute('UPDATE balances SET balance = balance + ? WHERE user = ?', (amount, user))
    conn.commit()
    conn.close()

def set_balance(user, amount):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('INSERT OR REPLACE INTO balances (user, balance) VALUES (?, ?)', (user, amount))
    conn.commit()
    conn.close()

def get_balance(user):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT balance FROM balances WHERE user = ?', (user,))
    row = c.fetchone()
    conn.close()
    return row[0] if row else 0.0

def get_deposits():
    payload = {
        "jsonrpc": "2.0",
        "method": "find",
        "params": {
            "contract": "tokens",
            "table": "transfers",
            "query": {"to": PLATFORM_ACCOUNT, "symbol": SYMBOL},
            "limit": 100,
            "sort": "desc"
        },
        "id": 1
    }
    r = requests.post(HIVE_ENGINE_HISTORY_API, json=payload)
    data = r.json()
    return data['result']

def watch_deposits():
    print('Starting deposit watcher...')
    seen = set()
    while True:
        deposits = get_deposits()
        for tx in deposits:
            txid = tx.get('_id')
            if txid not in seen:
                seen.add(txid)
                user = tx.get('from', '').lower()
                amount = float(tx.get('quantity', 0))
                if user and amount > 0:
                    print(f"Deposit: {user} +{amount} {SYMBOL}")
                    update_balance(user, amount)
        time.sleep(30)

@app.route('/api/balance', methods=['GET'])
def api_balance():
    username = request.args.get('user', '').lower()
    if not username:
        return jsonify({'error': 'Missing user parameter'}), 400
    bal = get_balance(username)
    return jsonify({'user': username, 'symbol': SYMBOL, 'balance': bal})

if __name__ == '__main__':
    import threading
    init_db()
    t = threading.Thread(target=watch_deposits, daemon=True)
    t.start()
    app.run(debug=True)
