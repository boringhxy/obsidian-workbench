const {Plugin, ItemView, Modal, Notice} = require('obsidian');
const VIEW='yu-workbench-home', BASE='工具/个人工作台/', TASK_PATH=BASE+'待办收件箱.md';
const GROUPS=['学术研究','语言学习','个人管理','实习与发展'];
const LEGACY={'论文':0,'毕业论文':0,'科研项目':0,'课程':0,'数字人文':0,'英语':1,'韩语':1,'琐事':2,'个人管理':2,'实习':3};
const STUDIES=['英语单词','韩语','AI+线上课','清代文化史','数字人文实践'];
const localDate=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const shiftDate=(v,n)=>{const d=new Date(v+'T12:00:00');d.setDate(d.getDate()+n);return localDate(d);};
const dateOK=v=>!v||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&localDate(new Date(v+'T12:00:00'))===v);
const timeOK=v=>!v||/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const PRIORITIES={none:'无',low:'低',medium:'中',high:'高'},PRIORITY_MARK={none:'',low:'🔽',medium:'🔼',high:'⏫'};
const clean=v=>String(v||'').replace(/[\r\n]+/g,' ').trim();
const getGroups=data=>[...GROUPS,...(data?.directions||[]).map(d=>d.name)];
const getStudies=data=>[...new Set([...STUDIES,...(data?.studyOrder||[]),...Object.keys(data?.studies||{})])];
const groupOf=(p,directions=[])=>directions.find(d=>d.id===p)?.name||(GROUPS.includes(p)?p:GROUPS[LEGACY[p]??2]);
function itemName(value){const name=clean(value).normalize('NFC');if(!name)throw Error('请填写名称');if(name.length>60)throw Error('名称请控制在60字以内');if(['__proto__','prototype','constructor'].includes(name))throw Error('请换一个名称');return name;}
const linkOK=url=>!url||/^(https?:\/\/|obsidian:\/\/|\[\[[^\n]+\]\]$)/i.test(url);
function parseTasks(text,directions=[]){let heading='',fence=false;const out=[],lines=text.split('\n');lines.forEach((raw,line)=>{
 if(/^\s*(```|~~~)/.test(raw)){fence=!fence;return;}if(fence)return;
 if(/^## /.test(raw))heading=raw.slice(3).trim();const m=raw.match(/^(\s*-\s+\[([ xX])\]\s+)(.*)$/);if(!m)return;
 const metaRaw=/^\s*<!-- yu:[\w-]+ -->(?:\s+<!-- yu-note:[^ ]* -->)?\s*$/.test(lines[line-1]||'')?lines[line-1]:'';const metadata=metaRaw||raw;const body=m[3],end=body.search(/\s+(?:#方向\/|#项目\/|📅|✅|<!--|🔁|⏳|🛫|[⏫🔼🔽🔺⏬])/u);
 const inferred=({'Historia':'论文','日记研究':'毕业论文','语言学习':'语言学习','课程与数字人文':'课程','实习申请':'实习'})[heading]||heading;
 const project=body.match(/#方向\/([^\s]+)/u)?.[1]||inferred||'个人管理';
 out.push({raw,line,title:end<0?body:body.slice(0,end),done:m[2]!==' ',project,explicitItemId:body.match(/#项目\/([\w-]+)/u)?.[1]||'',category:groupOf(project,directions),date:body.match(/📅️?\s*(\d{4}-\d{2}-\d{2})/u)?.[1]||'',time:body.match(/📅️?\s*\d{4}-\d{2}-\d{2}[ T](\d{1,2}:\d{2})/u)?.[1]?.padStart(5,'0')||'',priority:body.includes('⏫')?'high':body.includes('🔼')?'medium':body.includes('🔽')?'low':'none',notes:(()=>{try{return decodeURIComponent(metadata.match(/<!-- yu-note:([^ ]*) -->/)?.[1]||'');}catch{return '';}})(),metaRaw,id:metadata.match(/<!-- yu:([\w-]+) -->/)?.[1]||null});
 });return out;}
function makeTask(title,project,date,id,directions=[],itemId='',items=[],details={}){
 title=clean(title);if(!title)throw Error('请填写任务名称');if(/<!--|[📅⏫🔼🔽🔺⏬✅🔁⏳🛫]|#方向\/|#项目\//u.test(title))throw Error('请使用所属项目和日期选项填写任务信息');if(!dateOK(date))throw Error('日期无效');if(!timeOK(details.time))throw Error('时间请使用24小时制，例如14:30');if(details.time&&!date)throw Error('请先选择日期，再设置时间');if(details.priority&&!PRIORITIES[details.priority])throw Error('优先级无效');if((details.notes||'').length>3000)throw Error('备注请控制在3000字以内');
 if(itemId){if(!items.some(i=>i.id===itemId))throw Error('找不到所属项目');}
 else if(!GROUPS.includes(project)&&LEGACY[project]===undefined&&!directions.some(d=>d.id===project))throw Error('请选择有效方向');
 return `<!-- yu:${id} -->${details.notes?' <!-- yu-note:'+encodeURIComponent(details.notes.trim())+' -->':''}\n- [ ] ${title} ${itemId?'#项目/'+itemId:'#方向/'+project}${date?' 📅 '+date+(details.time?' '+details.time:''):''}${PRIORITY_MARK[details.priority]?' '+PRIORITY_MARK[details.priority]:''}`;
}
function changeTask(text,task,patch,directions=[],items=[]){
 const lines=text.split('\n');let i=task.id?lines.findIndex(l=>l.includes(`<!-- yu:${task.id} -->`)):(lines[task.line]===task.raw?task.line:lines.indexOf(task.raw));
 if(i>=0&&!parseTasks(lines[i]).length)i++;if(i<0||i>=lines.length)throw Error('任务已变更，请刷新后再操作');const current=parseTasks(text).find(t=>t.line===i);if(!current)throw Error('任务格式已变更');let raw=lines[i];
 if(patch.title!==undefined){if(raw!==task.raw||(current.metaRaw||'')!==(task.metaRaw||''))throw Error('任务已变更，请刷新后再编辑');const itemId=patch.itemId===undefined?current.explicitItemId:patch.itemId;
 const details={time:patch.time===undefined?current.time:patch.time,priority:patch.priority===undefined?current.priority:patch.priority,notes:patch.notes===undefined?current.notes:patch.notes};
 makeTask(patch.title,patch.project,patch.date,'check',directions,itemId,items,details);
 const m=raw.match(/^(\s*-\s+\[[ xX]\]\s+)(.*)$/);let suffix=m[2].slice(current.title.length).replace(/\s+#(?:方向|项目)\/[^\s]+/gu,'').replace(/\s+📅️?\s*\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2})?/gu,'');
 if(patch.priority!==undefined)suffix=suffix.replace(/\s+[⏫🔼🔽]/gu,'');if(patch.notes!==undefined)suffix=suffix.replace(/\s*<!-- yu-note:[^ ]* -->/g,'');
 raw=m[1]+clean(patch.title)+' '+(itemId?'#项目/'+itemId:'#方向/'+patch.project)+(patch.date?' 📅 '+patch.date+(details.time?' '+details.time:''):'')+(patch.priority!==undefined&&PRIORITY_MARK[patch.priority]?' '+PRIORITY_MARK[patch.priority]:'')+suffix+(patch.notes!==undefined&&details.notes?' <!-- yu-note:'+encodeURIComponent(details.notes.trim())+' -->':'');
 }
 if(patch.done!==undefined){if(/🔁/u.test(raw))throw Error('重复任务请在 Tasks 中完成');raw=raw.replace(/^(\s*-\s+\[)[ xX](\])/,'$1'+(patch.done?'x':' ')+'$2').replace(/\s+✅\s*\d{4}-\d{2}-\d{2}/gu,'');if(patch.done)raw+=' ✅ '+localDate();}
 const notes=patch.notes===undefined?current.notes:patch.notes;raw=raw.replace(/\s*<!-- yu:[\w-]+ -->/g,'').replace(/\s*<!-- yu-note:[^ ]* -->/g,'');lines[i]=raw;
 if(current.id||notes){const prefix=`<!-- yu:${current.id||newId('task')} -->${notes?' <!-- yu-note:'+encodeURIComponent(notes.trim())+' -->':''}`;if(current.metaRaw)lines[i-1]=prefix;else lines.splice(i,0,prefix);}
 return lines.join('\n');
}
function importProgress(data,text){const d=JSON.parse(JSON.stringify(data||{}));d.progress??={};d.categoryProgress??={};d.studies??={};d.directions??=[];d.studyOrder??=[];let section='';
 for(const line of text.split('\n')){if(/^## /.test(line))section=line.slice(3);if(!line.startsWith('|'))continue;const cells=line.split('|').slice(1,-1).map(x=>x.trim());
 if(section==='本周方向'&&cells.length>=4&&cells[0]!=='方向'&&!cells[0].startsWith('---')){const key=({'Historia':'论文','毕业论文 · 日记研究':'毕业论文','实习申请':'实习','数字人文':'数字人文'})[cells[0]];if(key&&!d.progress[key])d.progress[key]={stage:cells[1],next:cells[3]};}
 if(section==='学习轮换'&&STUDIES.includes(cells[0])&&!d.studies[cells[0]]){const old=d.progress[({'英语单词':'英语','韩语':'韩语','AI+线上课':'课程','数字人文实践':'数字人文'})[cells[0]]];d.studies[cells[0]]={stage:old?.stage||(/^待/.test(cells[2])?'':cells[2]),next:old?.next||'',link:old?.link||(/^待/.test(cells[3])?'':cells[3])};}}
 for(const g of GROUPS){if(d.categoryProgress[g])continue;const entries=Object.entries(d.progress).filter(([k])=>groupOf(k)===g);d.categoryProgress[g]={stage:entries.filter(([,v])=>v.stage).map(([k,v])=>`${k}：${v.stage}`).join('；'),next:entries.filter(([,v])=>v.next).map(([k,v])=>`${k}：${v.next}`).join('；'),link:entries.find(([,v])=>v.link)?.[1].link||''};}return d;}

const directionId=(data,name)=>data?.directions?.find(d=>d.name===name)?.id||name;
const directionName=(data,id)=>id?groupOf(id,data?.directions||[]):'待选择方向';
const knownDirection=(data,id)=>GROUPS.includes(id)||(data.directions||[]).some(d=>d.id===id);
const sameName=(a,b)=>a.normalize('NFC').toLocaleLowerCase()===b.normalize('NFC').toLocaleLowerCase();
const newId=prefix=>prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
const legacyItemKey=task=>({'论文':'paper','毕业论文':'diaries','英语':'study-0','韩语':'study-1','数字人文':'study-4','实习':'internship'})[task.project]||(task.project==='课程'?(task.title.includes('清代文化史')?'study-3':task.title.includes('AI')?'study-2':'courses'):'');
function migrateData(saved,note,source=''){
 const d=importProgress(saved,note);if(d.schemaVersion>=3&&Array.isArray(d.items))return d;
 d.items=Array.isArray(d.items)?d.items:[];const tasks=parseTasks(source,d.directions);
 const push=(id,name,direction,record={})=>{if(d.items.some(i=>i.id===id))return;d.items.push({...record,id,name,direction,stage:record.stage||'',next:record.next||'',link:record.link||''});};
 const studyDirections=['语言学习','语言学习','学术研究','学术研究','学术研究'];
 for(const [index,name]of getStudies(d).entries()){
  const record=d.studies[name]||d.progress[({'英语单词':'英语','韩语':'韩语','AI+线上课':'课程','数字人文实践':'数字人文'})[name]]||{};const direction=knownDirection(d,record.direction)?record.direction:(studyDirections[index]||'');
  push('study-'+index,name,direction,record);
 }
 for(const [id,name,key]of [['paper','论文修改','论文'],['diaries','日记研究','毕业论文'],['internship','实习申请','实习'],['courses','线上课程','课程']]){
  if(d.progress[key]||tasks.some(t=>legacyItemKey(t)===id)){
   if(id==='courses'&&!tasks.some(t=>legacyItemKey(t)==='courses'))continue;
   push(id,name,groupOf(key),d.progress[key]);
  }
 }
 for(const [index,[key,record]]of Object.entries(d.progress).entries()){
  if(['论文','毕业论文','实习','课程','英语','韩语','数字人文'].includes(key)||(!record.stage&&!record.next&&!record.link))continue;
  const direction=knownDirection(d,key)?key:(LEGACY[key]!==undefined?GROUPS[LEGACY[key]]:'');
  push('legacy-extra-'+index,key==='琐事'?'日常事务':key,direction,record);
 }
 // Keep manually written direction records as projects; generated summaries are rebuilt below.
 for(const name of getGroups(d)){
  const r=d.categoryProgress[name]||{};if(!r.stage&&!r.next&&!r.link)continue;
  const entries=Object.entries(d.progress).filter(([key])=>groupOf(key,d.directions)===name);
  const stage=entries.filter(([,v])=>v.stage).map(([k,v])=>`${k}：${v.stage}`).join('；');
  const next=entries.filter(([,v])=>v.next).map(([k,v])=>`${k}：${v.next}`).join('；');
  const link=entries.find(([,v])=>v.link)?.[1].link||'';
  if((r.stage||'')===stage&&(r.next||'')===next&&(r.link||'')===link)continue;
  let id='direction-record-'+getGroups(d).indexOf(name);push(id,name+'记录',directionId(d,name),r);
 }
 d.schemaVersion=3;return d;
}
function resolveTasks(source,data){
 return parseTasks(source,data?.directions||[]).map(t=>{
  const itemId=t.explicitItemId||legacyItemKey(t);const item=(data?.items||[]).find(i=>i.id===itemId);
  const direction=item?item.direction:(knownDirection(data,t.project)?t.project:directionId(data,groupOf(t.project,data.directions)));
  return {...t,itemId:item?.id||'',missingItem:!!t.explicitItemId&&!item,itemName:item?.name||'',direction,category:directionName(data,direction)};
 });
}
function summaryFor(tasks,items,direction){const ts=tasks.filter(t=>t.direction===direction);return {items:items.filter(i=>i.direction===direction),total:ts.length,done:ts.filter(t=>t.done).length,pending:ts.filter(t=>!t.done).length,unassigned:ts.filter(t=>!t.itemId)};}

function syncMessage(config,entry,modifiedMs,vaultPath){
 if(vaultPath&&config.vaultPath!==vaultPath)return '提醒事项：同步工具选择了其他知识库，请检查。';
 if(config.defaultList!=='工作台')return '提醒事项：目标清单不是“工作台”，请检查。';
 if(config.dryRunMode)return '提醒事项：当前为预览模式，不会实际同步。';
 if(!config.includeDueTime||!config.addReminderAlarm)return '提醒事项：具体时间或闹钟未启用，请安装本次更新。';
 if(!entry)return '提醒事项：尚无同步记录，请打开 Remindian 完成首次同步。';
 if(entry.result?.errorCount)return '提醒事项：最近一次同步有错误，请打开 Remindian 查看。';
 if(entry.result?.isDryRun)return '提醒事项：最近一次是预览同步，尚未实际写入。';
 const last=(entry.timestamp+978307200)*1000;const label=new Date(last).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
 if(modifiedMs>last+1000)return '已保存，等待提醒事项同步 · 上次 '+label+'。请保持 Remindian 运行。';
 return '同步记录已更新 · '+label+'。可在提醒事项“工作台”清单核对。';
}
function el(p,t,c,text){const n=document.createElement(t);if(c)n.className=c;if(text!==undefined)n.textContent=text;if(t==='label')n.style.color='var(--yu-ink, #303c30)';if(c&&/yuw-field-help|yuw-form-intro/.test(c))n.style.color='var(--yu-muted, #64715e)';p.appendChild(n);return n;}
function button(p,text,fn,c=''){const n=el(p,'button',c,text);n.type='button';n.style.color=c.split(' ').includes('yuw-primary')?'#fff':'var(--yu-ink, #303c30)';n.addEventListener('click',fn);return n;}
function input(p,type,value,label){const n=el(p,'input');n.type=type;n.style.color='var(--yu-ink, #303c30)';n.value=value||'';if(label)n.setAttribute('aria-label',label);return n;}
function select(p,items,value){const n=el(p,'select');n.style.color='var(--yu-ink, #303c30)';for(const [v,t]of items){const o=el(n,'option','',t);o.value=v;}n.value=value;return n;}
function openLink(app,link){if(link.startsWith('[[')){const [path,label]=link.slice(2,-2).split('|');app.workspace.openLinkText(path,'',true);}else if(/^(https?:\/\/|obsidian:\/\/)/i.test(link))window.open(link,'_blank','noopener');}
let fieldSequence=0;
function prepareForm(root,intro){root.classList.add('yuw-form');root.style.color='var(--yu-ink, #303c30)';root.style.backgroundColor='var(--yu-form-bg, #fff)';return ()=>el(root,'p','yuw-form-intro',intro);}
function progressExamples(name=''){
 if(/英语|单词/.test(name))return ['例如：已复习词表第1—3组，易错词还需巩固','例如：复习第3组易错词，并完成一次自测'];
 if(/韩语|韩国/.test(name))return ['例如：延世韩国语第3课，已学语法，听力未完成','例如：听两遍第3课对话，并完成课后练习'];
 if(/论文|研究|日记/.test(name))return ['例如：已读3篇文献，正在比较史料处理方法','例如：整理下一篇论文的研究问题与材料来源'];
 return ['例如：已完成第一阶段，第二阶段正在整理材料','例如：整理下一阶段需要的材料和待办'];
}

function formField(parent,labelText,value,placeholder,description,aria=labelText){const id='yuw-field-'+(++fieldSequence);const label=el(parent,'label','yuw-field-label',labelText);label.setAttribute('for',id);const field=input(parent,'text',value,aria);field.id=id;field.placeholder=placeholder;if(description){const help=el(parent,'p','yuw-field-help',description);help.id=id+'-help';field.setAttribute('aria-describedby',help.id);}return field;}
function selectField(parent,labelText,options,value,description,aria=labelText){const id='yuw-field-'+(++fieldSequence);const label=el(parent,'label','yuw-field-label',labelText);label.setAttribute('for',id);const field=select(parent,options,value);field.id=id;field.setAttribute('aria-label',aria);if(description){const p=el(parent,'p','yuw-field-help',description);p.id=id+'-help';field.setAttribute('aria-describedby',p.id);}return field;}
class TaskModal extends Modal{
 constructor(plugin,view,task=null,itemId='',direction='',initial={}){super(plugin.app);Object.assign(this,{plugin,view,task,itemId,direction,initial});}
 onOpen(){const r=this.contentEl;const explain=prepareForm(r,'先写要做的事，再按需要设置日期、具体时间和优先级。');el(r,'h2','',this.task?'提醒事项详情':'新建提醒事项');explain();const f=el(r,'form');const original=this.task||this.initial;
 const title=formField(f,'标题（必填）',original.title,'例如：完成第3课韩语听力','用一件可以勾选完成的事作为标题。','任务名称');title.required=true;
 const notesLabel=el(f,'label','yuw-field-label','备注');const notes=el(f,'textarea','yuw-task-notes');notes.value=original.notes||'';notes.rows=3;notes.maxLength=3000;notes.id='yuw-field-'+(++fieldSequence);notesLabel.setAttribute('for',notes.id);notes.setAttribute('aria-label','任务备注');notes.placeholder='补充材料、步骤或注意事项…';el(f,'p','yuw-field-help','备注保存在工作台，可在详情中继续编辑；提醒事项端的备注同步尚未验证。');
 const chosen=this.plugin.data.items.find(i=>i.id===(original.itemId||this.itemId));
 const initialDirection=chosen?chosen.direction:((original.direction||this.direction)||directionId(this.plugin.data,this.view.filter||GROUPS[0]));
 const direction=selectField(f,'方向',[['','请选择方向'],...getGroups(this.plugin.data).map(g=>[directionId(this.plugin.data,g),g])],initialDirection,'例如学术研究、语言学习。','任务方向');direction.required=true;
 const item=selectField(f,'项目／学习事项',[],chosen?.id||'','和今日列表使用同一条任务，完成后一起更新。','任务所属项目');
 const drawItems=selected=>{item.replaceChildren();for(const [value,label]of [['','暂不归入项目'],...this.plugin.data.items.filter(i=>i.direction===direction.value).map(i=>[i.id,i.name])]){const o=el(item,'option','',label);o.value=value;}item.value=selected||'';};drawItems(chosen?.id);direction.addEventListener('change',()=>drawItems(''));
 const schedule=el(f,'section','yuw-reminder-schedule');
 const toggle=(text,aria,checked)=>{const label=el(schedule,'label','yuw-toggle');const cb=input(label,'checkbox','',aria);cb.checked=checked;el(label,'span','',text);return cb;};
 const initialDate=this.task?this.task.date:(original.date===undefined?(this.itemId?'':this.view.date):original.date);
 const dated=toggle('日期','启用任务日期',!!initialDate);const label=el(schedule,'label','yuw-field-label','提醒日期');const date=input(schedule,'date',initialDate,'任务日期');date.id='yuw-field-'+(++fieldSequence);label.setAttribute('for',date.id);
 const chips=el(schedule,'div','yuw-date-chips');for(const [text,value]of [['今天',localDate()],['明天',shiftDate(localDate(),1)]])button(chips,text,()=>{dated.checked=true;date.value=value;drawSchedule();});button(chips,'不设日期',()=>{dated.checked=false;date.value='';timed.checked=false;drawSchedule();});
 const timed=toggle('时间','启用任务时间',!!original.time);const timeLabel=el(schedule,'label','yuw-field-label','提醒时间');const time=input(schedule,'time',original.time||'09:00','任务时间');time.id='yuw-field-'+(++fieldSequence);timeLabel.setAttribute('for',time.id);time.step='60';
 const hint=el(schedule,'p','yuw-field-help','只设日期为全天事项；开启时间后按所选时间提醒。使用这台电脑的本地时区。');
 const drawSchedule=()=>{date.disabled=!dated.checked;date.required=dated.checked;timed.disabled=!dated.checked;time.disabled=!dated.checked||!timed.checked;time.required=dated.checked&&timed.checked;hint.textContent=dated.checked?(timed.checked?'将在所选日期的 '+time.value+' 提醒；使用这台电脑的本地时区。':'全天事项；开启“时间”可指定几点提醒。仅有日期的事项使用同步工具设置的默认提醒时间。'):'未设日期，保存在方向和项目中，提醒事项的“今天”列表不会显示它。';};
 dated.addEventListener('change',()=>{if(dated.checked&&!date.value)date.value=this.view.date;drawSchedule();});timed.addEventListener('change',drawSchedule);time.addEventListener('change',drawSchedule);date.addEventListener('change',()=>{dated.checked=!!date.value;drawSchedule();});drawSchedule();
 const priority=selectField(f,'优先级',Object.entries(PRIORITIES),original.priority||'none','高优先级用于需要优先处理的事情。','任务优先级');
 el(f,'p','yuw-field-help','提醒事项清单：工作台。保存后由 Remindian 同步；请保持 Remindian 运行。');
 const actions=el(f,'div','yuw-actions');button(actions,'取消',()=>this.close());const save=el(actions,'button','yuw-primary',this.task?'保存更改':'添加提醒事项');save.type='submit';f.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;try{if(!knownDirection(this.plugin.data,direction.value))throw Error('请选择所属方向');const project=this.task&&!item.value&&this.task.direction===direction.value&&!this.task.itemId?this.task.project:direction.value;const patch={title:title.value,project,itemId:item.value,date:dated.checked?date.value:'',time:dated.checked&&timed.checked?time.value:'',priority:priority.value,notes:notes.value};if(this.task)await this.plugin.updateTask(this.task,patch);else await this.plugin.addTask(patch);this.close();new Notice('已保存到知识库，等待提醒事项同步');await this.view.refresh();}catch(e){new Notice(e.message);save.disabled=false;}});title.focus();}
}
class DirectionModal extends Modal{
 constructor(plugin,view){super(plugin.app);Object.assign(this,{plugin,view});}
 onOpen(){const r=this.contentEl;const explain=prepareForm(r,'方向是项目的大类。例如“语言学习”可以包含“英语单词”和“延世韩国语”；具体待办放在各项目下面。');el(r,'h2','','新建方向');explain();const f=el(r,'form');const name=formField(f,'方向名称（必填）','','例如：运动健康','给一类持续关注的事情起名，例如“运动健康”。任务完成数量由所属项目自动汇总，不必重复填写。','名称');name.required=true;name.maxLength=60;const a=el(f,'div','yuw-actions');button(a,'取消',()=>this.close());const save=el(a,'button','yuw-primary','新建方向');save.type='submit';f.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;try{await this.plugin.createDirection(name.value);this.close();await this.view.refresh();}catch(e){new Notice(e.message);save.disabled=false;}});name.focus();}
}
class ItemModal extends Modal{
 constructor(plugin,view,item=null,direction=''){super(plugin.app);Object.assign(this,{plugin,view,item,direction});}
 onOpen(){const r=this.contentEl;const explain=prepareForm(r,'项目或学习事项是一件需要持续推进的事，例如“日记研究”或“延世韩国语”。这里记录做到哪里；保存后可在项目卡片中添加具体任务。');el(r,'h2','',this.item?'编辑项目与进度':'新建项目／学习事项');explain();const f=el(r,'form');const examples=progressExamples(this.item?.name);const name=formField(f,'项目／学习事项名称（必填）',this.item?.name,'例如：日记研究、延世韩国语','填写具体研究项目、课程或学习内容，例如“民国女中教育论文”“延世韩国语1”，便于和其他项目区分。','名称');name.required=true;name.maxLength=60;
 const direction=selectField(f,'所属方向（必选）',[['','请选择方向'],...getGroups(this.plugin.data).map(g=>[directionId(this.plugin.data,g),g])],this.item?this.item.direction:this.direction,'选择这个项目属于哪个大类。保存后，项目及其任务会一起计入该方向的汇总。','项目所属方向');direction.required=true;
 const stage=formField(f,'当前进度（可选）',this.item?.stage,examples[0],'记录已做到哪里、哪些部分仍未完成，方便下次接着做。这里由你记录，任务完成数量会自动统计。','当前进度');const next=formField(f,'下一步（可选）',this.item?.next,examples[1],'写下下一轮的推进计划。这段文字不会自动变成待办；需要日期或勾选时，请另用“＋ 任务”添加。','下一步');const link=formField(f,'资料或课程入口（可选）',this.item?.link,'[[笔记名]] 或 https://…','粘贴课程、文稿或资料网页地址；也可填写 [[英语笔记]] 这样的库内链接。保存后点击“打开资料”即可进入。没有链接可留空。','资料或课程入口');const a=el(f,'div','yuw-actions');button(a,'取消',()=>this.close());const save=el(a,'button','yuw-primary',this.item?'保存项目':'新建项目');save.type='submit';f.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;try{const id=await this.plugin.saveItem({id:this.item?.id,name:name.value,direction:direction.value,stage:stage.value,next:next.value,link:link.value});this.view.projectDirection=direction.value;this.view.itemFilter=id;this.close();await this.view.refresh();}catch(e){new Notice(e.message);save.disabled=false;}});name.focus();}
}
class WorkbenchView extends ItemView{
 constructor(leaf,plugin){super(leaf);this.plugin=plugin;this.date=localDate();this.filter='';this.showOverdue=false;this.projectDirection='';this.itemFilter='';this.queue=Promise.resolve();}
 async updateSyncStatus(){const label=this.syncLabel;if(label?.isConnected)label.textContent=await this.plugin.syncStatus();}
 getViewType(){return VIEW;}getDisplayText(){return '我的工作台';}getIcon(){return 'panels-top-left';}async onOpen(){await this.refresh();}
 refresh(){this.queue=this.queue.catch(()=>{}).then(()=>this.render()).catch(e=>new Notice('工作台：'+e.message));return this.queue;}
 taskRow(parent,task){const row=el(parent,'div','yuw-task'+(task.done?' is-done':''));row.setAttribute('data-task-id',task.id||'line-'+task.line);const cb=input(row,'checkbox','','完成任务：'+task.title);cb.checked=task.done;cb.addEventListener('change',async()=>{cb.disabled=true;try{await this.plugin.updateTask(task,{done:cb.checked});}catch(e){cb.checked=task.done;new Notice(e.message);}finally{cb.disabled=false;}});const desc=el(row,'div','yuw-task-desc');el(desc,'span','yuw-task-title',task.title);el(desc,'div','yuw-task-meta',[task.category,task.itemName||(task.missingItem?'所属项目缺失':'未归入项目'),task.date?(task.date+(task.time?' '+task.time:' · 全天')):'未设日期',task.priority!=='none'?'优先级：'+PRIORITIES[task.priority]:''].filter(Boolean).join(' · '));if(task.notes)el(desc,'p','yuw-task-note-preview',task.notes);button(row,'编辑',()=>new TaskModal(this.plugin,this,task).open(),'yuw-edit');}
 async render(){const tasks=await this.plugin.readTasks();const groups=getGroups(this.plugin.data);if(!this.containerEl.isConnected)return;const c=this.contentEl;c.replaceChildren();c.classList.add('yuw-root');const layout=el(c,'div','yuw-layout');const side=el(layout,'aside','yuw-sidebar');el(side,'h2','','我的工作台');
 for(const [label,id]of [['今日任务','tasks'],['各方向推进','directions'],['项目与学习进度','study']])button(side,label,()=>{if(id==='tasks'){this.date=localDate();this.filter='';this.refresh();}else main.querySelector('#yuw-'+id).scrollIntoView({behavior:'smooth',block:'start'});});
 el(side,'div','yuw-side-bottom');button(side,'知识库',()=>this.app.workspace.openLinkText('首页','',true));button(side,'任务原文',()=>this.app.workspace.openLinkText(TASK_PATH,'',true));
 const main=el(layout,'main','yuw-main');const header=el(main,'header','yuw-header');const heading=el(header,'div');el(heading,'h1','','我的工作台');el(heading,'p','yuw-muted',new Date(this.date+'T12:00:00').toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'}));button(header,'＋ 添加任务',()=>new TaskModal(this.plugin,this).open(),'yuw-primary');
 const sync=el(main,'div','yuw-sync-status');this.syncLabel=el(sync,'span','',await this.plugin.syncStatus());button(sync,'检查同步',()=>this.updateSyncStatus(),'yuw-edit');button(sync,'打开 Remindian',()=>this.plugin.openSyncApp(),'yuw-edit');
 const selected=tasks.filter(t=>(!this.filter||t.category===this.filter));const dated=selected.filter(t=>t.date===this.date),done=dated.filter(t=>t.done).length;const metrics=el(main,'div','yuw-metrics');for(const [label,n]of [['当日任务',dated.length],['已经完成',done],['待完成',dated.length-done]]){const x=el(metrics,'div','yuw-metric');el(x,'span','yuw-muted',label);el(x,'strong','',String(n));}
 const card=el(main,'section','yuw-card');card.id='yuw-tasks';const head=el(card,'div','yuw-section-head');el(head,'h2','',this.date===localDate()?'今日任务':'当日任务');const controls=el(head,'div','yuw-date-controls');button(controls,'‹',()=>{this.date=shiftDate(this.date,-1);this.refresh();}).setAttribute('aria-label','前一天');const date=input(controls,'date',this.date,'选择任务日期');date.addEventListener('change',()=>{if(date.value&&dateOK(date.value)){this.date=date.value;this.refresh();}});button(controls,'›',()=>{this.date=shiftDate(this.date,1);this.refresh();}).setAttribute('aria-label','后一天');button(controls,'今天',()=>{this.date=localDate();this.refresh();},'yuw-edit');
 const week=el(card,'div','yuw-week');const offset=(new Date(this.date+'T12:00:00').getDay()+6)%7;for(let i=0;i<7;i++){const d=shiftDate(this.date,i-offset);const b=button(week,'',()=>{this.date=d;this.refresh();},d===this.date?'selected':'');b.setAttribute('aria-label',d);el(b,'small','','一二三四五六日'[i]);el(b,'strong','',String(Number(d.slice(-2))));el(b,'span','yuw-week-dot',selected.some(t=>t.date===d&&!t.done)?'•':'·');}
 const filters=el(card,'div','yuw-filters');for(const g of ['',...groups])button(filters,g||'全部',()=>{this.filter=g;this.refresh();},this.filter===g?'is-active':'');
 const quick=el(card,'form','yuw-quick');const text=input(quick,'text','','快速添加任务');text.required=true;text.placeholder='添加具体任务…';const group=select(quick,groups.map(g=>[directionId(this.plugin.data,g),g]),directionId(this.plugin.data,this.filter||GROUPS[0]));group.setAttribute('aria-label','快速任务方向');
 const project=select(quick,[],'');project.setAttribute('aria-label','快速任务所属项目');const drawQuickProjects=()=>{project.replaceChildren();for(const [value,label]of [['','暂不归入项目'],...this.plugin.data.items.filter(i=>i.direction===group.value).map(i=>[i.id,i.name])]){const option=el(project,'option','',label);option.value=value;}project.value='';};drawQuickProjects();group.addEventListener('change',drawQuickProjects);
 const quickTimeLabel=el(quick,'label','yuw-quick-time');el(quickTimeLabel,'span','','时间（可选）');const quickTime=input(quickTimeLabel,'time','','快速任务时间');quickTime.step='60';quickTime.title='可选：指定当天几点提醒';button(quick,'详情',()=>new TaskModal(this.plugin,this,null,project.value,group.value,{title:text.value,date:this.date,time:quickTime.value,itemId:project.value,direction:group.value}).open(),'yuw-edit');
 const add=el(quick,'button','','＋');add.type='submit';add.setAttribute('aria-label','保存快速任务');quick.addEventListener('submit',async e=>{e.preventDefault();add.disabled=true;try{await this.plugin.addTask({title:text.value,project:group.value,itemId:project.value,date:this.date,time:quickTime.value});new Notice('已保存到知识库，等待提醒事项同步');await this.refresh();}catch(e){new Notice(e.message);add.disabled=false;}});
 const late=selected.filter(t=>!t.done&&t.date&&t.date<this.date);const l=el(card,'label','yuw-overdue');const cb=input(l,'checkbox','','显示此前未完成');cb.checked=this.showOverdue;el(l,'span','',`此前未完成 ${late.length}`);cb.addEventListener('change',()=>{this.showOverdue=cb.checked;this.refresh();});const visible=selected.filter(t=>t.date===this.date||(this.showOverdue&&!t.done&&t.date&&t.date<this.date)).sort((a,b)=>Number(a.done)-Number(b.done)||a.date.localeCompare(b.date)||(a.time||'99:99').localeCompare(b.time||'99:99'));if(!visible.length)el(card,'div','yuw-empty','暂无任务');for(const t of visible)this.taskRow(card,t);

 const directions=el(main,'section','yuw-projects');directions.id='yuw-directions';const dh=el(directions,'div','yuw-section-head');el(dh,'h2','','各方向推进');button(dh,'＋ 新建方向',()=>new DirectionModal(this.plugin,this).open(),'yuw-edit');const grid=el(directions,'div','yuw-project-grid');
 for(const g of groups){const direction=directionId(this.plugin.data,g);const summary=summaryFor(tasks,this.plugin.data.items,direction);const p=el(grid,'article','yuw-card yuw-direction');const h=el(p,'div','yuw-section-head');el(h,'h3','',g);button(h,'＋ 项目',()=>new ItemModal(this.plugin,this,null,direction).open(),'yuw-edit');
 el(p,'p','yuw-direction-counts',`${summary.items.length} 个项目 · ${summary.pending} 项待办 · 已完成 ${summary.done} / ${summary.total}`);const track=el(p,'progress');track.max=Math.max(1,summary.total);track.value=summary.done;track.setAttribute('aria-label',g+'任务完成情况');
 const links=el(p,'div','yuw-item-links');for(const item of summary.items){const b=button(links,'',async()=>{this.projectDirection=direction;this.itemFilter=item.id;await this.refresh();this.contentEl.querySelector('#yuw-study')?.scrollIntoView({behavior:'smooth',block:'start'});},'yuw-item-link');el(b,'span','',item.name);el(b,'small','',item.stage||'未记录进度');}
 if(!summary.items.length)el(p,'p','yuw-small','暂无项目');
 if(summary.unassigned.length){const loose=el(p,'details','yuw-history');el(loose,'summary','',`未归入项目 ${summary.unassigned.length} 项`);for(const task of summary.unassigned)this.taskRow(loose,task);}
 }
 const study=el(main,'section','yuw-projects');study.id='yuw-study';const sh=el(study,'div','yuw-section-head');el(sh,'h2','','项目与学习进度');button(sh,'＋ 新建项目／学习事项',()=>new ItemModal(this.plugin,this).open(),'yuw-edit');
 const projectFilters=el(study,'div','yuw-filters');const selectDirection=select(projectFilters,[['','全部方向'],...groups.map(g=>[directionId(this.plugin.data,g),g]),['__unclassified','待选择方向']],this.projectDirection);selectDirection.setAttribute('aria-label','筛选项目方向');selectDirection.addEventListener('change',()=>{this.projectDirection=selectDirection.value;this.itemFilter='';this.refresh();});
 if(this.itemFilter)button(projectFilters,'显示全部项目',()=>{this.itemFilter='';this.projectDirection='';this.refresh();},'yuw-edit');
 const rows=el(study,'div','yuw-project-grid');const visibleItems=this.plugin.data.items.filter(i=>(!this.projectDirection||(this.projectDirection==='__unclassified'?!i.direction:i.direction===this.projectDirection))&&(!this.itemFilter||i.id===this.itemFilter));
 if(!visibleItems.length)el(rows,'div','yuw-empty','暂无项目');
 for(const item of visibleItems){const row=el(rows,'article','yuw-card yuw-project');row.setAttribute('data-item-id',item.id);const h=el(row,'div','yuw-section-head');el(h,'h3','',item.name);const actions=el(h,'div','yuw-project-actions');button(actions,'编辑项目与进度',()=>new ItemModal(this.plugin,this,item).open(),'yuw-edit');button(actions,item.direction?'＋ 任务':'选择所属方向',()=>item.direction?new TaskModal(this.plugin,this,null,item.id).open():new ItemModal(this.plugin,this,item).open(),'yuw-edit');
 el(row,'p','yuw-project-direction',directionName(this.plugin.data,item.direction));el(row,'p','yuw-stage',item.stage||'未记录进度');if(item.next)el(row,'p','yuw-next','下一步：'+item.next);if(item.link)button(row,'打开资料 ↗',()=>openLink(this.app,item.link),'yuw-link');
 const itemTasks=tasks.filter(t=>t.itemId===item.id),completed=itemTasks.filter(t=>t.done);el(row,'div','yuw-small',`任务完成 ${completed.length} / ${itemTasks.length}`);const track=el(row,'progress');track.max=Math.max(1,itemTasks.length);track.value=completed.length;track.setAttribute('aria-label',item.name+'任务完成情况');
 const list=el(row,'div','yuw-project-tasks');const pending=itemTasks.filter(t=>!t.done).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));if(!pending.length)el(list,'p','yuw-project-empty','暂无待办');for(const task of pending)this.taskRow(list,task);
 if(completed.length){const history=el(row,'details','yuw-history');el(history,'summary','',`已完成 ${completed.length}`);for(const task of completed)this.taskRow(history,task);}
 }

 }
}
class YuWorkbench extends Plugin{
 async onload(){
  const saved=await this.loadData();const v=this.app.vault;const note=v.getAbstractFileByPath(BASE+'方向与进度.md'),taskFile=v.getAbstractFileByPath(TASK_PATH);
  this.data=migrateData(saved,note?await v.read(note):'',taskFile?await v.read(taskFile):'');
  if(saved?.schemaVersion!==3)await this.saveData(this.data);
  this.registerView(VIEW,leaf=>new WorkbenchView(leaf,this));this.addRibbonIcon('panels-top-left','打开我的工作台',()=>this.open());this.addCommand({id:'open',name:'打开我的工作台',callback:()=>this.open()});this.registerObsidianProtocolHandler('yu-workbench',()=>this.open());
  for(const name of ['modify','create','delete'])this.registerEvent(v.on(name,f=>{if(f.path===TASK_PATH)this.refreshViews();}));this.app.workspace.onLayoutReady(()=>{if(!this.stopped)this.open().catch(e=>new Notice(e.message));});this.lastToday=localDate();this.registerInterval(window.setInterval(()=>{const today=localDate();if(today!==this.lastToday){for(const l of this.app.workspace.getLeavesOfType(VIEW))if(l.view.date===this.lastToday)l.view.date=today;this.lastToday=today;this.refreshViews();}else for(const leaf of this.app.workspace.getLeavesOfType(VIEW))leaf.view.updateSyncStatus?.();},60000));
 }
 onunload(){this.stopped=true;}
 async syncStatus(){
  try{const fs=require('fs'),path=require('path'),os=require('os');const base=path.join(os.homedir(),'Library/Containers/com.remindian.app/Data/Library/Application Support/Remindian');const config=JSON.parse(await fs.promises.readFile(path.join(base,'config.json'),'utf8'));const log=JSON.parse(await fs.promises.readFile(path.join(base,'sync_log.json'),'utf8'));const file=this.app.vault.getAbstractFileByPath(TASK_PATH);return syncMessage(config,log.entries?.[0],file?.stat?.mtime||0,this.app.vault.adapter?.getBasePath?.());}catch{return '提醒事项：暂时无法读取同步记录，请在 Remindian 中检查。';}
 }
 async openSyncApp(){try{const electron=require('electron');const shell=electron.shell||electron.remote?.shell;if(!shell)throw Error('无法打开应用');const error=await shell.openPath('/Applications/Remindian.app');if(error)throw Error(error);new Notice('已打开 Remindian；如未自动同步，请点窗口右上角 Sync Now。');}catch{new Notice('请打开“应用程序”中的 Remindian，点击右上角 Sync Now。');}}
 async ensureFile(){const v=this.app.vault;let f=v.getAbstractFileByPath(TASK_PATH);if(f)return f;let p='';for(const part of BASE.slice(0,-1).split('/')){p=p?p+'/'+part:part;if(!v.getAbstractFileByPath(p))await v.createFolder(p);}return v.create(TASK_PATH,'---\ntype: "项目"\ntags:\n  - stage/整理\n  - type/项目\n  - field/数字人文\n---\n# 待办收件箱\n\n## 工作台任务\n');}
 async readTasks(){const f=this.app.vault.getAbstractFileByPath(TASK_PATH);return f?resolveTasks(await this.app.vault.read(f),this.data||{directions:[],items:[]}):[];}
 async addTask(p){const project=this.projectForCategory(p.project);const line=makeTask(p.title,project,p.date,newId('task'),this.data?.directions||[],p.itemId||'',this.data?.items||[],p);this.writes=(this.writes||Promise.resolve()).catch(()=>{}).then(async()=>{const f=await this.ensureFile();await this.app.vault.process(f,text=>text.replace(/\s*$/,'')+(text.includes('## 工作台任务')?'\n':'\n\n## 工作台任务\n')+line+'\n');this.refreshViews();});return this.writes;}
 async updateTask(task,patch){const f=this.app.vault.getAbstractFileByPath(TASK_PATH);if(!f)throw Error('找不到任务源文件');await this.app.vault.process(f,text=>changeTask(text,task,patch,this.data?.directions||[],this.data?.items||[]));this.refreshViews();}
 projectForCategory(name){return directionId(this.data,name);}
 writeData(mutator){this.preferenceWrites=(this.preferenceWrites||Promise.resolve()).catch(()=>{}).then(async()=>{const next=JSON.parse(JSON.stringify(this.data));const result=mutator(next);await this.saveData(next);this.data=next;this.refreshViews();return result;});return this.preferenceWrites;}
 async createDirection(value){const name=itemName(value);return this.writeData(next=>{if(getGroups(next).some(n=>sameName(n,name)))throw Error('已有同名方向');const id=newId('自定义');next.directions.push({id,name});return id;});}
 async saveItem(record){const name=itemName(record.name);const link=(record.link||'').trim();if(!linkOK(link))throw Error('请填写有效资料入口');return this.writeData(next=>{
  if(!knownDirection(next,record.direction))throw Error('请选择所属方向');
  const index=record.id?next.items.findIndex(i=>i.id===record.id):-1;if(record.id&&index<0)throw Error('项目已变更，请刷新后再编辑');
  if(next.items.some(i=>i.id!==record.id&&i.direction===record.direction&&sameName(i.name,name)))throw Error('这个方向下已有同名项目');
  const item={...(index>=0?next.items[index]:{}),id:record.id||newId('project'),name,direction:record.direction,stage:clean(record.stage),next:clean(record.next),link};
  if(index>=0)next.items[index]=item;else next.items.push(item);return item.id;
 });}
 refreshViews(){for(const l of this.app.workspace.getLeavesOfType(VIEW))l.view.refresh();}
 async open(){if(this.opening)return this.opening;this.opening=(async()=>{let leaf=this.app.workspace.getLeavesOfType(VIEW)[0];if(!leaf){leaf=this.app.workspace.getLeaf('tab');await leaf.setViewState({type:VIEW,active:true});}await this.app.workspace.revealLeaf(leaf);})();try{return await this.opening;}finally{this.opening=null;}}
}
module.exports=YuWorkbench;module.exports.core={parseTasks,makeTask,changeTask,localDate,shiftDate,dateOK,groupOf,importProgress,getGroups,getStudies,itemName,GROUPS,STUDIES,migrateData,resolveTasks,summaryFor,directionId,directionName,timeOK,syncMessage};
