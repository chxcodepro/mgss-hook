package io.github.mgss.lock;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Insets;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.WindowMetrics;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import java.text.NumberFormat;
import java.util.Locale;

public final class FloatingService extends Service {
    private final Handler handler = new Handler();
    private final NumberFormat number = NumberFormat.getIntegerInstance(Locale.US);
    private WindowManager manager;
    private WindowManager.LayoutParams params;
    private SharedPreferences position;
    private View window, dot;
    private TextView status, count;
    private Switch[] toggles;
    private TextView[] values;
    private boolean expanded, updating;
    private final Runnable tick = new Runnable() {
        @Override public void run() { update(); handler.postDelayed(this, 600); }
    };
    @Override public void onCreate() {
        super.onCreate();
        if (!Settings.canDrawOverlays(this)) { stopSelf(); return; }
        NotificationManager notifications = getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel("locks", "悬浮窗", NotificationManager.IMPORTANCE_LOW);
        channel.setShowBadge(false); notifications.createNotificationChannel(channel);
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, FloatingService.class).setAction("stop"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        startForeground(41, new Notification.Builder(this, "locks").setSmallIcon(R.drawable.ic_lock)
            .setContentTitle("宿舍 · 锁定").setContentText("悬浮窗运行中").setContentIntent(open)
            .setOngoing(true).setShowWhen(false).addAction(new Notification.Action.Builder(null, "停止", stop).build()).build());
        State.write(this, "running", true);
        manager = getSystemService(WindowManager.class);
        position = getSharedPreferences("window", 0);
        params = new WindowManager.LayoutParams(Ui.dp(this, 248), Ui.dp(this, 356),
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.LEFT;
        params.x = position.getInt("x", Ui.dp(this, 12)); params.y = position.getInt("y", Ui.dp(this, 96));
        show(true); handler.post(tick);
    }
    @Override public int onStartCommand(Intent intent, int flags, int id) {
        if (intent != null && "stop".equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        if (manager != null && intent != null && "show".equals(intent.getAction()) && !expanded) show(true);
        return START_STICKY;
    }
    private void show(boolean open) {
        if (manager == null) return;
        if (window != null) manager.removeView(window);
        expanded = open; toggles = null; values = null; status = null; count = null; dot = null;
        if (!open) {
            Ui.Mark mark = new Ui.Mark(this, -1); mark.setContentDescription("展开锁定面板");
            mark.setElevation(Ui.dp(this, 8)); mark.setOnClickListener(v -> show(true)); drag(mark);
            window = mark;
        } else {
            LinearLayout panel = Ui.column(this);
            panel.setPadding(Ui.dp(this, 14), Ui.dp(this, 2), Ui.dp(this, 14), Ui.dp(this, 12));
            panel.setBackground(Ui.shape(Ui.CARD, Ui.dp(this, 20), Ui.BORDER)); panel.setElevation(Ui.dp(this, 10));
            LinearLayout header = Ui.row(this);
            TextView title = Ui.text(this, "宿舍", 16, Ui.TEXT, true); title.setGravity(Gravity.CENTER_VERTICAL);
            title.setContentDescription("拖动悬浮窗"); drag(title);
            header.addView(title, new LinearLayout.LayoutParams(0, Ui.dp(this, 48), 1));
            TextView collapse = Ui.button(this, "−", "收起悬浮窗"); collapse.setOnClickListener(v -> show(false));
            header.addView(collapse, new LinearLayout.LayoutParams(Ui.dp(this, 48), Ui.dp(this, 48)));
            TextView close = Ui.button(this, "×", "停止锁定并关闭悬浮窗"); close.setOnClickListener(v -> stopSelf());
            header.addView(close, new LinearLayout.LayoutParams(Ui.dp(this, 48), Ui.dp(this, 48))); panel.addView(header);
            LinearLayout connection = Ui.row(this); connection.setPadding(0, Ui.dp(this, 2), 0, Ui.dp(this, 12));
            dot = new View(this); dot.setBackground(Ui.shape(Ui.MUTED, Ui.dp(this, 4), 0));
            LinearLayout.LayoutParams dotParams = new LinearLayout.LayoutParams(Ui.dp(this, 6), Ui.dp(this, 6)); dotParams.rightMargin = Ui.dp(this, 8); connection.addView(dot, dotParams);
            status = Ui.text(this, "等待猛鬼宿舍", 11, Ui.MUTED, false); connection.addView(status, new LinearLayout.LayoutParams(0, -2, 1));
            count = Ui.text(this, "", 11, Ui.ACCENT, true); connection.addView(count); panel.addView(connection);
            View divider = new View(this); divider.setBackgroundColor(Ui.BORDER); panel.addView(divider, new LinearLayout.LayoutParams(-1, 1));
            ScrollView scroll = new ScrollView(this); scroll.setFillViewport(false); scroll.setVerticalScrollBarEnabled(false);
            LinearLayout body = Ui.column(this); scroll.addView(body); panel.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
            toggles = new Switch[State.KEYS.length]; values = new TextView[State.KEYS.length];
            String[] labels = {"金币", "闪电", "蜜獾币", "跳过广告"};
            for (int i = 0; i < State.KEYS.length; i++) {
                final String key = State.KEYS[i];
                LinearLayout row = Ui.row(this); row.setMinimumHeight(Ui.dp(this, 66));
                row.addView(new Ui.Mark(this, i), new LinearLayout.LayoutParams(Ui.dp(this, 34), Ui.dp(this, 34)));
                LinearLayout label = Ui.column(this); label.setPadding(Ui.dp(this, 10), 0, 0, 0);
                label.addView(Ui.text(this, labels[i], 13, Ui.TEXT, true));
                values[i] = Ui.text(this, "999,999", 15, Ui.COLORS[i], true);
                LinearLayout.LayoutParams valueParams = new LinearLayout.LayoutParams(-2, -2); valueParams.topMargin = Ui.dp(this, 6); label.addView(values[i], valueParams);
                row.addView(label, new LinearLayout.LayoutParams(0, -2, 1));
                toggles[i] = Ui.toggle(this, i == 3 ? "跳过广告" : "锁定" + labels[i]); row.addView(toggles[i], new LinearLayout.LayoutParams(Ui.dp(this, 48), Ui.dp(this, 48)));
                toggles[i].setOnCheckedChangeListener((button, checked) -> { if (!updating) { State.write(this, key, checked); update(); } });
                body.addView(row);
            }
            window = panel;
        }
        clamp(); manager.addView(window, params); update(); savePosition();
    }
    private void update() {
        if (toggles == null) return;
        Bundle b = State.read(this);
        boolean ready = State.connected(b) && b.getBoolean("ready") && b.getString("error", "").isEmpty();
        boolean applied = ready && b.getInt("appliedRevision", -1) == b.getInt("revision");
        status.setText(ready && !applied ? "切换中" : State.status(b));
        dot.setBackground(Ui.shape(applied ? Ui.ACCENT : Ui.MUTED, Ui.dp(this, 4), 0));
        updating = true;
        int active = 0;
        for (int i = 0; i < State.KEYS.length; i++) {
            String key = State.KEYS[i]; toggles[i].setChecked(b.getBoolean(key));
            if (applied && b.getBoolean(key + "Applied")) active++;
            if ("ad".equals(key)) { values[i].setText(adStatus(ready, b)); continue; }
            long value = b.getLong(key + "Value", -1);
            values[i].setText(ready && value >= 0 ? number.format(value) : b.getBoolean(key) ? "999,999" : "—");
        }
        updating = false; count.setText(applied ? active + "/" + State.KEYS.length : "");
    }
    private String adStatus(boolean ready, Bundle b) {
        if (!ready) return "—";
        if (!b.getBoolean("adInstalled", true)) return "广告接口不可用";
        return "已跳过 " + number.format(Math.max(b.getLong("adValue", 0), 0)) + " 次";
    }
    private void drag(View view) {
        view.setOnTouchListener(new View.OnTouchListener() {
            float downX, downY; int startX, startY; boolean moving;
            final int slop = ViewConfiguration.get(FloatingService.this).getScaledTouchSlop();
            @Override public boolean onTouch(View v, MotionEvent event) {
                switch (event.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        downX = event.getRawX(); downY = event.getRawY(); startX = params.x; startY = params.y; moving = false; return true;
                    case MotionEvent.ACTION_MOVE:
                        float dx = event.getRawX() - downX, dy = event.getRawY() - downY;
                        if (Math.abs(dx) > slop || Math.abs(dy) > slop) moving = true;
                        if (moving) { params.x = startX + Math.round(dx); params.y = startY + Math.round(dy); clamp(); manager.updateViewLayout(window, params); }
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (!moving) v.performClick(); savePosition(); return true;
                    case MotionEvent.ACTION_CANCEL: return true;
                    default: return false;
                }
            }
        });
    }
    private void clamp() {
        WindowMetrics metrics = manager.getCurrentWindowMetrics(); Rect bounds = metrics.getBounds();
        Insets insets = metrics.getWindowInsets().getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
        int margin = Ui.dp(this, 8), width = bounds.width() - insets.left - insets.right;
        int height = bounds.height() - insets.top - insets.bottom;
        params.width = Math.min(Ui.dp(this, expanded ? 248 : 48), width - margin * 2);
        params.height = Math.min(Ui.dp(this, expanded ? 356 : 48), height - margin * 2);
        params.x = Math.max(margin, Math.min(params.x, width - params.width - margin));
        params.y = Math.max(margin, Math.min(params.y, height - params.height - margin));
    }
    private void savePosition() { position.edit().putInt("x", params.x).putInt("y", params.y).apply(); }
    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        if (window != null) { clamp(); manager.updateViewLayout(window, params); savePosition(); }
    }
    @Override public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        State.write(this, "running", false);
        if (window != null && manager != null) manager.removeView(window);
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
