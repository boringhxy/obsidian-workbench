from pathlib import Path
import html,json,zipfile

root=Path(__file__).resolve().parents[1];output=root/'dist';output.mkdir(exist_ok=True);version=json.loads((root/'manifest.json').read_text())['version'];css=(root/'styles.css').read_text();shim=(root/'examples/preview-shim.js').read_text();application=(root/'main.js').read_text()
style='''
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;background:var(--yu-page);color:var(--yu-ink);color-scheme:var(--yu-scheme)}button,input,select{font:inherit}button{cursor:pointer}#mount{min-height:calc(100vh - 60px)}
.demo-banner{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 18px;background:var(--yu-surface);color:var(--yu-muted);border-bottom:1px solid var(--yu-border);font-size:12px;line-height:1.7;flex-wrap:wrap}
.demo-mode{display:flex;gap:6px}.demo-mode button{border:1px solid var(--yu-edge);border-radius:4px;background:var(--yu-paper);color:var(--yu-ink);padding:5px 12px;font-size:12px}.demo-mode button[aria-pressed=true]{background:var(--yu-selected-bg);color:var(--yu-selected-ink)}.demo-mode button:focus-visible{outline:2px solid var(--yu-focus);outline-offset:2px}
.demo-overlay{position:fixed;inset:0;background:rgba(7,18,12,.55);display:grid;place-items:center;z-index:10;padding:20px}
.demo-modal{padding:28px;border-radius:9px;background:var(--yu-paper);color:var(--yu-ink);width:490px;max-width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 80px #0004;border:1px solid var(--yu-edge)}
.demo-modal.yuw-form{padding:28px}.demo-modal input,.demo-modal select{box-sizing:border-box}.demo-modal .yuw-actions{margin-top:22px}
.demo-toast{position:fixed;bottom:25px;left:50%;transform:translateX(-50%);padding:15px 20px;border-radius:6px;background:var(--yu-paper);border:1px solid var(--yu-edge);color:var(--yu-ink);z-index:100;font-size:13px}
'''
mode_js='''
function setPreviewTheme(mode){document.body.classList.toggle('theme-dark',mode==='dark');document.body.classList.toggle('theme-light',mode==='light');document.documentElement.style.colorScheme=mode;document.querySelectorAll('[data-preview-theme]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.previewTheme===mode)));}
document.querySelectorAll('[data-preview-theme]').forEach(button=>button.addEventListener('click',()=>setPreviewTheme(button.dataset.previewTheme)));
setPreviewTheme(document.body.classList.contains('theme-dark')?'dark':'light');
'''
def script(content):return '<script>'+content.replace('</script','<\\/script')+'</script>'
def build(mode,title):
 return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>'+html.escape(title)+'</title><style>'+css+'\n'+style+'</style></head><body class="yuw-preview-body theme-'+mode+'"><div class="demo-banner"><span>工作台 '+version+' · 提醒事项式录入预览 · 演示版，不会同步至 Obsidian 或提醒事项</span><div class="demo-mode" role="group" aria-label="预览主题"><button type="button" data-preview-theme="light">白天</button><button type="button" data-preview-theme="dark">黑夜</button></div></div><div id="mount"></div>'+script(mode_js)+script(shim)+script(application)+script('window.demoPlugin=new module.exports();window.demoPlugin.syncStatus=async()=>"演示版：输入仅保存在浏览器，不会同步到提醒事项。";window.demoPlugin.openSyncApp=async()=>alert("请安装更新，并在 Obsidian 内使用正式工作台。");window.demoPlugin.requestReminderSync=async()=>"demo";window.demoPlugin.onload();')+'</body></html>'
for name,mode,title in [('工作台预览.html','light','工作台 '+version+' · 明暗切换预览'),('白天预览.html','light','工作台 '+version+' · 白天配色'),('黑夜预览.html','dark','工作台 '+version+' · 黑夜配色')]:
 (output/name).write_text(build(mode,title))
print('已生成白天、黑夜及可切换预览。')

with zipfile.ZipFile(output/('yu-workbench-'+version+'.zip'),'w',zipfile.ZIP_DEFLATED) as archive:
 for name in ['main.js','styles.css','manifest.json']:
  archive.write(root/name,'yu-workbench/'+name)
print('插件安装包已生成：'+version)
