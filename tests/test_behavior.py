import contextlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import secureframe_api as cli
class Behavior(unittest.TestCase):
    def test_baseline_contains_no_identifiers_or_free_text(self):
        payload={'data':[{'id':'private-id','attributes':{'email':'private@example.com','status':'private-name','password':'hidden'}}],'meta':{'total':1}}
        with patch('secureframe_api.request_json',return_value=payload) as req:
            result=cli.collect('users',100,10)
            self.assertTrue(result['complete']);self.assertNotIn('private',json.dumps(result))
            self.assertEqual(req.call_args.args[1],{'per_page':100,'page':1})
    def test_capped_pagination_is_explicit(self):
        with patch('secureframe_api.request_json',return_value={'data':[{}],'meta':{'total':3}}):
            result=cli.collect('tests',1,2)
            self.assertFalse(result['complete']);self.assertEqual(result['fetched_count'],2)
    def test_dry_run_no_auth_or_network(self):
        with patch('secureframe_api.request_json') as req,contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cli.main(['baseline','--out-dir','unused','--dry-run']),0);req.assert_not_called()
