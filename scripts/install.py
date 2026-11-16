#!/usr/bin/env python3
"""Install the plugin into an explicitly selected vault; Remindian changes are opt-in."""
from pathlib import Path
from datetime import datetime
import argparse,base64,copy,json,os,re,subprocess,sys,tempfile
from reminders_migration import migrate_metadata

ROOT=Path(__file__).resolve().parents[1]
BASE=Path('工具/个人工作台')
TASK=BASE/'待办收件箱.md'
SYNC_FOLDER=BASE.as_posix()
SYNC_LIST='工作台'

def json_bytes(value):return (json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode()

def plan_install(vault,remindian=None,profile_name=None):
    vault=Path(vault).expanduser().resolve()
    if not (vault/'.obsidian').is_dir():raise ValueError('请选择已有Obsidian知识库，不会自动猜测路径。')
    originals={};writes={}
    def remember(path):
        path=Path(path)
        if path.is_symlink():raise ValueError('目标文件是符号链接，停止安装：'+str(path))
        if path not in originals:originals[path]=path.read_bytes() if path.exists() else None
        return originals[path]
    def update(path,raw):
        if remember(path)!=raw:writes[path]=raw
    for name in ['main.js','styles.css','manifest.json']:
        update(vault/'.obsidian/plugins/yu-workbench'/name,(ROOT/name).read_bytes())
    enabled_path=vault/'.obsidian/community-plugins.json';raw=remember(enabled_path)
    enabled=json.loads(raw) if raw else []
    if not isinstance(enabled,list) or any(not isinstance(x,str) for x in enabled):raise ValueError('插件启用列表格式异常。')
    if 'yu-workbench' not in enabled:enabled.append('yu-workbench')
    update(enabled_path,json_bytes(enabled))
    source=vault/TASK;raw=remember(source)
    if raw is None:update(source,'---\ntype: 项目\ntags: [stage/整理, type/项目]\n---\n# 待办收件箱\n\n## 工作台任务\n'.encode())
    if remindian is not None:
        base=Path(remindian).expanduser().resolve();profiles_path=base/'profiles.json';config_path=base/'config.json'
        profiles=json.loads(remember(profiles_path) or b'{}');current=json.loads(remember(config_path) or b'{}')
        selected=[p for p in profiles.get('profiles',[]) if (p.get('name')==profile_name if profile_name else p.get('id')==profiles.get('activeProfileId'))]
        if len(selected)!=1:raise ValueError('请先在Remindian中创建并选择唯一的同步配置。')
        profile=selected[0];pid=profile.get('id','')
        if not re.fullmatch(r'[A-Za-z0-9-]+',pid):raise ValueError('配置ID格式异常。')
        if profiles.get('activeProfileId')!=pid or not profile.get('enabled'):raise ValueError('请先在Remindian内激活并启用所选配置。')
        if any(p.get('enabled') and p.get('id')!=pid for p in profiles['profiles']):raise ValueError('请先停用其他配置，防止重复处理任务。')
        conf=profile.get('config',{})
        for c in [conf,current]:
            if Path(c.get('vaultPath','')).expanduser().resolve()!=vault:raise ValueError('请先在Remindian中Browse选择同一个知识库，并授予访问权限。')
            expected={'taskSourceType':'obsidianTasks','taskDestinationType':'appleReminders','includedFolders':[SYNC_FOLDER],'defaultList':SYNC_LIST,'syncedRemindersLists':[SYNC_LIST],'unmappedTagsCreateLists':False,'dryRunMode':False}
            if any(c.get(k)!=v for k,v in expected.items()):raise ValueError('请按docs/reminders.md配置来源、目标、文件夹和清单范围，并退出预览模式。')
            if c.get('globalFilter','') or c.get('includedNoteTags',[]):raise ValueError('请清空额外全局过滤器和笔记标签过滤，避免漏扫。')
            if c.get('syncStateLocation','appSupport')!='appSupport':raise ValueError('此迁移器仅支持本机Application Support索引。')
        state_path=base/('sync_state_'+pid+'.json');state_raw=remember(state_path)
        state=json.loads(state_raw) if state_raw else {'mappings':[],'stateVersion':8}
        if state.get('stateVersion')!=8 or not isinstance(state.get('mappings'),list):raise ValueError('当前同步索引版本未验证，停止迁移。')
        for mapping in state['mappings']:
            path=base64.b64decode(mapping['obsidianId'],validate=True).decode().split('|',1)[0]
            if path!='/'+TASK.as_posix():raise ValueError('发现工作台任务源以外的历史关联，停止安装；请先核对范围，不要提高删除限额。')
        source_raw=writes.get(source,raw);clean,state_new,_,_=migrate_metadata(source_raw,state)
        update(source,clean)
        if state_new!=state:update(state_path,json_bytes(state_new))
        settings={'enableAutoSync':True,'enableFileWatcher':True,'syncIntervalMinutes':1,'syncOnLaunch':True,'includeDueTime':True,'addReminderAlarm':True,'reminderAlarmHour':9,'writeTagsToReminderNotes':False,'enableCompletionWriteback':True,'enableDueDateWriteback':True,'enablePriorityWriteback':True}
        updated=copy.deepcopy(profiles)
        next(p for p in updated['profiles'] if p['id']==pid)['config'].update(settings)
        active=copy.deepcopy(current);active.update(settings)
        update(profiles_path,json_bytes(updated));update(config_path,json_bytes(active))
    roots=[vault]+([Path(remindian).expanduser().resolve()] if remindian is not None else [])
    for path in originals:
        if not any(path.resolve().is_relative_to(root) for root in roots):raise ValueError('目标路径越出已选择目录，停止安装。')
    return {'vault':vault,'originals':originals,'writes':writes}

def atomic_write(path,raw):
    path.parent.mkdir(parents=True,exist_ok=True);temporary=None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent,prefix='.yuw-install-',delete=False) as f:
            temporary=Path(f.name);f.write(raw);f.flush();os.fsync(f.fileno())
        os.replace(temporary,path);temporary=None
    finally:
        if temporary and temporary.exists():temporary.unlink()

def apply_plan(plan):
    def verify():
        for p,raw in plan['originals'].items():
            if (p.read_bytes() if p.exists() else None)!=raw:raise ValueError('规划后文件发生变化，停止安装。')
    verify()
    if not plan['writes']:return None
    backup=plan['vault']/'.obsidian/yu-workbench-backups'/datetime.now().strftime('%Y%m%d-%H%M%S-%f');backup.mkdir(parents=True)
    journal=[]
    for index,(path,content) in enumerate(plan['writes'].items()):
        old=plan['originals'][path];name=str(index)+'.bin'
        if old is not None:(backup/name).write_bytes(old)
        journal.append({'path':str(path),'backup':name if old is not None else None})
    (backup/'changes.json').write_bytes(json_bytes(journal));verify();written=[]
    try:
        for path,content in plan['writes'].items():atomic_write(path,content);written.append(path)
        for path,content in plan['writes'].items():
            if path.read_bytes()!=content:raise IOError('写入校验失败。')
    except Exception:
        for path in reversed(written):
            old=plan['originals'][path]
            if old is None:path.unlink(missing_ok=True) # Only roll back files created by this failed install.
            else:atomic_write(path,old)
        raise
    return backup

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--vault',required=True,type=Path);parser.add_argument('--enable-reminders',action='store_true');parser.add_argument('--profile-name');parser.add_argument('--remindian-data',type=Path);parser.add_argument('--dry-run',action='store_true')
    args=parser.parse_args();base=args.remindian_data
    if args.enable_reminders and base is None:base=Path.home()/'Library/Containers/com.remindian.app/Data/Library/Application Support/Remindian'
    if not args.enable_reminders and args.remindian_data:parser.error('--remindian-data requires --enable-reminders')
    plan=plan_install(args.vault,base if args.enable_reminders else None,args.profile_name)
    if args.dry_run:
        print('仅检查，预计更新'+str(len(plan['writes']))+'个文件；没有写入。');return
    if sys.platform=='darwin':
        for app in ['Obsidian']+(['Remindian'] if args.enable_reminders else []):
            result=subprocess.run(['/usr/bin/pgrep','-x',app],capture_output=True)
            if result.returncode!=1:raise ValueError('请先退出'+app+'，或检查进程访问权限。')
    elif args.enable_reminders:raise ValueError('苹果提醒事项接入需要macOS。')
    backup=apply_plan(plan);print('安装完成。备份：'+str(backup) if backup else '文件已是最新，无需修改。')
    print('重新打开Obsidian；如启用提醒事项，请同时打开Remindian并核对Sync Now结果。')

if __name__=='__main__':
    try:main()
    except Exception as exc:print('安装停止：'+str(exc),file=sys.stderr);sys.exit(1)
