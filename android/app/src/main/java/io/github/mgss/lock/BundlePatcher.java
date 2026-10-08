package io.github.mgss.lock;

import java.io.File;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;

final class BundlePatcher {
    private static final String TAIL = "return new yr(),s.Main=yr,s;}({});";
    private static final String[] SIGNATURES = {
        "{key:\"hsn\",value:function hsn(t){t=this.prp[t];return null==t?null:t;}}",
        "{key:\"frt\",value:function frt(t){var i=this.prp[t];return null==i&&(i={gold1:0,gold2:0},this.prp[t]=i),i;}}",
        "{key:\"xcl\",value:function xcl(t,i,s){var e=this.prp[t];(e=e||this.frt(t)).gold1+=i,e.gold2+=s,e.gold1=Math.round(10*e.gold1)/10,e.gold2=Math.round(10*e.gold2)/10;}}",
        "{key:\"gold\",get:function get(){return this._data._gold;},set:function set(t){if(this._data._gold=t,",
        "{key:\"wtn\",value:function wtn(t){if(this._data._gold+=t,"
    };
    static String patch(String source, String controller) {
        return patch(source, controller, "");
    }
    static String patch(String source, String controller, String ghost) {
        if (!source.contains("HorrorDormitory")) return null;
        for (String signature : SIGNATURES) if (count(source, signature) != 1) throw new IllegalArgumentException("Currency signature mismatch");
        if (count(source, TAIL) != 1) throw new IllegalArgumentException("Bundle scope mismatch");
        String extension = !ghost.isEmpty() && ghostCompatible(source) ? ghost + "\n" : "";
        return source.replace(TAIL, extension + controller + "\n" + TAIL);
    }
    static boolean ghostCompatible(String source) {
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
