package io.github.mgss.lock;

import android.app.Application;
import android.content.Context;
import android.content.res.AssetManager;
import android.database.ContentObserver;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;
import android.webkit.ValueCallback;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import org.json.JSONObject;
import de.robv.android.xposed.IXposedHookLoadPackage;
import de.robv.android.xposed.IXposedHookZygoteInit;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import de.robv.android.xposed.callbacks.XC_LoadPackage;

public final class GameModule implements IXposedHookLoadPackage, IXposedHookZygoteInit {
    private static final String SCRIPT = "https://usr/js/game.js";
    private static String modulePath;
    private Context context;
    private Handler worker;
    private volatile WeakReference<Object> runtime = new WeakReference<>(null);
    private volatile String error = "";
    private volatile boolean target;
    private String controller, ghost;
    private long requested;
    private volatile boolean pending;
    @Override public void initZygote(StartupParam param) { modulePath = param.modulePath; }
    @Override public void handleLoadPackage(XC_LoadPackage.LoadPackageParam param) {
        if (!State.GAME.equals(param.packageName) || !param.processName.startsWith(State.GAME + ":appbrand")) return;
        XposedHelpers.findAndHookMethod(Application.class, "attach", Context.class, new XC_MethodHook() {
            @Override protected void afterHookedMethod(MethodHookParam hook) {
                if (context != null) return;
                context = (Context) hook.args[0];
                HandlerThread thread = new HandlerThread("MgssControls"); thread.start();
                worker = new Handler(thread.getLooper());
                try {
                    controller = loadAsset("controller.js"); ghost = loadAsset("ghost.js");
                    Class<?> cls = XposedHelpers.findClass("com.tencent.mm.plugin.appbrand.jsruntime.h", context.getClassLoader());
                    java.util.Set<XC_MethodHook.Unhook> hooks = XposedBridge.hookAllMethods(cls, "k0", new XC_MethodHook() {
                        @Override protected void beforeHookedMethod(MethodHookParam call) { patchRequests(call); }
                    });
                    if (hooks.isEmpty()) throw new IllegalStateException("JSRuntime loader method unavailable");
                    context.getContentResolver().registerContentObserver(State.CONFIG, false, new ContentObserver(worker) {
                        @Override public void onChange(boolean selfChange, Uri uri) { worker.post(() -> synchronize()); }
                    });
                    XposedBridge.log("MgssLock: loader attached " + param.processName + " " + cls.getClassLoader());
                } catch (Throwable failure) {
                    error = failure.toString(); XposedBridge.log(failure);
                }
                worker.post(new Runnable() {
                    @Override public void run() {
                        try { context.getContentResolver().call(State.URI, "presence", null, null); }
                        catch (Throwable ignored) { }
                        synchronize();
                        worker.postDelayed(this, 1000);
                    }
                });
            }
        });
    }
    private String loadAsset(String name) throws Exception {
        AssetManager assets = AssetManager.class.getDeclaredConstructor().newInstance();
        Method add = AssetManager.class.getDeclaredMethod("addAssetPath", String.class); add.setAccessible(true);
        add.invoke(assets, modulePath);
        try (InputStream input = assets.open(name); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] bytes = new byte[4096]; int size;
            while ((size = input.read(bytes)) != -1) output.write(bytes, 0, size);
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        } finally { assets.close(); }
    }
    private void patchRequests(XC_MethodHook.MethodHookParam call) {
        if (call.args.length < 1 || !(call.args[0] instanceof ArrayList)) return;
        for (Object request : (ArrayList<?>) call.args[0]) {
            try {
                if (!SCRIPT.equals(XposedHelpers.getObjectField(request, "scriptName"))) continue;
                String source;
                Object descriptor = XposedHelpers.getObjectField(request, "scriptWxaFd");
                if (descriptor != null) {
                    String path = (String) XposedHelpers.getObjectField(descriptor, "wxaPkgPath");
                    String name = (String) XposedHelpers.getObjectField(descriptor, "wxaFileName");
                    source = BundlePatcher.readWxa(path, name);
                } else {
                    source = (String) XposedHelpers.getObjectField(request, "scriptText");
                }
                if (source == null) continue;
                String patched = BundlePatcher.patch(source, controller, ghost);
                if (patched == null) continue;
                XposedHelpers.setIntField(request, "scriptType", XposedHelpers.getStaticIntField(request.getClass(), "SCRIPT_TYPE_TEXT"));
                XposedHelpers.setObjectField(request, "scriptText", patched);
                XposedHelpers.setObjectField(request, "scriptFd", null);
                XposedHelpers.setObjectField(request, "scriptWxaFd", null);
                XposedHelpers.setObjectField(request, "cacheKey", null);
                XposedHelpers.setObjectField(request, "cacheCategory", null);
                XposedHelpers.setIntField(request, "lineNumber", 0);
                runtime = new WeakReference<>(call.thisObject);
                target = true; error = "";
                worker.postDelayed(() -> synchronize(), 300);
                XposedBridge.log("MgssLock: target bundle connected");
            } catch (Throwable failure) {
                error = failure.toString();
                XposedBridge.log("MgssLock: original script retained: " + failure);
                if (error.contains("signature") || error.contains("scope")) { target = true; worker.post(() -> report(null)); }
            }
        }
    }
    private void synchronize() {
        Object object = runtime.get();
        if (object == null) { if (target && !error.isEmpty()) report(null); return; }
        if (pending && SystemClock.elapsedRealtime() - requested < 3000) return;
        JSONObject config = new JSONObject();
        try {
            Bundle b;
            try { b = State.read(context); } catch (Throwable unavailable) { b = new Bundle(); }
            config.put("running", b.getBoolean("running"));
            for (String key : State.FLAGS) config.put(key, b.getBoolean(key));
            Bundle pendingCommand = b.getBundle("ghostCommand");
            if (pendingCommand != null) {
                JSONObject command = new JSONObject();
                command.put("id", pendingCommand.getString("id")); command.put("token", pendingCommand.getString("token"));
                command.put("kind", pendingCommand.getString("kind")); command.put("value", pendingCommand.getInt("value"));
                command.put("expiresAt", pendingCommand.getLong("expiresAt"));
                config.put("ghostCommand", command);
            }
            config.put("target", 999999); config.put("revision", b.getInt("revision"));
            String script = "JSON.stringify((function(){var r=typeof GameGlobal!=='undefined'?GameGlobal:globalThis;"
                + "return r.__mgssControl?r.__mgssControl.apply(" + config + "):{ready:false};})())";
            pending = true; requested = SystemClock.elapsedRealtime();
            ValueCallback<String> callback = value -> worker.post(() -> {
                pending = false;
                try {
                    Object decoded = new org.json.JSONTokener(value).nextValue();
                    JSONObject snapshot = decoded instanceof String ? new JSONObject((String) decoded) : (JSONObject) decoded;
                    error = ""; report(snapshot);
                } catch (Throwable failure) { error = failure.toString(); report(null); }
            });
            XposedHelpers.callMethod(object, "evaluateJavascript", script, callback);
        } catch (Throwable failure) { pending = false; error = failure.toString(); report(null); }
    }
    private void report(JSONObject snapshot) {
        try {
            Bundle b = new Bundle(); b.putString("error", error);
            if (snapshot != null) {
                b.putBoolean("ready", snapshot.optBoolean("ready"));
                b.putInt("appliedRevision", snapshot.optInt("revision", -1));
                b.putBoolean("adInstalled", snapshot.optBoolean("adInstalled"));
                b.putBoolean("ghostAvailable", snapshot.optBoolean("ghostAvailable"));
                b.putBoolean("ghostSelf", snapshot.optBoolean("ghostSelf"));
                b.putBoolean("selfGhostHpApplied", snapshot.optBoolean("selfGhostHpApplied"));
                b.putInt("ghostLevel", snapshot.optInt("ghostLevel")); b.putInt("ghostMaxLevel", snapshot.optInt("ghostMaxLevel"));
                b.putDouble("ghostHp", snapshot.optDouble("ghostHp", -1)); b.putDouble("ghostMaxHp", snapshot.optDouble("ghostMaxHp", -1));
                b.putString("ghostToken", snapshot.optString("ghostToken"));
                b.putString("ghostRequestId", snapshot.optString("ghostRequestId"));
                b.putString("ghostCommandError", snapshot.optString("ghostCommandError"));
                for (String key : State.KEYS) {
                    b.putLong(key + "Value", snapshot.optLong(key + "Value", -1));
                    b.putBoolean(key + "Applied", snapshot.optBoolean(key + "Applied"));
                }
            }
            context.getContentResolver().call(State.URI, "report", null, b);
        } catch (Throwable ignored) { }
    }
}
