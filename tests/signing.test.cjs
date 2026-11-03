const { test } = require("node:test");
const assert = require("node:assert/strict");
const { signingConfig } = require("../scripts/signing-config.cjs");

test("preview keeps update signature verification enabled", () => {
  const config = signingConfig({});
  assert.equal(config.forceCodeSigning, false);
  assert.equal(config.win.verifyUpdateCodeSignature, true);
});

test("signed release rejects absent publisher or credentials", () => {
  for (const env of [
    { ELECTRICCAD_SIGNED_RELEASE: "1" },
    { ELECTRICCAD_SIGNED_RELEASE: "1", CSC_LINK: "private.pfx" },
    { ELECTRICCAD_SIGNED_RELEASE: "1", ELECTRICCAD_PUBLISHER_NAME: "Publisher" },
  ]) assert.throws(() => signingConfig(env), /Signed release blocked/);
});

test("PFX credentials stay outside generated signing configuration", () => {
  const config = signingConfig({ ELECTRICCAD_SIGNED_RELEASE: "1", ELECTRICCAD_PUBLISHER_NAME: "Publisher",
    CSC_LINK: "private-certificate-secret", CSC_KEY_PASSWORD: "private-password-secret" });
  assert.equal(config.forceCodeSigning, true);
  assert.equal(config.win.signtoolOptions.publisherName, "Publisher");
  assert.equal(config.win.verifyUpdateCodeSignature, true);
  assert.doesNotMatch(JSON.stringify(config), /private-/);
});

test("certificate store signing validates the complete thumbprint", () => {
  assert.throws(() => signingConfig({ ELECTRICCAD_CERTIFICATE_SHA1: "not-a-thumbprint" }), /thumbprint/);
  const config = signingConfig({ ELECTRICCAD_SIGNED_RELEASE: "1", ELECTRICCAD_PUBLISHER_NAME: "Publisher",
    ELECTRICCAD_CERTIFICATE_SHA1: "ab".repeat(20) });
  assert.equal(config.win.signtoolOptions.certificateSha1, "ab".repeat(20));
});

test("Azure signing requires all fields and keeps credentials out of config", () => {
  assert.throws(() => signingConfig({ ELECTRICCAD_AZURE_ENDPOINT: "https://sign.example" }), /requires endpoint/);
  const env = { ELECTRICCAD_SIGNED_RELEASE: "1", ELECTRICCAD_PUBLISHER_NAME: "Publisher",
    ELECTRICCAD_AZURE_ENDPOINT: "https://sign.example", ELECTRICCAD_AZURE_ACCOUNT: "account",
    ELECTRICCAD_AZURE_PROFILE: "profile", AZURE_CLIENT_SECRET: "azure-private-secret" };
  const config = signingConfig(env);
  assert.equal(config.win.azureSignOptions.publisherName, "Publisher");
  assert.equal(config.win.signtoolOptions, undefined);
  assert.doesNotMatch(JSON.stringify(config), /azure-private-secret/);
});
