"""
Google Indexing API - 색인 생성 요청 스크립트
서비스 계정 JSON 키 + Search Console 소유자 등록 필요
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

from google.oauth2 import service_account
from googleapiclient.discovery import build

SERVICE_ACCOUNT_FILE = r'C:\Users\iceam\Downloads\gen-lang-client-0672540876-ad7f4e4e11a2.json'
SCOPES = ['https://www.googleapis.com/auth/indexing']

URLS = [
    'https://노란봉투법.com/',
    'https://노란봉투법.com/guide',
    'https://노란봉투법.com/checklist',
    'https://노란봉투법.com/manual',
    'https://노란봉투법.com/cases',
    'https://노란봉투법.com/database',
    'https://노란봉투법.com/news',
    'https://노란봉투법.com/ai',
    'https://노란봉투법.com/contact',
]

def main():
    credentials = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )
    service = build('indexing', 'v3', credentials=credentials)

    for url in URLS:
        try:
            body = {'url': url, 'type': 'URL_UPDATED'}
            response = service.urlNotifications().publish(body=body).execute()
            print(f'✅ {url} → {response.get("urlNotificationMetadata", {}).get("latestUpdate", {}).get("notifyTime", "OK")}')
        except Exception as e:
            print(f'❌ {url} → {e}')

if __name__ == '__main__':
    main()
