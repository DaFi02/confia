# confIA backend (FastAPI) — Cloud Run container contract:
# https://docs.cloud.google.com/run/docs/container-contract
FROM python:3.14-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY main.py receipt_storage.py alembic.ini ./
COPY alembic ./alembic

ENV PATH="/app/.venv/bin:$PATH"

# Cloud Run injects PORT (default 8080) and requires listening on 0.0.0.0.
ENV PORT=8080
EXPOSE 8080

# Run pending Alembic migrations, then start the API. For multi-instance
# production deploys, prefer running `alembic upgrade head` as a separate
# release step/job instead of on every container start (avoids races).
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
