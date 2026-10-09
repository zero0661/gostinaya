import pathlib,json,subprocess,time
base=pathlib.Path('/root/afterlogin-restore-check-20261009-v2')
app=base/'expanded/gostinaya'
f=base/'compose.json'
def run(args,**kw):
 r=subprocess.run(args,capture_output=True,text=True,**kw)
 if r.returncode:
  (base/'test-upgrade-command-error.log').write_text(r.stderr)
  raise RuntimeError('Test upgrade command failed: '+args[0])
 return r.stdout
run(['systemctl','stop','afterlogin-restore-lounge-20261009-v2.service','afterlogin-restore-nginx-20261009-v2.service'])
cfg=json.loads(f.read_text())
cfg['services']['ghost']['image']='ghost@sha256:55131b90d48c3cecae6c085f873b2067542ababd286b12d08474b2b34328e266'
f.write_text(json.dumps(cfg,indent=2)); f.chmod(0o600)
run(['docker','compose','-p','afterlogin-restorecheck-20261009','-f',str(f),'up','-d','--no-deps','ghost'],timeout=180)
pid=run(['docker','inspect','-f','{{.State.Pid}}','afterlogin-restore-ghost-20261009']).strip()
assert pid.isdigit() and int(pid)>0
(base/'ghost-pid.txt').write_text(pid)
for unit,args,cwd in [
 ('afterlogin-restore-lounge-20261009-v3',['/usr/local/bin/node',str(app/'app.js')],app),
 ('afterlogin-restore-nginx-20261009-v3',['/usr/sbin/nginx','-c',str(base/'nginx-restore.conf')],base)]:
 run(['systemd-run','--unit='+unit,'--property=NetworkNamespacePath=/proc/'+pid+'/ns/net','--property=WorkingDirectory='+str(cwd),'--property=IPAddressDeny=any','--property=IPAddressAllow=localhost','--property=MemoryMax=512M','--property=CPUQuota=100%','--property=UMask=0077',*args],timeout=30)
for i in range(90):
 r=subprocess.run(['nsenter','-t',pid,'-n','curl','-sS','--max-time','3','-o','/dev/null','-w','%{http_code}','http://localhost:8080/'],capture_output=True,text=True)
 if r.returncode==0 and r.stdout=='200': break
 time.sleep(1)
else: raise RuntimeError('Test Ghost upgrade did not become ready')
print('TEST_GHOST_UPGRADED_6_69_0')
run(['python3',str(base/'check-restored-applications.py'),'6.69.0'],timeout=240)
print((base/'verification-6.69.0.json').read_text())
