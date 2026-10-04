package io.github.mgss.lock;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.Switch;
import android.widget.TextView;

final class Ui {
    static final int BG = 0xff101622, CARD = 0xff1b2433, BORDER = 0xff2d394b;
    static final int TEXT = 0xffedf2f8, MUTED = 0xff98a6ba, ACCENT = 0xff80e6c1;
    static final int[] COLORS = {0xffffcf70, 0xff85baff, 0xffdfa4ed, 0xff6fdbe8};
    static int dp(Context c, float n) { return Math.round(n * c.getResources().getDisplayMetrics().density); }
    static GradientDrawable shape(int color, float radius, int border) {
        GradientDrawable d = new GradientDrawable(); d.setColor(color); d.setCornerRadius(radius);
        if (border != 0) d.setStroke(1, border); return d;
    }
    static LinearLayout column(Context c) { LinearLayout v = new LinearLayout(c); v.setOrientation(LinearLayout.VERTICAL); return v; }
    static LinearLayout row(Context c) { LinearLayout v = new LinearLayout(c); v.setGravity(Gravity.CENTER_VERTICAL); return v; }
    static TextView text(Context c, String value, int size, int color, boolean bold) {
        TextView v = new TextView(c); v.setText(value); v.setTextSize(size); v.setTextColor(color);
        v.setFontFeatureSettings("tnum"); v.setIncludeFontPadding(false);
        if (bold) v.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL)); return v;
    }
    static TextView button(Context c, String value, String description) {
        TextView v = text(c, value, 23, MUTED, false); v.setGravity(Gravity.CENTER);
        v.setContentDescription(description); v.setBackgroundResource(android.R.drawable.list_selector_background);
        v.setClickable(true); v.setFocusable(true); return v;
    }
    static Switch toggle(Context c, String description) {
        Switch v = new Switch(c); v.setContentDescription(description);
        v.setShowText(false); v.setSplitTrack(false); v.setSwitchMinWidth(dp(c, 42));
        v.setMinimumHeight(dp(c, 48)); v.setMinimumWidth(dp(c, 48));
        v.setThumbTintList(new ColorStateList(new int[][]{{android.R.attr.state_checked}, {}}, new int[]{ACCENT, 0xffb1bccb}));
        v.setTrackTintList(new ColorStateList(new int[][]{{android.R.attr.state_checked}, {}}, new int[]{0xff397f70, 0xff435167}));
        return v;
    }
    static final class Mark extends View {
        private final Paint paint = new Paint(3);
        private final int kind;
        Mark(Context c, int kind) { super(c); this.kind = kind; setLayerType(View.LAYER_TYPE_SOFTWARE, null); }
        private void color(int value, boolean stroke, float width) {
            paint.setColor(value); paint.setStyle(stroke ? Paint.Style.STROKE : Paint.Style.FILL); paint.setStrokeWidth(width);
            paint.setStrokeCap(Paint.Cap.ROUND); paint.setStrokeJoin(Paint.Join.ROUND);
        }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas); canvas.save(); canvas.scale(getWidth() / 48f, getHeight() / 48f);
            int tint = kind < 0 ? ACCENT : COLORS[kind];
            color(kind < 0 ? CARD : (tint & 0xffffff) | 0x18000000, false, 0);
            canvas.drawRoundRect(new RectF(1, 1, 47, 47), kind < 0 ? 16 : 13, kind < 0 ? 16 : 13, paint);
            color(tint, true, 2.2f);
            if (kind == 0) { canvas.drawCircle(24, 24, 10, paint); canvas.drawCircle(24, 24, 6, paint); canvas.drawLine(24, 20, 24, 28, paint); }
            else if (kind == 1) {
                Path p = new Path(); p.moveTo(27, 12); p.lineTo(17, 26); p.lineTo(24, 26); p.lineTo(21, 36); p.lineTo(32, 21); p.lineTo(25, 21); p.close(); canvas.drawPath(p, paint);
            } else if (kind == 2) {
                canvas.drawRoundRect(new RectF(15, 19, 33, 35), 5, 5, paint); canvas.drawLine(17, 15, 31, 15, paint);
                canvas.drawLine(19, 16, 19, 19, paint); canvas.drawLine(29, 16, 29, 19, paint);
                Path p = new Path(); p.moveTo(24, 23); p.lineTo(28, 27); p.lineTo(24, 31); p.lineTo(20, 27); p.close(); canvas.drawPath(p, paint);
            } else if (kind == 3) {
                Path p = new Path(); p.moveTo(15, 15); p.lineTo(27, 24); p.lineTo(15, 33); p.close(); canvas.drawPath(p, paint);
                canvas.drawLine(33, 15, 33, 33, paint);
            } else {
                canvas.drawRoundRect(new RectF(15, 22, 33, 36), 3, 3, paint);
                canvas.drawArc(new RectF(18, 12, 30, 30), 180, 180, false, paint); canvas.drawLine(24, 27, 24, 31, paint);
            }
            canvas.restore();
        }
    }
}
