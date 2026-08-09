import urllib.request
import re

url = "https://docs.google.com/spreadsheets/d/1Co4rEgH5AphlVPMykryFz9oBdOE87Vx2d5iNbksj6wQ/htmlview"
try:
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        # Google sheets htmlview contains the tabs data in a JS array or list of links
        matches = re.findall(r'<li id="sheet-button-(.*?)".*?><a[^>]*>(.*?)</a></li>', html)
        if matches:
            for gid, name in matches:
                print(f"{name}: {gid}")
        else:
            # Look for window.aData or similar
            gids = re.findall(r'\{gid:"(.*?)"', html)
            names = re.findall(r'name: "(.*?)"', html)
            for i in range(min(len(gids), len(names))):
                print(f"{names[i]}: {gids[i]}")
            
except Exception as e:
    print(e)
