import os, json, subprocess, base64, urllib.request
from pathlib import Path
BASE='bd585846d78469dd7528eb40eede93dc318646cd'
TREE='d86ad44bf51b6538e44f51aacde1a23b4f6b0b0f'
EXPECTED={
 'ARCHITECTURE.md':'f1cc27063f8fdf5ddd80fe27b766b81ac84822a9',
 'docs/reconciliations/2026-10-15-tech-pack-issued-document-context.md':'60541884ebb8d3bed0ce0c27b07454f21511ff77',
 'src/application/tech-pack-canonical-issue-service.mjs':'85085c9eececb35a1540fc489dd0f821dde113c9',
 'src/application/tech-pack-canonical-issue-snapshot.mjs':'c344dda1f5365314f039c4a8843b92165b99720d',
 'src/application/tech-pack-issued-document-context.mjs':'1f41e40d6742a687847de6c5cd2860e5b51a61ef',
 'src/infrastructure/postgres-tech-pack-document-sources.mjs':'79dfdef90bb8d74b11272160f58f5c587a8eb201',
 'src/infrastructure/postgres-tech-pack-reader.mjs':'d7a88ef4f4ebfc05187905464db62afc0ef9515a',
 'src/infrastructure/postgres-tech-pack-store.mjs':'308a897d2025b6437da20c6b91dcb425767e3e07',
 'tests/helpers/tech-pack-document-context-fixture.mjs':'05eec659aa2e86c95df2877b061db6aeae5e4c12',
 'tests/postgres/tech-pack-canonical-issue-positive.test.mjs':'3ac4ee930d05e674587cca430d6b0798f0d394fd',
 'tests/tech-pack-canonical-issue-service.test.mjs':'0db9896a7dc88c554851f7ecc3411f85560ce7f5',
 'tests/tech-pack-document-source-locking.test.mjs':'597d6608f823e882cf054caf8c5636641efaaa1a',
 'tests/tech-pack-issued-document-context.test.mjs':'8f8d9e0d6d787196149dc0cc772b7f7bfaeb8934'
}
assert subprocess.check_output(['git','rev-parse','HEAD^'],text=True).strip()==BASE
for path, sha in EXPECTED.items():
 actual=subprocess.check_output(['git','hash-object',path],text=True).strip()
 assert actual==sha, (path,actual,sha)
print('All 13 candidate blobs match locally tested file bytes.')
if os.environ.get('WRITE_GIT_OBJECTS')=='true':
 def post(endpoint, data):
  req=urllib.request.Request('https://api.github.com/repos/PetrFedin/synth-v2/git/'+endpoint,
    data=json.dumps(data).encode(),method='POST',headers={
    'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json',
    'Content-Type':'application/json','User-Agent':'Syntha-bounded-context-qualification'})
  with urllib.request.urlopen(req,timeout=30) as response:return json.load(response)
 entries=[]
 for path,sha in EXPECTED.items():
  result=post('blobs',{'encoding':'base64','content':base64.b64encode(Path(path).read_bytes()).decode()})
  assert result['sha']==sha
  entries.append({'path':path,'mode':'100644','type':'blob','sha':sha})
 result=post('trees',{'base_tree':TREE,'tree':entries})
 Path('context-tree.json').write_text(json.dumps({'base':BASE,'tree':result['sha'],'blobs':EXPECTED},indent=2))
 print('CANDIDATE_TREE='+result['sha'])
 with open(os.environ['GITHUB_OUTPUT'],'a') as output:output.write('tree='+result['sha']+'\n')
 # Intentionally do not create commits, update refs, merge or deploy here.
