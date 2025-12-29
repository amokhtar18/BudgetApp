# Budget App - Production Deployment Guide

## Deployment Options

### Option 1: Docker Deployment (Recommended)

#### Prerequisites
- Docker and Docker Compose installed
- Domain name (optional, for SSL)

#### Steps

1. **Clone/Copy the application to your server**
   ```bash
   scp -r "Budget App" user@your-server:/opt/budget-app
   ```

2. **Create production environment file**
   ```bash
   cd /opt/budget-app
   cp .env.production .env
   ```

3. **Edit .env with secure values**
   ```bash
   nano .env
   ```
   Generate secure keys:
   ```bash
   python3 -c "import secrets; print(secrets.token_hex(32))"
   ```

4. **Build and start containers**
   ```bash
   docker-compose up -d --build
   ```

5. **Check logs**
   ```bash
   docker-compose logs -f
   ```

6. **Access the application**
   - http://your-server-ip:80

---

### Option 2: Manual Deployment (Linux Server)

#### Prerequisites
- Python 3.9+
- PostgreSQL 12+
- Nginx
- Supervisor (for process management)

#### Steps

1. **Install system dependencies**
   ```bash
   sudo apt update
   sudo apt install python3-pip python3-venv postgresql nginx supervisor
   ```

2. **Create application user**
   ```bash
   sudo useradd -m -s /bin/bash budget
   sudo mkdir -p /opt/budget-app
   sudo chown budget:budget /opt/budget-app
   ```

3. **Copy application files**
   ```bash
   sudo -u budget cp -r * /opt/budget-app/
   ```

4. **Create virtual environment**
   ```bash
   sudo -u budget bash
   cd /opt/budget-app/backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   pip install gunicorn
   ```

5. **Create PostgreSQL database**
   ```bash
   sudo -u postgres psql
   CREATE DATABASE budget_db;
   CREATE USER budget_user WITH PASSWORD 'your_secure_password';
   GRANT ALL PRIVILEGES ON DATABASE budget_db TO budget_user;
   \q
   ```

6. **Configure environment**
   ```bash
   cd /opt/budget-app/backend
   nano .env
   ```
   Add:
   ```
   PG_HOST=localhost
   PG_PORT=5432
   PG_DATABASE=budget_db
   PG_USER=budget_user
   PG_PASSWORD=your_secure_password
   SECRET_KEY=your_generated_secret_key
   PASSWORD_SALT=your_generated_salt
   ```

7. **Create Supervisor config**
   ```bash
   sudo nano /etc/supervisor/conf.d/budget-app.conf
   ```
   Add:
   ```ini
   [program:budget-app]
   directory=/opt/budget-app/backend
   command=/opt/budget-app/backend/venv/bin/gunicorn --config gunicorn_config.py wsgi:app
   user=budget
   autostart=true
   autorestart=true
   stderr_logfile=/var/log/budget-app/error.log
   stdout_logfile=/var/log/budget-app/access.log
   environment=PATH="/opt/budget-app/backend/venv/bin"
   ```

8. **Create log directory**
   ```bash
   sudo mkdir -p /var/log/budget-app
   sudo chown budget:budget /var/log/budget-app
   ```

9. **Start the application**
   ```bash
   sudo supervisorctl reread
   sudo supervisorctl update
   sudo supervisorctl start budget-app
   ```

10. **Configure Nginx**
    ```bash
    sudo nano /etc/nginx/sites-available/budget-app
    ```
    Add:
    ```nginx
    server {
        listen 80;
        server_name your-domain.com;

        location / {
            proxy_pass http://127.0.0.1:8000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
    ```

11. **Enable site and restart Nginx**
    ```bash
    sudo ln -s /etc/nginx/sites-available/budget-app /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl restart nginx
    ```

---

### Option 3: Windows Server (IIS)

#### Prerequisites
- Windows Server 2019+
- IIS with URL Rewrite module
- Python 3.9+
- PostgreSQL

#### Steps

1. **Install Python and dependencies**
   ```powershell
   # Install Python from python.org
   cd "C:\budget-app\backend"
   python -m venv venv
   .\venv\Scripts\activate
   pip install -r requirements.txt
   pip install waitress
   ```

2. **Create Windows Service (using NSSM)**
   ```powershell
   # Download NSSM from nssm.cc
   nssm install BudgetApp "C:\budget-app\backend\venv\Scripts\python.exe"
   nssm set BudgetApp AppParameters "-m waitress --port=8000 wsgi:app"
   nssm set BudgetApp AppDirectory "C:\budget-app\backend"
   nssm start BudgetApp
   ```

3. **Configure IIS as Reverse Proxy**
   - Install URL Rewrite and ARR modules
   - Create website pointing to frontend folder
   - Add URL Rewrite rule to proxy /api/* to localhost:8000

---

## SSL/HTTPS Setup

### Using Let's Encrypt (Linux)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### Using Docker with Let's Encrypt

Add to docker-compose.yml:
```yaml
certbot:
  image: certbot/certbot
  volumes:
    - ./ssl:/etc/letsencrypt
    - ./certbot-www:/var/www/certbot
  command: certonly --webroot -w /var/www/certbot -d your-domain.com --email your@email.com --agree-tos
```

---

## Post-Deployment

### 1. Change Default Admin Password
Login with `admin` / `admin123` and change password immediately.

### 2. Create Users
Use admin panel or API to create additional users.

### 3. Backup Strategy
```bash
# Database backup (daily cron job)
pg_dump -U postgres budget_db > backup_$(date +%Y%m%d).sql
```

### 4. Monitoring
- Check logs: `docker-compose logs -f` or `/var/log/budget-app/`
- Monitor server resources
- Set up alerts for errors

---

## Troubleshooting

### Application won't start
```bash
# Check logs
docker-compose logs budget-app
# Or
tail -f /var/log/budget-app/error.log
```

### Database connection issues
```bash
# Test connection
psql -h localhost -U postgres -d budget_db
```

### Permission denied
```bash
sudo chown -R budget:budget /opt/budget-app
```

---

## Security Checklist

- [ ] Change default admin password
- [ ] Use strong SECRET_KEY and PASSWORD_SALT
- [ ] Enable HTTPS/SSL
- [ ] Configure firewall (allow only 80/443)
- [ ] Regular security updates
- [ ] Database backups
- [ ] Log monitoring
