import requests
import json
import sys

BASE = 'http://localhost:8000'
PASS = 0
FAIL = 0

def test(label, method, url, expect=200, **kwargs):
    global PASS, FAIL
    try:
        r = getattr(requests, method)(url, timeout=15, **kwargs)
        ok = r.status_code == expect
        sym = 'PASS' if ok else 'FAIL'
        try: body = json.dumps(r.json())[:150]
        except: body = r.text[:150]
        print(f' [{sym}] {label} ({r.status_code})')
        if not ok: print(f'        {body}')
        if ok: PASS += 1
        else: FAIL += 1
        return r
    except Exception as e:
        print(f' [ERR]  {label}: {e}')
        FAIL += 1
        return None

print()
print('='*65)
print('  ASM BACKEND - CORE API TEST')
print('='*65)

print()
print('-- Core Endpoints --')
test('Root info',   'get', f'{BASE}/')
test('Health',      'get', f'{BASE}/health')
test('OpenAPI doc', 'get', f'{BASE}/openapi.json')

print()
print('-- Scan List --')
r_list = test('List scans', 'get', f'{BASE}/api/scans/list')
scans = []
sid = None
if r_list and r_list.ok:
    data = r_list.json()
    scans = data.get('scans', [])
    print(f'   -> {data["total"]} scan(s) available')
    if scans:
        sid = scans[0]['scan_id']
        print(f'   -> Using scan_id: {sid}')
        for s in scans[:3]:
            print(f'      * {s["scan_id"]} | {s["scan_name"]} | {s["status"]} | {s["num_points"]} pts')

print()
print('-- Per-scan Endpoints --')
if sid:
    test('Get scan meta',           'get', f'{BASE}/api/scans/{sid}')
    test('Get 404 (bad id)',        'get', f'{BASE}/api/scans/bad-id-xyz', expect=404)
    test('Analysis status',         'get', f'{BASE}/api/analysis/status/{sid}')
    test('Analysis result (404)',   'get', f'{BASE}/api/analysis/{sid}', expect=404)

print()
print('-- Upload Validation --')
test('Upload no file (422 expected)', 'post', f'{BASE}/api/scans/upload', expect=422)

print()
print('='*65)
print(f'  TOTAL: {PASS} passed / {PASS + FAIL} tests')
print('='*65)
