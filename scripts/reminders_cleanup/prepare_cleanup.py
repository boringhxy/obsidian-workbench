#!/usr/bin/env python3
"""Build a local cleanup manifest from selected sources and an explicit creation event. Never deletes reminders."""
from pathlib import Path
import argparse,base64,hashlib,json,os

TASK='/工具/个人工作台/待办收件箱.md'

def read(path):return json.loads(Path(path).read_text())

def target(mapping):
    decoded=base64.b64decode(mapping['obsidianId'],validate=True).decode()
    source,rest=decoded.split('|',1);title,separator,tags=rest.rpartition('|')
    if not separator or not title:raise ValueError('历史任务索引格式异常')
    return {'id':mapping['remindersId'],'title':title,'source':source,'tags':tags}

def build_manifest(base,historical,creation_id,sources):
    base=Path(base).expanduser().resolve();historical=Path(historical).expanduser().resolve()
    if not historical.is_relative_to(base):raise ValueError('历史备份必须位于所选Remindian数据目录内')
    if not sources or TASK in sources:raise ValueError('必须显式选择误导入来源，不能选择正常工作台任务源')
    profiles=read(base/'profiles.json');enabled=[p for p in profiles.get('profiles',[]) if p.get('enabled')]
    if len(enabled)!=1 or enabled[0].get('id')!=profiles.get('activeProfileId'):raise ValueError('请只启用正式工作台配置')
    profile=enabled[0];conf=profile.get('config',{})
    if conf.get('includedFolders')!=['工具/个人工作台'] or conf.get('defaultList')!='工作台':raise ValueError('先收窄正式同步范围，避免清理后再次误导入')
    pid=profile['id']
    if not isinstance(pid,str) or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-' for c in pid):raise ValueError('配置ID无效')
    live=read(base/('sync_state_'+pid+'.json'));protected={m['remindersId'] for m in live['mappings']}
    historical_bytes=historical.read_bytes();old=json.loads(historical_bytes);all_targets=[target(m) for m in old['mappings']]
    present={t['source'] for t in all_targets}
    if set(sources)-present:raise ValueError('选择的来源未出现在历史备份中')
    targets=[t for t in all_targets if t['source'] in set(sources)]
    if not 1<=len(targets)<=100 or len({t['id'] for t in targets})!=len(targets):raise ValueError('清单为空、超过100条或包含重复编号')
    if protected & {t['id'] for t in targets}:raise ValueError('所选编号与当前正常任务有重叠')
    events=[e for e in read(base/'sync_log.json')['entries'] if e.get('id')==creation_id]
    if len(events)!=1:raise ValueError('未找到唯一的创建事件，不能猜测来源')
    event=events[0];result=event.get('result',{})
    if result.get('isDryRun') or result.get('errorCount') or not result.get('created'):raise ValueError('所选事件不是成功的实际创建事件')
    created={(d.get('filePath'),d.get('taskTitle')) for d in event.get('details',[]) if d.get('action')=='created'}
    if not all((t['source'],t['title']) in created for t in targets):raise ValueError('有目标缺少这次创建事件的逐条证据')
    return {'schemaVersion':1,'expectedCount':len(targets),'originalCreationUnix':event['timestamp']+978307200,'creationLogID':creation_id,'evidenceSHA256':hashlib.sha256(historical_bytes).hexdigest(),'evidenceRelativePath':historical.relative_to(base).as_posix(),'targets':targets}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--remindian-data',type=Path,default=Path.home()/'Library/Containers/com.remindian.app/Data/Library/Application Support/Remindian')
    p.add_argument('--historical-state',type=Path,required=True);p.add_argument('--creation-log-id');p.add_argument('--source',action='append');p.add_argument('--list-sources',action='store_true');p.add_argument('--output',type=Path,default=Path('cleanup-targets.local.json'))
    a=p.parse_args()
    if a.list_sources:
        counts={}
        for item in read(a.historical_state)['mappings']:
            source=target(item)['source']
            if source!=TASK:counts[source]=counts.get(source,0)+1
        print(json.dumps(counts,ensure_ascii=False,indent=2));return
    if not a.creation_log_id or not a.source:p.error('生成清单必须提供--creation-log-id与至少一个--source')
    manifest=build_manifest(a.remindian_data,a.historical_state,a.creation_log_id,a.source)
    if a.output.exists():raise ValueError('目标清单已存在，停止覆盖；请选择新的本地文件名')
    a.output.parent.mkdir(parents=True,exist_ok=True)
    fd=os.open(a.output,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as f:json.dump(manifest,f,ensure_ascii=False,indent=2);f.write('\n')
    print('生成'+str(manifest['expectedCount'])+'条编号清单；没有访问或删除系统提醒事项。请先--preview核对。')

if __name__=='__main__':main()
