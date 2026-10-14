#!/usr/bin/env python3
"""Add a release signingConfig to the generated Tauri Android app/build.gradle.kts.
Usage: wire-signing.py <build.gradle.kts> <keystore> <store_pass> <alias> <key_pass>
Fails loudly when the expected anchors are missing, so a Tauri template change never yields a silently unsigned bundle.
Passwords go into keystore.properties next to the gradle file (generated, untracked), never into the output."""
import pathlib, sys
gradle, ks, store_pass, alias, key_pass = sys.argv[1:6]
p = pathlib.Path(gradle)
s = p.read_text()
if "signingConfigs" in s:
    sys.exit("signingConfigs already present: refusing to patch twice")
if "android {" not in s:
    sys.exit("anchor 'android {' not found in " + gradle)
if 'getByName("release") {' not in s:
    sys.exit("anchor 'getByName(\"release\") {' not found in " + gradle)
(p.parent / "keystore.properties").write_text(
    f"storeFile={ks}\npassword={store_pass}\nkeyAlias={alias}\nkeyPassword={key_pass}\n")
props = '''
val keystoreProperties = Properties().apply {
    val f = rootProject.file("app/keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
'''
signing = '''
    signingConfigs {
        create("release") {
            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["keyPassword"] as String
            storeFile = file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["password"] as String
        }
    }
'''
s = "import java.util.Properties\n" + s
s = s.replace("android {", props + "android {" + signing, 1)
s = s.replace('getByName("release") {', 'getByName("release") {\n            signingConfig = signingConfigs.getByName("release")', 1)
p.write_text(s)
print("release signing wired")
