#!/usr/bin/env python3
import pathlib,subprocess,json,sqlite3,urllib.parse,sys
BASE=pathlib.Path('/root/afterlogin-restore-check-20261009-v2')
APP=BASE/'expanded/gostinaya'
pid=subprocess.check_output(['docker','inspect','-f','{{.State.Pid}}','afterlogin-restore-ghost-20261009'],text=True).strip()
assert pid.isdigit() and int(pid)>0
label=sys.argv[1] if len(sys.argv)>1 else '6.67.0'
def dbquery(sql):
 r=subprocess.run(['docker','exec','afterlogin-restore-db-20261009','sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --batch --raw --skip-column-names "$MYSQL_DATABASE" -e "$1"','sh',sql],capture_output=True,text=True,check=True)
 return r.stdout.splitlines()
def request(path,allowed=(200,),cookie=None,method=None,data=None,node=False,depth=0):
 args=['nsenter','-t',pid,'-n','curl','-sS','--max-time','20','-o',str(BASE/'http-check-body.txt'),'-D',str(BASE/'http-check-headers.txt'),'-w','%{http_code}']
 if cookie: args+=['-H','Cookie: '+cookie]
 if method: args+=['-X',method,'-H','Content-Type: application/json','--data',data]
 args+=['http://localhost:'+('3001' if node else '8080')+path]
 r=subprocess.run(args,capture_output=True,text=True)
 assert r.returncode==0,(path,r.stdout)
 if int(r.stdout) not in allowed and int(r.stdout) in (301,302,307,308):
  assert depth<4, 'Redirect limit'
  headers=(BASE/'http-check-headers.txt').read_text()
  location=next(line.split(':',1)[1].strip() for line in headers.splitlines() if line.lower().startswith('location:'))
  target=urllib.parse.urlsplit(location)
  assert not target.hostname or target.hostname in ('localhost','milenin.pro','www.milenin.pro'), 'Unexpected redirect host'
  return request(target.path+('?' + target.query if target.query else ''),allowed,cookie,method,data,node,depth+1)
 assert int(r.stdout) in allowed,(path,r.stdout)
 return int(r.stdout)
slugs=dbquery("SELECT slug FROM posts WHERE status='published' AND visibility='public' ORDER BY slug;")
for slug in slugs: request('/'+urllib.parse.quote(slug,safe='')+'/')
for path in ['/','/en/','/ghost/']: request(path,allowed=(200,301,302))
images=sorted({urllib.parse.urlsplit(x.replace('__GHOST_URL__','http://localhost:8080')).path for x in dbquery("SELECT DISTINCT feature_image FROM posts WHERE status='published' AND feature_image IS NOT NULL AND feature_image<>'';") if urllib.parse.urlsplit(x.replace('__GHOST_URL__','http://localhost:8080')).path.startswith('/content/')})
assert images, 'No local image paths found'
for path in images: request(path)
public=['/gostinaya/login','/gostinaya/login?lang=en','/gostinaya/register','/gostinaya/rules','/gostinaya/privacy','/gostinaya/newsletter/consent?lang=ru','/gostinaya/newsletter/consent?lang=en','/gostinaya/newsletter/privacy?lang=ru','/gostinaya/newsletter/privacy?lang=en']
for path in public: request(path)
request('/health',node=True)
request('/gostinaya/api/newsletter/subscribe',allowed=(400,),method='POST',data=json.dumps({'email':'restore@example.invalid','consent':False}))
with sqlite3.connect(APP/'database/gostinaya.db') as db:
 guest=db.execute('SELECT id FROM guests WHERE COALESCE(is_blocked,0)=0 ORDER BY id LIMIT 1').fetchone()[0]
 topic=db.execute('SELECT id FROM discussion_topics ORDER BY id LIMIT 1').fetchone()[0]
session_js="""const fs=require('fs');const dotenv=require('dotenv');const signature=require('cookie-signature');const crypto=require('crypto');const env=dotenv.parse(fs.readFileSync('.env'));const id='restorecheck'+crypto.randomBytes(12).toString('hex');fs.mkdirSync('database/sessions',{recursive:true,mode:0o700});fs.writeFileSync('database/sessions/'+id+'.json',JSON.stringify({cookie:{originalMaxAge:3600000,expires:new Date(Date.now()+3600000).toISOString(),httpOnly:true,secure:false,path:'/'},guest:{id:JSON.parse(process.argv[1])},__lastAccess:Date.now()}),{mode:0o600});console.log('gostinaya.sid='+encodeURIComponent('s:'+signature.sign(id,env.SESSION_SECRET)));"""
cookie=subprocess.check_output(['node','-e',session_js,json.dumps(guest)],cwd=APP,text=True).strip()
protected=['/gostinaya/hall','/gostinaya/members','/gostinaya/profile','/gostinaya/notifications','/gostinaya/discussions','/gostinaya/topic/'+str(topic)]
for path in protected: request(path,cookie=cookie)
api_js="""import 'dotenv/config';import {createGhostApiService} from './services/GhostApiService.js';const api=createGhostApiService();const n=await api.listNewsletters();const before=await api.listMembers();const target=n.find(x=>x.status==='active');if(!target)throw new Error('No active newsletter');const email='restore-check@example.invalid';if(await api.findMemberByEmail(email))throw new Error('Fixture unexpectedly exists');const member=await api.subscribeMember({email,newsletterName:target.name,labelName:'restore-check'});if(!await api.isMemberSubscribed({email,newsletterName:target.name}))throw new Error('Subscribe check failed');await api.unsubscribeMember({memberId:member.id,email,newsletterName:target.name});if(await api.isMemberSubscribed({email,newsletterName:target.name}))throw new Error('Unsubscribe check failed');await api.deleteFreeMemberByEmail(email);if((await api.listMembers()).length!==before.length)throw new Error('Fixture cleanup failed');console.log('RESTORED_GHOST_ADMIN_API_SUBSCRIBE_UNSUBSCRIBE_ERASURE_OK');"""
r=subprocess.run(['nsenter','-t',pid,'-n','/usr/local/bin/node','--input-type=module','-e',api_js],cwd=APP,capture_output=True,text=True,timeout=90)
if r.returncode:
 (BASE/('admin-api-error-'+label+'.log')).write_text(r.stderr)
 raise RuntimeError('Restored Ghost Admin API integration failed; see private test log')
print(r.stdout.strip())
outside=subprocess.run(['nsenter','-t',pid,'-n','curl','-sS','--max-time','3','https://1.1.1.1'],capture_output=True)
assert outside.returncode in (7,28), 'External connection was not blocked at network level'
routes=subprocess.check_output(['nsenter','-t',pid,'-n','ip','-4','route'],text=True)
assert 'default ' not in routes,'Unexpected default route in isolated network'
version=subprocess.check_output(['docker','exec','afterlogin-restore-ghost-20261009','node','-p',"require('/var/lib/ghost/current/package.json').version"],text=True).strip()
assert version==label
results={'version':version,'published_urls_checked':len(slugs),'feature_images_checked':len(images),'public_lounge_pages':len(public),'authenticated_lounge_pages':len(protected),'consent_required':True,'ghost_admin_api_subscribe_unsubscribe_erasure':True,'external_network_blocked':True,'source':'after-login-20261009T040213Z'}
(BASE/('verification-'+label+'.json')).write_text(json.dumps(results,indent=2))
print('FULL_APPLICATION_RESTORE_CHECK_OK',json.dumps(results))
