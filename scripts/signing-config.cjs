"use strict";

// Credentials stay in the build environment; this module never writes or logs them.
function signingConfig(env = process.env) {
  const required = env.ELECTRICCAD_SIGNED_RELEASE === "1";
  const publisherName = env.ELECTRICCAD_PUBLISHER_NAME?.trim();
  const certificateSha1 = env.ELECTRICCAD_CERTIFICATE_SHA1?.replace(/\s/g, "");
  const azureFields = ["ELECTRICCAD_AZURE_ENDPOINT", "ELECTRICCAD_AZURE_ACCOUNT", "ELECTRICCAD_AZURE_PROFILE"];
  const azureConfigured = azureFields.every(key => env[key]?.trim());
  const certificateConfigured = !!(env.WIN_CSC_LINK || env.CSC_LINK || certificateSha1);
  if (certificateSha1 && !/^[\da-f]{40}$/i.test(certificateSha1))
    throw new Error("ELECTRICCAD_CERTIFICATE_SHA1 must contain a 40-character certificate thumbprint.");
  if (azureFields.some(key => env[key]) && !azureConfigured)
    throw new Error("Azure signing requires endpoint, account and certificate profile.");
  if (required && (!publisherName || (!certificateConfigured && !azureConfigured)))
    throw new Error("Signed release blocked: configure ELECTRICCAD_PUBLISHER_NAME and a code-signing certificate or Azure signing service.");
  if (azureConfigured && !publisherName)
    throw new Error("Azure signing requires ELECTRICCAD_PUBLISHER_NAME matching the certificate CN.");
  const win = { verifyUpdateCodeSignature: true };
  if (azureConfigured) {
    win.azureSignOptions = {
      publisherName,
      endpoint: env.ELECTRICCAD_AZURE_ENDPOINT.trim(),
      codeSigningAccountName: env.ELECTRICCAD_AZURE_ACCOUNT.trim(),
      certificateProfileName: env.ELECTRICCAD_AZURE_PROFILE.trim(),
    };
  } else if (publisherName || certificateSha1) {
    win.signtoolOptions = {
      ...(publisherName && { publisherName }),
      ...(certificateSha1 && { certificateSha1 }),
      signingHashAlgorithms: ["sha256"],
      rfc3161TimeStampServer: "http://timestamp.digicert.com",
    };
  }
  return { forceCodeSigning: required, win };
}

module.exports = { signingConfig };
