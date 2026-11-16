from pathlib import Path
import json,math,subprocess,tempfile,unittest,zipfile
ROOT=Path(__file__).resolve().parents[1]

def luminance(color):
    channels=[int(color[i:i+2],16)/255 for i in (1,3,5)];linear=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in channels];return sum(a*b for a,b in zip(linear,[.2126,.7152,.0722]))

class ReleaseTests(unittest.TestCase):
    def test_light_dark_text_contrast(self):
        palettes=json.loads((ROOT/'design/palettes.json').read_text());self.assertEqual(palettes['light'].keys(),palettes['dark'].keys())
        pairs=[('ink','paper'),('muted','paper'),('ink','input'),('placeholder','input'),('side-ink','side-bg'),('side-muted','side-bg'),('primary-ink','primary'),('selected-ink','selected-bg'),('metric-muted','metric-bg'),('metric-done-ink','metric-done-bg'),('metric-done-muted','metric-done-bg'),('badge-ink','badge'),('muted','surface')]
        for mode,palette in palettes.items():
            for fg,bg in pairs:
                low,high=sorted([luminance(palette[fg]),luminance(palette[bg])]);self.assertGreaterEqual((high+.05)/(low+.05),4.5,(mode,fg,bg))
    def test_distribution_whitelist(self):
        subprocess.run(['python3',str(ROOT/'scripts/build.py')],check=True,capture_output=True)
        version=json.loads((ROOT/'manifest.json').read_text())['version']
        with zipfile.ZipFile(ROOT/'dist'/('yu-workbench-'+version+'.zip')) as z:
            self.assertEqual(set(z.namelist()),{'yu-workbench/main.js','yu-workbench/styles.css','yu-workbench/manifest.json'})
            self.assertIsNone(z.testzip())
        for name in ['白天预览.html','黑夜预览.html']:
            self.assertIn('演示版，不会同步',(ROOT/'dist'/name).read_text())

if __name__=='__main__':unittest.main()
