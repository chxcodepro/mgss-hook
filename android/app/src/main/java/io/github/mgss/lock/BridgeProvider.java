package io.github.mgss.lock;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Binder;
import android.os.Bundle;
import android.os.Process;
import android.os.SystemClock;

public final class BridgeProvider extends ContentProvider {
    private SharedPreferences prefs;
    private int gameUid = -1, revision, targetPid;
    private boolean running;
    private long moduleSeen, seen;
    private Bundle report = new Bundle();
    private Bundle command;
    private long commandTime;
    @Override public boolean onCreate() {
        prefs = getContext().getSharedPreferences("locks", 0);
        try { gameUid = getContext().getPackageManager().getApplicationInfo(State.GAME, 0).uid; }
        catch (Exception ignored) { }
        return true;
    }
    @Override public synchronized Bundle call(String method, String arg, Bundle extras) {
        int uid = Binder.getCallingUid();
        boolean own = uid == Process.myUid();
        if (!own && uid != gameUid) throw new SecurityException("Caller denied");
        if ("configure".equals(method)) {
            if (!own || extras == null) throw new SecurityException("Caller denied");
            SharedPreferences.Editor editor = prefs.edit();
            for (String key : State.FLAGS) if (extras.containsKey(key)) editor.putBoolean(key, extras.getBoolean(key));
            editor.apply();
            if (extras.containsKey("running")) { running = extras.getBoolean("running"); if (!running) command = null; }
            revision++;
            getContext().getContentResolver().notifyChange(State.CONFIG, null);
        } else if ("ghostCommand".equals(method)) {
            if (!own || extras == null) throw new SecurityException("Caller denied");
            if (command != null) throw new IllegalStateException("操作执行中");
            if (!running || !report.getBoolean("ghostSelf") || SystemClock.elapsedRealtime() - seen >= 5000
                || !report.getString("ghostToken", "").equals(extras.getString("token", "")))
                throw new IllegalStateException("仅本人玩鬼时可用");
            String kind = extras.getString("kind", ""); int value = extras.getInt("value");
            if (!("set".equals(kind) && value >= 1 && value <= report.getInt("ghostMaxLevel"))
                && !("step".equals(kind) && (value == -1 || value == 1))) throw new IllegalArgumentException("无效等级");
            command = new Bundle(extras); command.putString("id", java.util.UUID.randomUUID().toString());
            command.putLong("expiresAt", System.currentTimeMillis() + 5000);
            commandTime = SystemClock.elapsedRealtime(); report.putString("ghostCommandError", "");
            getContext().getContentResolver().notifyChange(State.CONFIG, null);
        } else if ("presence".equals(method)) {
            if (uid != gameUid) throw new SecurityException("Caller denied");
            moduleSeen = SystemClock.elapsedRealtime();
        } else if ("report".equals(method)) {
            if (uid != gameUid || extras == null) throw new SecurityException("Caller denied");
            int pid = Binder.getCallingPid();
            if (targetPid == 0 || targetPid == pid || SystemClock.elapsedRealtime() - seen >= 5000) {
                targetPid = pid; report = new Bundle(extras); seen = SystemClock.elapsedRealtime();
                if (command != null && command.getString("id", "").equals(report.getString("ghostRequestId", ""))) command = null;
            }
        } else if (!"read".equals(method)) throw new IllegalArgumentException("Unknown operation");
        Bundle out = new Bundle(report);
        out.putBoolean("running", running);
        for (String key : State.FLAGS) out.putBoolean(key, prefs.getBoolean(key, !"selfGhostHp".equals(key)));
        if (command != null && SystemClock.elapsedRealtime() - commandTime >= 5000) {
            command = null; report.putString("ghostCommandError", "操作超时"); out.putString("ghostCommandError", "操作超时");
        }
        if (command != null) out.putBundle("ghostCommand", new Bundle(command));
        out.putBoolean("ghostPending", command != null);
        out.putInt("revision", revision);
        out.putLong("target", 999999);
        out.putLong("moduleSeen", moduleSeen); out.putLong("seen", seen);
        return out;
    }
    @Override public Cursor query(Uri u, String[] p, String s, String[] a, String o) { return null; }
    @Override public String getType(Uri u) { return "vnd.android.cursor.item/vnd.mgss.control"; }
    @Override public Uri insert(Uri u, ContentValues v) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri u, String s, String[] a) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri u, ContentValues v, String s, String[] a) { throw new UnsupportedOperationException(); }
}
