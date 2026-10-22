from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_HEAD(self): self.reply(True)
    def do_GET(self): self.reply()
    def do_POST(self): self.reply()
    def reply(self, head=False):
        path=self.path.split('?')[0]
        size=int(self.headers.get('Content-Length','0'))
        params=json.loads(self.rfile.read(size) or b'{}') if size else {}
        data=[]
        if path.endswith('/rpc/get_faq_by_category'):
            data=[{'id':999999,'unified_category':params.get('cat') or '노동조합','question':'합성 빌드 질문','answer':'합성 빌드 참고 문안','total_count':1}]
        elif path.endswith('/rpc/get_faq_category_counts'):
            data=[{'unified_category':'노동조합','count':1}]
        payload=json.dumps(data,ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(payload)))
        self.send_header('Content-Range','0-0/1' if data else '*/0')
        self.end_headers()
        if not head:self.wfile.write(payload)
print('synthetic Supabase build fixture ready on 127.0.0.1:45671',flush=True)
ThreadingHTTPServer(('127.0.0.1',45671),Handler).serve_forever()
