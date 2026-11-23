#!/bin/sh
# 같은 이미지를 두 가지로 돌린다.
#   MODE=http  → node server.mjs (PORT, 기본 8080)
#   그 밖      → Lambda 런타임(aws-lambda-ric). Lambda 밖에서 그냥 띄우면 안내하고 끝낸다.
set -e
cd /app
if [ "$MODE" = "http" ]; then
  exec node /app/server.mjs
fi
if [ -z "$AWS_LAMBDA_RUNTIME_API" ]; then
  echo "Lambda 모드인데 AWS_LAMBDA_RUNTIME_API 가 없습니다. 일반 서버로 쓰려면 MODE=http 를 주세요." >&2
  exit 64
fi
exec /app/node_modules/.bin/aws-lambda-ric lambda.handler
