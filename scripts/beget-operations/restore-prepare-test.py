#!/usr/bin/env python3
import os,pathlib,json,secrets,subprocess,gzip,shutil,sqlite3,time
os.umask(0o077)
BASE=pathlib.Path('/root/afterlogin-restore-check-20261009-v2')
EXP=BASE/'expanded'
APP=EXP/'gostinaya'
DBNAME='afterlogin-restore-db-20261009'
GHOSTNAME='afterlogin-restore-ghost-20261009'
PROJECT='afterlogin-restorecheck-20261009'
FILE=BASE/'compose.json'
def run(args,**kwargs):
 r=subprocess.run(args,capture_output=True,text=True,**kwargs)
 if r.returncode:
  (BASE/'last-command-error.log').write_text(r.stderr)
  raise RuntimeError('Test command failed: '+args[0])
 return r.stdout
def compose(*args):
 return run(['docker','compose','-p',PROJECT,'-f',str(FILE),*args],timeout=240)
assert (APP/'database/db.js').is_file(), 'Required application code missing from archive'
source=json.loads((EXP/'config/ghost/compose.json').read_text())
rootpass=secrets.token_urlsafe(32)
dbpass=secrets.token_urlsafe(32)
ghostenv={k:v for k,v in source['services']['ghost']['environment'].items() if not k.startswith('mail__')}
ghostenv.update({'url':'http://localhost:8080','database__connection__host':'db','database__connection__password':dbpass,'database__connection__user':'ghost','database__connection__database':'ghost','mail__transport':'SMTP','mail__options__host':'127.0.0.1','mail__options__port':1025,'mail__options__secure':'false','mail__from':'restore@example.invalid'})
cfg={'services':{
 'db':{'image':source['services']['db']['image'],'container_name':DBNAME,'environment':{'MYSQL_ROOT_PASSWORD':rootpass,'MYSQL_DATABASE':'ghost','MYSQL_USER':'ghost','MYSQL_PASSWORD':dbpass},'volumes':[str(BASE/'mysql-data')+':/var/lib/mysql'],'mem_limit':'768m','networks':['isolated'],'healthcheck':{'test':['CMD-SHELL','MYSQL_PWD="$$MYSQL_ROOT_PASSWORD" mysqladmin ping -h 127.0.0.1 -uroot --silent'],'interval':'3s','timeout':'3s','retries':40}},
 'ghost':{'image':source['services']['ghost']['image'],'container_name':GHOSTNAME,'environment':ghostenv,'volumes':[str(EXP/'ghost-content')+':/var/lib/ghost/content'],'mem_limit':'768m','networks':['isolated'],'depends_on':{'db':{'condition':'service_healthy'}}}
},'networks':{'isolated':{'internal':True}}}
assert not FILE.exists(),'Test already prepared'
FILE.write_text(json.dumps(cfg,indent=2)); FILE.chmod(0o600)
(BASE/'mysql-data').mkdir(mode=0o700)
print('STARTING_ISOLATED_RESTORE_DATABASE',flush=True)
compose('up','-d','db','--wait','--wait-timeout','180')
with gzip.open(EXP/'data/ghost.sql.gz','rb') as source_sql, (BASE/'mysql-restore-errors.log').open('wb') as err:
 proc=subprocess.Popen(['docker','exec','-i',DBNAME,'sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --default-character-set=utf8mb4 "$MYSQL_DATABASE"'],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=err)
 shutil.copyfileobj(source_sql,proc.stdin); proc.stdin.close()
 assert proc.wait(timeout=180)==0,'SQL restore failed'
query='SELECT COUNT(*) FROM posts; SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM settings; CHECK TABLE posts,users,settings,integrations,api_keys;'
result=run(['docker','exec',DBNAME,'sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --batch --skip-column-names --default-character-set=utf8mb4 "$MYSQL_DATABASE" -e "$1"','sh',query],timeout=50)
rows=result.splitlines()
manifest=json.loads((EXP/'data/manifest.json').read_text())
assert rows[:3]==manifest['ghost_restore_counts_posts_users_settings']
assert len(rows)==8 and all(s.endswith('\tstatus\tOK') for s in rows[3:])
(APP/'database').mkdir(mode=0o700,exist_ok=True)
shutil.copyfile(EXP/'data/gostinaya.db',APP/'database/gostinaya.db')
(APP/'database/gostinaya.db').chmod(0o600)
with sqlite3.connect(APP/'database/gostinaya.db') as db:
 assert db.execute('PRAGMA integrity_check').fetchall()==[('ok',)]
 assert not db.execute('PRAGMA foreign_key_check').fetchall()
 counts={t:db.execute('SELECT COUNT(*) FROM '+t).fetchone()[0] for t in ['guests','discussion_topics','discussion_messages','article_discussions','newsletter_consents']}
print('SQLITE_RESTORED_COUNTS',json.dumps(counts),flush=True)
env={}
for line in (APP/'.env').read_text().splitlines():
 if '=' in line and not line.lstrip().startswith('#'):
  k,v=line.split('=',1); env[k]=v
env.update({'NODE_ENV':'development','PORT':'3001','APP_URL':'http://localhost:8080','GHOST_ADMIN_API_URL':'http://localhost:8080/ghost/api/admin','SESSION_SECRET':secrets.token_urlsafe(40),'GHOST_WEBHOOK_SECRET':secrets.token_urlsafe(32),'OPENAI_API_KEY':'','SMTP_HOST':'127.0.0.1','SMTP_PORT':'1025','SMTP_SECURE':'false','SMTP_USER':'restore-only','SMTP_PASS':'invalid','NEWSLETTER_SMTP_HOST':'127.0.0.1','NEWSLETTER_SMTP_PORT':'1025','NEWSLETTER_SMTP_SECURE':'false','NEWSLETTER_SMTP_USER':'restore-only','NEWSLETTER_SMTP_PASS':'invalid','MAIL_FROM':'Restore <restore@example.invalid>','NEWSLETTER_MAIL_FROM':'Restore <restore@example.invalid>'})
(APP/'.env').write_text('\n'.join(k+'='+v for k,v in env.items())+'\n')
(APP/'.env').chmod(0o600)
print('INSTALLING_DEPENDENCIES_FROM_RESTORED_LOCKFILE',flush=True)
with (BASE/'npm-ci.log').open('wb') as log:
 r=subprocess.run(['npm','ci','--omit=dev','--no-audit','--no-fund'],cwd=APP,stdout=log,stderr=log,timeout=300)
 assert r.returncode==0,'Restored dependency installation failed'
compose('up','-d','ghost')
pid=run(['docker','inspect','-f','{{.State.Pid}}',GHOSTNAME]).strip()
assert pid.isdigit() and int(pid)>0
BASE.joinpath('ghost-pid.txt').write_text(pid)
nginx=BASE/'nginx-restore.conf'
nginx.write_text('daemon off;\npid '+str(BASE/'nginx.pid')+';\nerror_log '+str(BASE/'nginx-error.log')+';\nevents { worker_connections 64; }\nhttp { include /etc/nginx/mime.types; access_log '+str(BASE/'nginx-access.log')+'; server { listen 127.0.0.1:8080; server_name localhost; location /gostinaya { proxy_pass http://127.0.0.1:3001; proxy_set_header Host $http_host; proxy_set_header X-Forwarded-Proto http; } location / { proxy_pass http://127.0.0.1:2368; proxy_set_header Host $http_host; proxy_set_header X-Forwarded-Proto http; } } }\n')
for unit,args,cwd in [
 ('afterlogin-restore-lounge-20261009-v2',['/usr/local/bin/node',str(APP/'app.js')],APP),
 ('afterlogin-restore-nginx-20261009-v2',['/usr/sbin/nginx','-c',str(nginx)],BASE)]:
 run(['systemd-run','--unit='+unit,'--property=NetworkNamespacePath=/proc/'+pid+'/ns/net','--property=WorkingDirectory='+str(cwd),'--property=IPAddressDeny=any','--property=IPAddressAllow=localhost','--property=MemoryMax=512M','--property=CPUQuota=100%','--property=UMask=0077',*args],timeout=30)
def http(url,**kwargs):
 return subprocess.run(['nsenter','-t',pid,'-n','curl','-sS','--max-time','10','-o',str(BASE/'last-http-body.txt'),'-w','%{http_code}',url],capture_output=True,text=True,**kwargs)
for i in range(90):
 a=http('http://localhost:8080/')
 b=http('http://localhost:8080/gostinaya/login')
 if a.returncode==0 and a.stdout=='200' and b.stdout=='200': break
 time.sleep(1)
else: raise RuntimeError('Restored applications did not become ready')
outside=subprocess.run(['nsenter','-t',pid,'-n','curl','-sS','--max-time','3','https://1.1.1.1'],capture_output=True)
assert outside.returncode!=0,'Test namespace unexpectedly has internet egress'
print('RESTORED_STACK_READY_6_67_0; EXTERNAL_NETWORK_BLOCKED',flush=True)
(BASE/'restore-preparation.json').write_text(json.dumps({'source':'after-login-20261009T040213Z','mysql_counts':rows[:3],'sqlite_counts':counts,'ghost':'6.67.0','external_network_blocked':True},indent=2))
