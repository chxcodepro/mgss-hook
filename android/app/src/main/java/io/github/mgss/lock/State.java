package io.github.mgss.lock;

import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;

final class State {
    static final String GAME = "com.tencent.mm";
    static final Uri URI = Uri.parse("content://io.github.mgss.lock.bridge");
    static final Uri CONFIG = Uri.withAppendedPath(URI, "config");
    static final String[] KEYS = {"gold", "lightning", "honey", "ad"};
    static Bundle read(Context context) {
        Bundle value = context.getContentResolver().call(URI, "read", null, null);
        return value == null ? new Bundle() : value;
    }
    static void write(Context context, String key, boolean value) {
        Bundle b = new Bundle(); b.putBoolean(key, value);
        context.getContentResolver().call(URI, "configure", null, b);
    }
    static boolean connected(Bundle b) {
        return b.getLong("seen") > 0 && SystemClock.elapsedRealtime() - b.getLong("seen") < 5000;
    }
    static String status(Bundle b) {
        if (connected(b)) {
            String error = b.getString("error", "");
            if (!error.isEmpty()) return error.contains("signature") || error.contains("scope") ? "版本不匹配" : "连接异常";
            return b.getBoolean("ready") ? "已连接" : "等待游戏加载";
        }
        long moduleSeen = b.getLong("moduleSeen");
        if (moduleSeen > 0 && SystemClock.elapsedRealtime() - moduleSeen < 5000) return "等待猛鬼宿舍";
        return "等待微信连接";
    }
}
