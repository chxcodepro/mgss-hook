"""Evaluate a supplied diagnostic expression in a running WeChat JSRuntime."""
import argparse
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--pid", required=True)
parser.add_argument("--script", type=Path, required=True)
parser.add_argument("--after-script", type=Path)
parser.add_argument("--seconds", type=int, default=3)
args = parser.parse_args()
expression = args.script.read_text(encoding="utf-8")
if args.after_script:
    followup = args.after_script.read_text(encoding="utf-8")
    expression = "(function(){var first=" + expression + ";if(first.kind==='other')return first;var second=" + followup + ";return {kind:'runtime-sequence',first:first,second:second};})()"
javascript = """
Java.perform(function () {
    var Callback = Java.registerClass({
        name: 'io.github.mgss.RuntimeProbe' + Date.now(),
        implements: [Java.use('android.webkit.ValueCallback')],
        methods: { onReceiveValue: function (value) { console.log('MGSS_RESULT ' + value); } }
    });
    Java.choose('com.tencent.mm.plugin.appbrand.jsruntime.h', {
        onMatch: function (runtime) {
            try { runtime.evaluateJavascript(EXPRESSION, Callback.$new()); }
            catch (error) { console.log('MGSS_ERROR ' + error); }
        },
        onComplete: function () {}
    });
});
""".replace("EXPRESSION", json.dumps("JSON.stringify(" + expression + ")"))
frida = Path.home() / ".local" / "bin" / "frida.exe"
result = subprocess.run([str(frida), "-H", "127.0.0.1:27042", "-p", args.pid,
                         "-q", "-t", str(args.seconds), "-e", javascript],
                        capture_output=True, text=True, timeout=args.seconds + 15)
found = False
for line in result.stdout.splitlines():
    if line.startswith("MGSS_RESULT "):
        try:
            value = json.loads(line[12:])
            if isinstance(value, str):
                value = json.loads(value)
            if isinstance(value, dict) and value.get("kind") != "other":
                print(json.dumps(value, ensure_ascii=False)); found = True
        except (ValueError, TypeError):
            print(line)
    elif line.startswith("MGSS_ERROR"):
        print(line)
if not found:
    print("No game result", result.stdout[:1200], result.stderr[:600])
raise SystemExit(result.returncode)
