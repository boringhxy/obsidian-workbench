from pathlib import Path
import base64,copy,importlib.util,json,sys,tempfile,unittest

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
import install
from reminders_migration import migrate_metadata

def encoded(value):return base64.b64encode(value.encode()).decode()

class InstallTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.vault=self.root/'vault';(self.vault/'.obsidian').mkdir(parents=True)
        (self.vault/'.obsidian/community-plugins.json').write_text('["dataview"]')
        self.source=self.vault/install.TASK;self.source.parent.mkdir(parents=True)
        self.source.write_text('---\ntype: 项目\ntags: [type/项目]\n---\n- [ ] 示例任务 #方向/个人管理 📅 2030-01-02 <!-- yu:example -->\n')
        self.plugin=self.vault/'.obsidian/plugins/yu-workbench';self.plugin.mkdir(parents=True);(self.plugin/'data.json').write_text('{"items":[{"id":"keep"}]}')
        self.base=self.root/'remindian';self.base.mkdir();pid='synthetic-profile'
        self.conf={'vaultPath':str(self.vault),'taskSourceType':'obsidianTasks','taskDestinationType':'appleReminders','includedFolders':['工具/个人工作台'],'defaultList':'工作台','syncedRemindersLists':['工作台'],'unmappedTagsCreateLists':False,'dryRunMode':False,'globalFilter':'','includedNoteTags':[],'syncStateLocation':'appSupport','enableNewTaskWriteback':False}
        self.profiles={'activeProfileId':pid,'profiles':[{'id':pid,'name':'工作台','enabled':True,'config':copy.deepcopy(self.conf)}]}
        self.state_path=self.base/('sync_state_'+pid+'.json');self.state={'stateVersion':8,'mappings':[{'obsidianId':encoded('/'+install.TASK.as_posix()+'|示例任务 <!-- yu:example -->|#方向/个人管理'),'remindersId':'synthetic-native-id','lastObsidianHash':'previous-source','lastRemindersHash':'previous-reminder'}]}
        (self.base/'profiles.json').write_text(json.dumps(self.profiles));(self.base/'config.json').write_text(json.dumps(self.conf));self.state_path.write_text(json.dumps(self.state))
    def tearDown(self):self.temp.cleanup()
    def test_plugin_only_preserves_source_and_data(self):
        before=self.source.read_bytes();data=(self.plugin/'data.json').read_bytes();plan=install.plan_install(self.vault);backup=install.apply_plan(plan)
        self.assertTrue(backup.is_dir());self.assertEqual(self.source.read_bytes(),before);self.assertEqual((self.plugin/'data.json').read_bytes(),data)
        self.assertIn('dataview',json.loads((self.vault/'.obsidian/community-plugins.json').read_text()));self.assertEqual(install.plan_install(self.vault)['writes'],{})
    def test_reminders_migration_preserves_native_identity(self):
        plan=install.plan_install(self.vault,self.base,'工作台');install.apply_plan(plan);state=json.loads(self.state_path.read_text());mapping=state['mappings'][0]
        self.assertEqual(mapping['remindersId'],'synthetic-native-id');self.assertEqual(mapping['lastObsidianHash'],'previous-source');self.assertEqual(mapping['lastRemindersHash'],'previous-reminder')
        self.assertIn('|示例任务|',base64.b64decode(mapping['obsidianId']).decode());self.assertIn('<!-- yu:example -->\n- [ ] 示例任务',self.source.read_text())
        active=json.loads((self.base/'config.json').read_text());self.assertFalse(active['writeTagsToReminderNotes']);self.assertTrue(active['includeDueTime']);self.assertFalse(active['enableNewTaskWriteback']);self.assertEqual(install.plan_install(self.vault,self.base,'工作台')['writes'],{})
    def test_unknown_scope_stops(self):
        self.profiles['profiles'][0]['config']['includedFolders']=[];(self.base/'profiles.json').write_text(json.dumps(self.profiles))
        with self.assertRaises(ValueError):install.plan_install(self.vault,self.base,'工作台')
    def test_outside_mapping_stops(self):
        self.state['mappings'][0]['obsidianId']=encoded('/another-note.md|example|#tag');self.state_path.write_text(json.dumps(self.state))
        with self.assertRaises(ValueError):install.plan_install(self.vault,self.base,'工作台')
    def test_stale_file_stops(self):
        plan=install.plan_install(self.vault);self.source.write_text('changed externally')
        with self.assertRaises(ValueError):install.apply_plan(plan)
    def test_failure_restores_written_files(self):
        plan=install.plan_install(self.vault,self.base,'工作台');original=install.atomic_write;calls=[0]
        def flaky(path,raw):
            calls[0]+=1
            if calls[0]==3:raise OSError('simulated failure')
            return original(path,raw)
        install.atomic_write=flaky
        try:
            with self.assertRaises(OSError):install.apply_plan(plan)
        finally:install.atomic_write=original
        for path,raw in plan['originals'].items():self.assertEqual(path.read_bytes() if path.exists() else None,raw)
    def test_collision_stops(self):
        state=copy.deepcopy(self.state);state['mappings'].append({'obsidianId':encoded('/'+install.TASK.as_posix()+'|示例任务|#方向/个人管理'),'remindersId':'another-native-id'})
        with self.assertRaises(ValueError):migrate_metadata(self.source.read_bytes(),state)

if __name__=='__main__':unittest.main()
