"""Migrate workbench-owned metadata without changing native reminder IDs."""
import base64,copy,re
OWN_ID=re.compile(r'<!-- yu:([\w-]+) -->')
OWN_NOTE=re.compile(r'<!-- yu-note:[^ ]* -->')
def clean_owned_title(title):
    return OWN_NOTE.sub('',OWN_ID.sub('',title)).strip()

def migrate_metadata(raw,state):
    """Move only our metadata off checkbox lines; keep native reminder IDs and baselines."""
    text=raw.decode('utf-8');lines=text.splitlines(keepends=True);out=[];fence=False;owned=set();changed=0
    for line in lines:
        if re.match(r'^\s*(```|~~~)',line):fence=not fence
        if fence or not re.match(r'^\s*-\s+\[[ xX]\]\s+',line):out.append(line);continue
        ids=OWN_ID.findall(line)
        if len(ids)>1:raise ValueError('单条任务含多个内部编号，停止整理。')
        if not ids:out.append(line);continue
        task_id=ids[0]
        if task_id in owned:raise ValueError('任务内部编号重复，停止整理。')
        owned.add(task_id);note=OWN_NOTE.search(line);prefix='<!-- yu:'+task_id+' -->'+((' '+note[0]) if note else '')
        if out and OWN_ID.search(out[-1]):raise ValueError('任务前已有内部编号，停止重复整理。')
        newline='\r\n' if line.endswith('\r\n') else '\n'
        clean=re.sub(r'\s*<!-- yu:[\w-]+ -->','',line.rstrip('\r\n'))
        clean=re.sub(r'\s*<!-- yu-note:[^ ]* -->','',clean)
        out.extend([prefix+newline,clean+(newline if line.endswith('\n') else '')]);changed+=1
    updated=copy.deepcopy(state);renamed=0
    for mapping in updated.get('mappings',[]):
        decoded=base64.b64decode(mapping['obsidianId'],validate=True).decode();path,rest=decoded.split('|',1);title,sep,tags=rest.rpartition('|')
        if not sep:raise ValueError('同步关联格式不符合已核对版本，停止整理。')
        ids=OWN_ID.findall(title)
        if not ids:continue
        if len(ids)!=1 or ids[0] not in owned:raise ValueError('带内部编号的关联未找到对应原任务，停止整理。')
        clean=clean_owned_title(title)
        if not clean:raise ValueError('整理后任务标题为空，停止整理。')
        mapping['obsidianId']=base64.b64encode((path+'|'+clean+'|'+tags).encode()).decode();renamed+=1
    keys=[m['obsidianId'] for m in updated.get('mappings',[])]
    if len(keys)!=len(set(keys)):raise ValueError('整理后出现同名同标签的同步关联，停止整理。')
    return ''.join(out).encode(),updated,changed,renamed
