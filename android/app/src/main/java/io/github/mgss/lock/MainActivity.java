package io.github.mgss.lock;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class MainActivity extends Activity {
    private final Handler handler = new Handler();
    private boolean requested;
    private TextView status;
    private final Runnable tick = new Runnable() {
        @Override public void run() { status.setText(State.status(State.read(MainActivity.this))); handler.postDelayed(this, 1000); }
    };
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        if (saved != null) requested = saved.getBoolean("requested");
        getWindow().setStatusBarColor(Ui.BG); getWindow().setNavigationBarColor(Ui.BG);
        LinearLayout page = Ui.column(this); page.setGravity(Gravity.CENTER_VERTICAL);
        page.setPadding(Ui.dp(this, 28), Ui.dp(this, 28), Ui.dp(this, 28), Ui.dp(this, 28)); page.setBackgroundColor(Ui.BG);
        Ui.Mark logo = new Ui.Mark(this, -1); page.addView(logo, new LinearLayout.LayoutParams(Ui.dp(this, 64), Ui.dp(this, 64)));
        TextView title = Ui.text(this, "宿舍 · 锁定", 30, Ui.TEXT, true);
        LinearLayout.LayoutParams heading = new LinearLayout.LayoutParams(-1, -2); heading.topMargin = Ui.dp(this, 24); page.addView(title, heading);
        status = Ui.text(this, "等待微信连接", 13, Ui.MUTED, false);
        LinearLayout.LayoutParams sub = new LinearLayout.LayoutParams(-1, -2); sub.topMargin = Ui.dp(this, 12); sub.bottomMargin = Ui.dp(this, 32); page.addView(status, sub);
        String[] labels = {"金币", "闪电", "蜜獾币", "跳过广告"};
        String[] values = {"999,999", "999,999", "999,999", "免观看"};
        for (int i = 0; i < labels.length; i++) {
            LinearLayout row = Ui.row(this); row.setPadding(Ui.dp(this, 14), Ui.dp(this, 12), Ui.dp(this, 16), Ui.dp(this, 12));
            row.setBackground(Ui.shape(Ui.CARD, Ui.dp(this, 16), Ui.BORDER));
            row.addView(new Ui.Mark(this, i), new LinearLayout.LayoutParams(Ui.dp(this, 40), Ui.dp(this, 40)));
            TextView label = Ui.text(this, labels[i], 15, Ui.TEXT, true); label.setPadding(Ui.dp(this, 14), 0, 0, 0);
            row.addView(label, new LinearLayout.LayoutParams(0, -2, 1)); row.addView(Ui.text(this, values[i], 17, Ui.COLORS[i], true));
            LinearLayout.LayoutParams item = new LinearLayout.LayoutParams(-1, -2); item.bottomMargin = Ui.dp(this, 12); page.addView(row, item);
        }
        TextView run = Ui.text(this, "运行", 17, Ui.BG, true); run.setGravity(Gravity.CENTER);
        run.setBackground(Ui.shape(Ui.ACCENT, Ui.dp(this, 16), 0)); run.setContentDescription("运行并显示悬浮窗");
        run.setFocusable(true); run.setOnClickListener(v -> requestRun());
        LinearLayout.LayoutParams action = new LinearLayout.LayoutParams(-1, Ui.dp(this, 56)); action.topMargin = Ui.dp(this, 20); page.addView(run, action);
        TextView module = Ui.text(this, "LSPosed", 13, Ui.MUTED, false); module.setGravity(Gravity.CENTER); module.setFocusable(true);
        module.setOnClickListener(v -> {
            Intent intent = getPackageManager().getLaunchIntentForPackage("org.lsposed.manager");
            if (intent != null) startActivity(intent);
        });
        LinearLayout.LayoutParams setup = new LinearLayout.LayoutParams(-1, Ui.dp(this, 48)); setup.topMargin = Ui.dp(this, 8); page.addView(module, setup);
        setContentView(page);
    }
    private void requestRun() {
        if (!Settings.canDrawOverlays(this)) {
            requested = true;
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())));
            return;
        }
        requested = false;
        startForegroundService(new Intent(this, FloatingService.class).setAction("show"));
        finish();
    }
    @Override protected void onResume() {
        super.onResume(); handler.post(tick);
        if (requested && Settings.canDrawOverlays(this)) requestRun();
    }
    @Override protected void onPause() { super.onPause(); handler.removeCallbacks(tick); }
    @Override protected void onSaveInstanceState(Bundle out) { out.putBoolean("requested", requested); super.onSaveInstanceState(out); }
}
