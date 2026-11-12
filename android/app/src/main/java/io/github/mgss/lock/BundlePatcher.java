package io.github.mgss.lock;

import java.io.File;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class BundlePatcher {
    private static final String TAIL = "return new yr(),s.Main=yr,s;}({});";
    private static final String[] SIGNATURES = {
        "{key:\"hsn\",value:function hsn(t){t=this.prp[t];return null==t?null:t;}}",
        "{key:\"frt\",value:function frt(t){var i=this.prp[t];return null==i&&(i={gold1:0,gold2:0},this.prp[t]=i),i;}}",
        "{key:\"xcl\",value:function xcl(t,i,s){var e=this.prp[t];(e=e||this.frt(t)).gold1+=i,e.gold2+=s,e.gold1=Math.round(10*e.gold1)/10,e.gold2=Math.round(10*e.gold2)/10;}}",
        "{key:\"gold\",get:function get(){return this._data._gold;},set:function set(t){if(this._data._gold=t,",
        "{key:\"wtn\",value:function wtn(t){if(this._data._gold+=t,"
    };
    private static final String CURRENT_TAIL = "return new mr,s.Main=mr,s})({});";
    private static final String[] CURRENT_SIGNATURES = {
        "class Ns{constructor(){this.iho={}",
        "emg(t){t=this.iho[t];return null==t?null:t}",
        "zlf(t){let i=this.iho[t];return null==i&&(i={gold1:0,gold2:0},this.iho[t]=i),i}",
        "hbj(t,i,s){let e=this.iho[t];(e=e||this.zlf(t)).gold1+=i,e.gold2+=s,e.gold1=Math.round(10*e.gold1)/10,e.gold2=Math.round(10*e.gold2)/10}",
        "get gold(){return this._data._gold}",
        "set gold(t){if(this._data._gold=t,this._data._gold<0&&(this._data._gold=0),0<this.osc.length)for(let t=0;t<this.osc.length;t++)this.osc[t].text=this._data._gold.toString();this.fzs()}",
        "byn(t){if(this._data._gold+=t,",
        "get rap(){return this.wqg&&null!=this.wqg||(this.wqg=new Ns),this.wqg}",
        "get player(){return this.ohv&&null!=this.ohv||(this.ohv=new Ds),this.ohv}",
        "t=O.instance.player.qxy,null!=(t=E.instance.rap.emg(t))",
        "static get xae(){return\"wx\"==this.pf&&this.rlz instanceof Hs?this.rlz:null}",
        "this.cbi.weight=t.shareWeight,this.xyd();"
    };
    private static final String[][] CURRENT_NAMES = {
        {"hsn", "emg"}, {"frt", "zlf"}, {"xcl", "hbj"}, {"prp", "iho"},
        {"wtn", "byn"}, {"rqp", "qxy"}, {"fli", "rap"}, {"pgg", "xae"}, {"ilu", "cbi"},
        {"yi", "mi"}, {"ljq", "rde"}, {"uje", "rvk"}, {"hfv", "nbh"}, {"plg", "thf"},
        {"xax", "xvd"}, {"oob", "ohl"}, {"fjf", "rgf"}, {"fxq", "wqv"}, {"gdp", "mfx"},
        {"vrw", "xrj"}, {"xxl", "egf"}, {"dta", "zql"}, {"hli", "hsq"}, {"rqo", "adg"},
        {"laj", "lfv"}, {"qga", "xrx"}, {"ipw", "svy"}, {"uzm", "iav"},
        {"mvx", "sun"}, {"rwn", "glx"}
    };
    static String patch(String source, String controller) {
        return patch(source, controller, "");
    }
    static String patch(String source, String controller, String ghost) {
        if (!source.contains("HorrorDormitory")) return null;
        if (source.contains(CURRENT_TAIL)) {
            for (String signature : CURRENT_SIGNATURES) if (count(source, signature) != 1) throw new IllegalArgumentException("Currency signature mismatch");
            if (count(source, CURRENT_TAIL) != 1) throw new IllegalArgumentException("Bundle scope mismatch");
            String extension = !ghost.isEmpty() && ghostCompatible(source) ? remap(ghost) + "\n" : "";
            return source.replace(CURRENT_TAIL, extension + remap(controller) + "\n" + CURRENT_TAIL);
        }
        for (String signature : SIGNATURES) if (count(source, signature) != 1) throw new IllegalArgumentException("Currency signature mismatch");
        if (count(source, TAIL) != 1) throw new IllegalArgumentException("Bundle scope mismatch");
        String extension = !ghost.isEmpty() && ghostCompatible(source) ? ghost + "\n" : "";
        return source.replace(TAIL, extension + controller + "\n" + TAIL);
    }
    static boolean ghostCompatible(String source) {
        if (source.contains(CURRENT_TAIL)) {
            String start = "class mi extends Pt{", end = "class fi{";
            int from = source.indexOf(start), to = source.indexOf(end, from);
            if (from < 0 || to < from || count(source, start) != 1) return false;
            String actor = source.substring(from, to);
            return count(actor, "set rde(t){t=this.dse(t),this.rvk=t,this.rde>this.nbh&&(this.rvk=this.nbh),this.iln=this.hp}get rde(){return this.rvk}") == 1
                && count(actor, "egf(){this.hsq=1,this.adg=1,this.lfv=!1,this.ors()}") == 1
                && count(actor, "ors(){this.level++,this.zql=this.wqv[this.ifp];") == 1
                && count(actor, "this.nbh=this.mfx[this.level],this.rde+=t,this.xrx=this.xrj[this.ifp-1],this.svy=0") == 1
                && count(actor, "T.mode==B.Troll?(this.wqv=E.instance.troll.xct,this.mfx=E.instance.troll.vgh,this.xrj=E.instance.troll.yjv)") == 1
                && count(actor, "get nbh(){if(T.mode==B.Troll)return this.cvf+this.tkg();") == 1
                && count(source, "get player(){return T.mode==B.Troll?_.instance.xvd:null==this.rgf?null==O.instance.angel?O.instance.player:O.instance.angel:null}") == 1
                && count(source, "class ys extends mi{") == 1
                && count(source, "get xvd(){return this.jcn}") == 1
                && count(source, "get troll(){var t;return null!=(t=this.jcn.ohl)&&t.parent?this.jcn.ohl:null}") == 1
                && count(source, "set thf(t){this.ncf=t}get thf(){return this.ncf}") == 1;
        }
        String start = "var yi=/*#__PURE__*/function(_Pt)", end = "return yi;}";
        int from = source.indexOf(start), to = source.indexOf(end, from);
        if (from < 0 || to < from || count(source, start) != 1) return false;
        String actor = source.substring(from, to);
        return count(actor, "{key:\"ljq\",get:function get(){return this.uje;},set:function set(t){t=this.ava(t),this.uje=t,this.ljq>this.hfv&&(this.uje=this.hfv),this.nci=this.hp;}}") == 1
            && count(actor, "{key:\"xxl\",value:function xxl(){this.hli=1,this.rqo=1,this.laj=!1,this.yok();}}") == 1
            && count(actor, "{key:\"yok\",value:function yok(){this.level++,this.dta=this.fxq[this.cuj];") == 1
            && count(actor, "{key:\"hfv\",get:function get(){if(T.mode==B.Troll)return this.mke+this.yir();") == 1
            && count(source, "{key:\"player\",get:function get(){return T.mode==B.Troll?_.instance.xax:null==this.fjf?null==O.instance.angel?O.instance.player:O.instance.angel:null;}}") == 1
            && count(source, "var ms=/*#__PURE__*/function(_yi)") == 1
            && count(source, "{key:\"xax\",get:function get(){return this.tmi;}}") == 1;
    }
    private static String remap(String script) {
        Matcher tokens = Pattern.compile("\\b[A-Za-z_$][\\w$]*\\b").matcher(script);
        StringBuffer result = new StringBuffer();
        while (tokens.find()) {
            String name = tokens.group();
            for (String[] binding : CURRENT_NAMES) if (binding[0].equals(name)) { name = binding[1]; break; }
            tokens.appendReplacement(result, Matcher.quoteReplacement(name));
        }
        tokens.appendTail(result);
        return result.toString();
    }
    private static int count(String source, String needle) {
        int count = 0, offset = 0;
        while ((offset = source.indexOf(needle, offset)) >= 0) { count++; offset += needle.length(); }
        return count;
    }
    static String readWxa(String path, String fileName) throws Exception {
        File file = new File(path);
        if (!file.isFile() || file.length() < 18 || file.length() > 128 * 1024 * 1024) throw new IllegalArgumentException("Invalid WXA package");
        try (RandomAccessFile input = new RandomAccessFile(file, "r")) {
            if (input.readUnsignedByte() != 0xbe) throw new IllegalArgumentException("Unsupported WXA format");
            input.seek(13);
            if (input.readUnsignedByte() != 0xed) throw new IllegalArgumentException("Invalid WXA header");
            int files = input.readInt();
            if (files < 1 || files > 100000) throw new IllegalArgumentException("Invalid WXA index");
            String wanted = fileName.startsWith("/") ? fileName : "/" + fileName;
            for (int index = 0; index < files; index++) {
                int length = input.readInt();
                if (length < 1 || length > 4096) throw new IllegalArgumentException("Invalid WXA name");
                byte[] name = new byte[length]; input.readFully(name);
                long offset = Integer.toUnsignedLong(input.readInt()), size = Integer.toUnsignedLong(input.readInt());
                if (!wanted.equals(new String(name, StandardCharsets.UTF_8))) continue;
                if (size > 16 * 1024 * 1024 || offset < 18 || offset + size > input.length()) throw new IllegalArgumentException("Invalid WXA entry");
                input.seek(offset); byte[] bytes = new byte[(int) size]; input.readFully(bytes);
                return new String(bytes, StandardCharsets.UTF_8);
            }
        }
        throw new IllegalArgumentException("WXA script entry missing");
    }
}
