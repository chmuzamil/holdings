import { buildHandover, handoverHtml } from '@holdings/core'

// Encrypted handover files. The passphrase is never stored; without it the
// file can't be read, and AES-GCM rejects any file that was tampered with.

export const KDF_ITERATIONS = 600000
export const MIN_PASSPHRASE_LENGTH = 12

const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))

async function deriveKey(passphrase, salt, iterations, usage) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  )
}

export async function encryptHandover(content, passphrase) {
  if (String(passphrase).length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Use a passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters.`)
  }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt, KDF_ITERATIONS, 'encrypt')
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(content))
  return { v: 1, kdf: 'PBKDF2-SHA256', iterations: KDF_ITERATIONS, salt: toBase64(salt), iv: toBase64(iv), data: toBase64(data) }
}

/**
 * Self-contained on purpose (no imports or outside helpers): its source is
 * embedded in the handover file, so the file runs exactly this tested code.
 */
export async function decryptHandover(payload, passphrase) {
  const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(payload.salt), iterations: payload.iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(payload.iv) }, key, fromBase64(payload.data))
  return new TextDecoder().decode(plain)
}

/**
 * A standalone HTML page holding the encrypted payload and a small script
 * that asks for the passphrase and shows the content. Opens offline in any
 * modern browser.
 */
export function handoverFileHtml(payload, { owner = '' } = {}) {
  const title = owner ? `Handover from ${owner}` : 'Handover'
  const json = JSON.stringify(payload).replace(/</g, '\\u003c')
  const escapedTitle = title.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char])
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapedTitle}</title>
<style>
  body { margin: 0; background: #f7f7f5; color: #1f2328; font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 48px 20px; }
  h1 { font-size: 28px; line-height: 1.2; } h2 { margin-top: 32px; font-size: 20px; }
  .meta, .hint { color: #59636e; } form { display: grid; gap: 12px; max-width: 420px; }
  input, button { font: inherit; padding: 10px 12px; border-radius: 8px; border: 1px solid #c7ccd1; }
  button { background: #1f2328; color: #fff; cursor: pointer; } .error { color: #b42318; }
  li { margin: 4px 0; } @media print { form, .hint { display: none; } }
  .runbook { padding: 4px 16px; border-left: 3px solid #c7ccd1; } .runbook h3, .runbook h4 { font-size: 17px; margin: 16px 0 4px; }
  code, pre { font: 14px/1.5 ui-monospace, Consolas, monospace; background: #eceef0; border-radius: 4px; } code { padding: 1px 4px; } pre { padding: 10px; overflow-x: auto; }
</style>
</head>
<body>
<main>
  <div id="locked">
    <h1>${escapedTitle}</h1>
    <p class="hint">This file is locked. Enter the passphrase you were given. Nothing is sent anywhere; it opens on this device only.</p>
    <form id="unlock">
      <label for="passphrase">Passphrase</label>
      <input id="passphrase" type="password" autocomplete="off" required autofocus>
      <button type="submit">Open</button>
      <p id="status" class="error" role="alert"></p>
    </form>
  </div>
  <article id="content" hidden></article>
</main>
<script>
const payload = ${json};
const decryptHandover = ${decryptHandover.toString()};
document.getElementById('unlock').addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.getElementById('status');
  status.textContent = 'Opening…';
  try {
    const html = await decryptHandover(payload, document.getElementById('passphrase').value);
    document.getElementById('content').innerHTML = html;
    document.getElementById('content').hidden = false;
    document.getElementById('locked').remove();
  } catch (error) {
    status.textContent = 'That passphrase did not work. Check it and try again.';
  }
});
</script>
</body>
</html>
`
}

/**
 * The same locked file the Handover page downloads, as a string, for the
 * dead-man's switch to upload. Locked here, in the browser: only the
 * locked file leaves it.
 */
export async function lockedHandoverFile(data, options, passphrase) {
  const doc = buildHandover(data, options)
  return handoverFileHtml(await encryptHandover(handoverHtml(doc), passphrase), { owner: options.owner })
}
