package io.github.mgss.lock;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

public final class BundlePatcherCurrentTest {
    private static final String TAIL = "return new mr,s.Main=mr,s})({});";
    public static void main(String[] args) throws Exception {
        String source = BundlePatcher.readWxa(args[0], "/js/game.js");
        String controller = new String(Files.readAllBytes(Paths.get(args[1])), StandardCharsets.UTF_8);
        String ghost = new String(Files.readAllBytes(Paths.get(args[2])), StandardCharsets.UTF_8);
        String patched = BundlePatcher.patch(source, controller, ghost);
        require(BundlePatcher.ghostCompatible(source), "Current ghost signatures missing");
        int insertion = source.indexOf(TAIL);
        String injected = patched.substring(insertion, patched.length() - source.length() + insertion);
        require((patched.substring(0, insertion) + patched.substring(insertion + injected.length())).equals(source), "Original bundle changed");
        for (String binding : new String[] {
            "resources.prototype.emg", "resources.prototype.zlf", "resources.prototype.hbj",
            "wallet.prototype.byn", "player.qxy", "data.instance.rap.iho", "facade.xae", "next.cbi",
            "Ghost.prototype, 'rde'", "manager.instance.xvd", "actor.ohl", "{ rgf: null }",
            "actor.wqv", "actor.mfx", "actor.xrj", "actor.egf()", "actor.zql = attack",
            "actor.nbh = cap", "actor.hsq = 1", "actor.adg = 1", "actor.lfv = false",
            "actor.xrx = speed", "actor.svy = 0", "actor.iav", "events.instance.sun(events.instance.glx)",
            "})(mi, _, T, B, nn, E, A,", "})(Ns, Ds, E, O,"
        }) require(injected.contains(binding), "Missing binding: " + binding);
        require(injected.contains("ghostAvailable: true"), "Ghost state keys changed");
        String changed = source.replace("egf(){this.hsq=1,this.adg=1,this.lfv=!1,this.ors()}", "egf(){this.ors()}");
        String fallback = BundlePatcher.patch(changed, controller, ghost);
        require(!fallback.contains("root.__mgssGhost =") && fallback.contains("root.__mgssControl ="), "Ghost mismatch must preserve resource controls");
        rejects(() -> BundlePatcher.patch(source.replace("hbj(t,i,s){", "changed(t,i,s){"), controller, ghost));
        rejects(() -> BundlePatcher.patch(source + TAIL, controller, ghost));
        rejects(() -> BundlePatcher.patch(source + "emg(t){t=this.iho[t];return null==t?null:t}", controller, ghost));
        require(BundlePatcher.patch("another game", controller, ghost) == null, "Other game patched");
        System.out.println("PASS: version 116 bindings, source preservation, independent ghost fallback and signature guards");
    }
    private interface Action { void run() throws Exception; }
    private static void rejects(Action action) throws Exception {
        try { action.run(); } catch (IllegalArgumentException expected) { return; }
        throw new AssertionError("Expected validation failure");
    }
    private static void require(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }
}
