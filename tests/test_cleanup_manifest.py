from pathlib import Path
import base64,copy,importlib.util,json,tempfile,unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('prepare_cleanup',ROOT/'scripts/reminders_cleanup/prepare_cleanup.py');cleanup=importlib.util.module_from_spec(spec);spec.loader.exec_module(cleanup)

def mapping(source,title,native):
    return {'obsidianId':base64.b64encode((source+'|'+title+'|').encode()).decode(),'remindersId':native}

class CleanupManifestTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.base=Path(self.temp.name);self.history=self.base/'backups/old.json';self.history.parent.mkdir()
        self.old={'mappings':[mapping(cleanup.TASK,'正常任务','normal'),mapping('/notes/a.md','字段甲','extra-a'),mapping('/notes/b.md','字段乙','extra-b')]}
        self.history.write_text(json.dumps(self.old))
        p={'activeProfileId':'example','profiles':[{'id':'example','enabled':True,'config':{'includedFolders':['工具/个人工作台'],'defaultList':'工作台'}}]}
        (self.base/'profiles.json').write_text(json.dumps(p));(self.base/'sync_state_example.json').write_text(json.dumps({'mappings':[mapping(cleanup.TASK,'正常任务','normal')]}))
        self.event={'id':'event-example','timestamp':800000000,'result':{'created':3,'errorCount':0,'isDryRun':False},'details':[{'action':'created','filePath':'/notes/a.md','taskTitle':'字段甲'},{'action':'created','filePath':'/notes/b.md','taskTitle':'字段乙'}]};self.logs()
    def logs(self):(self.base/'sync_log.json').write_text(json.dumps({'entries':[self.event]}))
    def tearDown(self):self.temp.cleanup()
    def build(self,sources=None):return cleanup.build_manifest(self.base,self.history,'event-example',sources or ['/notes/a.md'])
    def test_only_selected_source_is_included(self):
        result=self.build();self.assertEqual(result['expectedCount'],1);self.assertEqual(result['targets'][0]['id'],'extra-a');self.assertEqual(result['evidenceRelativePath'],'backups/old.json')
    def test_current_task_source_is_forbidden(self):
        with self.assertRaises(ValueError):self.build([cleanup.TASK])
    def test_overlap_with_current_reminders_is_forbidden(self):
        (self.base/'sync_state_example.json').write_text(json.dumps({'mappings':[mapping(cleanup.TASK,'正常任务','extra-a')]}))
        with self.assertRaises(ValueError):self.build()
    def test_each_target_requires_creation_evidence(self):
        self.event['details']=[];self.logs()
        with self.assertRaises(ValueError):self.build()
    def test_dry_run_is_not_creation_proof(self):
        self.event['result']['isDryRun']=True;self.logs()
        with self.assertRaises(ValueError):self.build()
    def test_duplicate_ids_are_forbidden(self):
        self.old['mappings'].append(mapping('/notes/a.md','另一个字段','extra-a'));self.history.write_text(json.dumps(self.old))
        with self.assertRaises(ValueError):self.build()
    def test_unknown_sources_are_forbidden(self):
        with self.assertRaises(ValueError):self.build(['/missing.md'])

if __name__=='__main__':unittest.main()
