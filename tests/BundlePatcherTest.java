package io.github.mgss.lock;

import java.nio.file.Files;
import java.nio.file.Paths;

public final class BundlePatcherTest {
    public static void main(String[] args) throws Exception {
        String source = BundlePatcher.readWxa(args[0], "/js/game.js");
        String controller = new String(Files.readAllBytes(Paths.get(args[1])), java.nio.charset.StandardCharsets.UTF_8);
        String patched = BundlePatcher.patch(source, controller);
        if (patched == null || !patched.contains(controller)) throw new AssertionError("Controller missing");
        if (!patched.replace(controller + "\n", "").equals(source)) throw new AssertionError("Original bundle changed");
        if (BundlePatcher.patch("another game", controller) != null) throw new AssertionError("Other game patched");
        rejects(() -> BundlePatcher.patch(source.replace("function hsn(t)", "function changed(t)"), controller));
        rejects(() -> BundlePatcher.patch(source + "return new yr(),s.Main=yr,s;}({});", controller));
        rejects(() -> BundlePatcher.readWxa(args[0], "/missing.js"));
        System.out.println("PASS: current WXA extraction, original preservation, signature and scope guards");
    }
    private interface Action { void run() throws Exception; }
    private static void rejects(Action action) throws Exception {
        try { action.run(); } catch (IllegalArgumentException expected) { return; }
        throw new AssertionError("Expected validation failure");
    }
}
