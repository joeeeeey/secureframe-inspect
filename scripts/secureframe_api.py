#!/usr/bin/env python3
"""Read Secureframe metadata; export count-only compliance baselines."""
import argparse
from collections import Counter
import json
import os
from pathlib import Path
import re
import sys
from safety import SafeError, secret, api_url, request, private_json

RESOURCES = ('frameworks','framework_requirements','controls','tests','integration_connections',
             'users','user_accounts','user_security_settings','repositories','cloud_resources',
             'devices','vendors','risks','trust_center_requests')
BASELINE = ('frameworks','controls','tests','integration_connections','users','repositories',
            'cloud_resources','devices','vendors','risks')

def request_json(path, params=None):
    base = os.environ.get('SECUREFRAME_API_BASE', 'https://api.secureframe.com')
    if base not in ('https://api.secureframe.com','https://api-uk.secureframe.com'):
        raise SafeError('Use an official US or UK Secureframe API origin.')
    auth = secret('SECUREFRAME_AUTH') if os.environ.get('SECUREFRAME_AUTH') else secret('SECUREFRAME_API_KEY', 'SECUREFRAME_API_KEY_FILE') + ' ' + secret('SECUREFRAME_API_SECRET', 'SECUREFRAME_API_SECRET_FILE')
    return request(api_url(base,path,params), headers={'Authorization':auth})[1]

def summary(payload):
    rows = payload.get('data', []) if isinstance(payload, dict) else []
    if not isinstance(rows, list):
        return {'kind':'object'}
    # Count a small known vocabulary; never persist arbitrary free text as keys.
    allowed = {'passed','failed','passing','failing','pending','not_applicable','active','inactive','in_progress','complete','incomplete','not_started'}
    counts = Counter()
    for row in rows:
        attrs = row.get('attributes', {}) if isinstance(row,dict) else {}
        state = attrs.get('status') if isinstance(attrs,dict) else None
        counts[state if isinstance(state,str) and state in allowed else 'other'] += 1
    total = payload.get('meta',{}).get('total') if isinstance(payload.get('meta'),dict) else None
    return {'fetched_count':len(rows), 'reported_total':total if type(total) is int else None, 'status_counts':dict(counts)}

def collect(resource, limit, max_pages):
    result = {'resource':resource, 'fetched_count':0, 'status_counts':{}, 'pages':0, 'complete':False}
    counts = Counter()
    for page in range(1,max_pages+1):
        part = summary(request_json('/'+resource, {'per_page':limit,'page':page}))
        count = part.get('fetched_count',0)
        result['fetched_count'] += count
        result['pages'] = page
        counts.update(part.get('status_counts',{}))
        result['reported_total'] = part.get('reported_total')
        total = result['reported_total']
        if count < limit or (total is not None and result['fetched_count'] >= total):
            result['complete'] = True
            break
    result['status_counts'] = dict(counts)
    return result

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='command',required=True)
    sub.add_parser('auth-check')
    ls=sub.add_parser('list');ls.add_argument('resource',choices=RESOURCES)
    ls.add_argument('--limit',type=int,default=25);ls.add_argument('--page',type=int,default=1)
    ls.add_argument('--summary',action='store_true')
    get=sub.add_parser('get');get.add_argument('resource',choices=RESOURCES);get.add_argument('id')
    b=sub.add_parser('baseline');b.add_argument('--out-dir',type=Path,required=True)
    b.add_argument('--limit',type=int,default=100);b.add_argument('--max-pages',type=int,default=10)
    b.add_argument('--dry-run',action='store_true')
    a=parser.parse_args(argv)
    try:
        if not 1 <= getattr(a,'limit',1) <= 100 or not 1 <= getattr(a,'max_pages',1) <= 100 or getattr(a,'page',1)<1:
            raise SafeError('Use page size 1..100 and max pages 1..100.')
        if a.command=='auth-check':
            request_json('/frameworks',{'per_page':1,'page':1});out={'ok':True}
        elif a.command=='list':
            out=request_json('/'+a.resource,{'per_page':a.limit,'page':a.page})
            if a.summary:out=summary(out)
        elif a.command=='get':
            if not re.fullmatch(r'[a-zA-Z0-9_-]+',a.id):raise SafeError('Invalid resource ID')
            out=request_json('/'+a.resource+'/'+a.id)
        elif a.dry_run:
            out={'would_collect':BASELINE,'mode':'counts-only','max_pages_per_resource':a.max_pages}
        else:
            out={'mode':'counts-only','resources':[collect(n,a.limit,a.max_pages) for n in BASELINE]}
            private_json(a.out_dir/'baseline.json',out)
        print(json.dumps(out,indent=2))
        return 0
    except (SafeError,OSError,ValueError) as e:
        print(str(e) if isinstance(e,SafeError) else 'Input or output error; details suppressed.',file=sys.stderr)
        return 2
if __name__=='__main__':raise SystemExit(main())
