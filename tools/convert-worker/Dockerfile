# LibreOffice 변환 워커 — 한 이미지로 Lambda 와 일반 HTTP 서버를 둘 다 돌린다.
#   기본           : Lambda 런타임(aws-lambda-ric)  — Lambda 컨테이너 이미지로 배포
#   MODE=http      : node server.mjs, PORT(기본 8080) — Lightsail·아무 Docker 호스트
# Lambda 는 /tmp 말고는 읽기 전용이라 HOME·임시 폴더를 /tmp 로 둔다.

# ── 1단계: Lambda 런타임 클라이언트(네이티브 빌드가 필요해 따로 만든다) ──
FROM node:22-trixie-slim AS ric
RUN apt-get update \
 && apt-get install -y --no-install-recommends g++ make cmake autoconf automake libtool unzip xz-utils python3 libcurl4-openssl-dev ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# ── 2단계: 실행 이미지 ──
FROM node:22-trixie-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice-calc-nogui libreoffice-writer-nogui libreoffice-impress-nogui \
      fonts-nanum fontconfig libcurl4t64 tini \
 && fc-cache -f \
 && rm -rf /var/lib/apt/lists/* /usr/share/doc/* /usr/share/man/*

ENV HOME=/tmp \
    TMPDIR=/tmp \
    SAL_USE_VCLPLUGIN=svp \
    SOFFICE_PATH=/usr/bin/soffice \
    LAMBDA_TASK_ROOT=/app \
    NODE_ENV=production \
    PORT=8080

WORKDIR /app
COPY --from=ric /app/node_modules ./node_modules
COPY package.json core.mjs server.mjs lambda.mjs docker-entrypoint.sh ./
RUN chmod 0755 /app/docker-entrypoint.sh && chmod -R a+rX /app

# HTTP 모드에서는 root 로 돌 이유가 없다(Lambda 는 자체 사용자로 실행).
USER node
EXPOSE 8080
# tini = PID 1. 시간 초과로 죽인 soffice.bin 이 node(PID 1) 밑에서 좀비로 남지 않게 거둔다(261123 실측).
ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker-entrypoint.sh"]
CMD ["lambda.handler"]
