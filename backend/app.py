"""
Budget Data Entry Application - Flask Backend
PostgreSQL with SCD (Slowly Changing Dimension) versioning
Supports multiple scenarios: most_likely, best_case, worst_case
Includes user authentication
"""

import os
import hashlib
import secrets
import traceback
import logging
from datetime import datetime, timedelta, date
from functools import wraps
from flask import Flask, jsonify, request, send_from_directory, session
from flask_cors import CORS
import psycopg
from psycopg.rows import dict_row
import clickhouse_connect
from dotenv import load_dotenv
from hijri_converter import Hijri, Gregorian

# Load environment variables from .env.production in parent directory
env_path = os.path.join(os.path.dirname(__file__), '..', '.env.production')
load_dotenv(env_path)

app = Flask(__name__, static_folder='../frontend', static_url_path='')
app.secret_key = os.getenv('SECRET_KEY', secrets.token_hex(32))
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=8)
CORS(app, supports_credentials=True)

# Database configuration
DB_CONFIG = {
    'host': os.getenv('PG_HOST','172.22.24.7'),
    'port': os.getenv('PG_PORT','5432'),
    'dbname': os.getenv('PG_DATABASE','postgres'),
    'user': os.getenv('PG_USER','postgres'),
    'password': os.getenv('PG_PASSWORD','Dataw_135')
}

# ClickHouse configuration
CLICKHOUSE_CONFIG = {
    'host': os.getenv('CH_HOST','172.22.25.165'),
    'port': os.getenv('CH_PORT','8123'),
    'database': os.getenv('CH_DATABASE','budget'),
    'username': os.getenv('CH_USER','default'),
    'password': os.getenv('CH_PASSWORD','biuser')
}

# Track database availability
DB_AVAILABLE = False

# Predefined attributes from Final.xlsx
METRICS = ['Census', 'Conversion', 'CPE', 'Avg Revenue/Night', 'ALOS', 'Direct Admissions #Episodes']
CARE_TYPES = ['OP', 'ER', 'Non-LTC', 'LTC']
INPUT_TYPES = ['Growth Rate', 'Exact Value%', 'Exact Value Number']
BRANCHES = [1, 2, 3, 4, 5, 6]
QUARTERS = [1, 2, 3, 4]
SCENARIOS = ['most_likely', 'best_case', 'worst_case']  # Scenario types

# Branch ID to Name mapping
BRANCH_NAMES = {
    1: 'Riyadh',
    2: 'Khamis',
    3: 'Jazan',
    4: 'Qassem',
    5: 'Madinah',
    6: 'Abha'
}

# Metric to Care Type mapping (which care types apply to which metrics)
METRIC_CARE_TYPES = {
    'Census': ['OP', 'ER'],
    'Conversion': ['OP', 'ER'],
    'CPE': ['OP', 'ER'],
    'Avg Revenue/Night': ['Non-LTC', 'LTC'],
    'ALOS': ['Non-LTC', 'LTC'],
    'Direct Admissions #Episodes': ['LTC']
}

# Metric to Input Type mapping
METRIC_INPUT_TYPES = {
    'Census': 'Growth Rate',
    'Conversion': 'Exact Value%',
    'CPE': 'Growth Rate',
    'Avg Revenue/Night': 'Exact Value Number',
    'ALOS': 'Exact Value Number',
    'Direct Admissions #Episodes': 'Exact Value Number'
}

# Hardcoded Calendar Adjustment Factors
CALENDAR_FACTORS = {
    'weekday': 1.0,      # Sunday - Thursday
    'friday': 0.5,       # Friday (Weekend)
    'saturday': 0.6,     # Saturday (Weekend)
    'holiday': 0.5,      # National holidays
    'ramadan': 0.7,      # Ramadan period
    'eid_fitr': 0.3,     # Eid Al-Fitr
    'eid_adha': 0.3      # Eid Al-Adha
}

# KSA National Holidays (Gregorian dates - fixed)
KSA_NATIONAL_HOLIDAYS_GREGORIAN = [
    (9, 23),   # Saudi National Day (September 23)
    (2, 22),   # Founding Day (February 22)
]

# KSA Holidays based on Hijri Calendar (Hijri month, day)
KSA_HOLIDAYS_HIJRI = [
    (1, 1),    # Islamic New Year (1st Muharram)
]

# Ramadan month in Hijri calendar
RAMADAN_MONTH_HIJRI = 9

# Eid Al-Fitr: 1st - 3rd of Shawwal (month 10)
EID_FITR_MONTH_HIJRI = 10
EID_FITR_DAYS = [1, 2, 3, 4]  # 4 days

# Eid Al-Adha: 9th - 13th of Dhul Hijjah (month 12)
EID_ADHA_MONTH_HIJRI = 12
EID_ADHA_START_DAY = 9   # Day of Arafah
EID_ADHA_END_DAY = 13    # 5 days total


def get_db_connection():
    """Create a PostgreSQL database connection."""
    conn = psycopg.connect(**DB_CONFIG, row_factory=dict_row, connect_timeout=10)
    # Set statement timeout to 30 seconds to prevent indefinite hangs
    conn.execute("SET statement_timeout = '30s'")
    return conn


def get_clickhouse_connection():
    """Create a ClickHouse database connection."""
    return clickhouse_connect.get_client(
        host=CLICKHOUSE_CONFIG['host'],
        port=CLICKHOUSE_CONFIG['port'],
        database=CLICKHOUSE_CONFIG['database'],
        username=CLICKHOUSE_CONFIG['username'],
        password=CLICKHOUSE_CONFIG['password']
    )


def init_database():
    """Initialize the database schema with SCD versioning and scenario support."""
    conn = get_db_connection()
    cur = conn.cursor()
    
    # Create schema first
    cur.execute("CREATE SCHEMA IF NOT EXISTS budget;")
    
    # Check if table exists and if scenario column exists
    cur.execute("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'budget' 
            AND table_name = 'budget_assumptions'
        );
    """)
    table_exists = cur.fetchone()['exists']
    
    if not table_exists:
        # Create new table with scenario column
        cur.execute("""
            CREATE TABLE budget.budget_assumptions (
                id SERIAL PRIMARY KEY,
                metric VARCHAR(50) NOT NULL,
                care_type VARCHAR(20) NOT NULL,
                year INTEGER NOT NULL,
                quarter INTEGER NOT NULL,
                input_type VARCHAR(30) NOT NULL,
                branch_id INTEGER NOT NULL,
                scenario VARCHAR(20) NOT NULL DEFAULT 'most_likely',
                value DECIMAL(10, 4),
                version INTEGER DEFAULT 1,
                is_last_value BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_by VARCHAR(100) DEFAULT 'system',
                UNIQUE(metric, care_type, year, quarter, branch_id, scenario, version)
            );
        """)
    else:
        # Table exists - check if scenario column exists
        cur.execute("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'budget' 
                AND table_name = 'budget_assumptions' 
                AND column_name = 'scenario'
            );
        """)
        scenario_exists = cur.fetchone()['exists']
        
        if not scenario_exists:
            # Add scenario column to existing table
            cur.execute("""
                ALTER TABLE budget.budget_assumptions 
                ADD COLUMN scenario VARCHAR(20) NOT NULL DEFAULT 'most_likely';
            """)
        
        # Always ensure old constraints are dropped and new one exists
        # Drop ALL possible old constraint names (they don't include scenario)
        cur.execute("""
            ALTER TABLE budget.budget_assumptions 
            DROP CONSTRAINT IF EXISTS budget_assumptions_metric_care_type_year_quarter_branch_id_key;
        """)
        cur.execute("""
            ALTER TABLE budget.budget_assumptions 
            DROP CONSTRAINT IF EXISTS budget_assumptions_metric_care_type_year_quarter_branch__key;
        """)
        cur.execute("""
            ALTER TABLE budget.budget_assumptions 
            DROP CONSTRAINT IF EXISTS budget_assumptions_metric_care_type_year_quarter_branch_id__key;
        """)
        
        # Check if the correct constraint exists
        cur.execute("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.table_constraints 
                WHERE table_schema = 'budget' 
                AND table_name = 'budget_assumptions' 
                AND constraint_name = 'budget_assumptions_unique_scenario'
            );
        """)
        new_constraint_exists = cur.fetchone()['exists']
        
        if not new_constraint_exists:
            cur.execute("""
                ALTER TABLE budget.budget_assumptions 
                ADD CONSTRAINT budget_assumptions_unique_scenario 
                UNIQUE(metric, care_type, year, quarter, branch_id, scenario, version);
            """)
    
    # Create indexes
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_budget_last_value 
        ON budget.budget_assumptions(year, is_last_value);
        
        CREATE INDEX IF NOT EXISTS idx_budget_scenario 
        ON budget.budget_assumptions(year, scenario);
        
        CREATE INDEX IF NOT EXISTS idx_budget_composite 
        ON budget.budget_assumptions(metric, care_type, year, quarter, branch_id, is_last_value);
    """)
    
    # Create users table with branch support
    cur.execute("""
        CREATE TABLE IF NOT EXISTS budget.users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password_hash VARCHAR(128) NOT NULL,
            full_name VARCHAR(100),
            email VARCHAR(100),
            role VARCHAR(20) DEFAULT 'user',
            branch_id INTEGER,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP
        );
    """)
    
    # Check if branch_id column exists, add if not
    cur.execute("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'budget' 
            AND table_name = 'users' 
            AND column_name = 'branch_id'
        );
    """)
    branch_col_exists = cur.fetchone()['exists']
    
    if not branch_col_exists:
        cur.execute("""
            ALTER TABLE budget.users ADD COLUMN branch_id INTEGER;
        """)
    
    # Create default admin user if no users exist
    cur.execute("SELECT COUNT(*) as count FROM budget.users;")
    user_count = cur.fetchone()['count']
    
    if user_count == 0:
        # Create default admin user (password: admin123)
        admin_password_hash = hash_password('admin123')
        cur.execute("""
            INSERT INTO budget.users (username, password_hash, full_name, role)
            VALUES ('admin', %s, 'Administrator', 'admin');
        """, (admin_password_hash,))
        print("Default admin user created (username: admin, password: admin123)")
    
    conn.commit()
    cur.close()
    conn.close()


def hash_password(password):
    """Hash a password using SHA-256 with salt."""
    salt = os.getenv('PASSWORD_SALT', 'budget_app_salt_2024')
    return hashlib.sha256(f"{password}{salt}".encode()).hexdigest()


def login_required(f):
    """Decorator to require login for routes."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required', 'authenticated': False}), 401
        return f(*args, **kwargs)
    return decorated_function


def admin_required(f):
    """Decorator to require admin role for routes."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required', 'authenticated': False}), 401
        if session.get('role') != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated_function


# ============== Hijri Calendar Functions ==============

def is_ksa_national_holiday(check_date):
    """Check if a Gregorian date is a KSA national holiday."""
    month_day = (check_date.month, check_date.day)
    return month_day in KSA_NATIONAL_HOLIDAYS_GREGORIAN


def is_hijri_holiday(check_date):
    """Check if a date corresponds to a Hijri-based holiday."""
    try:
        # Convert Gregorian to Hijri
        hijri_date = Gregorian(check_date.year, check_date.month, check_date.day).to_hijri()
        month_day = (hijri_date.month, hijri_date.day)
        return month_day in KSA_HOLIDAYS_HIJRI
    except Exception as e:
        print(f"Error converting date to Hijri: {e}")
        return False


def is_ramadan(check_date):
    """Check if a date falls in Ramadan."""
    try:
        hijri_date = Gregorian(check_date.year, check_date.month, check_date.day).to_hijri()
        return hijri_date.month == RAMADAN_MONTH_HIJRI
    except Exception as e:
        print(f"Error checking Ramadan: {e}")
        return False


def is_eid_fitr(check_date):
    """Check if a date falls in Eid Al-Fitr period."""
    try:
        hijri_date = Gregorian(check_date.year, check_date.month, check_date.day).to_hijri()
        return (hijri_date.month == EID_FITR_MONTH_HIJRI and 
                hijri_date.day in EID_FITR_DAYS)
    except Exception as e:
        print(f"Error checking Eid Fitr: {e}")
        return False


def is_eid_adha(check_date):
    """Check if a date falls in Eid Al-Adha period."""
    try:
        hijri_date = Gregorian(check_date.year, check_date.month, check_date.day).to_hijri()
        return (hijri_date.month == EID_ADHA_MONTH_HIJRI and 
                EID_ADHA_START_DAY <= hijri_date.day <= EID_ADHA_END_DAY)
    except Exception as e:
        print(f"Error checking Eid Adha: {e}")
        return False


def get_calendar_adjustment_factor(check_date):
    """Get the calendar adjustment factor for a specific date.
    Priority: Eid > National Holiday > Hijri Holiday > Ramadan > Day of Week
    """
    # Check Eid periods (highest priority)
    if is_eid_adha(check_date):
        return CALENDAR_FACTORS['eid_adha']
    
    if is_eid_fitr(check_date):
        return CALENDAR_FACTORS['eid_fitr']
    
    # Check national holidays
    if is_ksa_national_holiday(check_date):
        return CALENDAR_FACTORS['holiday']
    
    # Check Hijri-based holidays
    if is_hijri_holiday(check_date):
        return CALENDAR_FACTORS['holiday']
    
    # Check Ramadan
    if is_ramadan(check_date):
        return CALENDAR_FACTORS['ramadan']
    
    # Day of week factors (0=Monday, 4=Friday, 5=Saturday, 6=Sunday)
    weekday = check_date.weekday()
    if weekday == 4:  # Friday
        return CALENDAR_FACTORS['friday']
    elif weekday == 5:  # Saturday
        return CALENDAR_FACTORS['saturday']
    else:
        return CALENDAR_FACTORS['weekday']


# Initialize database on startup
try:
    init_database()
    DB_AVAILABLE = True
    print("Database initialized successfully")
except Exception as e:
    DB_AVAILABLE = False
    print(f"Database initialization warning: {e}")


@app.route('/')
def serve_frontend():
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)


# ============== Authentication Routes ==============

@app.route('/api/auth/login', methods=['POST'])
def login():
    """User login endpoint."""
    try:
        data = request.json
        username = data.get('username', '').strip()
        password = data.get('password', '')
        
        if not username or not password:
            return jsonify({'error': 'Username and password are required'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        password_hash = hash_password(password)
        cur.execute("""
            SELECT id, username, full_name, email, role, branch_id, is_active
            FROM budget.users 
            WHERE username = %s AND password_hash = %s
        """, (username, password_hash))
        
        user = cur.fetchone()
        
        if not user:
            cur.close()
            conn.close()
            return jsonify({'error': 'Invalid username or password'}), 401
        
        if not user['is_active']:
            cur.close()
            conn.close()
            return jsonify({'error': 'Account is disabled'}), 403
        
        # Update last login
        cur.execute("""
            UPDATE budget.users SET last_login = CURRENT_TIMESTAMP WHERE id = %s
        """, (user['id'],))
        conn.commit()
        cur.close()
        conn.close()
        
        # Set session
        session.permanent = True
        session['user_id'] = user['id']
        session['username'] = user['username']
        session['branch_id'] = user['branch_id']
        session['full_name'] = user['full_name']
        session['role'] = user['role']
        
        return jsonify({
            'success': True,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'full_name': user['full_name'],
                'email': user['email'],
                'role': user['role'],
                'branch_id': user['branch_id'],
                'branch_name': BRANCH_NAMES.get(user['branch_id'], 'All Branches') if user['branch_id'] else 'All Branches'
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """User logout endpoint."""
    session.clear()
    return jsonify({'success': True, 'message': 'Logged out successfully'})


@app.route('/api/auth/check', methods=['GET'])
def check_auth():
    """Check if user is authenticated."""
    if 'user_id' in session:
        branch_id = session.get('branch_id')
        return jsonify({
            'authenticated': True,
            'user': {
                'id': session.get('user_id'),
                'username': session.get('username'),
                'full_name': session.get('full_name'),
                'role': session.get('role'),
                'branch_id': branch_id,
                'branch_name': BRANCH_NAMES.get(branch_id, 'All Branches') if branch_id else 'All Branches'
            }
        })
    return jsonify({'authenticated': False})


@app.route('/api/auth/change-password', methods=['POST'])
@login_required
def change_password():
    """Change user password."""
    try:
        data = request.json
        current_password = data.get('current_password', '')
        new_password = data.get('new_password', '')
        
        if not current_password or not new_password:
            return jsonify({'error': 'Current and new passwords are required'}), 400
        
        if len(new_password) < 6:
            return jsonify({'error': 'New password must be at least 6 characters'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verify current password
        current_hash = hash_password(current_password)
        cur.execute("""
            SELECT id FROM budget.users 
            WHERE id = %s AND password_hash = %s
        """, (session['user_id'], current_hash))
        
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'error': 'Current password is incorrect'}), 401
        
        # Update password
        new_hash = hash_password(new_password)
        cur.execute("""
            UPDATE budget.users SET password_hash = %s WHERE id = %s
        """, (new_hash, session['user_id']))
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Password changed successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============== User Management Routes (Admin Only) ==============

@app.route('/api/users', methods=['GET'])
@admin_required
def get_users():
    """Get all users (admin only)."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, username, full_name, email, role, branch_id, is_active, created_at, last_login
            FROM budget.users ORDER BY created_at DESC
        """)
        users = cur.fetchall()
        cur.close()
        conn.close()
        
        # Add branch names to users
        users_list = []
        for u in users:
            user_dict = dict(u)
            user_dict['branch_name'] = BRANCH_NAMES.get(u['branch_id'], 'All Branches') if u['branch_id'] else 'All Branches'
            users_list.append(user_dict)
        
        return jsonify({'users': users_list, 'branches': BRANCH_NAMES})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/users', methods=['POST'])
@admin_required
def create_user():
    """Create a new user (admin only)."""
    try:
        data = request.json
        username = data.get('username', '').strip()
        password = data.get('password', '')
        full_name = data.get('full_name', '').strip()
        email = data.get('email', '').strip()
        role = data.get('role', 'user')
        branch_id = data.get('branch_id')  # None means all branches (admin)
        
        if not username or not password:
            return jsonify({'error': 'Username and password are required'}), 400
        
        if len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400
        
        if role not in ['user', 'admin']:
            role = 'user'
        
        # Validate branch_id if provided
        if branch_id is not None:
            try:
                branch_id = int(branch_id)
                if branch_id not in BRANCHES:
                    branch_id = None
            except (ValueError, TypeError):
                branch_id = None
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if username exists
        cur.execute("SELECT id FROM budget.users WHERE username = %s", (username,))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'error': 'Username already exists'}), 400
        
        password_hash = hash_password(password)
        cur.execute("""
            INSERT INTO budget.users (username, password_hash, full_name, email, role, branch_id)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
        """, (username, password_hash, full_name, email, role, branch_id))
        
        new_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({'success': True, 'user_id': new_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/users/<int:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    """Update a user (admin only)."""
    try:
        data = request.json
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        updates = []
        params = []
        
        if 'full_name' in data:
            updates.append("full_name = %s")
            params.append(data['full_name'])
        if 'email' in data:
            updates.append("email = %s")
            params.append(data['email'])
        if 'role' in data and data['role'] in ['user', 'admin']:
            updates.append("role = %s")
            params.append(data['role'])
        if 'is_active' in data:
            updates.append("is_active = %s")
            params.append(data['is_active'])
        if 'branch_id' in data:
            branch_id = data['branch_id']
            if branch_id is not None and branch_id != '':
                try:
                    branch_id = int(branch_id)
                    if branch_id not in BRANCHES:
                        branch_id = None
                except (ValueError, TypeError):
                    branch_id = None
            else:
                branch_id = None
            updates.append("branch_id = %s")
            params.append(branch_id)
        if 'password' in data and data['password']:
            if len(data['password']) < 6:
                return jsonify({'error': 'Password must be at least 6 characters'}), 400
            updates.append("password_hash = %s")
            params.append(hash_password(data['password']))
        
        if not updates:
            return jsonify({'error': 'No fields to update'}), 400
        
        params.append(user_id)
        cur.execute(f"""
            UPDATE budget.users SET {', '.join(updates)} WHERE id = %s
        """, params)
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """Delete a user (admin only)."""
    try:
        # Prevent deleting yourself
        if user_id == session.get('user_id'):
            return jsonify({'error': 'Cannot delete your own account'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM budget.users WHERE id = %s", (user_id,))
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============== Budget Data Routes ==============


@app.route('/api/config', methods=['GET'])
def get_config():
    """Return predefined configuration options."""
    return jsonify({
        'metrics': METRICS,
        'care_types': CARE_TYPES,
        'input_types': INPUT_TYPES,
        'branches': BRANCHES,
        'quarters': QUARTERS,
        'branch_names': BRANCH_NAMES,
        'metric_care_types': METRIC_CARE_TYPES,
        'metric_input_types': METRIC_INPUT_TYPES,
        'scenarios': SCENARIOS
    })


@app.route('/api/years', methods=['GET'])
def get_years():
    """Get list of years that have data."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT year 
            FROM budget.budget_assumptions 
            WHERE is_last_value = TRUE 
            ORDER BY year DESC
        """)
        years = [row['year'] for row in cur.fetchall()]
        cur.close()
        conn.close()
        return jsonify({'years': years})
    except Exception as e:
        # Return empty list if DB not available - allows new year creation
        print(f"Warning: Could not fetch years - {e}")
        return jsonify({'years': []})


@app.route('/api/branches', methods=['GET'])
def get_branches():
    """Get list of branches that have budget assumptions data."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT branch_id 
            FROM budget.budget_assumptions 
            WHERE is_last_value = TRUE 
            ORDER BY branch_id
        """)
        branch_ids = [row['branch_id'] for row in cur.fetchall()]
        cur.close()
        conn.close()
        
        # Return branches with their names
        branches = [
            {'id': bid, 'name': BRANCH_NAMES.get(bid, f'Branch {bid}')}
            for bid in branch_ids
        ]
        return jsonify({'branches': branches})
    except Exception as e:
        print(f"Warning: Could not fetch branches - {e}")
        return jsonify({'branches': []})


@app.route('/api/scenarios', methods=['GET'])
def get_scenarios():
    """Get list of scenarios that have budget assumptions data."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT scenario 
            FROM budget.budget_assumptions 
            WHERE is_last_value = TRUE 
            ORDER BY scenario
        """)
        scenario_names = [row['scenario'] for row in cur.fetchall()]
        cur.close()
        conn.close()
        
        # Return scenarios with display names
        scenario_display = {
            'most_likely': 'Most Likely',
            'best_case': 'Best Case',
            'worst_case': 'Worst Case'
        }
        scenarios = [
            {'value': scenario, 'label': scenario_display.get(scenario, scenario.replace('_', ' ').title())}
            for scenario in scenario_names
        ]
        return jsonify({'scenarios': scenarios})
    except Exception as e:
        print(f"Warning: Could not fetch scenarios - {e}")
        return jsonify({'scenarios': []})


@app.route('/api/budget/<int:year>', methods=['GET'])
@login_required
def get_budget_data(year):
    """Get all budget data for a specific year and scenario (latest versions only).
    Regular users can only see their assigned branch data.
    Admins and users without branch assignment can see all data."""
    try:
        # Get scenario from query parameter, default to 'most_likely'
        scenario = request.args.get('scenario', 'most_likely')
        if scenario not in SCENARIOS:
            scenario = 'most_likely'
        
        # Get user's branch from session
        user_branch = session.get('branch_id')
        user_role = session.get('role')
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Filter by branch if user has one assigned (and is not admin)
        if user_branch and user_role != 'admin':
            cur.execute("""
                SELECT id, metric, care_type, year, quarter, input_type, branch_id, 
                       scenario, value, version, created_at, updated_at
                FROM budget.budget_assumptions 
                WHERE year = %s AND scenario = %s AND is_last_value = TRUE AND branch_id = %s
                ORDER BY metric, care_type, quarter, branch_id
            """, (year, scenario, user_branch))
        else:
            cur.execute("""
                SELECT id, metric, care_type, year, quarter, input_type, branch_id, 
                       scenario, value, version, created_at, updated_at
                FROM budget.budget_assumptions 
                WHERE year = %s AND scenario = %s AND is_last_value = TRUE
                ORDER BY metric, care_type, quarter, branch_id
            """, (year, scenario))
        
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        # Convert to list of dicts
        data = []
        for row in rows:
            data.append({
                'id': row['id'],
                'metric': row['metric'],
                'care_type': row['care_type'],
                'year': row['year'],
                'quarter': row['quarter'],
                'input_type': row['input_type'],
                'branch_id': row['branch_id'],
                'scenario': row['scenario'],
                'value': float(row['value']) if row['value'] else None,
                'version': row['version'],
                'created_at': row['created_at'].isoformat() if row['created_at'] else None,
                'updated_at': row['updated_at'].isoformat() if row['updated_at'] else None
            })
        
        return jsonify({
            'year': year,
            'scenario': scenario,
            'exists': len(data) > 0,
            'data': data
        })
    except Exception as e:
        # Return empty data if DB not available - allows template generation
        print(f"Warning: Could not fetch budget data - {e}")
        return jsonify({
            'year': year,
            'scenario': request.args.get('scenario', 'most_likely'),
            'exists': False,
            'data': []
        })


@app.route('/api/budget/history/<int:year>', methods=['GET'])
@login_required
def get_budget_history(year):
    """Get full history of changes for a year and scenario (all versions)."""
    try:
        # Get scenario from query parameter, default to 'most_likely'
        scenario = request.args.get('scenario', 'most_likely')
        if scenario not in SCENARIOS:
            scenario = 'most_likely'
        
        # Get user's branch from session
        user_branch = session.get('branch_id')
        user_role = session.get('role')
            
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Filter by branch if user has one assigned (and is not admin)
        if user_branch and user_role != 'admin':
            cur.execute("""
                SELECT id, metric, care_type, year, quarter, input_type, branch_id, 
                       scenario, value, version, is_last_value, created_at, updated_at
                FROM budget.budget_assumptions 
                WHERE year = %s AND scenario = %s AND branch_id = %s
                ORDER BY metric, care_type, quarter, branch_id, version DESC
            """, (year, scenario, user_branch))
        else:
            cur.execute("""
                SELECT id, metric, care_type, year, quarter, input_type, branch_id, 
                       scenario, value, version, is_last_value, created_at, updated_at
                FROM budget.budget_assumptions 
                WHERE year = %s AND scenario = %s
                ORDER BY metric, care_type, quarter, branch_id, version DESC
            """, (year, scenario))
        
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        data = []
        for row in rows:
            data.append({
                'id': row['id'],
                'metric': row['metric'],
                'care_type': row['care_type'],
                'year': row['year'],
                'quarter': row['quarter'],
                'input_type': row['input_type'],
                'branch_id': row['branch_id'],
                'scenario': row['scenario'],
                'value': float(row['value']) if row['value'] else None,
                'version': row['version'],
                'is_last_value': row['is_last_value'],
                'created_at': row['created_at'].isoformat() if row['created_at'] else None,
                'updated_at': row['updated_at'].isoformat() if row['updated_at'] else None
            })
        
        return jsonify({'year': year, 'scenario': scenario, 'history': data})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/budget', methods=['POST'])
@login_required
def create_budget_data():
    """Create new budget records for a year and scenario (batch insert)."""
    conn = None
    cur = None
    try:
        data = request.json
        year = data.get('year')
        scenario = data.get('scenario', 'most_likely')
        records = data.get('records', [])
        
        print(f"POST /api/budget - year: {year}, scenario: {scenario}, records count: {len(records)}")
        
        if not year or not records:
            return jsonify({'error': 'Year and records are required'}), 400
        
        # Validate records have required fields
        for i, record in enumerate(records):
            required_fields = ['metric', 'care_type', 'quarter', 'input_type', 'branch_id']
            missing = [f for f in required_fields if not record.get(f)]
            if missing:
                return jsonify({'error': f'Record {i} missing required fields: {missing}'}), 400
        
        # Get user's branch from session
        user_branch = session.get('branch_id')
        user_role = session.get('role')
        
        if scenario not in SCENARIOS:
            scenario = 'most_likely'
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        inserted = 0
        errors = []
        for record in records:
            # Skip records for other branches if user has a branch assigned (and is not admin)
            if user_branch and user_role != 'admin' and record['branch_id'] != user_branch:
                continue
            
            try:
                cur.execute("""
                    INSERT INTO budget.budget_assumptions 
                    (metric, care_type, year, quarter, input_type, branch_id, scenario, value, version, is_last_value)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 1, TRUE)
                    ON CONFLICT (metric, care_type, year, quarter, branch_id, scenario, version) DO NOTHING
                """, (
                    record['metric'],
                    record['care_type'],
                    year,
                    record['quarter'],
                    record['input_type'],
                    record['branch_id'],
                    scenario,
                    record.get('value')
                ))
                inserted += cur.rowcount
            except Exception as insert_err:
                errors.append(f"Error inserting {record.get('metric')}/{record.get('care_type')}/Q{record.get('quarter')}/B{record.get('branch_id')}: {str(insert_err)}")
        
        if errors:
            conn.rollback()
            cur.close()
            conn.close()
            return jsonify({'error': '; '.join(errors)}), 500
        
        conn.commit()
        cur.close()
        conn.close()
        
        print(f"POST /api/budget - inserted: {inserted}")
        return jsonify({'success': True, 'inserted': inserted, 'scenario': scenario})
    except Exception as e:
        print(f"POST /api/budget - ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        if cur:
            cur.close()
        if conn:
            conn.close()
        return jsonify({'error': str(e)}), 500


@app.route('/api/budget/<int:record_id>', methods=['PUT'])
@login_required
def update_budget_record(record_id):
    """Update a budget record with SCD versioning."""
    try:
        data = request.json
        new_value = data.get('value')
        
        # Get user's branch from session
        user_branch = session.get('branch_id')
        user_role = session.get('role')
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get current record
        cur.execute("""
            SELECT metric, care_type, year, quarter, input_type, branch_id, scenario, value, version
            FROM budget.budget_assumptions 
            WHERE id = %s AND is_last_value = TRUE
        """, (record_id,))
        current = cur.fetchone()
        
        if not current:
            cur.close()
            conn.close()
            return jsonify({'error': 'Record not found'}), 404
        
        # Check if user has permission to edit this branch
        if user_branch and user_role != 'admin' and current['branch_id'] != user_branch:
            cur.close()
            conn.close()
            return jsonify({'error': 'You do not have permission to edit this branch'}), 403
        
        # Mark current record as not last value
        cur.execute("""
            UPDATE budget.budget_assumptions 
            SET is_last_value = FALSE, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (record_id,))
        
        # Insert new version
        new_version = current['version'] + 1
        cur.execute("""
            INSERT INTO budget.budget_assumptions 
            (metric, care_type, year, quarter, input_type, branch_id, scenario, value, version, is_last_value)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
            RETURNING id
        """, (
            current['metric'],
            current['care_type'],
            current['year'],
            current['quarter'],
            current['input_type'],
            current['branch_id'],
            current['scenario'],
            new_value,
            new_version
        ))
        
        new_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'old_id': record_id,
            'new_id': new_id,
            'new_version': new_version
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/budget/<int:record_id>', methods=['DELETE'])
@login_required
def delete_budget_record(record_id):
    """Soft delete a record (mark as not last value with NULL value)."""
    try:
        # Get user's branch from session
        user_branch = session.get('branch_id')
        user_role = session.get('role')
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get current record
        cur.execute("""
            SELECT metric, care_type, year, quarter, input_type, branch_id, scenario, version
            FROM budget.budget_assumptions 
            WHERE id = %s AND is_last_value = TRUE
        """, (record_id,))
        current = cur.fetchone()
        
        if not current:
            cur.close()
            conn.close()
            return jsonify({'error': 'Record not found'}), 404
        
        # Check if user has permission to delete this branch's record
        if user_branch and user_role != 'admin' and current['branch_id'] != user_branch:
            cur.close()
            conn.close()
            return jsonify({'error': 'You do not have permission to delete this record'}), 403
        
        # Mark current as not last
        cur.execute("""
            UPDATE budget.budget_assumptions 
            SET is_last_value = FALSE, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (record_id,))
        
        # Insert deletion record (with NULL value)
        new_version = current['version'] + 1
        cur.execute("""
            INSERT INTO budget.budget_assumptions 
            (metric, care_type, year, quarter, input_type, branch_id, scenario, value, version, is_last_value)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NULL, %s, TRUE)
        """, (
            current['metric'],
            current['care_type'],
            current['year'],
            current['quarter'],
            current['input_type'],
            current['branch_id'],
            current['scenario'],
            new_version
        ))
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({'success': True, 'deleted_id': record_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/budget/batch', methods=['PUT'])
@login_required
def batch_update_budget():
    """Batch update multiple records for a specific scenario."""
    try:
        data = request.json
        updates = data.get('updates', [])
        scenario = data.get('scenario', 'most_likely')
        
        # Get user's branch from session
        user_branch = session.get('branch_id')
        user_role = session.get('role')
        
        if scenario not in SCENARIOS:
            scenario = 'most_likely'
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        updated_count = 0
        skipped_count = 0
        for update in updates:
            record_id = update.get('id')
            new_value = update.get('value')
            
            # Get current record
            cur.execute("""
                SELECT metric, care_type, year, quarter, input_type, branch_id, scenario, value, version
                FROM budget.budget_assumptions 
                WHERE id = %s AND is_last_value = TRUE
            """, (record_id,))
            current = cur.fetchone()
            
            if not current:
                continue
            
            # Check if user has permission to edit this branch
            if user_branch and user_role != 'admin' and current['branch_id'] != user_branch:
                skipped_count += 1
                continue
            
            if current['value'] != new_value:
                # Mark current as not last
                cur.execute("""
                    UPDATE budget.budget_assumptions 
                    SET is_last_value = FALSE, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                """, (record_id,))
                
                # Insert new version
                new_version = current['version'] + 1
                cur.execute("""
                    INSERT INTO budget.budget_assumptions 
                    (metric, care_type, year, quarter, input_type, branch_id, scenario, value, version, is_last_value)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
                """, (
                    current['metric'],
                    current['care_type'],
                    current['year'],
                    current['quarter'],
                    current['input_type'],
                    current['branch_id'],
                    current['scenario'],
                    new_value,
                    new_version
                ))
                updated_count += 1
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({'success': True, 'updated': updated_count, 'skipped': skipped_count, 'scenario': scenario})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============== Daily Budget Distribution Routes ==============

def init_calendar_tables():
    """Initialize tables for calendar factors and daily budget distribution."""
    conn = get_db_connection()
    cur = conn.cursor()
    
    # Public Holidays table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS budget.public_holidays (
            id SERIAL PRIMARY KEY,
            holiday_date DATE NOT NULL,
            holiday_name VARCHAR(100) NOT NULL,
            adjustment_factor DECIMAL(5, 2) DEFAULT 0.5,
            year INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(holiday_date)
        );
    """)
    
    # Ramadan periods table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS budget.ramadan_periods (
            id SERIAL PRIMARY KEY,
            year INTEGER NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            adjustment_factor DECIMAL(5, 2) DEFAULT 0.7,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(year)
        );
    """)
    
    # Eid periods table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS budget.eid_periods (
            id SERIAL PRIMARY KEY,
            year INTEGER NOT NULL,
            eid_type VARCHAR(20) NOT NULL,  -- 'fitr' or 'adha'
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            adjustment_factor DECIMAL(5, 2) DEFAULT 0.3,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(year, eid_type)
        );
    """)
    
    # Day of week adjustment factors
    cur.execute("""
        CREATE TABLE IF NOT EXISTS budget.day_adjustments (
            id SERIAL PRIMARY KEY,
            day_of_week INTEGER NOT NULL,  -- 0=Monday, 6=Sunday
            day_name VARCHAR(10) NOT NULL,
            adjustment_factor DECIMAL(5, 2) DEFAULT 1.0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(day_of_week)
        );
    """)
    
    # Insert default day of week factors if not exist
    cur.execute("SELECT COUNT(*) as cnt FROM budget.day_adjustments")
    if cur.fetchone()['cnt'] == 0:
        days = [
            (0, 'Monday', 1.0),
            (1, 'Tuesday', 1.0),
            (2, 'Wednesday', 1.0),
            (3, 'Thursday', 1.0),
            (4, 'Friday', 0.5),  # Weekend in KSA
            (5, 'Saturday', 0.6),  # Weekend in KSA
            (6, 'Sunday', 1.0)
        ]
        for day_num, day_name, factor in days:
            cur.execute("""
                INSERT INTO budget.day_adjustments (day_of_week, day_name, adjustment_factor)
                VALUES (%s, %s, %s)
            """, (day_num, day_name, factor))
    
    conn.commit()
    cur.close()
    conn.close()


# Initialize calendar tables
try:
    init_calendar_tables()
    print("Calendar tables initialized successfully")
except Exception as e:
    print(f"Calendar tables initialization warning: {e}")


# ============== Daily Budget Distribution Calculation ==============

@app.route('/api/daily-budget/calculate', methods=['POST'])
@login_required
def calculate_daily_budget():
    """
    Calculate daily budget distribution for a given year and scenario.
    Quarter is optional - if not provided, calculates for all 4 quarters (full year).
    Uses pre-calculated weights from vw_actual_for_weghit (avg of last 2 years).
    Maps days by weekday position in month (1st Sunday = 1st Sunday, etc.)
    """
    try:
        data = request.json
        year = data.get('year')
        quarter = data.get('quarter')  # Optional - None means full year
        scenario = data.get('scenario', 'most_likely')
        branch_id = data.get('branch_id')  # Optional filter
        
        if not year:
            return jsonify({'error': 'Year is required'}), 400
        
        if scenario not in SCENARIOS:
            scenario = 'most_likely'
        
        # Determine which quarters to process
        if quarter:
            quarters_to_process = [quarter]
        else:
            quarters_to_process = [1, 2, 3, 4]  # Full year
        
        # Step 1: Get budget data from ClickHouse vw_Budget
        ch_client = get_clickhouse_connection()
        
        if quarter:
            budget_query = """
                SELECT BranchId, Year, Quarter, scenario, Speciality, CareType, StayType, 
                       Census, Episodes, CPE_Budget, ALOS, Revenue
                FROM budget.vw_Budget
                WHERE Year = {year:UInt32} AND Quarter = {quarter:UInt8} AND scenario = {scenario:String}
            """
            query_params = {'year': year, 'quarter': quarter, 'scenario': scenario}
        else:
            budget_query = """
                SELECT BranchId, Year, Quarter, scenario, Speciality, CareType, StayType, 
                       Census, Episodes, CPE_Budget, ALOS, Revenue
                FROM budget.vw_Budget
                WHERE Year = {year:UInt32} AND scenario = {scenario:String}
            """
            query_params = {'year': year, 'scenario': scenario}
        
        if branch_id:
            budget_query += ' AND BranchId = {branch_id:UInt8}'
            query_params['branch_id'] = branch_id
        
        budget_result = ch_client.query(budget_query, parameters=query_params)
        budget_columns = budget_result.column_names
        budget_data = [dict(zip(budget_columns, row)) for row in budget_result.result_rows]
        
        if not budget_data:
            return jsonify({'error': 'No budget data found for the specified criteria'}), 404
        
        # Calculate source totals for verification
        source_total_revenue = sum(float(row.get('Revenue') or 0) for row in budget_data)
        source_total_census = sum(float(row.get('Census') or 0) for row in budget_data)
        
        # Step 2: Get actuals data from vw_actual_for_weight (avg of last 2 years)
        # Structure: BranchId, Month_, Day_, CareType, StayType, Speciality, Census, Revenue
        # Census weight is used for both Census and Episodes distribution
        weights_query = """
            SELECT BranchId, Month_, Day_, CareType, StayType, Speciality, 
                   Census, Revenue
            FROM budget.vw_actual_for_weight
        """
        weights_result = ch_client.query(weights_query)
        weights_columns = weights_result.column_names
        raw_weights_data = [dict(zip(weights_columns, row)) for row in weights_result.result_rows]
        
        # Calculate All_Revenue (total per Branch/CareType/StayType/Quarter)
        # and Weight = Revenue / All_Revenue
        # Also calculate Census weight for episodes distribution
        from collections import defaultdict
        
        # First pass: Calculate All_Revenue and All_Census per Branch/CareType/StayType for each quarter
        total_revenue_by_group_quarter = defaultdict(float)
        total_census_by_group_quarter = defaultdict(float)
        for w in raw_weights_data:
            month = w['Month_']
            q = (month - 1) // 3 + 1  # Determine quarter from month
            key = (w['BranchId'], w['CareType'], w['StayType'], q)
            total_revenue_by_group_quarter[key] += float(w['Revenue'] or 0)
            total_census_by_group_quarter[key] += float(w['Census'] or 0)
        
        # Second pass: Add calculated All_Revenue, Weight, and Census_Weight to each record
        # Weight = Revenue / All_Revenue (for revenue distribution)
        # Census_Weight = Census / All_Census (for episodes distribution)
        weights_data = []
        for w in raw_weights_data:
            month = w['Month_']
            q = (month - 1) // 3 + 1
            key = (w['BranchId'], w['CareType'], w['StayType'], q)
            all_revenue = total_revenue_by_group_quarter.get(key, 0)
            all_census = total_census_by_group_quarter.get(key, 0)
            weight = float(w['Revenue'] or 0) / all_revenue if all_revenue > 0 else 0
            census_weight = float(w['Census'] or 0) / all_census if all_census > 0 else 0
            w['All_Revenue'] = all_revenue
            w['All_Census'] = all_census
            w['Weight'] = weight
            w['Census_Weight'] = census_weight
            w['Quarter'] = q  # Add quarter to weight record
            weights_data.append(w)
        
        # Step 3: Generate dates and map to weekday positions
        from calendar import monthrange
        
        def get_weekday_position(d):
            """Get the position of this weekday in the month (1st Sunday, 2nd Monday, etc.)"""
            day_of_week = d.weekday()  # 0=Monday, 6=Sunday
            day_of_month = d.day
            position = (day_of_month - 1) // 7 + 1
            return position
        
        def get_calendar_factor(check_date):
            """Get the adjustment factor for a specific date using automatic Hijri calendar detection."""
            return get_calendar_adjustment_factor(check_date)
        
        # Generate all dates for the requested period (quarter or full year)
        # Build a dict: {quarter: [date_info, ...]}
        dates_by_quarter = {}
        for q in quarters_to_process:
            q_start_month = (q - 1) * 3 + 1
            q_end_month = q * 3
            dates_by_quarter[q] = []
            for month in range(q_start_month, q_end_month + 1):
                last_day = monthrange(year, month)[1]
                for day in range(1, last_day + 1):
                    d = date(year, month, day)
                    dates_by_quarter[q].append({
                        'date': d,
                        'month': month,
                        'quarter': q,
                        'day_position': get_weekday_position(d),  # 1st, 2nd, 3rd, etc.
                        'calendar_factor': get_calendar_factor(d)
                    })
        
        # Step 5: Build weight lookup by (BranchId, Month, DayPosition, CareType, StayType, Speciality)
        weight_lookup = {}
        for w in weights_data:
            key = (
                w['BranchId'],
                w['Month_'],
                w['Day_'],  # This is the day position (1st, 2nd, etc.)
                w['CareType'],
                w['StayType'],
                w['Speciality']
            )
            weight_lookup[key] = float(w['Weight'] or 0)
        
        # Step 6: Calculate daily distribution for each budget row
        daily_results = []
        
        for budget_row in budget_data:
            branch = budget_row['BranchId']
            budget_quarter = budget_row['Quarter']  # Get quarter from budget row
            care_type = budget_row['CareType']
            stay_type = budget_row['StayType']
            budget_speciality = budget_row['Speciality']  # NULL for LTC, has value for others
            budget_census = float(budget_row['Census'] or 0)
            budget_episodes = float(budget_row['Episodes'] or 0)
            budget_cpe = float(budget_row['CPE_Budget'] or 0)
            budget_alos = float(budget_row['ALOS'] or 0)
            budget_revenue = float(budget_row['Revenue'] or 0)
            
            # Get the dates for this budget row's quarter
            quarter_dates = dates_by_quarter.get(budget_quarter, [])
            if not quarter_dates:
                continue
            
            # Calculate month range for this quarter
            quarter_start_month = (budget_quarter - 1) * 3 + 1
            quarter_end_month = budget_quarter * 3
            
            # Get all weights for this branch/caretype/staytype/quarter
            # For non-LTC, also match by Speciality from budget row
            # Store both Revenue weight and Census weight
            relevant_weights = {}
            relevant_census_weights = {}
            for w in weights_data:
                if (w['BranchId'] == branch and 
                    w['CareType'] == care_type and 
                    w['StayType'] == stay_type and
                    w['Quarter'] == budget_quarter):
                    # For LTC (no speciality in budget), include all weights
                    # For others, match by speciality
                    if stay_type == 'LTC' or w['Speciality'] == budget_speciality:
                        key = (w['Month_'], w['Day_'], w['Speciality'])
                        relevant_weights[key] = float(w['Weight'] or 0)
                        relevant_census_weights[key] = float(w['Census_Weight'] or 0)
            
            if not relevant_weights:
                # No weight data - distribute evenly with calendar factors
                total_cal_factor = sum(d['calendar_factor'] for d in quarter_dates)
                
                for date_info in quarter_dates:
                    d = date_info['date']
                    cal_factor = date_info['calendar_factor']
                    weight = cal_factor / total_cal_factor if total_cal_factor > 0 else 1.0 / len(quarter_dates)
                    
                    daily_results.append({
                        'branch_id': branch,
                        'table_date': str(d),
                        'quarter': budget_quarter,
                        'scenario': scenario,
                        'care_type': care_type,
                        'stay_type': stay_type,
                        'speciality': budget_speciality,
                        'census': round(budget_census * weight, 4) if stay_type in ['OP', 'ER'] else 0,
                        'episodes': round(budget_episodes * weight, 4) if stay_type in ['OP', 'ER'] else 0,
                        'cpe': budget_cpe,
                        'alos': budget_alos,
                        'revenue': round(budget_revenue * weight, 4)
                    })
            else:
                # Step 6a: Map dates to weights and apply calendar factors
                # First, collect weights for dates that have weight data
                # Track both revenue weights and census weights separately
                date_weights = []
                dates_with_weights = set()
                
                for date_info in quarter_dates:
                    d = date_info['date']
                    month = date_info['month']
                    day_pos = date_info['day_position']
                    cal_factor = date_info['calendar_factor']
                    
                    # Find all speciality combinations for this month/day_position
                    found_weight = False
                    for (m, dp, speciality), base_weight in relevant_weights.items():
                        if m == month and dp == day_pos:
                            found_weight = True
                            # Get census weight for this same key
                            base_census_weight = relevant_census_weights.get((m, dp, speciality), 0)
                            # Apply calendar factor to both weights
                            adjusted_weight = base_weight * cal_factor
                            adjusted_census_weight = base_census_weight * cal_factor
                            date_weights.append({
                                'date': d,
                                'speciality': speciality,
                                'base_weight': base_weight,
                                'adjusted_weight': adjusted_weight,
                                'base_census_weight': base_census_weight,
                                'adjusted_census_weight': adjusted_census_weight
                            })
                    
                    if found_weight:
                        dates_with_weights.add(str(d))
                
                # Step 6b: Normalize weights so they sum to 1 (preserves budget totals)
                # This ensures 100% of the budget is distributed to days with weight data
                # Normalize revenue weights and census weights separately
                total_adjusted_weight = sum(dw['adjusted_weight'] for dw in date_weights)
                total_adjusted_census_weight = sum(dw['adjusted_census_weight'] for dw in date_weights)
                
                if total_adjusted_weight > 0:
                    for dw in date_weights:
                        # Use revenue weight for revenue distribution
                        normalized_weight = dw['adjusted_weight'] / total_adjusted_weight
                        # Use census weight for episodes distribution (based on Census from vw_actual_for_weight)
                        normalized_census_weight = dw['adjusted_census_weight'] / total_adjusted_census_weight if total_adjusted_census_weight > 0 else normalized_weight
                        
                        daily_results.append({
                            'branch_id': branch,
                            'table_date': str(dw['date']),
                            'quarter': budget_quarter,
                            'scenario': scenario,
                            'care_type': care_type,
                            'stay_type': stay_type,
                            'speciality': budget_speciality if stay_type != 'LTC' else dw['speciality'],
                            'census': round(budget_census * normalized_census_weight, 4) if stay_type in ['OP', 'ER'] else 0,
                            'episodes': round(budget_episodes * normalized_census_weight, 4) if stay_type in ['OP', 'ER'] else 0,
                            'cpe': budget_cpe,
                            'alos': budget_alos,
                            'revenue': round(budget_revenue * normalized_weight, 4)
                        })
                else:
                    # Fallback: If no weights matched, distribute evenly across all days
                    total_cal_factor = sum(d['calendar_factor'] for d in quarter_dates)
                    for date_info in quarter_dates:
                        d = date_info['date']
                        cal_factor = date_info['calendar_factor']
                        weight = cal_factor / total_cal_factor if total_cal_factor > 0 else 1.0 / len(quarter_dates)
                        
                        daily_results.append({
                            'branch_id': branch,
                            'table_date': str(d),
                            'quarter': budget_quarter,
                            'scenario': scenario,
                            'care_type': care_type,
                            'stay_type': stay_type,
                            'speciality': budget_speciality,
                            'census': round(budget_census * weight, 4) if stay_type in ['OP', 'ER'] else 0,
                            'episodes': round(budget_episodes * weight, 4) if stay_type in ['OP', 'ER'] else 0,
                            'cpe': budget_cpe,
                            'alos': budget_alos,
                            'revenue': round(budget_revenue * weight, 4)
                        })
        
        # Aggregate results for display (Branch, Day, CareType, StayType, Speciality)
        aggregated = defaultdict(lambda: {'census': 0, 'episodes': 0, 'revenue': 0, 'cpe': 0, 'alos': 0})
        for r in daily_results:
            key = (r['branch_id'], r['table_date'], r['care_type'], r['stay_type'], r['speciality'], r['scenario'])
            aggregated[key]['census'] += r['census']
            aggregated[key]['episodes'] += r['episodes']
            aggregated[key]['revenue'] += r['revenue']
            aggregated[key]['cpe'] = r['cpe']
            aggregated[key]['alos'] = r['alos']
        
        aggregated_results = []
        for (branch_id, table_date, care_type, stay_type, speciality, scen), values in aggregated.items():
            # Derive quarter from date
            month = int(table_date.split('-')[1])
            quarter = (month - 1) // 3 + 1
            aggregated_results.append({
                'branch_id': branch_id,
                'table_date': table_date,
                'quarter': quarter,
                'scenario': scen,
                'care_type': care_type,
                'stay_type': stay_type,
                'speciality': speciality,
                'census': round(values['census'], 4),
                'episodes': round(values['episodes'], 4),
                'cpe': values['cpe'],
                'alos': values['alos'],
                'revenue': round(values['revenue'], 4)
            })
        
        # Sort by date
        aggregated_results.sort(key=lambda x: (x['table_date'], x['branch_id'], x['care_type'], x['speciality'] or ''))
        
        # Calculate distributed totals for verification
        distributed_total_revenue = sum(r['revenue'] for r in aggregated_results)
        distributed_total_census = sum(r['census'] for r in aggregated_results)
        
        return jsonify({
            'success': True,
            'year': year,
            'quarter': quarter,  # None if full year
            'quarters': quarters_to_process,  # List of quarters processed
            'scenario': scenario,
            'total_records': len(aggregated_results),
            'detail_records': len(daily_results),
            'daily_budget': aggregated_results,
            'detail_data': daily_results,  # Full detail at purchaser/speciality level
            # Totals for verification
            'source_totals': {
                'revenue': round(source_total_revenue, 2),
                'census': round(source_total_census, 2)
            },
            'distributed_totals': {
                'revenue': round(distributed_total_revenue, 2),
                'census': round(distributed_total_census, 2)
            }
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/daily-budget/summary', methods=['GET'])
@login_required
def get_daily_budget_summary():
    """
    Get a summary of daily budget distribution with totals for reconciliation.
    """
    try:
        year = request.args.get('year', type=int)
        quarter = request.args.get('quarter', type=int)
        scenario = request.args.get('scenario', 'most_likely')
        branch_id = request.args.get('branch_id', type=int)
        
        if not year or not quarter:
            return jsonify({'error': 'Year and quarter are required'}), 400
        
        # Get original quarterly budget from ClickHouse for comparison
        ch_client = get_clickhouse_connection()
        
        budget_query = """
            SELECT BranchId, Year, Quarter, scenario, CareType, StayType, 
                   Census, CPE_Budget, ALOS, Revenue
            FROM budget.vw_Budget
            WHERE Year = {year:UInt32} AND Quarter = {quarter:UInt8} AND scenario = {scenario:String}
        """
        query_params = {'year': year, 'quarter': quarter, 'scenario': scenario}
        
        if branch_id:
            budget_query += ' AND BranchId = {branch_id:UInt8}'
            query_params['branch_id'] = branch_id
        
        budget_result = ch_client.query(budget_query, parameters=query_params)
        budget_columns = budget_result.column_names
        budget_data = [dict(zip(budget_columns, row)) for row in budget_result.result_rows]
        
        return jsonify({
            'success': True,
            'quarterly_budget': budget_data,
            'year': year,
            'quarter': quarter,
            'scenario': scenario
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/daily-budget/publish', methods=['POST'])
@admin_required
def publish_to_clickhouse():
    """
    Publish daily budget data to ClickHouse budget_data table.
    Inserts the calculated daily budget at speciality level.
    Supports both single quarter and full year (multiple quarters) publishing.
    """
    try:
        data = request.json
        detail_data = data.get('detail_data', [])
        year = data.get('year')
        quarters = data.get('quarters', [])  # List of quarters being published
        scenario = data.get('scenario')
        
        print(f"Publish request: year={year}, quarters={quarters}, scenario={scenario}, detail_data_count={len(detail_data)}")
        
        if not detail_data:
            return jsonify({'error': 'No data to publish'}), 400
        
        if not quarters:
            return jsonify({'error': 'Quarters list is required'}), 400
        
        ch_client = get_clickhouse_connection()
        
        # Create budget_data table if not exists
        create_table_query = """
        CREATE TABLE IF NOT EXISTS budget.budget_data (
            BranchId UInt8,
            TableDate Date32,
            Year UInt16,
            Quarter UInt8,
            Scenario String,
            CareType String,
            StayType String,
            Speciality Nullable(String),
            Census Float64,
            Episodes Float64,
            CPE Float64,
            ALOS Float64,
            Revenue Float64,
            is_last_value UInt8 DEFAULT 1,
            CreatedAt DateTime DEFAULT now(),
            CreatedBy String
        ) ENGINE = MergeTree()
        ORDER BY (Year, Quarter, Scenario, BranchId, TableDate, CareType, StayType, Speciality, CreatedAt)
        """
        ch_client.command(create_table_query)
        
        # Mark existing data as not latest (is_last_value = 0) instead of deleting
        # This preserves history and allows rollback to previous versions
        # Use mutations_sync = 1 to ensure UPDATE completes before INSERT
        for q in quarters:
            update_query = """
            ALTER TABLE budget.budget_data UPDATE is_last_value = 0 
            WHERE Year = {year:UInt32} AND Quarter = {quarter:UInt8} AND Scenario = {scenario:String} AND is_last_value = 1
            SETTINGS mutations_sync = 1
            """
            ch_client.command(update_query, parameters={'year': year, 'quarter': q, 'scenario': scenario})
        
        # Prepare data for insertion
        created_by = session.get('username', 'system')
        from datetime import date as dt_date
        
        rows = []
        for record in detail_data:
            # Convert string date to date object for ClickHouse Date32
            table_date = record['table_date']
            if isinstance(table_date, str):
                table_date = dt_date.fromisoformat(table_date)
            
            # Get quarter from record, or derive from date if missing
            record_quarter = record.get('quarter')
            if record_quarter is None:
                # Derive quarter from date
                month = table_date.month if hasattr(table_date, 'month') else int(record['table_date'].split('-')[1])
                record_quarter = (month - 1) // 3 + 1
            
            rows.append([
                record['branch_id'],
                table_date,
                year,
                record_quarter,
                scenario,
                record['care_type'],
                record['stay_type'],
                record.get('speciality'),
                record['census'],
                record.get('episodes', 0),
                record['cpe'],
                record['alos'],
                record['revenue'],
                1,  # is_last_value = 1 for new records
                created_by
            ])
        
        print(f"Publishing {len(rows)} records to ClickHouse...")
        
        # Insert data
        ch_client.insert(
            'budget.budget_data',
            rows,
            column_names=['BranchId', 'TableDate', 'Year', 'Quarter', 'Scenario', 
                         'CareType', 'StayType', 'Speciality',
                         'Census', 'Episodes', 'CPE', 'ALOS', 'Revenue', 'is_last_value', 'CreatedBy']
        )
        
        # Verify actual count after insert
        verify_query = """
            SELECT COUNT(*) as cnt
            FROM budget.budget_data
            WHERE Year = {year:UInt32} 
              AND Scenario = {scenario:String}
              AND is_last_value = 1
        """
        verify_result = ch_client.query(verify_query, parameters={'year': year, 'scenario': scenario})
        actual_count = verify_result.result_rows[0][0] if verify_result.result_rows else 0
        
        print(f"Verified: {actual_count} records with is_last_value=1")
        
        return jsonify({
            'success': True,
            'message': f'Successfully published {len(rows)} records to ClickHouse ({actual_count} verified)',
            'records_count': len(rows),
            'actual_count': actual_count,
            'quarters': quarters
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/daily-budget/published-summary', methods=['GET'])
@login_required
def get_published_budget_summary():
    """
    Get summary statistics from the published budget_data table in ClickHouse.
    Returns total revenue, census, episodes, avg CPE, avg ALOS separated by LTC and Non-LTC.
    """
    try:
        year = request.args.get('year', type=int)
        scenario = request.args.get('scenario', 'most_likely')
        branch_id = request.args.get('branch_id', type=int)
        
        if not year:
            return jsonify({'error': 'Year is required'}), 400
        
        ch_client = get_clickhouse_connection()
        
        # Build base WHERE clause
        base_where = """
            WHERE Year = {year:UInt32} 
              AND Scenario = {scenario:String}
              AND is_last_value = 1
        """
        
        query_params = {'year': year, 'scenario': scenario}
        
        if branch_id:
            base_where += ' AND BranchId = {branch_id:UInt8}'
            query_params['branch_id'] = branch_id
        
        # Query for overall totals and separate LTC/Non-LTC metrics
        query = f"""
            SELECT 
                SUM(Revenue) as total_revenue,
                SUM(Census) as total_census,
                SUM(Episodes) as total_episodes,
                COUNT(*) as total_records,
                -- Non-LTC metrics (includes OP and ER)
                sumIf(Revenue, StayType IN ('OP', 'ER', 'Non-LTC')) as nonltc_revenue,
                sumIf(Census, StayType IN ('OP', 'ER')) as nonltc_census,
                sumIf(Episodes, StayType IN ('OP', 'ER')) as nonltc_episodes,
                avgIf(CPE, CPE > 0 AND StayType IN ('OP', 'ER')) as nonltc_cpe,
                avgIf(ALOS, ALOS > 0 AND StayType = 'Non-LTC') as nonltc_alos,
                -- LTC metrics
                sumIf(Revenue, StayType = 'LTC') as ltc_revenue,
                avgIf(ALOS, ALOS > 0 AND StayType = 'LTC') as ltc_alos
            FROM budget.budget_data
            {base_where}
        """
        
        result = ch_client.query(query, parameters=query_params)
        
        if result.result_rows and len(result.result_rows) > 0:
            row = result.result_rows[0]
            return jsonify({
                'success': True,
                'summary': {
                    'total_revenue': float(row[0] or 0),
                    'total_census': float(row[1] or 0),
                    'total_episodes': float(row[2] or 0),
                    'total_records': int(row[3] or 0),
                    # Non-LTC metrics
                    'nonltc_revenue': float(row[4] or 0),
                    'nonltc_census': float(row[5] or 0),
                    'nonltc_episodes': float(row[6] or 0),
                    'nonltc_cpe': float(row[7] or 0),
                    'nonltc_alos': float(row[8] or 0),
                    # LTC metrics
                    'ltc_revenue': float(row[9] or 0),
                    'ltc_alos': float(row[10] or 0)
                },
                'year': year,
                'scenario': scenario
            })
        else:
            return jsonify({
                'success': True,
                'summary': None,
                'message': 'No published data found'
            })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # Suppress Werkzeug request logs
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.WARNING)
    
    app.run(host='0.0.0.0', debug=False, port=5050)
