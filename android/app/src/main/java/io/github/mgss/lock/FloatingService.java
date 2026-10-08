package io.github.mgss.lock;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Insets;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.text.InputType;
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
import android.widget.EditText;
import android.widget.Toast;
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
    private Switch ghostToggle;
    private TextView ghostHealth, ghostLevel, ghostNote, minus, plus;
    private boolean ghostPage;
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
        ghostPage = position.getBoolean("ghostPage", false);
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
        ghostToggle = null; ghostHealth = null; ghostLevel = null; ghostNote = null; minus = null; plus = null;
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
            LinearLayout tabs = Ui.row(this); tabs.setPadding(0, Ui.dp(this, 10), 0, Ui.dp(this, 6));
            for (int page = 0; page < 2; page++) {
                final boolean selectedGhost = page == 1;
                TextView tab = Ui.text(this, selectedGhost ? "猎梦者" : "资源", 12, ghostPage == selectedGhost ? Ui.TEXT : Ui.MUTED, true);
                tab.setGravity(Gravity.CENTER); tab.setFocusable(true);
                tab.setBackground(Ui.shape(ghostPage == selectedGhost ? Ui.BORDER : Ui.CARD, Ui.dp(this, 10), 0));
                tab.setOnClickListener(v -> { ghostPage = selectedGhost; position.edit().putBoolean("ghostPage", ghostPage).apply(); show(true); });
                LinearLayout.LayoutParams tabParams = new LinearLayout.LayoutParams(0, Ui.dp(this, 48), 1);
                if (page == 0) tabParams.rightMargin = Ui.dp(this, 6);
                tabs.addView(tab, tabParams);
            }
            panel.addView(tabs);
            ScrollView scroll = new ScrollView(this); scroll.setFillViewport(false); scroll.setVerticalScrollBarEnabled(false);
            LinearLayout body = Ui.column(this); scroll.addView(body); panel.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
            if (ghostPage) {
                LinearLayout healthRow = Ui.row(this); healthRow.setMinimumHeight(Ui.dp(this, 70));
                LinearLayout labels = Ui.column(this);
                labels.addView(Ui.text(this, "自身锁血", 14, Ui.TEXT, true));
                ghostHealth = Ui.text(this, "—", 12, Ui.ACCENT, false);
                LinearLayout.LayoutParams hpParams = new LinearLayout.LayoutParams(-2, -2); hpParams.topMargin = Ui.dp(this, 8);
                labels.addView(ghostHealth, hpParams); healthRow.addView(labels, new LinearLayout.LayoutParams(0, -2, 1));
                ghostToggle = Ui.toggle(this, "本人猎梦者锁血"); healthRow.addView(ghostToggle, new LinearLayout.LayoutParams(Ui.dp(this, 48), Ui.dp(this, 48)));
                ghostToggle.setOnCheckedChangeListener((v, checked) -> { if (!updating) { State.write(this, "selfGhostHp", checked); update(); } });
                body.addView(healthRow);
                LinearLayout levelRow = Ui.row(this); levelRow.setMinimumHeight(Ui.dp(this, 60));
                levelRow.addView(Ui.text(this, "等级", 13, Ui.TEXT, true), new LinearLayout.LayoutParams(0, -2, 1));
                minus = Ui.button(this, "−", "本人鬼降一级"); minus.setOnClickListener(v -> step(-1));
                LinearLayout.LayoutParams minusParams = new LinearLayout.LayoutParams(Ui.dp(this, 48), Ui.dp(this, 48)); minusParams.rightMargin = Ui.dp(this, 6);
                levelRow.addView(minus, minusParams);
                ghostLevel = Ui.text(this, "—", 14, Ui.ACCENT, true); ghostLevel.setGravity(Gravity.CENTER);
                ghostLevel.setBackground(Ui.shape(Ui.BG, Ui.dp(this, 10), Ui.BORDER)); ghostLevel.setContentDescription("输入本人鬼的目标等级");
                ghostLevel.setFocusable(true); ghostLevel.setOnClickListener(v -> inputLevel());
                LinearLayout.LayoutParams levelParams = new LinearLayout.LayoutParams(Ui.dp(this, 48), Ui.dp(this, 48)); levelParams.rightMargin = Ui.dp(this, 6);
                levelRow.addView(ghostLevel, levelParams);
                plus = Ui.button(this, "+", "本人鬼升一级"); plus.setOnClickListener(v -> step(1));
                levelRow.addView(plus, new LinearLayout.LayoutParams(Ui.dp(this, 48), Ui.dp(this, 48))); body.addView(levelRow);
                ghostNote = Ui.text(this, "仅本人玩鬼时可用", 11, Ui.MUTED, false);
                LinearLayout.LayoutParams noteParams = new LinearLayout.LayoutParams(-1, -2); noteParams.topMargin = Ui.dp(this, 6); body.addView(ghostNote, noteParams);
            } else {
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
            }
            window = panel;
        }
        clamp(); manager.addView(window, params); update(); savePosition();
    }
    private void update() {
        if (status == null) return;
        Bundle b = State.read(this);
        boolean ready = State.connected(b) && b.getBoolean("ready") && b.getString("error", "").isEmpty();
        boolean applied = ready && b.getInt("appliedRevision", -1) == b.getInt("revision");
        status.setText(ready && !applied ? "切换中" : State.status(b));
        dot.setBackground(Ui.shape(applied ? Ui.ACCENT : Ui.MUTED, Ui.dp(this, 4), 0));
        updating = true;
        int active = 0;
        if (ghostPage) {
            boolean available = ready && b.getBoolean("ghostAvailable"), self = available && b.getBoolean("ghostSelf");
            boolean pending = b.getBoolean("ghostPending"); int level = b.getInt("ghostLevel"), max = b.getInt("ghostMaxLevel");
            ghostToggle.setChecked(b.getBoolean("selfGhostHp")); ghostToggle.setEnabled(available);
            ghostHealth.setText(self ? number.format(b.getDouble("ghostHp")) + " / " + number.format(b.getDouble("ghostMaxHp")) : "—");
            ghostLevel.setText(self ? "Lv." + level : "—");
            boolean enabled = self && b.getBoolean("running") && !pending;
            ghostLevel.setEnabled(enabled); ghostLevel.setAlpha(enabled ? 1f : .45f);
            minus.setEnabled(enabled && level > 1); plus.setEnabled(enabled && level < max);
            minus.setAlpha(minus.isEnabled() ? 1f : .35f); plus.setAlpha(plus.isEnabled() ? 1f : .35f);
            String error = b.getString("ghostCommandError", "");
            ghostNote.setText(pending ? "执行中" : !self ? available ? "仅本人玩鬼时可用" : ready ? "当前版本暂不可用" : "等待游戏连接" : !error.isEmpty() ? error : "点击等级可输入");
            count.setText(applied && b.getBoolean("selfGhostHpApplied") ? "锁血中" : "");
            updating = false; return;
        }
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
    private void step(int value) {
        try { State.level(this, "step", value); }
        catch (RuntimeException failure) { Toast.makeText(this, failure.getMessage(), Toast.LENGTH_SHORT).show(); }
        update();
    }
    private void inputLevel() {
        Bundle state = State.read(this); int max = state.getInt("ghostMaxLevel");
        String token = state.getString("ghostToken", "");
        EditText input = new EditText(this); input.setTextColor(android.graphics.Color.BLACK);
        input.setHintTextColor(android.graphics.Color.DKGRAY);
        input.setInputType(InputType.TYPE_CLASS_NUMBER); input.setSingleLine(true);
        input.setText(Integer.toString(state.getInt("ghostLevel"))); input.selectAll();
        LinearLayout content = Ui.column(this); content.setPadding(Ui.dp(this, 20), Ui.dp(this, 8), Ui.dp(this, 20), Ui.dp(this, 8)); content.addView(input);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("设置等级 · 1–" + max).setView(content)
            .setNegativeButton("取消", null).setPositiveButton("设置", null).create();
        dialog.getWindow().setType(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY);
        dialog.show();
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            int value;
            try { value = Integer.parseInt(input.getText().toString()); }
            catch (NumberFormatException failure) { input.setError("请输入整数"); return; }
            if (value < 1 || value > max) { input.setError("请输入 1–" + max); return; }
            try { State.level(this, "set", value, token); dialog.dismiss(); update(); }
            catch (RuntimeException failure) { input.setError(failure.getMessage()); }
        });
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
        params.height = Math.min(Ui.dp(this, expanded ? ghostPage ? 326 : 418 : 48), height - margin * 2);
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
