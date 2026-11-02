# The shop software, online.  Built and run by Cloudflare Containers (see cloud/).
# Data is NOT kept in this image or on its disk: it is loaded from Supabase at start-up (backend/app/storage/cloud.py).

FROM node:22-slim AS screens
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN VITE_BASE_PATH=/shop-admin/ npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ABH_BASE_DIR=/srv/shop \
    SHOP_CLOUD=1 \
    BASE_PATH=/shop-admin \
    HOST=0.0.0.0 \
    PORT=8080 \
    AUTO_BACKUP_KEEP=14
WORKDIR /srv/shop/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=screens /src/frontend/dist /srv/shop/frontend/dist
RUN useradd --create-home shop && mkdir -p /srv/shop && chown -R shop /srv/shop
USER shop
EXPOSE 8080
CMD ["python", "-m", "uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8080", \
     "--proxy-headers", "--forwarded-allow-ips", "*", "--timeout-graceful-shutdown", "20", "--log-level", "warning"]
