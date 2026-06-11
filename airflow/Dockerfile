FROM apache/airflow:2.10.5

# The supplier ingestion DAG shells out to `npm run supplier:ingest:db`,
# so the image needs Node 20+ alongside Airflow.
USER root
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
USER airflow
